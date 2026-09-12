// A person can say who they are.
//
// The `name` column shipped with identity_users and nothing ever wrote it.
// Sign-up is email-OTP only, so every account's name was empty, and the
// Console's header avatar — which falls back to the first two letters of the
// email — showed the same two characters for everyone at a domain. Two
// colleagues in one workspace were indistinguishable, and the only thing
// identifying the signed-in person was a tooltip.
//
// These hold the authority rules for the one thing an account holder may change
// about themselves: it is their own record and nobody else's, the id comes from
// the session so there is no field to forge, and it needs Origin + CSRF like
// every other mutation on this surface.
package accountidentity

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
)

// signedIn runs the real OTP flow and returns the session cookie and CSRF token.
func signedIn(t *testing.T, h *Handlers, mail *fakeMailer, email string) (*http.Cookie, string) {
	t.Helper()
	do(h.RequestOTP, "POST", "/auth/request-otp", `{"email":"`+email+`"}`, origin(), nil)
	if mail.code == "" {
		t.Fatal("no OTP delivered")
	}
	rr := do(h.Verify, "POST", "/auth/verify", `{"email":"`+email+`","code":"`+mail.code+`"}`, origin(), nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("verify: want 200, got %d (%s)", rr.Code, rr.Body.String())
	}
	var out struct {
		CSRF string `json:"csrf_token"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	cs := rr.Result().Cookies()
	if len(cs) == 0 {
		t.Fatal("no session cookie")
	}
	return cs[0], out.CSRF
}

func nameOf(t *testing.T, h *Handlers, c *http.Cookie) string {
	t.Helper()
	rr := do(h.Me, "GET", "/auth/me", "", nil, []*http.Cookie{c})
	if rr.Code != http.StatusOK {
		t.Fatalf("me: want 200, got %d", rr.Code)
	}
	var out struct {
		User struct {
			Name string `json:"name"`
		} `json:"user"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	return out.User.Name
}

func TestUpdateMe_SetsTheNameAndMeReadsItBack(t *testing.T) {
	h, _, mail := newH(t, ServiceConfig{})
	c, csrf := signedIn(t, h, mail, "dev@x.co")

	if got := nameOf(t, h, c); got != "" {
		t.Fatalf("a fresh account should have no name, got %q", got)
	}

	hdr := origin()
	hdr["X-CSRF-Token"] = csrf
	rr := do(h.UpdateMe, "POST", "/auth/me", `{"name":"Fidel Monteiro"}`, hdr, []*http.Cookie{c})
	if rr.Code != http.StatusOK {
		t.Fatalf("update: want 200, got %d (%s)", rr.Code, rr.Body.String())
	}
	if got := nameOf(t, h, c); got != "Fidel Monteiro" {
		t.Errorf("name = %q, want %q", got, "Fidel Monteiro")
	}
}

func TestUpdateMe_NeedsOriginCSRFAndASession(t *testing.T) {
	h, _, mail := newH(t, ServiceConfig{})
	c, csrf := signedIn(t, h, mail, "dev@x.co")

	// Wrong origin — refused before anything else is looked at.
	rr := do(h.UpdateMe, "POST", "/auth/me", `{"name":"Intruso"}`,
		map[string]string{"Origin": "https://evil.example"}, []*http.Cookie{c})
	if rr.Code != http.StatusForbidden {
		t.Errorf("foreign origin: want 403, got %d", rr.Code)
	}

	// Right origin, no session.
	rr = do(h.UpdateMe, "POST", "/auth/me", `{"name":"Intruso"}`, origin(), nil)
	if rr.Code != http.StatusUnauthorized {
		t.Errorf("no session: want 401, got %d", rr.Code)
	}

	// Session but no CSRF token — the cross-site-request case.
	rr = do(h.UpdateMe, "POST", "/auth/me", `{"name":"Intruso"}`, origin(), []*http.Cookie{c})
	if rr.Code != http.StatusForbidden {
		t.Errorf("missing CSRF: want 403, got %d", rr.Code)
	}

	// Session with somebody else's CSRF token.
	hdr := origin()
	hdr["X-CSRF-Token"] = csrf + "x"
	rr = do(h.UpdateMe, "POST", "/auth/me", `{"name":"Intruso"}`, hdr, []*http.Cookie{c})
	if rr.Code != http.StatusForbidden {
		t.Errorf("wrong CSRF: want 403, got %d", rr.Code)
	}

	if got := nameOf(t, h, c); got != "" {
		t.Errorf("a refused update wrote the name anyway: %q", got)
	}
}

func TestUpdateMe_RejectsAnEmptyOrOverlongName(t *testing.T) {
	h, _, mail := newH(t, ServiceConfig{})
	c, csrf := signedIn(t, h, mail, "dev@x.co")
	hdr := origin()
	hdr["X-CSRF-Token"] = csrf

	for _, body := range []string{`{"name":""}`, `{"name":"   "}`, `{"name":"` + strings.Repeat("x", 81) + `"}`} {
		rr := do(h.UpdateMe, "POST", "/auth/me", body, hdr, []*http.Cookie{c})
		if rr.Code != http.StatusBadRequest {
			t.Errorf("body %.20s…: want 400, got %d", body, rr.Code)
		}
	}
	// A name of exactly the limit is fine, accents and all.
	ok := `{"name":"` + strings.Repeat("é", 80) + `"}`
	if rr := do(h.UpdateMe, "POST", "/auth/me", ok, hdr, []*http.Cookie{c}); rr.Code != http.StatusOK {
		t.Errorf("80 accented characters: want 200, got %d (%s)", rr.Code, rr.Body.String())
	}
}

// The caller updates their own record and nobody else's: the id comes from the
// session, so a second account is untouched however the request is shaped.
func TestUpdateMe_CannotNameAnotherAccount(t *testing.T) {
	h, _, mail := newH(t, ServiceConfig{})
	cA, csrfA := signedIn(t, h, mail, "a@x.co")
	cB, _ := signedIn(t, h, mail, "b@x.co")

	hdr := origin()
	hdr["X-CSRF-Token"] = csrfA
	// There is no id field to send; DisallowUnknownFields makes an attempt to
	// invent one a 400 rather than a silently ignored parameter.
	rr := do(h.UpdateMe, "POST", "/auth/me", `{"name":"Meu","user_id":"other"}`, hdr, []*http.Cookie{cA})
	if rr.Code != http.StatusBadRequest {
		t.Errorf("unknown field: want 400, got %d", rr.Code)
	}

	rr = do(h.UpdateMe, "POST", "/auth/me", `{"name":"Conta A"}`, hdr, []*http.Cookie{cA})
	if rr.Code != http.StatusOK {
		t.Fatalf("update A: %d (%s)", rr.Code, rr.Body.String())
	}
	if got := nameOf(t, h, cB); got != "" {
		t.Errorf("naming account A changed account B to %q", got)
	}
}

// The name itself is not written into the append-only audit log — the event
// records that the person renamed themselves, which is the fact worth keeping.
// Storing the value there would make a name unerasable.
func TestUpdateMe_AuditsTheActWithoutStoringTheName(t *testing.T) {
	h, store, mail := newH(t, ServiceConfig{})
	c, csrf := signedIn(t, h, mail, "dev@x.co")
	hdr := origin()
	hdr["X-CSRF-Token"] = csrf

	if rr := do(h.UpdateMe, "POST", "/auth/me", `{"name":"Nome Secreto"}`, hdr, []*http.Cookie{c}); rr.Code != http.StatusOK {
		t.Fatalf("update: %d", rr.Code)
	}

	seen := false
	for _, ev := range store.Audits {
		if ev.Action == "profile.name_set" {
			seen = true
			for _, v := range ev.Metadata {
				if s, ok := v.(string); ok && strings.Contains(s, "Nome Secreto") {
					t.Error("the audit event carries the name")
				}
			}
		}
	}
	if !seen {
		t.Error("no profile.name_set audit event")
	}
}
