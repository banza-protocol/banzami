package middleware

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

type fakeDevAuthorizer struct {
	ctx *service.DeveloperKeyContext
	err error
}

func (f *fakeDevAuthorizer) Authorize(_ context.Context, _ string) (*service.DeveloperKeyContext, error) {
	return f.ctx, f.err
}

func TestDeveloperKeyAuth_FailsClosed(t *testing.T) {
	ok := &fakeDevAuthorizer{ctx: &service.DeveloperKeyContext{KeyID: "k", Environment: "SANDBOX", Scopes: []string{"identity:read"}}}
	cases := []struct {
		name, authz string
		client      devKeyAuthorizer
		want        int
	}{
		{"no key", "", ok, 401},
		{"bz_live rejected", "Bearer bz_live_sk_abc", ok, 401},
		{"non-dev prefix rejected", "Bearer bz_test_plainmerchant", ok, 401},
		{"introspection error", "Bearer bz_test_sk_abc", &fakeDevAuthorizer{err: errors.New("x")}, 401},
		{"live env from introspection rejected", "Bearer bz_test_sk_abc", &fakeDevAuthorizer{ctx: &service.DeveloperKeyContext{Environment: "LIVE"}}, 401},
		{"valid sandbox dev key", "Bearer bz_test_sk_abc", ok, 200},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			h := DeveloperKeyAuth(c.client)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if _, ok := GetDeveloperPrincipal(r.Context()); !ok {
					t.Error("principal missing on success path")
				}
				w.WriteHeader(http.StatusOK)
			}))
			req := httptest.NewRequest(http.MethodGet, "/v1/me", nil)
			if c.authz != "" {
				req.Header.Set("Authorization", c.authz)
			}
			rr := httptest.NewRecorder()
			h.ServeHTTP(rr, req)
			if rr.Code != c.want {
				t.Errorf("got %d want %d", rr.Code, c.want)
			}
		})
	}
}
