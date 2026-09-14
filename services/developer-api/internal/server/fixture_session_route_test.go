package server

import (
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/banzami/banzami/services/developer-api/internal/accountidentity"
	"github.com/banzami/banzami/services/developer-api/internal/config"
	"github.com/banzami/banzami/services/developer-api/internal/developer"
)

type okMailer struct{}

func (okMailer) SendVerificationCode(string, string) error { return nil }

// The fixture-session route sits behind the internal key (the public edge also
// refuses /internal/), and even with the key it serves only fixture identities.
func TestFixtureSessionRoute_IsInternalAndFixtureOnly(t *testing.T) {
	svc := accountidentity.NewService(accountidentity.NewMemStore(), accountidentity.NewMemLimiter(), okMailer{},
		accountidentity.ServiceConfig{OTPPepper: "p", SessionSecret: "s", FixturesEnabled: true})
	auth := accountidentity.NewHandlers(svc, "https://developers.banzami.com", true)
	dev := developer.NewHandlers(developer.NewService(developer.NewMemStore(), "s", "k", 0))
	h := New(&config.Config{Environment: "sandbox", ConsoleOrigin: "https://developers.banzami.com", InternalAPIKey: "internal-key"},
		Deps{Auth: auth, Dev: dev})

	post := func(key, body string) *httptest.ResponseRecorder {
		r := httptest.NewRequest("POST", "/internal/v1/fixture-sessions", strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		if key != "" {
			r.Header.Set("X-Internal-Key", key)
		}
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		return w
	}
	fixture := `{"email":"e2e-route@banzami-e2e.test"}`
	if w := post("", fixture); w.Code != 401 {
		t.Fatalf("no key: %d", w.Code)
	}
	if w := post("wrong", fixture); w.Code != 401 {
		t.Fatalf("wrong key: %d", w.Code)
	}
	if w := post("internal-key", `{"email":"founder@banzami.com"}`); w.Code != 404 {
		t.Fatalf("a real address with the key: %d %s", w.Code, w.Body.String())
	}
	w := post("internal-key", fixture)
	if w.Code != 200 || !strings.Contains(w.Body.String(), "session_token") {
		t.Fatalf("fixture with the key: %d %s", w.Code, w.Body.String())
	}
}
