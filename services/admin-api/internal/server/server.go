package server

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"

	"github.com/banzami/banzami/services/admin-api/internal/config"
	"github.com/banzami/banzami/services/admin-api/internal/handler"
	"github.com/banzami/banzami/services/admin-api/internal/middleware"
	"github.com/banzami/banzami/services/admin-api/internal/service"
)

type Server struct {
	httpServer *http.Server
}

func New(cfg *config.Config, core *service.CoreAdminClient) *Server {
	r := chi.NewRouter()

	r.Use(middleware.CORS)
	r.Use(chimiddleware.RequestID)
	r.Use(chimiddleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(chimiddleware.Recoverer)
	r.Use(chimiddleware.Timeout(30 * time.Second))
	r.Use(middleware.RouteSpan) // enriches otelhttp span with chi route pattern

	// Health and metrics — unauthenticated
	r.Get("/health", handler.Liveness)
	r.Get("/metrics", promhttp.Handler().ServeHTTP)

	// All admin routes require API key authentication
	r.Group(func(r chi.Router) {
		r.Use(middleware.AdminAuth(cfg.AdminAPIKey))

		complianceH     := handler.NewComplianceHandler(core)
		settlementH     := handler.NewSettlementHandler(core)
		payoutH         := handler.NewPayoutHandler(core)
		merchantH       := handler.NewMerchantHandler(core)
		merchantSetupH  := handler.NewMerchantSetupHandler(core)
		reconciliationH := handler.NewReconciliationHandler(core)

		// Merchants
		r.Post("/admin/v1/merchants",                    merchantSetupH.Create)
		r.Get("/admin/v1/merchants/{id}",                merchantH.Get)
		r.Post("/admin/v1/merchants/{id}/api-keys",      merchantSetupH.CreateApiKey)
		r.Post("/admin/v1/merchants/{id}/wallets",       merchantSetupH.CreateWallet)

		// Compliance
		r.Get("/admin/v1/compliance/merchants/{id}", complianceH.GetMerchant)
		r.Post("/admin/v1/compliance/merchants/{id}/approve", complianceH.ApproveMerchant)
		r.Post("/admin/v1/compliance/merchants/{id}/reject", complianceH.RejectMerchant)
		r.Post("/admin/v1/compliance/merchants/{id}/suspend", complianceH.SuspendMerchant)
		r.Post("/admin/v1/compliance/merchants/{id}/flag-aml", complianceH.FlagAML)

		// Settlements
		r.Post("/admin/v1/settlements", settlementH.CreateBatch)
		r.Get("/admin/v1/settlements", settlementH.List)
		r.Get("/admin/v1/settlements/{id}", settlementH.Get)
		r.Post("/admin/v1/settlements/{id}/submit", settlementH.Submit)
		r.Post("/admin/v1/settlements/{id}/confirm", settlementH.Confirm)
		r.Post("/admin/v1/settlements/{id}/fail", settlementH.Fail)

		// Payouts
		r.Get("/admin/v1/payouts", payoutH.List)
		r.Get("/admin/v1/payouts/{id}", payoutH.Get)
		r.Post("/admin/v1/payouts/{id}/process", payoutH.Process)
		r.Post("/admin/v1/payouts/{id}/sent", payoutH.MarkSent)
		r.Post("/admin/v1/payouts/{id}/confirm", payoutH.Confirm)
		r.Post("/admin/v1/payouts/{id}/fail", payoutH.Fail)
		r.Post("/admin/v1/payouts/{id}/returned", payoutH.MarkReturned)

		// Reconciliation
		r.Post("/admin/v1/reconciliation/run", reconciliationH.Run)
	})

	// Wrap chi router with otelhttp: creates one span per request and records
	// http.server.request.duration metrics via the OTel SDK.
	traced := otelhttp.NewHandler(r, "admin-api")

	return &Server{
		httpServer: &http.Server{
			Addr:         fmt.Sprintf(":%d", cfg.Port),
			Handler:      traced,
			ReadTimeout:  15 * time.Second,
			WriteTimeout: 30 * time.Second,
			IdleTimeout:  60 * time.Second,
		},
	}
}

func (s *Server) Start() error {
	return s.httpServer.ListenAndServe()
}

func (s *Server) Shutdown(ctx context.Context) error {
	return s.httpServer.Shutdown(ctx)
}
