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
	"github.com/banzami/banzami/services/admin-api/internal/email"
	"github.com/banzami/banzami/services/admin-api/internal/handler"
	"github.com/banzami/banzami/services/admin-api/internal/middleware"
	"github.com/banzami/banzami/services/admin-api/internal/service"
)

type Server struct {
	httpServer *http.Server
}

func New(cfg *config.Config, core *service.CoreAdminClient, mailer *email.Sender, gw *service.GatewayClient, users *service.AdminUserService) *Server {
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

	// Build nil-safe interfaces so a nil *AdminUserService stays a true nil
	// interface (auth endpoints then respond 503 instead of panicking).
	var loginStore handler.LoginStore
	var jwtStore middleware.OperatorStore
	var opStore handler.OperatorStore
	var resetStore handler.ResetStore
	if users != nil {
		loginStore = users
		jwtStore = users
		opStore = users
		resetStore = users
	}

	// SMTP off / dry-run → reset link is returned to the SUPER_ADMIN in the
	// authenticated response so they can deliver it.
	showResetLink := cfg.EmailDryRun || !mailer.Enabled()
	resetH := handler.NewResetHandler(resetStore, mailer, cfg.AdminBaseURL, showResetLink)

	// Operator login — public (no token yet). Email + password → admin JWT.
	authH := handler.NewAuthHandler(loginStore, cfg.AdminJWTSecret, 12*time.Hour)
	r.Post("/admin/v1/auth/login", authH.Login)
	// Password-reset validate/complete are public (the operator has no session).
	r.Post("/admin/v1/auth/password-reset/validate", resetH.Validate)
	r.Post("/admin/v1/auth/password-reset/complete", resetH.Complete)

	// All admin routes require an operator JWT (per-operator email/password).
	// The legacy ADMIN_API_KEY no longer authenticates the portal.
	r.Group(func(r chi.Router) {
		r.Use(middleware.AdminJWT(cfg.AdminJWTSecret, jwtStore))

		r.Get("/admin/v1/auth/me", authH.Me)
		r.Post("/admin/v1/auth/logout", authH.Logout)
		r.Post("/admin/v1/auth/change-password", authH.ChangePassword)

		// Operator management (SUPER_ADMIN for mutations; read for any operator).
		opH := handler.NewOperatorHandler(opStore, mailer, cfg.AdminBaseURL, showResetLink)
		r.Get("/admin/v1/operators", opH.List)
		r.Get("/admin/v1/operators/{id}", opH.Get)
		r.Post("/admin/v1/operators", opH.Create)
		r.Patch("/admin/v1/operators/{id}", opH.Update)
		r.Post("/admin/v1/operators/{id}/role", opH.SetRole)
		r.Post("/admin/v1/operators/{id}/suspend", opH.Suspend)
		r.Post("/admin/v1/operators/{id}/activate", opH.Activate)
		r.Post("/admin/v1/operators/{id}/resend-invite", opH.ResendInvite)
		r.Post("/admin/v1/operators/{id}/password-reset", resetH.Request)

		complianceH := handler.NewComplianceHandler(core)
		settlementH := handler.NewSettlementHandler(core)
		payoutH := handler.NewPayoutHandler(core)
		merchantH := handler.NewMerchantHandler(core)
		merchantSetupH := handler.NewMerchantSetupHandler(core, mailer)
		applicationsH := handler.NewMerchantApplicationHandler(gw, mailer, cfg.WebsiteBaseURL)
		reconciliationH := handler.NewReconciliationHandler(core)
		consumerH := handler.NewConsumerHandler(core)
		walletH := handler.NewWalletHandler(core)
		riskH := handler.NewRiskHandler(core)
		disputeH := handler.NewDisputeHandler(core)

		// Merchants
		r.Post("/admin/v1/merchants", merchantSetupH.Create)
		r.Get("/admin/v1/merchants", merchantH.List)
		r.Get("/admin/v1/merchants/{id}", merchantH.Get)
		r.Delete("/admin/v1/merchants/{id}", merchantH.Delete)
		r.Patch("/admin/v1/merchants/{id}/verified", merchantH.SetVerified)
		r.Post("/admin/v1/merchants/{id}/api-keys", merchantSetupH.CreateApiKey)
		r.Post("/admin/v1/merchants/{id}/resend-credentials", merchantSetupH.ResendCredentials)
		r.Post("/admin/v1/merchants/{id}/wallets", merchantSetupH.CreateWallet)

		// Business onboarding applications (Merchant Lifecycle)
		r.Get("/admin/v1/merchant-applications", applicationsH.List)
		r.Get("/admin/v1/merchant-applications/{id}", applicationsH.Get)
		r.Post("/admin/v1/merchant-applications/{id}/approve", applicationsH.Approve)
		r.Post("/admin/v1/merchant-applications/{id}/reject", applicationsH.Reject)
		// KYB documents (Track 3) — admin review.
		r.Get("/admin/v1/merchant-applications/{id}/documents", applicationsH.ListDocuments)
		r.Post("/admin/v1/merchant-applications/{id}/documents/{documentId}/read-url", applicationsH.DocumentReadURL)
		r.Post("/admin/v1/merchant-applications/{id}/documents/{documentId}/accept", applicationsH.AcceptDocument)
		r.Post("/admin/v1/merchant-applications/{id}/documents/{documentId}/reject", applicationsH.RejectDocument)

		// Wallets
		r.Get("/admin/v1/wallets", walletH.GetForMerchant)
		r.Post("/admin/v1/wallets/{id}/credit", walletH.AdminCredit)

		// Consumers
		r.Get("/admin/v1/consumers", consumerH.List)
		r.Get("/admin/v1/consumers/{id}", consumerH.Get)
		r.Post("/admin/v1/consumers/{id}/suspend", consumerH.Suspend)
		r.Patch("/admin/v1/consumers/{id}/badge", consumerH.SetBadge)

		// Compliance
		r.Get("/admin/v1/compliance/merchants/{id}", complianceH.GetMerchant)
		r.Post("/admin/v1/compliance/merchants/{id}/approve", complianceH.ApproveMerchant)
		r.Post("/admin/v1/compliance/merchants/{id}/reject", complianceH.RejectMerchant)
		r.Post("/admin/v1/compliance/merchants/{id}/suspend", complianceH.SuspendMerchant)
		r.Post("/admin/v1/compliance/merchants/{id}/flag-aml", complianceH.FlagAML)

		// Settlements
		r.Post("/admin/v1/settlements", settlementH.CreateBatch)
		r.Get("/admin/v1/settlements", settlementH.List)
		r.Get("/admin/v1/settlements/all", settlementH.ListAll)
		r.Get("/admin/v1/settlements/{id}", settlementH.Get)
		r.Post("/admin/v1/settlements/{id}/submit", settlementH.Submit)
		r.Post("/admin/v1/settlements/{id}/confirm", settlementH.Confirm)
		r.Post("/admin/v1/settlements/{id}/fail", settlementH.Fail)

		// Payouts
		r.Get("/admin/v1/payouts", payoutH.List)
		r.Get("/admin/v1/payouts/all", payoutH.ListAll)
		r.Get("/admin/v1/payouts/{id}", payoutH.Get)
		r.Post("/admin/v1/payouts/{id}/process", payoutH.Process)
		r.Post("/admin/v1/payouts/{id}/sent", payoutH.MarkSent)
		r.Post("/admin/v1/payouts/{id}/confirm", payoutH.Confirm)
		r.Post("/admin/v1/payouts/{id}/fail", payoutH.Fail)
		r.Post("/admin/v1/payouts/{id}/returned", payoutH.MarkReturned)

		// Reconciliation (settlement-level)
		r.Post("/admin/v1/reconciliation/run", reconciliationH.Run)
		r.Get("/admin/v1/reconciliation/runs/{id}", reconciliationH.Get)

		// Risk — freeze/unfreeze, risk flags, audit log, acquiring reconciliation
		r.Post("/admin/v1/risk/freeze", riskH.FreezeAccount)
		r.Delete("/admin/v1/risk/freeze/{entity_type}/{entity_id}", riskH.UnfreezeAccount)
		r.Get("/admin/v1/risk/flags", riskH.ListRiskFlags)
		r.Post("/admin/v1/risk/flags/{id}/resolve", riskH.ResolveRiskFlag)
		r.Get("/admin/v1/risk/audit-log", riskH.QueryAuditLog)
		r.Post("/admin/v1/risk/acquiring-recon", riskH.RunAcquiringReconciliation)
		r.Get("/admin/v1/risk/acquiring-recon", riskH.ListAcquiringReconciliationRuns)
		r.Get("/admin/v1/risk/acquiring-recon/{id}", riskH.GetAcquiringReconciliationRun)

		// Disputes — admin resolution
		r.Get("/admin/v1/disputes", disputeH.List)
		r.Get("/admin/v1/disputes/{id}", disputeH.Get)
		r.Post("/admin/v1/disputes/{id}/resolve", disputeH.Resolve)
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
