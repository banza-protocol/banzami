package handler

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// 0145 at the gateway: a Project's simulated rail is its own. Two Projects in
// different Workspaces bound to the same Business (one connected to the other's
// by consent code) never take each other's rail down, and the Project Core
// records as a link's or session's creator comes from the authenticated key,
// never from anything the developer sends.
//
// Mutation: key the rail by Business alone (drop p.ProjectID in ExternalRail,
// SetExternalRail or PayAsTestPayer) and
// TestSandboxRail_AProjectsSwitchNeverReachesAnotherProject fails; stamp the
// creator from the body and TestCreatorProjectComesFromTheKey fails.

func principalOn(project, merchant string) *middleware.DeveloperPrincipal {
	return &middleware.DeveloperPrincipal{ProjectID: project, WorkspaceID: "ws-" + project, Environment: "SANDBOX", Bound: true,
		MerchantID: merchant, WalletID: "w-shared", WalletAccountID: "wa-shared",
		Scopes: []string{"sandbox:read", "sandbox:write", "payment_links:write", "payment_sessions:write"}}
}

func getRail(t *testing.T, h http.Handler) string {
	t.Helper()
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/v1/sandbox/external-rail", nil))
	var out struct{ State string }
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	return out.State
}

func TestSandboxRail_AProjectsSwitchNeverReachesAnotherProject(t *testing.T) {
	up := newUpstream(t)
	rails := &fakeRails{}
	_ = up
	sessions := sbxSessions{"shared": {SessionID: "shared", MerchantID: "merchant-shared", PaymentLinkSlug: slug("s-shared")}}
	h := NewSandboxDevHandler(up.srv.URL, "ik", sessions, sbxLinks{}).WithExternalRails(rails)
	a := railRouter(h, principalOn("proj-A", "merchant-shared"))
	b := railRouter(h, principalOn("proj-B", "merchant-shared"))

	if rec := put(t, a, "/v1/sandbox/external-rail", `{"state":"UNAVAILABLE"}`); rec.Code != http.StatusOK {
		t.Fatalf("A takes its rail down: %d %s", rec.Code, rec.Body)
	}
	if got := getRail(t, a); got != "UNAVAILABLE" {
		t.Fatalf("A sees %q", got)
	}
	if got := getRail(t, b); got != "AVAILABLE" {
		t.Fatalf("B, on the same Business, sees A's switch: %q", got)
	}
	if rec := post(t, a, "/v1/sandbox/test-payers/tp-a/payments", `{"payment_session_id":"shared","simulate":"DECLINED"}`, "ka"); rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("A's rail-dependent payment fails closed: %d %s", rec.Code, rec.Body)
	}
	// B gets the outcome it asked for — a simulated decline — not A's outage.
	if rec := post(t, b, "/v1/sandbox/test-payers/tp-b/payments", `{"payment_session_id":"shared","simulate":"DECLINED"}`, "kb"); rec.Code == http.StatusServiceUnavailable ||
		strings.Contains(rec.Body.String(), "PROVIDER_UNAVAILABLE") || !strings.Contains(rec.Body.String(), "DECLINED") {
		t.Fatalf("B's rail-dependent payment was stopped by A's switch: %d %s", rec.Code, rec.Body)
	}
	if rec := post(t, b, "/v1/sandbox/test-payers/tp-b/payments", `{"payment_session_id":"shared"}`, "kb2"); rec.Code != http.StatusOK {
		t.Fatalf("B's wallet payment: %d %s", rec.Code, rec.Body)
	}

	// Reverse.
	put(t, a, "/v1/sandbox/external-rail", `{"state":"AVAILABLE"}`)
	put(t, b, "/v1/sandbox/external-rail", `{"state":"UNAVAILABLE"}`)
	if getRail(t, a) != "AVAILABLE" || getRail(t, b) != "UNAVAILABLE" {
		t.Fatalf("reverse: A %q B %q", getRail(t, a), getRail(t, b))
	}
	if rails.state["proj-A|merchant-shared"] != "AVAILABLE" || rails.state["proj-B|merchant-shared"] != "UNAVAILABLE" || len(rails.state) != 2 {
		t.Fatalf("each switch is one Project's: %v", rails.state)
	}
}

// coreCapture is Core's internal API, recording the JSON each create sends.
type coreCapture struct {
	mu     sync.Mutex
	bodies map[string]map[string]any
}

func (c *coreCapture) server(t *testing.T) *httptest.Server {
	c.bodies = map[string]map[string]any{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		var body map[string]any
		_ = json.Unmarshal(raw, &body)
		c.mu.Lock()
		c.bodies[r.URL.Path] = body
		c.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		if strings.HasSuffix(r.URL.Path, "/payment-links") {
			w.WriteHeader(http.StatusCreated)
			_, _ = w.Write([]byte(`{"id":"l1","slug":"abc123","merchant_id":"merchant-shared","wallet_id":"w-shared","currency":"AOA","status":"ACTIVE","created_at":"2026-09-14T00:00:00Z","updated_at":"2026-09-14T00:00:00Z"}`))
			return
		}
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"session_id":"s1","merchant_id":"merchant-shared","wallet_account_id":"wa-shared","currency":"AOA","status":"ACTIVE","payment_link_slug":"abc123","created_at":"2026-09-14T00:00:00Z"}`))
	}))
	t.Cleanup(srv.Close)
	return srv
}

func TestCreatorProjectComesFromTheKey(t *testing.T) {
	capture := &coreCapture{}
	client := service.NewCoreApiClient(capture.server(t).URL, "k")

	links := NewPaymentLinkHandler(service.NewCoreApiPaymentLinkService(client), nil, nil)
	req := httptest.NewRequest(http.MethodPost, "/v1/payment-links",
		strings.NewReader(`{"amount_minor":1000,"currency":"AOA","sandbox_project_id":"proj-B"}`))
	req = req.WithContext(middleware.ContextWithDeveloperPrincipal(req.Context(), principalOn("proj-A", "merchant-shared")))
	rec := httptest.NewRecorder()
	links.Create(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create link: %d %s", rec.Code, rec.Body)
	}
	if got := capture.bodies["/internal/v1/payment-links"]["sandbox_project_id"]; got != "proj-A" {
		t.Fatalf("the link's creator must be the key's Project, not the body's: %v", got)
	}

	sessions := NewPaymentSessionHandler(service.NewCoreApiPaymentSessionService(client), activeMerchant(), nil)
	req = httptest.NewRequest(http.MethodPost, "/v1/payment-sessions",
		strings.NewReader(`{"purpose":"ORDER","amount_minor":1000,"currency":"AOA","sandbox_project_id":"proj-B"}`))
	req = req.WithContext(middleware.ContextWithDeveloperPrincipal(req.Context(), principalOn("proj-A", "merchant-shared")))
	rec = httptest.NewRecorder()
	sessions.Create(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create session: %d %s", rec.Code, rec.Body)
	}
	if got := capture.bodies["/internal/v1/payment-sessions"]["sandbox_project_id"]; got != "proj-A" {
		t.Fatalf("the session's creator must be the key's Project, not the body's: %v", got)
	}

	// A Business (merchant session) creates with no Project at all.
	req = httptest.NewRequest(http.MethodPost, "/v1/payment-sessions",
		strings.NewReader(`{"wallet_account_id":"wa-shared","purpose":"ORDER","amount_minor":1000,"sandbox_project_id":"proj-B"}`))
	req = req.WithContext(middleware.ContextWithPrincipal(req.Context(), &middleware.Principal{MerchantID: "merchant-shared", Environment: "SANDBOX"}))
	rec = httptest.NewRecorder()
	sessions.Create(rec, req)
	if _, present := capture.bodies["/internal/v1/payment-sessions"]["sandbox_project_id"]; rec.Code == http.StatusCreated && present {
		t.Fatalf("a Business's own session names no Project: %v", capture.bodies["/internal/v1/payment-sessions"])
	}
}
