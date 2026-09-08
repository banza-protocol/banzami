package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// A build that cannot verify a second factor must not issue a privileged session.
//
// Login's MFA branch is guarded by `if h.mfa != nil`. Everything below it issues
// a full session from a password alone. That path is unreachable today only
// because h.mfa is nil exactly when there is no database, and then there is no
// user to authenticate — a coincidence of wiring, not a rule. A refactor that
// builds the handler without WithMFA would turn SUPER_ADMIN administration into
// password-only and every existing test would still pass.
func TestLogin_RefusesASuperAdminSessionWhenMFACannotBeVerified(t *testing.T) {
	u := activeUser(t)
	u.Role = "SUPER_ADMIN"
	// Deliberately no .WithMFA — this is the misconfiguration being asserted.
	h := NewAuthHandler(&fakeStore{user: u}, "secret-xyz", time.Hour)

	rec := httptest.NewRecorder()
	h.Login(rec, loginReq(`{"email":"op@banzami.com","password":"a-strong-password"}`))

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503 — a password alone issued a SUPER_ADMIN session", rec.Code)
	}
	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("response is not JSON: %v", err)
	}
	if _, isToken := body["token"]; isToken {
		t.Fatal("a token was issued by a build that cannot verify a second factor")
	}
	if e, _ := body["error"].(map[string]any); e == nil || e["code"] != "MFA_UNAVAILABLE" {
		t.Fatalf("error code = %v, want MFA_UNAVAILABLE", body["error"])
	}
}
