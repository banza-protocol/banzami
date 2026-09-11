package handler

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/banzami/banzami/services/admin-api/internal/auth"
	"github.com/banzami/banzami/services/admin-api/internal/service"
	"github.com/banzami/banzami/services/common/clientip"
)

// LoginStore is the slice of AdminUserService the auth handler needs (interface
// for testability; *service.AdminUserService satisfies it).
type LoginStore interface {
	GetByEmail(ctx context.Context, email string) (service.AdminUser, error)
	GetByID(ctx context.Context, id string) (service.AdminUser, error)
	UpdatePassword(ctx context.Context, id, passwordHash string) error
	RecordFailedLogin(ctx context.Context, id string) (*time.Time, error)
	ResetLoginCountersAndTouch(ctx context.Context, id string)
	RecordLoginAttempt(ctx context.Context, emailNorm string, adminUserID *string, ip, userAgent string, success bool, failureReason string)
	BumpTokenVersion(ctx context.Context, id string) error
	// AdvanceLifecycle moves an operator between privileged-identity states.
	// Guarded by the `from` state so a replay cannot force a transition.
	AdvanceLifecycle(ctx context.Context, id, from, to string) error
}

// AuditSink appends to the immutable admin audit log. *service.AuditService
// satisfies it; nil disables direct auditing (e.g. in unit tests).
type AuditSink interface {
	Write(ctx context.Context, e service.AuditEntry)
}

// clientIP is the caller's address as clientip resolved it for this service
// (RemoteAddr): the edge's X-Real-IP only when the peer is a trusted proxy. It
// read the headers itself, from any peer, so a caller chose the address its
// login attempts and audit rows recorded (A9-09).
func clientIP(r *http.Request) string { return clientip.Host(r.RemoteAddr) }

// AuthHandler implements operator login / me / logout. Errors are deliberately
// generic (never reveal whether an email exists). Passwords and tokens are
// never logged.
type AuthHandler struct {
	users     LoginStore
	jwtSecret string
	ttl       time.Duration
	audit     AuditSink
	// mfa gates the session. nil means no second factor is configured on this
	// deployment, and login behaves as it did before — which is the only way an
	// operator can be onboarded on a deployment that has no MFA tables yet.
	mfa MFAGate
}

// MFAGate is the second-factor boundary the login path needs. An interface so
// the handler can be tested without a database, and so an unconfigured
// deployment is a nil value rather than a half-built service.
type MFAGate interface {
	Status(ctx context.Context, adminUserID string) (service.MFAStatus, error)
	Verify(ctx context.Context, adminUserID, code string) error
}

// WithMFA attaches the second-factor gate.
func (h *AuthHandler) WithMFA(g MFAGate) *AuthHandler { h.mfa = g; return h }

// mfaChallengeTTL bounds the window between proving a password and proving the
// second factor. Long enough to open an authenticator, short enough that a
// stolen challenge token is not a standing invitation.
const mfaChallengeTTL = 5 * time.Minute

func NewAuthHandler(users LoginStore, jwtSecret string, ttl time.Duration) *AuthHandler {
	return &AuthHandler{users: users, jwtSecret: jwtSecret, ttl: ttl}
}

// WithAudit attaches an audit sink. Login/logout are public routes (outside the
// audit middleware), so they record their own audit rows here.
func (h *AuthHandler) WithAudit(a AuditSink) *AuthHandler {
	h.audit = a
	return h
}

func (h *AuthHandler) writeAudit(ctx context.Context, e service.AuditEntry) {
	if h.audit != nil {
		h.audit.Write(ctx, e)
	}
}

type userDTO struct {
	ID       string `json:"id"`
	Email    string `json:"email"`
	FullName string `json:"full_name"`
	Role     string `json:"role"`
}

func (h *AuthHandler) ready(w http.ResponseWriter) bool {
	if h.users == nil || h.jwtSecret == "" {
		writeErr(w, http.StatusServiceUnavailable, "operator authentication is not configured")
		return false
	}
	return true
}

// POST /admin/v1/auth/login
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	if !h.ready(w) {
		return
	}
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Email == "" || body.Password == "" {
		writeError(w, http.StatusUnauthorized, "INVALID_CREDENTIALS", "invalid credentials")
		return
	}

	ctx := r.Context()
	emailNorm := strings.ToLower(strings.TrimSpace(body.Email))
	ip, ua := clientIP(r), r.UserAgent()
	now := time.Now()

	// failLogin keeps every rejection identical from the caller's perspective:
	// same 401 + same generic message + an equal-cost bcrypt comparison. The only
	// path that differs is a true lockout (429), which an attacker triggers
	// against a known-existing account anyway.
	failLogin := func(reason string, userID *string) {
		h.users.RecordLoginAttempt(ctx, emailNorm, userID, ip, ua, false, reason)
		uid := ""
		if userID != nil {
			uid = *userID
		}
		h.writeAudit(ctx, service.AuditEntry{
			AdminUserID: uid, AdminEmail: emailNorm, Action: "LOGIN_FAILED",
			EntityType: "operator", EntityID: uid, StatusCode: http.StatusUnauthorized,
			IP: ip, UserAgent: ua, After: map[string]string{"reason": reason},
		})
		writeError(w, http.StatusUnauthorized, "INVALID_CREDENTIALS", "invalid credentials")
	}

	u, err := h.users.GetByEmail(ctx, emailNorm)
	if err != nil {
		// Unknown email: still spend one bcrypt comparison so the response time
		// matches a real verification, then fail generically.
		auth.DummyVerify(body.Password)
		failLogin("UNKNOWN_EMAIL", nil)
		return
	}
	if u.IsLocked(now) {
		// The only non-generic outcome — a genuine lockout returns 429.
		h.users.RecordLoginAttempt(ctx, emailNorm, &u.ID, ip, ua, false, "LOCKED")
		h.writeAudit(ctx, service.AuditEntry{
			AdminUserID: u.ID, AdminEmail: emailNorm, Action: "LOGIN_FAILED",
			EntityType: "operator", EntityID: u.ID, StatusCode: http.StatusTooManyRequests,
			IP: ip, UserAgent: ua, After: map[string]string{"reason": "LOCKED"},
		})
		writeError(w, http.StatusTooManyRequests, "TOO_MANY_ATTEMPTS", "too many attempts, try again later")
		return
	}
	// Always run a bcrypt comparison (real hash, or the dummy for an INVITED
	// account with no password) so timing does not leak account state.
	var ok bool
	if u.PasswordHash == "" {
		auth.DummyVerify(body.Password)
	} else {
		ok = auth.VerifyPassword(u.PasswordHash, body.Password)
	}
	if !ok {
		reason := "BAD_PASSWORD"
		if u.PasswordHash == "" {
			reason = "NO_PASSWORD_SET"
		}
		_, _ = h.users.RecordFailedLogin(ctx, u.ID)
		failLogin(reason, &u.ID)
		return
	}
	// Correct password but the account cannot be signed into (e.g. SUSPENDED or
	// still INVITED): respond exactly like a wrong password — never reveal the
	// account state.
	//
	// The enrolment states are the exception, and they are an exception to the
	// REFUSAL, not to the guarantee: an operator part-way through enrolling a
	// factor must be able to prove their password to finish, and everything
	// below still refuses them a session. CanHoldSession is what decides that,
	// further down, and it names exactly one status.
	if !service.CanHoldSession(u.Status) && !service.CanContinueEnrolment(u.Status) {
		failLogin("NOT_ACTIVE", &u.ID)
		return
	}

	// The password is proven. Whether that is a session depends on the factor.
	//
	// Both branches below return a token that is NOT a session: the middleware
	// refuses anything whose purpose is not "session", so a caller cannot skip
	// the second step by simply using what login handed back.
	if h.mfa != nil {
		st, serr := h.mfa.Status(ctx, u.ID)
		if serr != nil {
			writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "could not check the second factor")
			return
		}
		purpose := auth.PurposeMFAChallenge
		code := "MFA_REQUIRED"
		if !st.Enrolled {
			// A privileged operator with no factor gets exactly one thing: the
			// ability to enrol one. Not a session.
			purpose = auth.PurposeMFAEnroll
			code = "MFA_ENROLMENT_REQUIRED"
		}
		chal := auth.Principal{ID: u.ID, Email: u.Email, FullName: u.FullName, Role: u.Role, TokenVersion: u.TokenVersion, Purpose: purpose}
		tok, cexp, cerr := auth.Issue(h.jwtSecret, chal, mfaChallengeTTL, now)
		if cerr != nil {
			writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "could not issue challenge")
			return
		}
		h.users.RecordLoginAttempt(ctx, emailNorm, &u.ID, ip, ua, false, code)
		h.writeAudit(ctx, service.AuditEntry{
			AdminUserID: u.ID, AdminEmail: u.Email, FullName: u.FullName, Role: u.Role,
			Action: "LOGIN_PASSWORD_OK_MFA_PENDING", EntityType: "operator", EntityID: u.ID,
			StatusCode: http.StatusOK, IP: ip, UserAgent: ua,
			After: map[string]string{"next": code},
		})
		writeJSON(w, http.StatusOK, map[string]any{
			"mfa_required":    true,
			"mfa_enrolled":    st.Enrolled,
			"challenge_token": tok,
			"expires_at":      cexp,
			"next":            code,
		})
		return
	}

	// Past the MFA branch with a status that is not ACTIVE means the deployment
	// has no second-factor service AND the account is mid-enrolment — a state it
	// can only have reached through a factor flow that this build cannot run.
	// There is no session to issue.
	if !service.CanHoldSession(u.Status) {
		h.users.RecordLoginAttempt(ctx, emailNorm, &u.ID, ip, ua, false, "NOT_ACTIVE")
		failLogin("NOT_ACTIVE", &u.ID)
		return
	}

	// No second-factor service, and the caller is privileged.
	//
	// Reaching here means h.mfa is nil, which today can only happen when there is
	// no database — and then there is no user to authenticate either, so the path
	// is unreachable. That is a coincidence of wiring, not a rule, and it is the
	// wrong thing to rest a SUPER_ADMIN session on: one refactor that constructs
	// the handler without WithMFA turns this into password-only administration,
	// silently, with every existing test still passing.
	//
	// So it is written down. A privileged operator is never issued a session by a
	// build that cannot verify a second factor.
	if h.mfa == nil && u.Role == "SUPER_ADMIN" {
		h.users.RecordLoginAttempt(ctx, emailNorm, &u.ID, ip, ua, false, "MFA_UNAVAILABLE")
		h.writeAudit(ctx, service.AuditEntry{
			AdminUserID: u.ID, AdminEmail: u.Email, FullName: u.FullName, Role: u.Role,
			Action: "LOGIN_REFUSED_MFA_UNAVAILABLE", EntityType: "operator", EntityID: u.ID,
			StatusCode: http.StatusServiceUnavailable, IP: ip, UserAgent: ua,
		})
		writeError(w, http.StatusServiceUnavailable, "MFA_UNAVAILABLE",
			"this deployment cannot verify a second factor, and a privileged session requires one")
		return
	}

	principal := auth.Principal{ID: u.ID, Email: u.Email, FullName: u.FullName, Role: u.Role, TokenVersion: u.TokenVersion, Purpose: auth.PurposeSession}
	token, exp, err := auth.Issue(h.jwtSecret, principal, h.ttl, now)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "could not issue session")
		return
	}
	h.users.ResetLoginCountersAndTouch(ctx, u.ID)
	h.users.RecordLoginAttempt(ctx, emailNorm, &u.ID, ip, ua, true, "")
	h.writeAudit(ctx, service.AuditEntry{
		AdminUserID: u.ID, AdminEmail: u.Email, FullName: u.FullName, Role: u.Role,
		Action: "LOGIN_SUCCESS", EntityType: "operator", EntityID: u.ID,
		StatusCode: http.StatusOK, IP: ip, UserAgent: ua,
	})
	slog.InfoContext(ctx, "admin.login", "admin_user_id", u.ID, "role", u.Role) // no password/token

	writeJSON(w, http.StatusOK, map[string]any{
		"token":      token,
		"expires_at": exp,
		"user":       userDTO{ID: u.ID, Email: u.Email, FullName: u.FullName, Role: u.Role},
	})
}

// POST /admin/v1/auth/terminate-sessions — the operator revokes all of their own
// sessions (including the current one) by incrementing token_version. The next
// request with any previously-issued token fails the middleware's version check.
func (h *AuthHandler) TerminateSessions(w http.ResponseWriter, r *http.Request) {
	if !h.ready(w) {
		return
	}
	p, ok := auth.FromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "unauthenticated")
		return
	}
	if err := h.users.BumpTokenVersion(r.Context(), p.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "could not terminate sessions")
		return
	}
	slog.InfoContext(r.Context(), "admin.sessions_terminated", "admin_user_id", p.ID)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// GET /admin/v1/auth/me
func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	p, ok := auth.FromContext(r.Context())
	if !ok {
		writeErr(w, http.StatusUnauthorized, "unauthenticated")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"user": userDTO{ID: p.ID, Email: p.Email, FullName: p.FullName, Role: p.Role},
	})
}

// POST /admin/v1/auth/logout — stateless JWT, so this is a client-side clear;
// the endpoint exists for symmetry and future server-side revocation.
func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusNoContent)
}

// POST /admin/v1/auth/change-password — operator changes their own password.
// Auth comes from the JWT middleware (principal in context); the body never
// reaches the logs and no hash/password is ever returned. A wrong current
// password is a 400 (not 401) so it does NOT trigger the client's auto-logout.
func (h *AuthHandler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	if !h.ready(w) {
		return
	}
	p, ok := auth.FromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "unauthenticated")
		return
	}
	var body struct {
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION_ERROR", "invalid request body")
		return
	}

	u, err := h.users.GetByID(r.Context(), p.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "could not change password")
		return
	}
	// Wrong current password → 400 (human, no technical detail). Not 401, to
	// avoid the client treating it as an expired session.
	if !auth.VerifyPassword(u.PasswordHash, body.CurrentPassword) {
		writeError(w, http.StatusBadRequest, "INVALID_CURRENT_PASSWORD", "current password is incorrect")
		return
	}
	if len(body.NewPassword) < auth.MinPasswordLen {
		writeError(w, http.StatusBadRequest, "WEAK_PASSWORD", "new password must be at least 12 characters")
		return
	}
	if auth.VerifyPassword(u.PasswordHash, body.NewPassword) {
		writeError(w, http.StatusConflict, "SAME_PASSWORD", "new password must differ from the current one")
		return
	}

	hash, err := auth.HashPassword(body.NewPassword)
	if err != nil {
		writeError(w, http.StatusBadRequest, "WEAK_PASSWORD", "new password must be at least 12 characters")
		return
	}
	if err := h.users.UpdatePassword(r.Context(), u.ID, hash); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "could not change password")
		return
	}
	slog.InfoContext(r.Context(), "admin.password_changed", "admin_user_id", u.ID) // no password/hash
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// writeJSON is shared with other handlers (helpers.go); declared there.
