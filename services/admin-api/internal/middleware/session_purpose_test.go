package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/banzami/banzami/services/admin-api/internal/auth"
	"github.com/banzami/banzami/services/admin-api/internal/service"
)

// A token that only proves a password must not open an operator route.
//
// The MFA challenge and enrolment tokens are signed with the same key and carry
// the same subject as a session. Without a purpose check they would authorise
// everything, and the second factor would be a screen rather than a control —
// a caller could simply present what login handed back.

type purposeStore struct{ u service.AdminUser }

func (s *purposeStore) GetByID(context.Context, string) (service.AdminUser, error) { return s.u, nil }

func TestAdminJWT_RefusesEveryTokenThatIsNotASession(t *testing.T) {
	const secret = "purpose-test-secret-long-enough-for-hs256"
	u := service.AdminUser{ID: "op-1", Email: "fidel.monteiro@banzami.com", Role: "SUPER_ADMIN", Status: "ACTIVE", TokenVersion: 2}
	mw := AdminJWT(secret, &purposeStore{u: u})

	reached := false
	h := mw(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { reached = true; w.WriteHeader(200) }))

	call := func(purpose string) int {
		reached = false
		p := auth.Principal{ID: u.ID, Email: u.Email, Role: u.Role, TokenVersion: u.TokenVersion, Purpose: purpose}
		tok, _, err := auth.Issue(secret, p, time.Hour, time.Now())
		if err != nil {
			t.Fatal(err)
		}
		req := httptest.NewRequest(http.MethodGet, "/admin/v1/merchants", nil)
		req.Header.Set("Authorization", "Bearer "+tok)
		w := httptest.NewRecorder()
		h.ServeHTTP(w, req)
		return w.Code
	}

	for _, purpose := range []string{auth.PurposeMFAChallenge, auth.PurposeMFAEnroll} {
		if code := call(purpose); code != http.StatusUnauthorized {
			t.Fatalf("a %q token reached an operator route (status %d)", purpose, code)
		}
		if reached {
			t.Fatalf("a %q token reached the handler", purpose)
		}
	}

	if code := call(auth.PurposeSession); code != http.StatusOK || !reached {
		t.Fatalf("a real session was refused (status %d, reached %v)", code, reached)
	}
}
