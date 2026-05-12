package server

import (
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"

	"github.com/banzami/banzami/services/api-gateway/internal/config"
	"github.com/banzami/banzami/services/api-gateway/internal/handler"
	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
)

// New constructs the HTTP server with the full middleware stack and route table.
func New(cfg *config.Config) *http.Server {
	r := chi.NewRouter()

	// ---------------------------------------------------------------------------
	// Global middleware — applied to every request
	// ---------------------------------------------------------------------------
	r.Use(chimw.RealIP)           // resolve X-Forwarded-For → r.RemoteAddr
	r.Use(middleware.RequestID)   // generate / propagate X-Request-ID
	r.Use(middleware.Logger)      // structured request log after completion
	r.Use(chimw.Recoverer)        // panic → 500, never crash the process
	r.Use(chimw.Timeout(60 * time.Second)) // global request timeout

	// ---------------------------------------------------------------------------
	// Observability endpoints — no auth, not rate-limited
	// ---------------------------------------------------------------------------
	r.Get("/health", handler.Liveness)
	r.Get("/readyz", handler.Readiness(cfg))

	// ---------------------------------------------------------------------------
	// Versioned public API
	// The auth and rate-limit middleware are registered here but commented out
	// until the JWT secret and Redis client are available.
	// ---------------------------------------------------------------------------
	r.Group(func(r chi.Router) {
		// r.Use(middleware.Auth(cfg))
		// r.Use(middleware.RateLimit(redisClient, cfg))
		// r.Use(middleware.Idempotency(redisClient))

		r.Route("/v1", func(r chi.Router) {
			// Domain routes will be mounted here as each service is implemented.
			// Example:
			//   r.Mount("/wallets",      walletRoutes(walletSvc))
			//   r.Mount("/transactions", transactionRoutes(txSvc))
			//   r.Mount("/payouts",      payoutRoutes(payoutSvc))
		})
	})

	return &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.Port),
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  120 * time.Second,
	}
}
