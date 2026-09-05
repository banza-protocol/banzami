package middleware

// The request log is only worth having if it is complete and safe. These tests
// hold both properties: every authenticated Developer API request produces
// exactly one entry (successes AND failures), an unauthenticated one produces
// none, and nothing credential-shaped survives into a stored field.

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/config"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
	"github.com/banzami/banzami/services/common/obs"
)

type memSink struct {
	mu      sync.Mutex
	entries []service.APIRequestLogEntry
}

func (m *memSink) Record(e service.APIRequestLogEntry) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.entries = append(m.entries, e)
}

func (m *memSink) all() []service.APIRequestLogEntry {
	m.mu.Lock()
	defer m.mu.Unlock()
	return append([]service.APIRequestLogEntry(nil), m.entries...)
}

func devAuthorizer(project string) devKeyAuthorizer {
	return &fakeDevAuthorizer{ctx: &service.DeveloperKeyContext{
		KeyID: "key-1", Environment: "SANDBOX", WorkspaceID: "ws-1",
		ProjectID: project, ProjectSlug: "proj", KeyStatus: "active",
		Scopes: []string{"payments:read"}, Bound: true,
		MerchantID: "m1", WalletID: "w1", WalletAccountID: "wa1",
	}}
}

// router builds a chi router with the log middleware mounted exactly where the
// real server mounts it, so the test exercises the real ordering.
func router(sink service.APIRequestLogSink, client devKeyAuthorizer, status int) chi.Router {
	r := chi.NewRouter()
	r.Use(obs.Correlation) // the real chain's source of request_id
	r.Use(APIRequestLog(sink))
	r.Route("/v1/business", func(r chi.Router) {
		r.Use(DualAuth(&config.Config{JWTSecret: "s"}, client))
		r.Get("/refunds/{id}", func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(status)
		})
	})
	return r
}

func TestAPIRequestLog_RecordsAuthenticatedRequest(t *testing.T) {
	sink := &memSink{}
	req := httptest.NewRequest(http.MethodGet, "/v1/business/refunds/rf_123?secret=shhh", nil)
	req.Header.Set("Authorization", "Bearer bz_test_sk_abc")
	rec := httptest.NewRecorder()
	router(sink, devAuthorizer("proj-1"), http.StatusOK).ServeHTTP(rec, req)

	got := sink.all()
	if len(got) != 1 {
		t.Fatalf("entries = %d, want exactly 1", len(got))
	}
	e := got[0]
	if e.ProjectID != "proj-1" || e.KeyID != "key-1" || e.Environment != "SANDBOX" {
		t.Errorf("attribution wrong: %+v", e)
	}
	if e.Method != http.MethodGet || e.Status != 200 {
		t.Errorf("method/status wrong: %s %d", e.Method, e.Status)
	}
	if e.Path != "/v1/business/refunds/rf_123" {
		t.Errorf("path = %q — the query string must be stripped", e.Path)
	}
	if e.Route != "/v1/business/refunds/{id}" {
		t.Errorf("route = %q, want the canonical chi pattern", e.Route)
	}
	if e.RequestID == "" {
		t.Error("request_id missing — it is the field the developer is told to quote")
	}
	if e.At.IsZero() {
		t.Error("timestamp missing")
	}
}

// A failure is the request a developer is most likely trying to find.
func TestAPIRequestLog_RecordsFailureStatuses(t *testing.T) {
	for _, status := range []int{http.StatusForbidden, http.StatusNotFound,
		http.StatusUnprocessableEntity, http.StatusInternalServerError} {
		sink := &memSink{}
		req := httptest.NewRequest(http.MethodGet, "/v1/business/refunds/x", nil)
		req.Header.Set("Authorization", "Bearer bz_test_sk_abc")
		router(sink, devAuthorizer("proj-1"), status).ServeHTTP(httptest.NewRecorder(), req)
		got := sink.all()
		if len(got) != 1 || got[0].Status != status {
			t.Errorf("status %d: entries=%d", status, len(got))
		}
	}
}

// An unauthenticated caller must not be able to write a row into anyone's log.
func TestAPIRequestLog_NoEntryWithoutAuthentication(t *testing.T) {
	for _, c := range []struct{ name, authz string }{
		{"no credential", ""},
		{"forged key", "Bearer bz_test_sk_forged"},
		{"live key", "Bearer bz_live_sk_x"},
	} {
		t.Run(c.name, func(t *testing.T) {
			sink := &memSink{}
			client := devKeyAuthorizer(&fakeDevAuthorizer{err: service.ErrDeveloperKeyInvalid})
			req := httptest.NewRequest(http.MethodGet, "/v1/business/refunds/x", nil)
			if c.authz != "" {
				req.Header.Set("Authorization", c.authz)
			}
			router(sink, client, http.StatusOK).ServeHTTP(httptest.NewRecorder(), req)
			if n := len(sink.all()); n != 0 {
				t.Errorf("entries = %d, want 0 — an unauthenticated request has no project to attribute to", n)
			}
		})
	}
}

// Merchant-JWT traffic is not Developer API traffic and must not appear in a
// project's log.
func TestAPIRequestLog_MerchantJWTNotLogged(t *testing.T) {
	jwt, _, err := NewMerchantToken("s", "merch-1", []string{"*"}, "SANDBOX", 3600000000000)
	if err != nil {
		t.Fatal(err)
	}
	sink := &memSink{}
	req := httptest.NewRequest(http.MethodGet, "/v1/business/refunds/x", nil)
	req.Header.Set("Authorization", "Bearer "+jwt)
	router(sink, devAuthorizer("proj-1"), http.StatusOK).ServeHTTP(httptest.NewRecorder(), req)
	if n := len(sink.all()); n != 0 {
		t.Errorf("entries = %d, want 0", n)
	}
}

func TestSanitisePath_RedactsCredentialShapes(t *testing.T) {
	for _, c := range []struct{ in, want string }{
		{"/v1/x?api_key=bz_test_sk_abc", "/v1/x"},
		{"/v1/keys/bz_test_sk_abcDEF123", "/v1/keys/[REDACTED]"},
		{"/v1/keys/bz_live_pk_zzz", "/v1/keys/[REDACTED]"},
		{"/v1/business/refunds/rf_1", "/v1/business/refunds/rf_1"},
	} {
		if got := sanitisePath(c.in); got != c.want {
			t.Errorf("sanitisePath(%q) = %q, want %q", c.in, got, c.want)
		}
	}
	if got := sanitisePath("/" + strings.Repeat("a", 900)); len(got) != 512 {
		t.Errorf("long path not truncated: len=%d", len(got))
	}
}

// Non-vacuity: the entry is populated by attribution, not by a default. Remove
// the AttributeRequest call in developer_auth.go and this fails.
func TestAPIRequestLog_AttributionIsWhatMakesTheEntry(t *testing.T) {
	sink := &memSink{}
	h := APIRequestLog(sink)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK) // authenticates nothing
	}))
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/v1/x", nil))
	if n := len(sink.all()); n != 0 {
		t.Fatalf("entries = %d without attribution, want 0", n)
	}
}

// A nil sink must add nothing at all rather than record into a void.
func TestAPIRequestLog_NilSinkIsPassthrough(t *testing.T) {
	var ran bool
	h := APIRequestLog(nil)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		ran = true
		w.WriteHeader(http.StatusOK)
	}))
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/v1/x", nil))
	if !ran {
		t.Error("nil sink must not break the chain")
	}
}
