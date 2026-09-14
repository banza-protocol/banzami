package developer

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

// A fake gateway that authenticates the Explorer's key the way the real one
// does — by asking the Service — and records what it received.
type explorerGateway struct {
	mu       sync.Mutex
	auths    []string
	paths    []string
	idem     []string
	bodies   []string
	respond  func(w http.ResponseWriter, r *http.Request)
	srv      *httptest.Server
	svc      *Service
	scopeHit []error
	wider    []error // the same key asked for a scope no operation here needs
}

func newExplorerGateway(t *testing.T, s *Service, scope string) *explorerGateway {
	g := &explorerGateway{svc: s}
	g.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		_, err := s.AuthorizeKey(r.Context(), raw, scope)
		_, widerErr := s.AuthorizeKey(r.Context(), raw, "transfers:write")
		b := make([]byte, r.ContentLength)
		_, _ = r.Body.Read(b)
		g.mu.Lock()
		g.auths = append(g.auths, raw)
		g.paths = append(g.paths, r.Method+" "+r.URL.RequestURI())
		g.idem = append(g.idem, r.Header.Get("Idempotency-Key"))
		g.bodies = append(g.bodies, string(b))
		g.scopeHit = append(g.scopeHit, err)
		g.wider = append(g.wider, widerErr)
		g.mu.Unlock()
		w.Header().Set("X-Request-ID", "req_explorer")
		if err != nil {
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = w.Write([]byte(`{"code":"UNAUTHORIZED","message":"no"}`))
			return
		}
		if g.respond != nil {
			g.respond(w, r)
			return
		}
		_, _ = w.Write([]byte(`{"environment":"SANDBOX","key_status":"ACTIVE"}`))
	}))
	t.Cleanup(g.srv.Close)
	return g
}

func explorerSvc(t *testing.T) (*Service, string) {
	t.Helper()
	s, _, ws := wsWithRoles(t)
	s.SetSandboxEnvironment(true)
	return s, mkProject(t, s, "u_owner", ws)
}

func TestExplorer_KeyIsScopedExpiringHiddenAndRevokedAfterUse(t *testing.T) {
	s, proj := explorerSvc(t)
	g := newExplorerGateway(t, s, "identity:read")
	s.SetExplorer(g.srv.URL, g.srv.Client())

	out, err := s.RunExplorerRequest(bg, "u_dev", proj, ExplorerRequest{OperationID: "getMe"})
	if err != nil {
		t.Fatalf("run: %v", err)
	}
	if out.Status != 200 || out.RequestID != "req_explorer" || g.scopeHit[0] != nil {
		t.Fatalf("the gateway must accept the Explorer key for its operation: %+v %v", out, g.scopeHit)
	}
	raw := g.auths[0]
	if !strings.HasPrefix(raw, "bz_test_sk_") {
		t.Fatalf("the Explorer key is a Sandbox secret key, got prefix %q", raw[:8])
	}
	if strings.Contains(string(out.Body), raw) || strings.Contains(out.Text, raw) {
		t.Fatal("the key must never appear in the answer")
	}
	// Scoped to the one operation: while it is live, another scope is refused.
	if g.wider[0] != ErrForbidden {
		t.Fatalf("the live Explorer key authorised a scope its operation does not need: %v", g.wider[0])
	}
	// Revoked once the answer is in.
	if _, err := s.AuthorizeKey(bg, raw, "identity:read"); err != ErrForbidden {
		t.Fatalf("the Explorer key must be revoked after use, got %v", err)
	}
	// Never listed, and not manageable as a credential.
	keys, _ := s.store.APIKeysForProject(bg, proj)
	if len(keys) != 0 {
		t.Fatalf("the Explorer key must not be listed: %+v", keys)
	}
	auth, _ := s.store.APIKeyByHash(bg, hashKey(raw, s.apiKeyPepper))
	if auth == nil || auth.Purpose != PurposeExplorer || auth.ExpiresAt == nil || auth.ExpiresAt.Sub(time.Now()) > ExplorerKeyTTL {
		t.Fatalf("the Explorer key must be EXPLORER and expire within %s: %+v", ExplorerKeyTTL, auth)
	}
	if _, _, err := s.RotateAPIKey(bg, "u_owner", auth.ID, "", ""); err != ErrNotFound {
		t.Fatalf("rotating an Explorer key would mint a STANDARD key from it: %v", err)
	}
}

func TestExplorer_AnExpiredKeyIsRefusedEvenIfNotRevoked(t *testing.T) {
	s, proj := explorerSvc(t)
	raw, prefix, _ := newAPIKey(KindSecret)
	past := time.Now().Add(-time.Second)
	if _, err := s.store.CreateAPIKey(bg, APIKeyInsert{ProjectID: proj, Environment: EnvSandbox, Kind: KindSecret, Name: "x",
		KeyPrefix: prefix, KeyHash: hashKey(raw, s.apiKeyPepper), HashVersion: 1, Scopes: []string{"identity:read"},
		CreatedBy: "u_owner", Purpose: PurposeExplorer, ExpiresAt: &past}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.AuthorizeKey(bg, raw, "identity:read"); err != ErrForbidden {
		t.Fatalf("an expired key authenticated: %v", err)
	}
}

func TestExplorer_RunsOnlyWhatThePublishedContractDescribes(t *testing.T) {
	s, proj := explorerSvc(t)
	g := newExplorerGateway(t, s, "payment_sessions:read")
	s.SetExplorer(g.srv.URL, g.srv.Client())
	bad := []ExplorerRequest{
		{OperationID: "createApiKey"},                                                                   // not an operation
		{OperationID: "getPaymentSession", PathParams: map[string]string{"id": "../../internal/v1/x"}},  // path escape
		{OperationID: "getPaymentSession", PathParams: map[string]string{"id": ""}},                     // missing value
		{OperationID: "listPaymentSessions", Query: map[string]string{"merchant_id": "m"}},              // undeclared query
		{OperationID: "getPaymentSession", PathParams: map[string]string{"id": "ps"}, Body: []byte(`{}`)}, // body on a GET
	}
	for _, in := range bad {
		if _, err := s.RunExplorerRequest(bg, "u_dev", proj, in); err == nil {
			t.Errorf("ran %+v", in)
		}
	}
	if len(g.paths) != 0 {
		t.Fatalf("a refused request reached the gateway: %v", g.paths)
	}
	// A viewer cannot run requests; an outsider does not see the Project.
	if _, err := s.RunExplorerRequest(bg, "u_view", proj, ExplorerRequest{OperationID: "getMe"}); err != ErrForbidden {
		t.Errorf("viewer: %v", err)
	}
	if _, err := s.RunExplorerRequest(bg, "u_outsider", proj, ExplorerRequest{OperationID: "getMe"}); err != ErrNotFound {
		t.Errorf("outsider: %v", err)
	}
}

func TestExplorer_WritesCarryAnIdempotencyKeyAndSecretsAreHidden(t *testing.T) {
	s, proj := explorerSvc(t)
	g := newExplorerGateway(t, s, "webhooks:write")
	g.respond = func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"id":"whep_1","secret":"whsec_REAL","events":["payment_session.paid"]}`))
	}
	s.SetExplorer(g.srv.URL, g.srv.Client())
	out, err := s.RunExplorerRequest(bg, "u_dev", proj, ExplorerRequest{OperationID: "registerWebhookEndpoint",
		Body: []byte(`{"url":"https://example.test/hook","events":["payment_session.paid"]}`)})
	if err != nil {
		t.Fatal(err)
	}
	var body map[string]any
	_ = json.Unmarshal(out.Body, &body)
	if strings.Contains(string(out.Body), "whsec_REAL") || len(out.Redacted) != 1 || out.Redacted[0] != "secret" {
		t.Fatalf("a signing secret must not reach the response panel: %s %v", out.Body, out.Redacted)
	}
	// An operation without an Idempotency-Key parameter sends none.
	if g.idem[0] != "" || out.IdempotencyKey != "" {
		t.Fatalf("registerWebhookEndpoint takes no Idempotency-Key: %q", g.idem[0])
	}

	// A write that takes one gets one the Console can show; a caller's own is kept.
	s2, proj2 := explorerSvc(t)
	g2 := newExplorerGateway(t, s2, "sandbox:write")
	s2.SetExplorer(g2.srv.URL, g2.srv.Client())
	gen, err := s2.RunExplorerRequest(bg, "u_dev", proj2, ExplorerRequest{OperationID: "createTestPayer", Body: []byte(`{"label":"x"}`)})
	if err != nil || !strings.HasPrefix(g2.idem[0], "explorer_") || gen.IdempotencyKey != g2.idem[0] {
		t.Fatalf("a POST must carry an Idempotency-Key the Console can show: %v %q", err, g2.idem)
	}
	mine, _ := s2.RunExplorerRequest(bg, "u_dev", proj2, ExplorerRequest{OperationID: "fundTestPayer",
		PathParams: map[string]string{"id": "tp_1"}, Body: []byte(`{"amount_minor":1}`), IdempotencyKey: "topup-1"})
	if mine == nil || g2.idem[1] != "topup-1" || mine.IdempotencyKey != "topup-1" {
		t.Fatalf("the caller's Idempotency-Key must be sent as given: %q", g2.idem)
	}
}

func TestExplorer_IsOffOutsideTheSandboxAndRateLimited(t *testing.T) {
	s, proj := explorerSvc(t)
	s.SetSandboxEnvironment(false)
	s.SetExplorer("http://gateway.invalid", nil)
	if _, err := s.RunExplorerRequest(bg, "u_dev", proj, ExplorerRequest{OperationID: "getMe"}); err != ErrExplorerUnavailable {
		t.Fatalf("outside the Sandbox the Explorer must be off: %v", err)
	}

	s2, proj2 := explorerSvc(t)
	g := newExplorerGateway(t, s2, "identity:read")
	s2.SetExplorer(g.srv.URL, g.srv.Client())
	var limited bool
	for i := 0; i < ExplorerRequestsPerMinute+1; i++ {
		if _, err := s2.RunExplorerRequest(bg, "u_dev", proj2, ExplorerRequest{OperationID: "getMe"}); err == ErrExplorerRateLimited {
			limited = true
		}
	}
	if !limited || len(g.paths) != ExplorerRequestsPerMinute {
		t.Fatalf("rate limit: limited=%v calls=%d", limited, len(g.paths))
	}
}

func TestExplorer_AllowlistIsTheContractsProjectKeySurface(t *testing.T) {
	cat, ops := explorerOperations()
	if len(cat.Operations) == 0 {
		t.Fatal("empty allowlist")
	}
	for _, id := range []string{"verifyPublicProof", "watchPaymentSessionStatus", "getIntegration", "getApplicationSettlement"} {
		if _, ok := ops[id]; ok {
			t.Errorf("%s needs no key or refuses a project key; the Explorer must not run it", id)
		}
	}
	for _, op := range cat.Operations {
		if op.Scope == "" || !AllowedScopes[op.Scope] {
			t.Errorf("%s: scope %q is not an allowed key scope", op.OperationID, op.Scope)
		}
	}
}
