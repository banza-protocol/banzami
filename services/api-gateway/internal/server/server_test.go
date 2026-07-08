package server

import (
	"testing"

	"github.com/banzami/banzami/services/api-gateway/internal/config"
)

// TestNew_SingleV1Mount guards against the chi "attempting to Mount() a handler
// on an existing path, '/v1'" panic. The merchant surface and the ADR-047
// canonical payment surface must be registered under a single /v1 mount. If a
// future change reintroduces a second r.Route("/v1", …) on the root router,
// chi panics during New() and this test fails.
//
// Both the developer-key-inactive and developer-key-active branches register
// /v1 (the payment group swaps Auth for DualAuth, and the active branch also
// mounts GET /v1/me), so both are exercised. Route registration does not invoke
// any handler or Redis, so zero-value Dependencies is sufficient.
func TestNew_SingleV1Mount(t *testing.T) {
	cases := []struct {
		name string
		cfg  *config.Config
	}{
		{
			name: "developer-key auth inactive (merchant-JWT-only payment surface)",
			cfg: &config.Config{
				Port:        8080,
				Environment: "SANDBOX",
			},
		},
		{
			name: "developer-key auth active (dual-credential payment surface + /v1/me)",
			cfg: &config.Config{
				Port:                    8080,
				Environment:             "SANDBOX",
				DeveloperKeyAuthEnabled: true,
				DeveloperInternalKey:    "test-internal-key",
				DeveloperAPIURL:         "http://developer-api",
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			// Sanity-check the branch under test actually holds, so the test
			// stays meaningful if the activation contract changes.
			active, _ := tc.cfg.DeveloperKeyAuthActive()
			wantActive := tc.cfg.DeveloperKeyAuthEnabled
			if active != wantActive {
				t.Fatalf("DeveloperKeyAuthActive() = %v, want %v — test fixture no longer exercises the intended branch", active, wantActive)
			}

			defer func() {
				if r := recover(); r != nil {
					t.Fatalf("New() panicked building the route table (regression: duplicate /v1 mount?): %v", r)
				}
			}()

			srv := New(tc.cfg, Dependencies{})
			if srv == nil || srv.Handler == nil {
				t.Fatal("New() returned a nil server or handler")
			}
		})
	}
}
