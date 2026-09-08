package handler

// The second factor, as endpoints.
//
// Three states an operator can be in, and each has exactly one way forward:
//
//   no factor          login returns an ENROLMENT token -> /mfa/enrol -> /mfa/enrol/confirm
//   factor, no session login returns a CHALLENGE token  -> /mfa/verify
//   full session       everything else
//
// None of the tokens login hands back is a session. The middleware refuses any
// token whose purpose is not "session", so the only thing a correct password
// buys is the right to attempt the second step.

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/banzami/banzami/services/admin-api/internal/auth"
	"github.com/banzami/banzami/services/admin-api/internal/service"
)

// MFAStore is what these endpoints need. An interface so an unconfigured
// deployment is a nil value rather than a half-built service.
type MFAStore interface {
	Status(ctx context.Context, adminUserID string) (service.MFAStatus, error)
	BeginEnrolment(ctx context.Context, adminUserID, accountEmail string) (secret, uri string, err error)
	BeginReplacement(ctx context.Context, adminUserID, accountEmail string) (secret, uri string, err error)
	ConfirmEnrolment(ctx context.Context, adminUserID, code string) ([]string, error)
	Verify(ctx context.Context, adminUserID, code string) error
	VerifyForReauthentication(ctx context.Context, adminUserID, code string) error
	Reset(ctx context.Context, adminUserID string) error
	RegenerateRecoveryCodes(ctx context.Context, adminUserID string) ([]string, error)
}

// MFAHandler serves the enrolment and verification endpoints.
type MFAHandler struct {
	mfa       MFAStore
	users     LoginStore
	jwtSecret string
	ttl       time.Duration
	audit     AuditSink
}

func NewMFAHandler(mfa MFAStore, users LoginStore, jwtSecret string, ttl time.Duration) *MFAHandler {
	return &MFAHandler{mfa: mfa, users: users, jwtSecret: jwtSecret, ttl: ttl}
}

func (h *MFAHandler) WithAudit(a AuditSink) *MFAHandler { h.audit = a; return h }

func (h *MFAHandler) ready(w http.ResponseWriter) bool {
	if h.mfa == nil {
		writeError(w, http.StatusServiceUnavailable, "UNAVAILABLE", "the second factor is not configured on this deployment")
		return false
	}
	return true
}

// bearer parses the token on the request and requires one of the given purposes.
//
// These endpoints are outside the session middleware by necessity — the caller
// does not have a session yet, that is the point — so each one states which
// purpose it accepts rather than accepting whatever arrives.
func (h *MFAHandler) bearer(w http.ResponseWriter, r *http.Request, want ...string) (auth.Principal, bool) {
	tok, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	if !ok || tok == "" {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing token")
		return auth.Principal{}, false
	}
	p, err := auth.Parse(h.jwtSecret, tok)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid or expired token")
		return auth.Principal{}, false
	}
	for _, wp := range want {
		if p.Purpose == wp {
			return p, true
		}
	}
	writeError(w, http.StatusForbidden, "WRONG_TOKEN_PURPOSE", "this token cannot be used here")
	return auth.Principal{}, false
}

// POST /admin/v1/auth/mfa/enrol   (enrolment token)
//
// Returns the secret and its provisioning URI once. Nothing reads them back:
// the stored copy is encrypted and no endpoint decrypts it to a caller.
func (h *MFAHandler) Enrol(w http.ResponseWriter, r *http.Request) {
	if !h.ready(w) {
		return
	}
	p, ok := h.bearer(w, r, auth.PurposeMFAEnroll)
	if !ok {
		return
	}
	secret, uri, err := h.mfa.BeginEnrolment(r.Context(), p.ID, p.Email)
	if err != nil {
		writeError(w, http.StatusConflict, "ENROLMENT_REFUSED", err.Error())
		return
	}
	// The secret is a credential: logged by id, never by value.
	slog.InfoContext(r.Context(), "admin.mfa.enrolment_started", "admin_user_id", p.ID)
	writeJSON(w, http.StatusOK, map[string]any{"secret": secret, "otpauth_uri": uri})
}

// POST /admin/v1/auth/mfa/enrol/confirm   (enrolment token)  {code}
//
// Proving one code is what makes the factor count. Until then it gates nothing,
// so a half-finished enrolment cannot lock an operator out of their own console.
func (h *MFAHandler) ConfirmEnrol(w http.ResponseWriter, r *http.Request) {
	if !h.ready(w) {
		return
	}
	p, ok := h.bearer(w, r, auth.PurposeMFAEnroll)
	if !ok {
		return
	}
	var body struct {
		Code string `json:"code"`
	}
	_ = json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&body)

	codes, err := h.mfa.ConfirmEnrolment(r.Context(), p.ID, body.Code)
	if err != nil {
		if errors.Is(err, service.ErrMFACodeRejected) {
			writeError(w, http.StatusUnauthorized, "MFA_CODE_REJECTED", "that code did not verify")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "could not confirm the second factor")
		return
	}
	h.writeAudit(r, p, "MFA_ENROLLED", map[string]string{"factor": "TOTP", "recovery_codes_issued": itoa(len(codes))})
	slog.InfoContext(r.Context(), "admin.mfa.enrolled", "admin_user_id", p.ID) // never the seed or the codes

	// NOT a session yet.
	//
	// The recovery codes exist in readable form exactly once, in this response.
	// Handing back a session here would let the operator navigate away with the
	// only copy still on screen — so the session is issued by /acknowledge, and
	// this token can do nothing else.
	ack := p
	ack.Purpose = auth.PurposeMFAAck
	tok, exp, err := auth.Issue(h.jwtSecret, ack, mfaChallengeTTL, time.Now())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "could not issue the acknowledgement step")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"recovery_codes":    codes,
		"acknowledge_token": tok,
		"expires_at":        exp,
		"account":           p.Email,
	})
}

// POST /admin/v1/auth/mfa/enrol/acknowledge   (acknowledgement token)
//
// The operator confirms they have stored the recovery codes. Only then does the
// login complete. Nothing is re-issued here and nothing is shown again: the
// codes are already hashed, and this endpoint cannot produce them.
func (h *MFAHandler) AcknowledgeRecovery(w http.ResponseWriter, r *http.Request) {
	if !h.ready(w) {
		return
	}
	p, ok := h.bearer(w, r, auth.PurposeMFAAck)
	if !ok {
		return
	}
	h.writeAudit(r, p, "MFA_RECOVERY_CODES_ACKNOWLEDGED", nil)
	h.issueSession(w, r, p, "MFA_ENROLLED", nil)
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

// POST /admin/v1/auth/mfa/verify   (challenge token)  {code}
//
// The code may be a TOTP or a recovery code; the service decides and consumes
// whichever it used. Both are one-time, and both are refused on reuse.
func (h *MFAHandler) Verify(w http.ResponseWriter, r *http.Request) {
	if !h.ready(w) {
		return
	}
	p, ok := h.bearer(w, r, auth.PurposeMFAChallenge)
	if !ok {
		return
	}
	var body struct {
		Code string `json:"code"`
	}
	_ = json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&body)

	if err := h.mfa.Verify(r.Context(), p.ID, body.Code); err != nil {
		h.writeAudit(r, p, "MFA_FAILED", map[string]string{"reason": "CODE_REJECTED"})
		writeError(w, http.StatusUnauthorized, "MFA_CODE_REJECTED", "that code did not verify")
		return
	}
	h.writeAudit(r, p, "MFA_VERIFIED", nil)
	h.issueSession(w, r, p, "MFA_VERIFIED", nil)
}

// reauthenticate re-proves the operator, in a session, before an operation that
// changes what guards the account.
//
// A long-lived session is not enough for these. A session is what an attacker
// has if they walked past an unlocked laptop, and "regenerate the recovery
// codes" or "replace the factor" from that position is the whole account. So
// both ask for the password AND a current second factor again.
func (h *MFAHandler) reauthenticate(w http.ResponseWriter, r *http.Request) (auth.Principal, bool) {
	p, ok := auth.FromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "unauthenticated")
		return auth.Principal{}, false
	}
	var body struct {
		Password string `json:"password"`
		Code     string `json:"code"`
	}
	_ = json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&body)
	if body.Password == "" || body.Code == "" {
		writeError(w, http.StatusBadRequest, "REAUTH_REQUIRED", "password and a current code are required")
		return auth.Principal{}, false
	}
	u, err := h.users.GetByID(r.Context(), p.ID)
	if err != nil || u.Status != "ACTIVE" {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "unauthenticated")
		return auth.Principal{}, false
	}
	if u.PasswordHash == "" || !auth.VerifyPassword(u.PasswordHash, body.Password) {
		auth.DummyVerify(body.Password)
		h.writeAudit(r, p, "MFA_REAUTH_FAILED", map[string]string{"reason": "BAD_PASSWORD"})
		writeError(w, http.StatusUnauthorized, "REAUTH_FAILED", "password or code incorrect")
		return auth.Principal{}, false
	}
	if err := h.mfa.VerifyForReauthentication(r.Context(), p.ID, body.Code); err != nil {
		h.writeAudit(r, p, "MFA_REAUTH_FAILED", map[string]string{"reason": "BAD_CODE"})
		writeError(w, http.StatusUnauthorized, "REAUTH_FAILED", "password or code incorrect")
		return auth.Principal{}, false
	}
	return p, true
}

// POST /admin/v1/auth/mfa/replace   (session + re-authentication)
//
// The authenticator is gone. This does NOT disable the factor — it discards the
// old one and starts enrolling a new one, and until the new authenticator
// proves a code the operator's login yields an enrolment token, never a
// session. A SUPER_ADMIN with a password and no second factor cannot hold a
// privileged session at any point in this flow.
func (h *MFAHandler) Replace(w http.ResponseWriter, r *http.Request) {
	if !h.ready(w) {
		return
	}
	p, ok := h.reauthenticate(w, r)
	if !ok {
		return
	}
	secret, uri, err := h.mfa.BeginReplacement(r.Context(), p.ID, p.Email)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "could not start the replacement")
		return
	}
	h.writeAudit(r, p, "MFA_FACTOR_REPLACEMENT_STARTED", map[string]string{"factor": "TOTP"})
	slog.InfoContext(r.Context(), "admin.mfa.replacement_started", "admin_user_id", p.ID) // never the seed

	// An enrolment token, exactly as a first-time enrolment gets: the next step
	// is confirming a code from the new authenticator, and nothing else.
	enr := p
	enr.Purpose = auth.PurposeMFAEnroll
	tok, exp, terr := auth.Issue(h.jwtSecret, enr, mfaChallengeTTL, time.Now())
	if terr != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "could not issue the enrolment step")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"secret": secret, "otpauth_uri": uri, "enrolment_token": tok, "expires_at": exp,
	})
}

// GET /admin/v1/auth/mfa/status   (session)
func (h *MFAHandler) Status(w http.ResponseWriter, r *http.Request) {
	if !h.ready(w) {
		return
	}
	p, ok := auth.FromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "unauthenticated")
		return
	}
	st, err := h.mfa.Status(r.Context(), p.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "could not read the second factor")
		return
	}
	writeJSON(w, http.StatusOK, st)
}

// POST /admin/v1/auth/mfa/recovery-codes   (session + re-authentication)
//
// Regenerating invalidates every unused code the operator holds, so it is not
// something a long-lived session should be able to do on its own: password and
// a current second factor are required again.
func (h *MFAHandler) RegenerateRecoveryCodes(w http.ResponseWriter, r *http.Request) {
	if !h.ready(w) {
		return
	}
	p, ok := h.reauthenticate(w, r)
	if !ok {
		return
	}
	codes, err := h.mfa.RegenerateRecoveryCodes(r.Context(), p.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "could not issue recovery codes")
		return
	}
	h.writeAudit(r, p, "MFA_RECOVERY_CODES_REGENERATED", map[string]string{"count": itoa(len(codes))})
	writeJSON(w, http.StatusOK, map[string]any{"recovery_codes": codes})
}

// issueSession mints the real session once both factors are proven.
func (h *MFAHandler) issueSession(w http.ResponseWriter, r *http.Request, p auth.Principal, how string, recoveryCodes []string) {
	ctx := r.Context()
	u, err := h.users.GetByID(ctx, p.ID)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid or expired token")
		return
	}
	// Re-checked here, not trusted from the challenge: status and token_version
	// can have changed between the password step and this one, and a suspended
	// operator finishing an in-flight MFA is exactly the case that matters.
	if u.Status != "ACTIVE" || u.TokenVersion != p.TokenVersion {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid or expired token")
		return
	}
	principal := auth.Principal{ID: u.ID, Email: u.Email, FullName: u.FullName, Role: u.Role, TokenVersion: u.TokenVersion, Purpose: auth.PurposeSession}
	token, exp, err := auth.Issue(h.jwtSecret, principal, h.ttl, time.Now())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "could not issue session")
		return
	}
	h.users.ResetLoginCountersAndTouch(ctx, u.ID)
	h.users.RecordLoginAttempt(ctx, u.Email, &u.ID, clientIP(r), r.UserAgent(), true, how)
	out := map[string]any{
		"token":      token,
		"expires_at": exp,
		"user":       userDTO{ID: u.ID, Email: u.Email, FullName: u.FullName, Role: u.Role},
	}
	if len(recoveryCodes) > 0 {
		// Shown exactly once, at enrolment. Never stored in the clear and never
		// returned again — regenerating is the only way to get a new set.
		out["recovery_codes"] = recoveryCodes
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *MFAHandler) writeAudit(r *http.Request, p auth.Principal, action string, after map[string]string) {
	if h.audit == nil {
		return
	}
	entry := service.AuditEntry{
		AdminUserID: p.ID, AdminEmail: p.Email, FullName: p.FullName, Role: p.Role,
		Action: action, EntityType: "operator", EntityID: p.ID,
		StatusCode: http.StatusOK, IP: clientIP(r), UserAgent: r.UserAgent(),
	}
	if after != nil {
		entry.After = after
	}
	h.audit.Write(r.Context(), entry)
}
