package server

import (
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/redis/go-redis/v9"

	"github.com/banzami/banzami/services/api-gateway/internal/config"
	"github.com/banzami/banzami/services/api-gateway/internal/handler"
	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// Dependencies holds the runtime dependencies injected into the server.
type Dependencies struct {
	Redis          *redis.Client
	TransactionSvc service.TransactionService
	WebhookSvc     service.WebhookService
}

// New constructs the HTTP server with the full middleware stack and route table.
func New(cfg *config.Config, deps Dependencies) *http.Server {
	r := chi.NewRouter()

	// ---------------------------------------------------------------------------
	// Global middleware — applied to every request
	// ---------------------------------------------------------------------------
	r.Use(chimw.RealIP)
	r.Use(middleware.RequestID)
	r.Use(middleware.Logger)
	r.Use(chimw.Recoverer)
	r.Use(chimw.Timeout(60 * time.Second))

	// ---------------------------------------------------------------------------
	// Observability endpoints — no auth, no rate limit
	// ---------------------------------------------------------------------------
	r.Get("/health", handler.Liveness)
	r.Get("/readyz", handler.Readiness(cfg))

	// ---------------------------------------------------------------------------
	// Versioned public API — JWT auth + rate limiting required
	// ---------------------------------------------------------------------------
	txHandler  := handler.NewTransactionHandler(deps.TransactionSvc)
	wbhHandler := handler.NewWebhookHandler(deps.WebhookSvc)

	r.Group(func(r chi.Router) {
		r.Use(middleware.Auth(cfg))
		r.Use(middleware.RateLimit(deps.Redis, middleware.DefaultRateLimits))
		r.Use(middleware.Idempotency(deps.Redis))

		r.Route("/v1", func(r chi.Router) {
			r.Post("/transactions", txHandler.Create)
			r.Get("/transactions", txHandler.List)
			r.Get("/transactions/{id}", txHandler.Get)

			r.Route("/webhooks", func(r chi.Router) {
				r.Post("/endpoints", wbhHandler.Register)
				r.Get("/endpoints", wbhHandler.ListEndpoints)
				r.Get("/endpoints/{id}", wbhHandler.GetEndpoint)
				r.Delete("/endpoints/{id}", wbhHandler.DeactivateEndpoint)

				r.Get("/events", wbhHandler.ListEvents)
				r.Get("/events/{id}/deliveries", wbhHandler.ListDeliveries)
			})
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
