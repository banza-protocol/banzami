package handler

// The deliberate ordering of the source throttle vs the account escalation
// policy (§5). A TRUSTED device (one that previously signed into the account)
// reaches PIN_RECOVERY_REQUIRED on its sixth relevant failure, unimpeded by the
// source throttle. An UNKNOWN source is throttled and can NEVER force the
// persistent recovery state merely by knowing a public @banza.
//
// DB-backed (real credential + throttle tables); skips without DATABASE_URL.

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/banzami/banzami/services/public-api/internal/config"
	"github.com/banzami/banzami/services/public-api/internal/service"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

func orderingHarnessOrSkip(t *testing.T) (*AuthHandler, *pgxpool.Pool) {
	t.Helper()
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set — skipping DB-backed PIN-login ordering test")
	}
	pool, err := pgxpool.New(context.Background(), dbURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	cfg := &config.Config{JWTSecret: "test-secret", Environment: "SANDBOX"}
	creds := service.NewCredentialStore(pool)
	throttle := service.NewSourceThrottle(pool, "test-pepper")
	h := NewAuthHandler(cfg, service.NewCorePublicClient("http://unused"), creds).WithSourceThrottle(throttle)
	return h, pool
}

func seedLoginConsumer(t *testing.T, pool *pgxpool.Pool, pin string) (id, handle string) {
	t.Helper()
	ctx := context.Background()
	id = uuid.NewString()
	handle = "lo" + id[:8]
	if _, err := pool.Exec(ctx, `INSERT INTO consumers (id, handle, status, display_name) VALUES ($1,$2,'ACTIVE',$2)`, id, handle); err != nil {
		t.Fatal(err)
	}
	h, _ := bcrypt.GenerateFromPassword([]byte(pin), bcrypt.MinCost)
	if _, err := pool.Exec(ctx, `INSERT INTO public_api_credentials (consumer_id, handle, pin_hash) VALUES ($1,$2,$3)`, id, handle, string(h)); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM consumer_devices WHERE consumer_id=$1`, id)
		_, _ = pool.Exec(ctx, `DELETE FROM public_api_credentials WHERE consumer_id=$1`, id)
		_, _ = pool.Exec(ctx, `DELETE FROM consumers WHERE id=$1`, id)
	})
	return
}

func login(t *testing.T, h *AuthHandler, handle, pin, deviceID, ip string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/v1/auth/token",
		strings.NewReader(`{"handle":"`+handle+`","pin":"`+pin+`"}`))
	if deviceID != "" {
		req.Header.Set("X-Device-Id", deviceID)
	}
	req.RemoteAddr = ip
	rr := httptest.NewRecorder()
	h.Token(rr, req)
	return rr
}

func TestPinLogin_TrustedDeviceReachesRecoveryRequiredOnSixthFailure(t *testing.T) {
	h, pool := orderingHarnessOrSkip(t)
	ctx := context.Background()
	id, handle := seedLoginConsumer(t, pool, "246824")
	const dev = "trusted-install-xyz"
	const ip = "203.0.113.5:5555"
	expireLock := func() {
		_, _ = pool.Exec(ctx, `UPDATE public_api_credentials SET locked_until = now() - interval '1 second' WHERE handle=$1`, handle)
	}

	// A successful login records the device as trusted for this account.
	if rr := login(t, h, handle, "246824", dev, ip); rr.Code != http.StatusOK {
		t.Fatalf("precondition: correct PIN should sign in, got %d: %s", rr.Code, rr.Body.String())
	}

	// Attempts 1 and 2: plain refusals (401).
	for i := 1; i <= 2; i++ {
		if rr := login(t, h, handle, "000000", dev, ip); rr.Code != http.StatusUnauthorized {
			t.Fatalf("attempt %d want 401, got %d", i, rr.Code)
		}
	}
	// Attempt 3: still 401, and now the credential is locked.
	if rr := login(t, h, handle, "000000", dev, ip); rr.Code != http.StatusUnauthorized {
		t.Fatalf("attempt 3 want 401, got %d", rr.Code)
	}
	// During the lock, even the correct PIN is refused (429) and does not advance
	// the second sequence.
	if rr := login(t, h, handle, "246824", dev, ip); rr.Code != http.StatusTooManyRequests {
		t.Fatalf("correct PIN during lock want 429, got %d: %s", rr.Code, rr.Body.String())
	}

	expireLock()
	// Attempts 4 and 5: second sequence, 401.
	for i := 4; i <= 5; i++ {
		if rr := login(t, h, handle, "000000", dev, ip); rr.Code != http.StatusUnauthorized {
			t.Fatalf("attempt %d want 401, got %d: %s", i, rr.Code, rr.Body.String())
		}
		expireLock() // a mid-run lock may re-apply; clear it to continue the sequence
	}
	// Attempt 6 from the TRUSTED device → PIN_RECOVERY_REQUIRED (403), NOT blocked
	// by the source throttle.
	rr := login(t, h, handle, "000000", dev, ip)
	if rr.Code != http.StatusForbidden || !strings.Contains(rr.Body.String(), "PIN_RECOVERY_REQUIRED") {
		t.Fatalf("attempt 6 (trusted) want 403 PIN_RECOVERY_REQUIRED, got %d: %s", rr.Code, rr.Body.String())
	}
	var status string
	_ = pool.QueryRow(ctx, `SELECT status FROM consumers WHERE id=$1`, id).Scan(&status)
	if status != "ACTIVE" {
		t.Fatalf("recovery-required must not change lifecycle, status=%s", status)
	}
}

func TestPinLogin_UnknownSourceCannotForceRecoveryRequired(t *testing.T) {
	h, pool := orderingHarnessOrSkip(t)
	ctx := context.Background()
	id, handle := seedLoginConsumer(t, pool, "246824")
	const ip = "198.51.100.9:4444"
	expireLock := func() {
		_, _ = pool.Exec(ctx, `UPDATE public_api_credentials SET locked_until = now() - interval '1 second' WHERE handle=$1`, handle)
	}

	// An unknown device (never recorded for this account) hammers the known @banza.
	sawBlocked := false
	for i := 0; i < 12; i++ {
		rr := login(t, h, handle, "000000", "attacker-install-unknown", ip)
		if rr.Code == http.StatusTooManyRequests {
			sawBlocked = true
		}
		// Must never reach the persistent recovery state from an unknown source.
		if strings.Contains(rr.Body.String(), "PIN_RECOVERY_REQUIRED") {
			t.Fatalf("an unknown source produced PIN_RECOVERY_REQUIRED on attempt %d", i)
		}
		expireLock()
	}
	if !sawBlocked {
		t.Fatal("the source should have been throttled (429) during the barrage")
	}
	var rr *string
	_ = pool.QueryRow(ctx, `SELECT pin_recovery_required_at::text FROM public_api_credentials WHERE consumer_id=$1`, id).Scan(&rr)
	if rr != nil {
		t.Fatal("an unknown source must never set pin_recovery_required_at")
	}
	var status string
	_ = pool.QueryRow(ctx, `SELECT status FROM consumers WHERE id=$1`, id).Scan(&status)
	if status != "ACTIVE" {
		t.Fatalf("the attacked account must stay ACTIVE, status=%s", status)
	}
}

// §9 Distributed brute force: many DIFFERENT unknown sources (rotating IPs)
// against the SAME @victim. The per-target untrusted budget bounds the total,
// rotating IP does not reset it, the global credential is never locked, no
// recovery-required is produced, and a legitimate trusted device still logs in.
func TestPinLogin_DistributedAttackBoundedByTargetBudget(t *testing.T) {
	h, pool := orderingHarnessOrSkip(t)
	ctx := context.Background()
	id, handle := seedLoginConsumer(t, pool, "246824")
	const trustedDev = "victim-own-install"
	t.Cleanup(func() { _, _ = pool.Exec(ctx, `TRUNCATE consumer_login_source_throttle`) })

	// The victim's own device is trusted (a prior successful login).
	if rr := login(t, h, handle, "246824", trustedDev, "203.0.113.1:1"); rr.Code != http.StatusOK {
		t.Fatalf("precondition trusted login, got %d", rr.Code)
	}

	// Attack from many different IPs, no/foreign device → untrusted.
	sawBlocked := false
	for i := 0; i < service.CapPerTarget()+5; i++ {
		ip := "198.51.100." + itoa(i%250+1) + ":5000" // rotating source
		rr := login(t, h, handle, "000000", "", ip)
		if rr.Code == http.StatusTooManyRequests {
			sawBlocked = true
		}
		if strings.Contains(rr.Body.String(), "PIN_RECOVERY_REQUIRED") {
			t.Fatalf("distributed unknown sources produced recovery-required at %d", i)
		}
	}
	if !sawBlocked {
		t.Fatal("the per-target budget should have blocked the distributed attack even as the IP rotated")
	}
	// Global credential state untouched; account still ACTIVE.
	var fa, lc int
	var lu, rr *string
	_ = pool.QueryRow(ctx,
		`SELECT failed_attempts, lock_count, locked_until::text, pin_recovery_required_at::text
		   FROM public_api_credentials WHERE consumer_id=$1`, id).Scan(&fa, &lc, &lu, &rr)
	if fa != 0 || lc != 0 || lu != nil || rr != nil {
		t.Fatalf("untrusted distributed attack must not touch global state, got fa=%d lc=%d lu=%v rr=%v", fa, lc, lu, rr)
	}
	// The legitimate trusted device still authenticates despite the target budget.
	if r := login(t, h, handle, "246824", trustedDev, "203.0.113.1:2"); r.Code != http.StatusOK {
		t.Fatalf("a trusted device must still log in under a target throttle, got %d: %s", r.Code, r.Body.String())
	}
}

// §10 Password spray: ONE source against MANY handles. The per-source budget
// blocks the source; no victim gets a persistent recovery state or a global lock.
func TestPinLogin_PasswordSprayBoundedBySourceBudget(t *testing.T) {
	h, pool := orderingHarnessOrSkip(t)
	ctx := context.Background()
	t.Cleanup(func() { _, _ = pool.Exec(ctx, `TRUNCATE consumer_login_source_throttle`) })
	const ip = "192.0.2.50:9999"

	ids := make([]string, 0, 4)
	handles := make([]string, 0, 4)
	for i := 0; i < 4; i++ {
		id, hd := seedLoginConsumer(t, pool, "246824")
		ids = append(ids, id)
		handles = append(handles, hd)
	}

	sawBlocked := false
	for i := 0; i < service.CapPerSource()+5; i++ {
		hd := handles[i%len(handles)] // spray across handles from one source
		rr := login(t, h, hd, "000000", "", ip)
		if rr.Code == http.StatusTooManyRequests {
			sawBlocked = true
		}
		if strings.Contains(rr.Body.String(), "PIN_RECOVERY_REQUIRED") {
			t.Fatalf("password spray produced recovery-required at %d", i)
		}
	}
	if !sawBlocked {
		t.Fatal("the per-source budget should have blocked the spraying source")
	}
	for _, id := range ids {
		var lc int
		var rr *string
		_ = pool.QueryRow(ctx, `SELECT lock_count, pin_recovery_required_at::text FROM public_api_credentials WHERE consumer_id=$1`, id).Scan(&lc, &rr)
		if lc != 0 || rr != nil {
			t.Fatalf("password spray must not lock or recovery-flag victim %s, lc=%d rr=%v", id, lc, rr)
		}
	}
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b []byte
	for n > 0 {
		b = append([]byte{byte('0' + n%10)}, b...)
		n /= 10
	}
	return string(b)
}

// Hardening: when the login-abuse throttle is REQUIRED but its secret is missing
// (no throttle wired), an untrusted login must FAIL CLOSED (503) — never run
// unthrottled. The protection is never silently disabled by a missing secret.
func TestPinLogin_FailsClosedWhenRequiredThrottleMissing(t *testing.T) {
	_, pool := orderingHarnessOrSkip(t)
	cfg := &config.Config{JWTSecret: "test-secret", Environment: "SANDBOX"}
	creds := service.NewCredentialStore(pool)
	_, handle := seedLoginConsumer(t, pool, "246824")

	// requireThrottle=true, NO throttle wired → the untrusted login (even with the
	// correct PIN) must be refused rather than served unthrottled.
	hard := NewAuthHandler(cfg, service.NewCorePublicClient("http://unused"), creds).
		WithRateLimitRequired(true)
	if rr := login(t, hard, handle, "246824", "", "198.51.100.9:7000"); rr.Code != http.StatusServiceUnavailable {
		t.Fatalf("a required-but-missing throttle must fail closed (503), got %d: %s", rr.Code, rr.Body.String())
	}

	// Control: without the requirement, the same no-throttle handler does NOT
	// fail closed on this branch — proving the flag is what gates the behaviour.
	soft := NewAuthHandler(cfg, service.NewCorePublicClient("http://unused"), creds)
	if rr := login(t, soft, handle, "246824", "", "198.51.100.9:7000"); rr.Code == http.StatusServiceUnavailable {
		t.Fatalf("without the requirement the throttle branch must not 503, got %d", rr.Code)
	}
}

func TestPinLogin_ArbitraryDeviceIdIsNotTrusted(t *testing.T) {
	h, pool := orderingHarnessOrSkip(t)
	_, handle := seedLoginConsumer(t, pool, "246824")
	// A client cannot self-declare trust: an arbitrary X-Device-Id that was never
	// recorded for this account is UNKNOWN.
	if h.creds.IsTrustedDevice(context.Background(), handle, "whatever-the-attacker-picks") {
		t.Fatal("an unrecorded X-Device-Id must not be trusted")
	}
}
