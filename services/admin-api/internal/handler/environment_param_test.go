package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/banzami/banzami/services/admin-api/internal/auth"
	"github.com/banzami/banzami/services/admin-api/internal/service"
)

// A2-22 — the review handlers chose their pool with
// `r.URL.Query().Get("environment") == "SANDBOX"`: anything else, "sandbox"
// and "SANDBX" included, reached the primary (Live) pool. The environment is
// now parsed strictly: SANDBOX/LIVE in any case pick that pool, absent is Live
// (the console sends nothing for Live), and an unknown value is refused 400
// before any pool is reached.
//
// Each handler is built with a Live service whose database is unreachable and
// NO Sandbox service, so the three outcomes are distinct:
//
//	400 INVALID_ENVIRONMENT — refused, no pool touched
//	503 UNAVAILABLE         — the Sandbox pool was chosen (and is not configured)
//	anything else           — the Live pool was reached

func deadPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	pool, err := pgxpool.New(context.Background(), "postgres://nobody:x@127.0.0.1:1/none?connect_timeout=1")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	return pool
}

type envCall struct {
	method, pattern, path string
	h                     http.HandlerFunc
}

func envCalls(t *testing.T) map[string]envCall {
	pool := deadPool(t)
	kyc := NewKycReviewHandler(service.NewKycReviewService(pool, nil), nil)
	cc := NewComplianceCasesHandler(service.NewComplianceService(pool, "LIVE"), nil)
	proofs := NewProofsHandler(service.NewProofAdminService(pool), nil)
	notif := NewNotificationsHandler(service.NewNotificationService(pool, "LIVE"), nil)
	return map[string]envCall{
		"kyc.list":           {http.MethodGet, "/admin/v1/kyc/cases", "/admin/v1/kyc/cases", kyc.List},
		"kyc.get":            {http.MethodGet, "/admin/v1/kyc/cases/{id}", "/admin/v1/kyc/cases/c-1", kyc.Get},
		"compliance.list":    {http.MethodGet, "/admin/v1/compliance/cases", "/admin/v1/compliance/cases", cc.List},
		"compliance.get":     {http.MethodGet, "/admin/v1/compliance/cases/{id}", "/admin/v1/compliance/cases/c-1", cc.Get},
		"proofs.list":        {http.MethodGet, "/admin/v1/proofs", "/admin/v1/proofs", proofs.List},
		"notifications.list": {http.MethodGet, "/admin/v1/notifications", "/admin/v1/notifications", notif.List},
		"notifications.read": {http.MethodPost, "/admin/v1/notifications/{id}/read", "/admin/v1/notifications/n-1/read", notif.MarkRead},
	}
}

func callWithEnv(c envCall, rawEnv string, present bool) *httptest.ResponseRecorder {
	path := c.path
	if present {
		path += "?environment=" + rawEnv
	}
	r := chi.NewRouter()
	r.Method(c.method, c.pattern, c.h)
	req := httptest.NewRequest(c.method, path, strings.NewReader(`{}`))
	req = req.WithContext(auth.WithPrincipal(req.Context(), auth.Principal{ID: "op", Email: "op@banzami.test", Role: auth.RoleSuperAdmin}))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestReviewHandlers_EnvironmentIsParsedStrictly(t *testing.T) {
	for name, c := range envCalls(t) {
		t.Run(name, func(t *testing.T) {
			for _, bad := range []string{"SANDBX", "sandbox1", "PRODUCTION", "", "%20"} {
				w := callWithEnv(c, bad, true)
				if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), "INVALID_ENVIRONMENT") {
					t.Fatalf("environment=%q: %d %s — an unknown environment must be refused, never sent to the Live pool", bad, w.Code, w.Body.String())
				}
			}
			for _, sbx := range []string{"SANDBOX", "sandbox", "Sandbox", "%20SANDBOX%20"} {
				if w := callWithEnv(c, sbx, true); w.Code != http.StatusServiceUnavailable {
					t.Fatalf("environment=%q: %d %s — the Sandbox pool (not configured here) must be chosen", sbx, w.Code, w.Body.String())
				}
			}
			for _, live := range []string{"LIVE", "live"} {
				if w := callWithEnv(c, live, true); w.Code == http.StatusBadRequest || w.Code == http.StatusServiceUnavailable {
					t.Fatalf("environment=%q: %d — Live must reach the Live pool", live, w.Code)
				}
			}
			if w := callWithEnv(c, "", false); w.Code == http.StatusBadRequest || w.Code == http.StatusServiceUnavailable {
				t.Fatalf("no environment: %d — the console's Live default must still reach the Live pool", w.Code)
			}
		})
	}
}

// The KYB review forwards to a gateway per environment: which one answered is
// directly observable.
func TestMerchantKyb_EnvironmentIsParsedStrictly(t *testing.T) {
	var liveHits, sandboxHits atomic.Int32
	gw := func(n *atomic.Int32) *service.GatewayClient {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			n.Add(1)
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"documents":[],"merchants":[]}`))
		}))
		t.Cleanup(srv.Close)
		return service.NewGatewayClient(srv.URL, "k")
	}
	h := NewMerchantKybHandler(gw(&liveHits), gw(&sandboxHits))
	c := envCall{http.MethodGet, "/admin/v1/merchant-kyb/documents", "/admin/v1/merchant-kyb/documents", h.List}

	if w := callWithEnv(c, "SANDBX", true); w.Code != http.StatusBadRequest || liveHits.Load()+sandboxHits.Load() != 0 {
		t.Fatalf("SANDBX: %d, live=%d sandbox=%d — refused before any gateway", w.Code, liveHits.Load(), sandboxHits.Load())
	}
	if callWithEnv(c, "sandbox", true); sandboxHits.Load() != 1 || liveHits.Load() != 0 {
		t.Fatalf("sandbox: live=%d sandbox=%d — the Sandbox gateway must answer", liveHits.Load(), sandboxHits.Load())
	}
	if callWithEnv(c, "", false); liveHits.Load() != 1 {
		t.Fatalf("no environment: live=%d — the Live gateway must answer", liveHits.Load())
	}
}

func TestAttention_EnvironmentIsParsedStrictly(t *testing.T) {
	live := &fakeAttentionGW{env: "LIVE", cats: map[string]int{"disputes": 1}}
	h := NewAttentionHandler(map[string]AttentionSource{"LIVE": {Gateway: live}})
	if code, _ := askAttention(t, h, auth.RoleSuperAdmin, "SANDBX"); code != http.StatusBadRequest || live.calls.Load() != 0 {
		t.Fatalf("SANDBX: %d, live calls %d — refused, never the Live summary", code, live.calls.Load())
	}
	if code, _ := askAttention(t, h, auth.RoleSuperAdmin, "sandbox"); code != http.StatusServiceUnavailable || live.calls.Load() != 0 {
		t.Fatalf("sandbox: %d, live calls %d — the Sandbox source (not configured) must be chosen", code, live.calls.Load())
	}
	if code, got := askAttention(t, h, auth.RoleSuperAdmin, "LIVE"); code != http.StatusOK || got.Environment != "LIVE" {
		t.Fatalf("LIVE: %d %+v", code, got)
	}
}
