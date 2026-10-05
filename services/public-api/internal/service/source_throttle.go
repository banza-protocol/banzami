package service

// Anti-DoS: a persistent per-source (client IP, later also device) throttle on
// failed consumer PIN logins.
//
// @banza is a potentially public identity, and the credential escalates to
// PIN_RECOVERY_REQUIRED after repeated wrong PINs. Without a source-level guard,
// a single attacker who simply knows many handles could drive many accounts into
// recovery. This throttle counts a source's FAILED attempts across ALL handles
// in a window and blocks the source once it exceeds a cap — checked BEFORE any
// account credential logic, so a blocked source can never reach (and escalate) an
// account. It is DB-backed, so it survives restarts and spans instances; the
// per-IP edge/in-process limiter is an additional, not a substitute, layer.
//
// This does not stop a distributed attack on one known @banza (that account can
// still be pushed to recovery-required, and its real owner recovers via their
// verified contact). It makes a single source unable to cause mass locks.

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Untrusted-login throttle thresholds (persistent, server-side). Failures from
// an untrusted device are counted against three independent budgets so that:
//   - (C) one source cannot spray many accounts   — per source (IP)
//   - (B) a distributed attack cannot online-guess a 6-digit PIN (1e6 space) on
//     one account by rotating IPs              — per target (consumer)
//   - (A) one source cannot hammer one account     — per (source, target)
//
// Magnitudes mirror the existing developer-api OTP limits (per-IP 20/15m,
// per-identity 5/15m) so they are not arbitrary. None of this touches the
// trusted-context credential policy (3→lock→3→recovery) in VerifyWithDevice.
const (
	throttleWindow = 15 * time.Minute
	throttleBlock  = 15 * time.Minute

	capPerSource       = 20 // (C) failures per source across all handles
	capPerTarget       = 20 // (B) untrusted failures per account across all sources
	capPerSourceTarget = 5  // (A) failures from one source against one account
)

// SourceThrottle is the persistent untrusted-login abuse guard. It counts
// failures against opaque keys (per source, per target, per source+target); the
// caller supplies the raw key and the budget. A nil receiver is a no-op. Keys
// are stored only as an HMAC with a dedicated rate-limit secret (never a raw IP;
// an IP is a signal, not an identity, and may be shared behind NAT/CGNAT).
type SourceThrottle struct {
	pool   *pgxpool.Pool
	pepper string
}

// NewSourceThrottle builds the throttle. It returns nil — never a keyless
// throttle — when the pool is absent OR the pepper is empty. A keyless throttle
// would hash every source/target with an empty key (no secret at rest), so an
// empty pepper is refused here rather than silently accepted. Callers that
// require the protection (the login path) must treat a nil throttle as a
// misconfiguration and fail closed, not run unthrottled; the service refuses to
// boot without a secret (see cmd/public-api/main.go), so in production the
// throttle is always configured.
func NewSourceThrottle(pool *pgxpool.Pool, pepper string) *SourceThrottle {
	if pool == nil || strings.TrimSpace(pepper) == "" {
		return nil
	}
	return &SourceThrottle{pool: pool, pepper: pepper}
}

// Threshold accessors (the handler supplies the budget per key kind).
func ThrottleWindow() time.Duration { return throttleWindow }
func ThrottleBlock() time.Duration  { return throttleBlock }
func CapPerSource() int             { return capPerSource }
func CapPerTarget() int             { return capPerTarget }
func CapPerSourceTarget() int       { return capPerSourceTarget }

// Key builders (domain-tagged). The raw value is never stored; key() HMACs it.
func SourceKey(ip string) string            { return "src:" + strings.TrimSpace(ip) }
func TargetKey(consumerID string) string    { return "tgt:" + consumerID }
func SourceTargetKey(ip, cid string) string { return "st:" + strings.TrimSpace(ip) + "|" + cid }

// key HMACs the raw throttle key with the rate-limit secret so stored state
// never holds a raw IP. Domain separation lives in the raw key's prefix.
func (s *SourceThrottle) key(raw string) string {
	mac := hmac.New(sha256.New, []byte(s.pepper))
	mac.Write([]byte(raw))
	return hex.EncodeToString(mac.Sum(nil))
}

// Blocked reports whether a raw key is currently blocked. nil receiver / empty
// key → not blocked.
func (s *SourceThrottle) Blocked(ctx context.Context, rawKey string) (bool, error) {
	if s == nil || rawKey == "" {
		return false, nil
	}
	var blockedUntil *time.Time
	err := s.pool.QueryRow(ctx,
		`SELECT blocked_until FROM consumer_login_source_throttle WHERE source = $1`, s.key(rawKey)).
		Scan(&blockedUntil)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("throttle read: %w", err)
	}
	return blockedUntil != nil && blockedUntil.After(time.Now()), nil
}

// AnyBlocked reports whether ANY of the raw keys is currently blocked.
func (s *SourceThrottle) AnyBlocked(ctx context.Context, rawKeys ...string) (bool, error) {
	for _, k := range rawKeys {
		if k == "" {
			continue
		}
		blocked, err := s.Blocked(ctx, k)
		if err != nil {
			return false, err
		}
		if blocked {
			return true, nil
		}
	}
	return false, nil
}

// RecordFailure counts one failed attempt against rawKey within window, blocking
// it for `block` once it reaches `cap`. One atomic upsert: the window reset, the
// increment and the block decision cannot race apart under concurrent attempts.
// Returns whether the key is now blocked (so the caller can audit once).
func (s *SourceThrottle) RecordFailure(ctx context.Context, rawKey string, window time.Duration, cap int, block time.Duration) (bool, error) {
	if s == nil || rawKey == "" {
		return false, nil
	}
	var blockedUntil *time.Time
	err := s.pool.QueryRow(ctx,
		`INSERT INTO consumer_login_source_throttle (source, attempts, window_started_at, updated_at)
		 VALUES ($1, 1, now(), now())
		 ON CONFLICT (source) DO UPDATE SET
		   attempts = CASE WHEN consumer_login_source_throttle.window_started_at < now() - ($2)::interval
		                   THEN 1 ELSE consumer_login_source_throttle.attempts + 1 END,
		   window_started_at = CASE WHEN consumer_login_source_throttle.window_started_at < now() - ($2)::interval
		                            THEN now() ELSE consumer_login_source_throttle.window_started_at END,
		   blocked_until = CASE WHEN (CASE WHEN consumer_login_source_throttle.window_started_at < now() - ($2)::interval
		                                   THEN 1 ELSE consumer_login_source_throttle.attempts + 1 END) >= $3
		                        THEN now() + ($4)::interval
		                        ELSE consumer_login_source_throttle.blocked_until END,
		   updated_at = now()
		 RETURNING blocked_until`,
		s.key(rawKey), window.String(), cap, block.String()).Scan(&blockedUntil)
	if err != nil {
		return false, fmt.Errorf("throttle record: %w", err)
	}
	return blockedUntil != nil && blockedUntil.After(time.Now()), nil
}
