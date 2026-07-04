// Package server wires the developer-api HTTP router (chi) and its middleware.
package server

import (
	"context"
	"crypto/subtle"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/banzami/banzami/services/common/obs"
	"github.com/banzami/banzami/services/developer-api/internal/accountidentity"
	"github.com/banzami/banzami/services/developer-api/internal/config"
	"github.com/banzami/banzami/services/developer-api/internal/developer"
	"github.com/banzami/banzami/services/developer-api/internal/httpx"
)

// Deps are the runtime dependencies injected into the router. Any may be nil in
// minimal/health-only boots.
type Deps struct {
	Pool *pgxpool.Pool
	Auth *accountidentity.Handlers
	Dev  *developer.Handlers
}

// New builds the developer-api HTTP handler.
func New(cfg *config.Config, deps Deps) http.Handler {
	r := chi.NewRouter()

	r.Use(obs.Correlation)
	r.Use(chimw.RealIP)
	r.Use(chimw.Recoverer)
	r.Use(chimw.Timeout(30 * time.Second))
	r.Use(cors(cfg.ConsoleOrigin))

	r.Get("/health", health(cfg, deps.Pool))

	// Service-to-service key introspection (ADR-046) — guarded by a shared
	// internal key. Fail closed: no internal key configured → route not mounted.
	if deps.Dev != nil && cfg.InternalAPIKey != "" {
		r.Group(func(gr chi.Router) {
			gr.Use(internalKeyGuard(cfg.InternalAPIKey))
			deps.Dev.MountInternal(gr)
		})
	}

	// Account Identity auth surface (developer-api.banzami.com).
	if deps.Auth != nil {
		deps.Auth.Register(r.Get, r.Post)

		// Developer surface: session-guarded; mutations also Origin+CSRF guarded.
		if deps.Dev != nil {
			r.Group(func(gr chi.Router) {
				gr.Use(deps.Auth.RequireAuth)
				deps.Dev.Mount(gr, deps.Auth.EnforceCSRF)
			})
		}
	}

	return r
}

// internalKeyGuard enforces a constant-time match of the X-Internal-Key header
// against the configured shared key. Neutral 401 on mismatch; never logs the key.
func internalKeyGuard(expected string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			got := r.Header.Get("X-Internal-Key")
			if subtle.ConstantTimeCompare([]byte(got), []byte(expected)) != 1 {
				httpx.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "internal auth required")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// health reports liveness and, when a DB pool is present, readiness (a quick
// ping). It never exposes connection strings or internal detail.
func health(cfg *config.Config, pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		status := "ok"
		db := "skipped"
		if pool != nil {
			ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
			defer cancel()
			if err := pool.Ping(ctx); err != nil {
				status, db = "degraded", "down"
			} else {
				db = "up"
			}
		}
		code := http.StatusOK
		if status != "ok" {
			code = http.StatusServiceUnavailable
		}
		httpx.JSON(w, code, map[string]string{
			"status":  status,
			"service": "developer-api",
			"env":     cfg.Environment,
			"db":      db,
		})
	}
}
