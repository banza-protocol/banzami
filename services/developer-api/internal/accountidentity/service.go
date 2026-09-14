package accountidentity

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/banzami/banzami/services/common/clientip"
	ce "github.com/banzami/banzami/services/common/email"
)

const purposeLogin = "login"

// OTPSender delivers the verification-code email. *Mailer satisfies it; tests
// inject a fake that captures the code.
type OTPSender interface {
	// SendVerificationCode reports whether the provider accepted the message. A
	// code that was not sent must not be announced as sent.
	SendVerificationCode(to, code string) error
}

// FixtureEmailDomain is the reserved domain of Banzami's own test identities
// (".test" is reserved by RFC 6761: no real mailbox can exist under it). The
// harness cleanup guard, the fixture email budget and fixture sessions are all
// keyed on it.
const FixtureEmailDomain = "banzami-e2e.test"

// IsFixtureEmail reports whether an address belongs to the fixture domain.
func IsFixtureEmail(email string) bool {
	return strings.HasSuffix(normalizeEmail(email), "@"+FixtureEmailDomain)
}

// ServiceConfig holds the Account Identity policy knobs. Peppers/secret come from
// the environment (never Postgres).
type ServiceConfig struct {
	OTPPepper      string
	SessionSecret  string
	OTPTTL         time.Duration
	SessionTTL     time.Duration
	ResendCooldown time.Duration
	PerEmailLimit  int
	PerIPLimit     int
	RateWindow     time.Duration
	// FixtureEmailDailyBudget caps the sign-in codes sent to the fixture domain
	// per UTC day. Every code costs the same provider sending quota a real
	// developer's does; without a cap Banzami's own assurance runs spent the whole
	// daily quota (200 on 2026-09-14) and no developer could sign in until it
	// reset. Real addresses are never counted against it.
	FixtureEmailDailyBudget int
	// FixturesEnabled allows fixture sessions (Sandbox and local development only).
	FixturesEnabled bool
}

func (c ServiceConfig) withDefaults() ServiceConfig {
	if c.OTPTTL == 0 {
		c.OTPTTL = 10 * time.Minute
	}
	if c.SessionTTL == 0 {
		c.SessionTTL = 720 * time.Hour
	}
	if c.ResendCooldown == 0 {
		c.ResendCooldown = 45 * time.Second
	}
	if c.PerEmailLimit == 0 {
		c.PerEmailLimit = 5
	}
	if c.PerIPLimit == 0 {
		c.PerIPLimit = 20
	}
	if c.RateWindow == 0 {
		c.RateWindow = 15 * time.Minute
	}
	if c.FixtureEmailDailyBudget == 0 {
		c.FixtureEmailDailyBudget = 40
	}
	return c
}

// Service orchestrates OTP + sessions over a Store, a RateLimiter and an OTPSender.
type Service struct {
	store  Store
	rl     RateLimiter
	mailer OTPSender
	cfg    ServiceConfig
	// local counts in this process when rl (Redis) cannot answer, so a limit
	// is never simply skipped during an outage (A2-23).
	local RateLimiter
}

// NewService builds the Account Identity service.
func NewService(store Store, rl RateLimiter, mailer OTPSender, cfg ServiceConfig) *Service {
	return &Service{store: store, rl: rl, mailer: mailer, cfg: cfg.withDefaults(), local: NewMemLimiter()}
}

var (
	ErrInvalidEmail    = errors.New("invalid email")
	ErrRateLimited     = errors.New("rate limited")
	ErrCooldown        = errors.New("resend cooldown")
	ErrInvalidCode     = errors.New("invalid or expired code")
	ErrUnauthenticated = errors.New("unauthenticated")
	ErrUnavailable     = errors.New("account identity unavailable")
	// ErrCodeNotSent: the code could not be handed to the email provider. The
	// person is told so; nothing claims the code is on its way.
	ErrCodeNotSent = errors.New("verification code not sent")
	// ErrFixtureEmailBudget: the day's fixture sign-in codes are spent.
	ErrFixtureEmailBudget = errors.New("fixture email budget exhausted")
	// ErrNotFixture: a fixture session was asked for an address outside the
	// fixture domain, or where fixtures are disabled.
	ErrNotFixture = errors.New("not a fixture identity")
)

func normalizeEmail(email string) string { return strings.ToLower(strings.TrimSpace(email)) }

func validEmail(email string) bool {
	at := strings.IndexByte(email, '@')
	return at > 0 && at < len(email)-1 && !strings.ContainsAny(email, " \t\r\n")
}

// emailBucket is a stable, non-reversible key component for rate-limit keys so
// raw emails never land in Redis keys.
func emailBucket(email string) string {
	sum := sha256.Sum256([]byte(email))
	return hex.EncodeToString(sum[:])[:16]
}

// RequestOTP issues a verification code. The response is uniform whether or not
// an Account Identity exists (the user is created lazily only on verify), and
// the work performed is constant, so timing does not reveal existence. Abuse is
// bounded by per-email and per-IP limits plus a resend cooldown.
func (s *Service) RequestOTP(ctx context.Context, email, ip, requestID string) error {
	email = normalizeEmail(email)
	if !validEmail(email) {
		return ErrInvalidEmail
	}
	if s.cfg.OTPPepper == "" {
		return ErrUnavailable // fail closed — never issue an unpeppered code
	}

	bucket := emailBucket(email)
	okEmail, err := s.rl.Allow(ctx, "otp:req:email:"+bucket, s.cfg.PerEmailLimit, s.cfg.RateWindow)
	if err == nil && ip != "" {
		var okIP bool
		// Per address; per /64 for IPv6, so rotating through one's own block
		// buys nothing (A9-04). The full address is still what is recorded.
		okIP, err = s.rl.Allow(ctx, "otp:req:ip:"+clientip.LimiterKey(ip), s.cfg.PerIPLimit, s.cfg.RateWindow)
		okEmail = okEmail && okIP
	}
	if err != nil {
		return ErrUnavailable
	}
	if !okEmail {
		s.audit(ctx, nil, "otp.rate_limited", "EMAIL:"+email, ip, requestID, nil)
		return ErrRateLimited
	}
	if allowed, _, cdErr := s.rl.Cooldown(ctx, "otp:cd:email:"+bucket, s.cfg.ResendCooldown); cdErr == nil && !allowed {
		s.audit(ctx, nil, "otp.cooldown", "EMAIL:"+email, ip, requestID, nil)
		return ErrCooldown
	}

	// Banzami's own fixture traffic has a daily budget, so assurance runs can
	// never spend the provider quota real developers sign in with.
	if IsFixtureEmail(email) {
		day := time.Now().UTC().Format("2006-01-02")
		ok, bErr := s.rl.Allow(ctx, "otp:fixture:day:"+day, s.cfg.FixtureEmailDailyBudget, 25*time.Hour)
		if bErr != nil {
			ok, _ = s.local.Allow(ctx, "otp:fixture:day:"+day, s.cfg.FixtureEmailDailyBudget, 25*time.Hour)
		}
		if !ok {
			slog.WarnContext(ctx, "auth.request_otp.fixture_budget_exhausted",
				"budget", s.cfg.FixtureEmailDailyBudget, "day", day, "request_id", requestID)
			s.audit(ctx, nil, "otp.fixture_budget_exhausted", "EMAIL:"+email, ip, requestID, nil)
			return ErrFixtureEmailBudget
		}
	}

	code, err := newOTPCode()
	if err != nil {
		return ErrUnavailable
	}
	if err := s.store.IssueOTP(ctx, OTPInsert{
		Email: email, Purpose: purposeLogin,
		CodeHash: hashOTP(code, s.cfg.OTPPepper), HashVersion: otpHashVersion,
		ExpiresAt: time.Now().Add(s.cfg.OTPTTL), RequestIP: ip,
	}); err != nil {
		return ErrUnavailable
	}
	if err := s.mailer.SendVerificationCode(email, code); err != nil {
		// The code exists but nobody will receive it: say so. The reason is for
		// operators only (a spent provider quota means nobody can sign in until
		// it resets); the public answer names no provider and no numbers.
		slog.ErrorContext(ctx, "auth.request_otp.delivery_failed",
			"reason", ce.DeliveryReason(err), "request_id", requestID)
		s.audit(ctx, nil, "otp.delivery_failed", "EMAIL:"+email, ip, requestID,
			map[string]any{"reason": ce.DeliveryReason(err)})
		return ErrCodeNotSent
	}
	s.audit(ctx, nil, "otp.requested", "EMAIL:"+email, ip, requestID, nil)
	return nil
}

// FixtureSessionResult is a session for a fixture identity.
type FixtureSessionResult struct {
	User       User
	SessionRaw string
	CSRFToken  string
}

// MintFixtureSession opens a session for a fixture identity without an email.
//
// For Banzami's own regression suites whose subject is not authentication
// (payments, refunds, rail isolation, deletion…), so they stop spending the
// provider sending quota real developers need. Authentication itself is still
// proved through real delivery by the public cleanroom and the auth E2E.
//
// Bounded so it cannot become a way into anyone's account:
//   - only where fixtures are enabled (Sandbox, local development) — refused in Live;
//   - only an address in the reserved fixture domain, which no real person can hold;
//   - reachable only on the internal key guard, which the public edge refuses
//     (/internal/ → 404) before it reaches the service;
//   - creates the identity and session through the same store calls a verified
//     sign-in uses, and records `session.fixture_minted` in the audit log.
//
// No OTP is created, read, derived or bypassed; the OTP flow is untouched.
func (s *Service) MintFixtureSession(ctx context.Context, email, requestID string) (*FixtureSessionResult, error) {
	email = normalizeEmail(email)
	if !s.cfg.FixturesEnabled || !validEmail(email) || !IsFixtureEmail(email) {
		return nil, ErrNotFixture
	}
	if s.cfg.SessionSecret == "" {
		return nil, ErrUnavailable
	}
	user, err := s.store.UpsertVerifiedUser(ctx, email)
	if err != nil {
		return nil, ErrUnavailable
	}
	raw, hash, err := newSessionToken(s.cfg.SessionSecret)
	if err != nil {
		return nil, ErrUnavailable
	}
	if err := s.store.CreateSession(ctx, SessionInsert{
		UserID: user.ID, TokenHash: hash, UserAgent: "banzami-fixture-session", IP: "",
		ExpiresAt: time.Now().Add(6 * time.Hour),
	}); err != nil {
		return nil, ErrUnavailable
	}
	s.audit(ctx, &user.ID, "session.fixture_minted", "USER:"+user.ID, "", requestID, nil)
	return &FixtureSessionResult{User: user, SessionRaw: raw, CSRFToken: s.csrfFor(raw)}, nil
}

// VerifyResult carries the raw session token (for the host-only cookie) and the
// CSRF token (returned in the JSON body).
type VerifyResult struct {
	User       User
	SessionRaw string
	CSRFToken  string
	SessionTTL time.Duration
}

// VerifyOTP atomically verifies the code; on success it lazily creates+verifies
// the user, opens a session, and mints a CSRF token bound to it.
func (s *Service) VerifyOTP(ctx context.Context, email, code, ip, userAgent, requestID string) (*VerifyResult, error) {
	email = normalizeEmail(email)
	if !validEmail(email) || len(code) != 6 {
		return nil, ErrInvalidCode
	}
	if s.cfg.OTPPepper == "" || s.cfg.SessionSecret == "" {
		return nil, ErrUnavailable
	}
	// Per-IP brute-force ceiling on top of the per-code attempt limit.
	//
	// It was skipped whenever Redis errored — an outage lifted the ceiling for
	// every address at once. The count now falls back to this process's own
	// window (as the gateway's limiters do): per instance rather than shared,
	// but never absent (A2-23).
	if ip != "" {
		key := "otp:vrf:ip:" + clientip.LimiterKey(ip)
		ok, err := s.rl.Allow(ctx, key, s.cfg.PerIPLimit, s.cfg.RateWindow)
		if err != nil {
			slog.WarnContext(ctx, "auth.verify.rate_limit_store_unavailable — counting in this process", "error_kind", fmt.Sprintf("%T", err))
			ok, _ = s.local.Allow(ctx, key, s.cfg.PerIPLimit, s.cfg.RateWindow)
		}
		if !ok {
			return nil, ErrRateLimited
		}
	}

	res, err := s.store.VerifyOTP(ctx, email, purposeLogin, code, s.cfg.OTPPepper)
	if err != nil {
		return nil, ErrUnavailable
	}
	if res != OTPOK {
		s.audit(ctx, nil, "otp.failed", "EMAIL:"+email, ip, requestID, map[string]any{"result": int(res)})
		return nil, ErrInvalidCode
	}

	user, err := s.store.UpsertVerifiedUser(ctx, email)
	if err != nil {
		return nil, ErrUnavailable
	}
	raw, hash, err := newSessionToken(s.cfg.SessionSecret)
	if err != nil {
		return nil, ErrUnavailable
	}
	if err := s.store.CreateSession(ctx, SessionInsert{
		UserID: user.ID, TokenHash: hash, UserAgent: userAgent, IP: ip,
		ExpiresAt: time.Now().Add(s.cfg.SessionTTL),
	}); err != nil {
		return nil, ErrUnavailable
	}
	s.audit(ctx, &user.ID, "otp.verified", "USER:"+user.ID, ip, requestID, nil)
	s.audit(ctx, &user.ID, "login", "USER:"+user.ID, ip, requestID, nil)
	return &VerifyResult{User: user, SessionRaw: raw, CSRFToken: s.csrfFor(raw), SessionTTL: s.cfg.SessionTTL}, nil
}

// ValidateSession resolves the raw cookie token to its user (guard + /auth/me).
func (s *Service) ValidateSession(ctx context.Context, raw string) (User, error) {
	if raw == "" || s.cfg.SessionSecret == "" {
		return User{}, ErrUnauthenticated
	}
	sess, err := s.store.LiveSessionByHash(ctx, hashToken(raw, s.cfg.SessionSecret))
	if err != nil {
		return User{}, ErrUnauthenticated
	}
	user, err := s.store.UserByID(ctx, sess.UserID)
	if err != nil {
		return User{}, ErrUnauthenticated
	}
	_ = s.store.TouchSession(ctx, sess.ID)
	return user, nil
}

// Sessions lists the person's own live sessions, marking the one asking.
//
// The caller's own session is identified by its hash, never by anything the
// caller sends: a client that could name "the current session" could name
// somebody else's and keep it alive while ending theirs.
func (s *Service) Sessions(ctx context.Context, raw string) ([]SessionView, error) {
	if raw == "" || s.cfg.SessionSecret == "" {
		return nil, ErrUnauthenticated
	}
	me, err := s.store.LiveSessionByHash(ctx, hashToken(raw, s.cfg.SessionSecret))
	if err != nil {
		return nil, ErrUnauthenticated
	}
	list, err := s.store.LiveSessions(ctx, me.UserID)
	if err != nil {
		return nil, err
	}
	for i := range list {
		list[i].Current = list[i].ID == me.ID
	}
	return list, nil
}

// RevokeOtherSessions signs the person out everywhere except here.
//
// The one recovery a person has when a device is lost. It deliberately keeps the
// session making the request: ending that too would sign them out mid-recovery
// and is what "terminar sessão" already does on its own.
func (s *Service) RevokeOtherSessions(ctx context.Context, raw string) (int, error) {
	if raw == "" || s.cfg.SessionSecret == "" {
		return 0, ErrUnauthenticated
	}
	me, err := s.store.LiveSessionByHash(ctx, hashToken(raw, s.cfg.SessionSecret))
	if err != nil {
		return 0, ErrUnauthenticated
	}
	return s.store.RevokeOtherSessions(ctx, me.UserID, me.ID)
}

// ErrInvalidName: the supplied display name is empty or longer than the column
// is meant to hold. A name is a label a person chooses for themselves, so the
// only rules are that it exists and stays a name.
var ErrInvalidName = errors.New("invalid name")

// MaxNameLen bounds the display name. Long enough for any real name including
// its accents; short enough that it cannot be used as a free-text field.
const MaxNameLen = 80

// SetName records the person's display name and returns the updated user.
//
// This is the only thing an account holder can change about themselves, and it
// exists because nothing could: sign-up is email-OTP only and no code ever wrote
// the name column, so every Console avatar fell back to two letters of the email
// and two colleagues at the same domain were indistinguishable.
func (s *Service) SetName(ctx context.Context, userID, name, ip, requestID string) (User, error) {
	name = strings.TrimSpace(name)
	if name == "" || utf8.RuneCountInString(name) > MaxNameLen {
		return User{}, ErrInvalidName
	}
	user, err := s.store.SetUserName(ctx, userID, name)
	if err != nil {
		return User{}, ErrUnavailable
	}
	// The name itself is not in the audit metadata: the event records that the
	// person renamed themselves, which is the fact worth keeping. Storing the
	// value again in an append-only log makes a name unerasable.
	s.audit(ctx, &userID, "profile.name_set", "USER:"+userID, ip, requestID, nil)
	return user, nil
}

// Logout revokes the session server-side. It returns ErrUnavailable when the
// revocation could not be written: the session is then still live, and saying
// "signed out" would be false — whoever holds the token could keep using it
// (A2-24).
func (s *Service) Logout(ctx context.Context, raw, ip, requestID string) error {
	if raw == "" || s.cfg.SessionSecret == "" {
		return nil
	}
	hash := hashToken(raw, s.cfg.SessionSecret)
	sess, lookupErr := s.store.LiveSessionByHash(ctx, hash)
	if err := s.store.RevokeSessionByHash(ctx, hash); err != nil {
		return ErrUnavailable
	}
	if lookupErr == nil {
		s.audit(ctx, &sess.UserID, "logout", "USER:"+sess.UserID, ip, requestID, nil)
	}
	return nil
}

// csrfFor derives the CSRF token bound to a session token (double-submit +
// crypto binding). Domain-separated from the session hash.
func (s *Service) csrfFor(raw string) string {
	return hashToken(raw, s.cfg.SessionSecret+"|csrf")
}

// ValidateCSRF checks the X-CSRF-Token header against the session cookie token.
func (s *Service) ValidateCSRF(rawSession, headerToken string) bool {
	if rawSession == "" || headerToken == "" {
		return false
	}
	return constantTimeEqual(s.csrfFor(rawSession), headerToken)
}

func (s *Service) audit(ctx context.Context, actor *string, action, subject, ip, requestID string, meta map[string]any) {
	_ = s.store.InsertAudit(ctx, AuditEvent{
		ActorUserID: actor, Action: action, Subject: subject,
		Metadata: meta, RequestIP: ip, RequestID: requestID,
	})
}
