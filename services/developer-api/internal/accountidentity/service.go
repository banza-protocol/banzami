package accountidentity

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"github.com/banzami/banzami/services/common/clientip"
)

const purposeLogin = "login"

// OTPSender delivers the verification-code email. *Mailer satisfies it; tests
// inject a fake that captures the code.
type OTPSender interface {
	SendVerificationCode(to, code string)
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
	return c
}

// Service orchestrates OTP + sessions over a Store, a RateLimiter and an OTPSender.
type Service struct {
	store  Store
	rl     RateLimiter
	mailer OTPSender
	cfg    ServiceConfig
}

// NewService builds the Account Identity service.
func NewService(store Store, rl RateLimiter, mailer OTPSender, cfg ServiceConfig) *Service {
	return &Service{store: store, rl: rl, mailer: mailer, cfg: cfg.withDefaults()}
}

var (
	ErrInvalidEmail    = errors.New("invalid email")
	ErrRateLimited     = errors.New("rate limited")
	ErrCooldown        = errors.New("resend cooldown")
	ErrInvalidCode     = errors.New("invalid or expired code")
	ErrUnauthenticated = errors.New("unauthenticated")
	ErrUnavailable     = errors.New("account identity unavailable")
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
	s.mailer.SendVerificationCode(email, code)
	s.audit(ctx, nil, "otp.requested", "EMAIL:"+email, ip, requestID, nil)
	return nil
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
	if ip != "" {
		if ok, err := s.rl.Allow(ctx, "otp:vrf:ip:"+clientip.LimiterKey(ip), s.cfg.PerIPLimit, s.cfg.RateWindow); err == nil && !ok {
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

// Logout revokes the session server-side.
func (s *Service) Logout(ctx context.Context, raw, ip, requestID string) {
	if raw == "" || s.cfg.SessionSecret == "" {
		return
	}
	hash := hashToken(raw, s.cfg.SessionSecret)
	if sess, err := s.store.LiveSessionByHash(ctx, hash); err == nil {
		s.audit(ctx, &sess.UserID, "logout", "USER:"+sess.UserID, ip, requestID, nil)
	}
	_ = s.store.RevokeSessionByHash(ctx, hash)
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
