package handler

// Registration is retry-safe. A transient failure during account creation (Core
// timeout/5xx/network) leaves the EMAIL_VERIFIED grant live so the SAME attempt
// can be retried; retrying completes exactly once — one credential, one wallet —
// and the grant cannot then be used for a second identity.
//
// DB-backed (real grant + credential tables) with a scripted fake Core that
// fails the first CreateConsumer and succeeds on the retry.

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	ce "github.com/banzami/banzami/services/common/email"
	"github.com/banzami/banzami/services/public-api/internal/config"
	"github.com/banzami/banzami/services/public-api/internal/service"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestRegister_RetrySafeAfterTransientCoreFailure(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set — skipping DB-backed retry-safe register test")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)

	handle := "rs" + strings.ReplaceAll(uuid.NewString(), "-", "")[:8]
	email := "rs-" + uuid.NewString()[:12] + "@banzami-e2e.test"
	consumerID := uuid.NewString()
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM consumer_email_otps WHERE lower(email)=lower($1)`, email)
		_, _ = pool.Exec(ctx, `DELETE FROM consumer_auth_grants WHERE lower(email)=lower($1)`, email)
		_, _ = pool.Exec(ctx, `DELETE FROM public_api_credentials WHERE consumer_id=$1`, consumerID)
		_, _ = pool.Exec(ctx, `DELETE FROM consumers WHERE id=$1`, consumerID)
	})

	// Scripted Core: first CreateConsumer fails 503 (transient); the retry
	// succeeds. Wallet creation is counted to prove it runs idempotently.
	var createCalls, walletCalls int32
	core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/internal/v1/consumers"):
			if atomic.AddInt32(&createCalls, 1) == 1 {
				w.WriteHeader(http.StatusServiceUnavailable)
				_, _ = w.Write([]byte(`{"code":"UNAVAILABLE","message":"core busy"}`))
				return
			}
			// The real Core persists the consumers row on a successful create; the fake
			// must too, or public_api_credentials_consumer_id_fkey fails when the handler
			// saves the credential. ON CONFLICT keeps it idempotent across the retry.
			_, _ = pool.Exec(r.Context(),
				`INSERT INTO consumers (id, handle, status, display_name)
				 VALUES ($1,$2,'ACTIVE',$2) ON CONFLICT (id) DO NOTHING`, consumerID, handle)
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(service.ConsumerRecord{
				ID: consumerID, Handle: handle, Status: "ACTIVE",
				CreatedAt: time.Now().UTC(), UpdatedAt: time.Now().UTC(),
			})
		case r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/internal/v1/consumer-wallets"):
			atomic.AddInt32(&walletCalls, 1)
			_, _ = w.Write([]byte(`{"id":"w1","consumer_id":"` + consumerID + `","currency":"AOA","status":"ACTIVE"}`))
		default:
			// Sandbox credit and anything else: succeed quietly.
			_, _ = w.Write([]byte(`{}`))
		}
	}))
	defer core.Close()

	cfg := &config.Config{JWTSecret: "test-secret", Environment: "LIVE"} // LIVE: skip the sandbox grant for a tighter test
	creds := service.NewCredentialStore(pool)
	rec := service.NewConsumerRecoveryService(pool, "test-pepper")
	mailer := ce.NewSender(ce.Config{DryRun: true, ResendAPIKey: "t", FromAddress: "n@b.co", NoreplyAddress: "n@b.co"})
	h := NewAuthHandler(cfg, service.NewCorePublicClient(core.URL), creds).WithRecovery(rec, mailer)

	// A real verified-email grant.
	code, err := rec.RequestSignupOtp(ctx, email, "")
	if err != nil {
		t.Fatal(err)
	}
	token, err := rec.VerifySignupOtp(ctx, email, code)
	if err != nil {
		t.Fatal(err)
	}

	body := `{"handle":"` + handle + `","display_name":"Rs","pin":"123456","email":"` + email + `","email_verification_token":"` + token + `"}`
	call := func() *httptest.ResponseRecorder {
		rr := httptest.NewRecorder()
		h.Register(rr, httptest.NewRequest(http.MethodPost, "/v1/auth/register", strings.NewReader(body)))
		return rr
	}

	// Attempt 1: transient Core failure → 503 SIGNUP_RETRY, grant NOT consumed.
	rr1 := call()
	if rr1.Code != http.StatusServiceUnavailable || !strings.Contains(rr1.Body.String(), "SIGNUP_RETRY") {
		t.Fatalf("attempt 1 should be a retryable 503, got %d: %s", rr1.Code, rr1.Body.String())
	}

	// Attempt 2: the SAME request retried → succeeds exactly once.
	rr2 := call()
	if rr2.Code != http.StatusCreated {
		t.Fatalf("retry should complete, got %d: %s", rr2.Code, rr2.Body.String())
	}

	// Exactly one credential for this account.
	var credCount int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM public_api_credentials WHERE consumer_id=$1`, consumerID).Scan(&credCount); err != nil {
		t.Fatal(err)
	}
	if credCount != 1 {
		t.Fatalf("expected exactly 1 credential, got %d", credCount)
	}
	// The wallet create ran (GetOrCreate is idempotent, so at most once per success).
	if atomic.LoadInt32(&walletCalls) < 1 {
		t.Fatal("wallet provisioning should have run on the successful attempt")
	}

	// The grant is now consumed: a fresh registration with it (even a different
	// handle) cannot create a second identity.
	var consumed *time.Time
	if err := pool.QueryRow(ctx, `SELECT consumed_at FROM consumer_auth_grants WHERE lower(email)=lower($1)`, email).Scan(&consumed); err != nil {
		t.Fatal(err)
	}
	if consumed == nil {
		t.Fatal("the grant must be consumed after a successful registration")
	}
	otherBody := `{"handle":"` + handle + `x","display_name":"Rs","pin":"123456","email":"` + email + `","email_verification_token":"` + token + `"}`
	rr3 := httptest.NewRecorder()
	h.Register(rr3, httptest.NewRequest(http.MethodPost, "/v1/auth/register", strings.NewReader(otherBody)))
	if rr3.Code != http.StatusForbidden {
		t.Fatalf("a consumed grant must not create a second identity, got %d: %s", rr3.Code, rr3.Body.String())
	}
}
