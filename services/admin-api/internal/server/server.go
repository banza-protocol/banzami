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

	"github.com/banzami/banzami/services/admin-api/internal/auth"
	"github.com/banzami/banzami/services/admin-api/internal/config"
	"github.com/banzami/banzami/services/admin-api/internal/email"
	"github.com/banzami/banzami/services/admin-api/internal/handler"
	"github.com/banzami/banzami/services/admin-api/internal/middleware"
	"github.com/banzami/banzami/services/admin-api/internal/service"
)

type Server struct {
	httpServer *http.Server
}

func New(cfg *config.Config, core *service.CoreAdminClient, mailer *email.Sender, gw *service.GatewayClient, users *service.AdminUserService, audit *service.AuditService) *Server {
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

	// Per-IP rate limit for the unauthenticated auth surface: 20 req/min/IP.
	// Mounted only on these routes so authenticated operators are never throttled
	// on normal endpoints. Protects login + reset-token brute force.
	authLimit := middleware.NewIPRateLimiter(20, time.Minute)

	// Operator login — public (no token yet). Email + password → admin JWT.
	authH := handler.NewAuthHandler(loginStore, cfg.AdminJWTSecret, 12*time.Hour).WithAudit(audit)
	r.With(authLimit.Middleware).Post("/admin/v1/auth/login", authH.Login)
	// Password-reset validate/complete are public (the operator has no session).
	r.With(authLimit.Middleware).Post("/admin/v1/auth/password-reset/validate", resetH.Validate)
	r.With(authLimit.Middleware).Post("/admin/v1/auth/password-reset/complete", resetH.Complete)

	// All admin routes require an operator JWT (per-operator email/password).
	// The legacy ADMIN_API_KEY no longer authenticates the portal. Every mutation
	// is gated by a single capability middleware (RequireCapability) and recorded
	// in the immutable audit log.
	r.Group(func(r chi.Router) {
		r.Use(middleware.AdminJWT(cfg.AdminJWTSecret, jwtStore))
		r.Use(middleware.Audit(auditSink(audit)))

		// cap is a small alias so the route table reads as a permission matrix.
		cap := middleware.RequireCapability

		// Self-service (any authenticated operator). change-password is rate
		// limited too (brute force of the current password).
		r.Get("/admin/v1/auth/me", authH.Me)
		r.Post("/admin/v1/auth/logout", authH.Logout)
		r.With(authLimit.Middleware).Post("/admin/v1/auth/change-password", authH.ChangePassword)
		r.Post("/admin/v1/auth/terminate-sessions", authH.TerminateSessions)

		// Operator management.
		opH := handler.NewOperatorHandler(opStore, mailer, cfg.AdminBaseURL, showResetLink)
		r.With(cap(auth.CapOperatorRead)).Get("/admin/v1/operators", opH.List)
		r.With(cap(auth.CapOperatorRead)).Get("/admin/v1/operators/{id}", opH.Get)
		r.With(cap(auth.CapOperatorManage)).Post("/admin/v1/operators", opH.Create)
		r.With(cap(auth.CapOperatorManage)).Patch("/admin/v1/operators/{id}", opH.Update)
		r.With(cap(auth.CapOperatorManage)).Post("/admin/v1/operators/{id}/role", opH.SetRole)
		r.With(cap(auth.CapOperatorManage)).Post("/admin/v1/operators/{id}/suspend", opH.Suspend)
		r.With(cap(auth.CapOperatorManage)).Post("/admin/v1/operators/{id}/activate", opH.Activate)
		r.With(cap(auth.CapOperatorReset)).Post("/admin/v1/operators/{id}/resend-invite", opH.ResendInvite)
		r.With(cap(auth.CapOperatorReset)).Post("/admin/v1/operators/{id}/password-reset", resetH.Request)
		r.With(cap(auth.CapOperatorReset)).Post("/admin/v1/operators/{id}/terminate-sessions", opH.TerminateSessions)

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
		r.With(cap(auth.CapMerchantManage)).Post("/admin/v1/merchants", merchantSetupH.Create)
		r.With(cap(auth.CapMerchantView)).Get("/admin/v1/merchants", merchantH.List)
		r.With(cap(auth.CapMerchantView)).Get("/admin/v1/merchants/{id}", merchantH.Get)
		r.With(cap(auth.CapMerchantManage)).Delete("/admin/v1/merchants/{id}", merchantH.Delete)
		r.With(cap(auth.CapMerchantManage)).Patch("/admin/v1/merchants/{id}/verified", merchantH.SetVerified)
		r.With(cap(auth.CapMerchantManage)).Post("/admin/v1/merchants/{id}/api-keys", merchantSetupH.CreateApiKey)
		r.With(cap(auth.CapMerchantManage)).Post("/admin/v1/merchants/{id}/resend-credentials", merchantSetupH.ResendCredentials)
		r.With(cap(auth.CapMerchantManage)).Post("/admin/v1/merchants/{id}/wallets", merchantSetupH.CreateWallet)

		// Business onboarding applications (Merchant Lifecycle)
		r.With(cap(auth.CapApplicationView)).Get("/admin/v1/merchant-applications", applicationsH.List)
		r.With(cap(auth.CapApplicationView)).Get("/admin/v1/merchant-applications/{id}", applicationsH.Get)
		r.With(cap(auth.CapApplicationApprove)).Post("/admin/v1/merchant-applications/{id}/approve", applicationsH.Approve)
		r.With(cap(auth.CapApplicationReject)).Post("/admin/v1/merchant-applications/{id}/reject", applicationsH.Reject)
		// KYB documents (Track 3) — admin review.
		r.With(cap(auth.CapApplicationView)).Get("/admin/v1/merchant-applications/{id}/documents", applicationsH.ListDocuments)
		r.With(cap(auth.CapApplicationView)).Post("/admin/v1/merchant-applications/{id}/documents/{documentId}/read-url", applicationsH.DocumentReadURL)
		r.With(cap(auth.CapKybAccept)).Post("/admin/v1/merchant-applications/{id}/documents/{documentId}/accept", applicationsH.AcceptDocument)
		r.With(cap(auth.CapKybReject)).Post("/admin/v1/merchant-applications/{id}/documents/{documentId}/reject", applicationsH.RejectDocument)

		// Wallets
		r.With(cap(auth.CapMerchantView)).Get("/admin/v1/wallets", walletH.GetForMerchant)
		r.With(cap(auth.CapWalletCredit)).Post("/admin/v1/wallets/{id}/credit", walletH.AdminCredit)

		// Consumers
		r.With(cap(auth.CapConsumerView)).Get("/admin/v1/consumers", consumerH.List)
		r.With(cap(auth.CapConsumerView)).Get("/admin/v1/consumers/{id}", consumerH.Get)
		r.With(cap(auth.CapConsumerSuspend)).Post("/admin/v1/consumers/{id}/suspend", consumerH.Suspend)
		r.With(cap(auth.CapConsumerBadge)).Patch("/admin/v1/consumers/{id}/badge", consumerH.SetBadge)

		// Compliance
		r.With(cap(auth.CapMerchantView)).Get("/admin/v1/compliance/merchants/{id}", complianceH.GetMerchant)
		r.With(cap(auth.CapComplianceReview)).Post("/admin/v1/compliance/merchants/{id}/approve", complianceH.ApproveMerchant)
		r.With(cap(auth.CapComplianceReview)).Post("/admin/v1/compliance/merchants/{id}/reject", complianceH.RejectMerchant)
		r.With(cap(auth.CapMerchantSuspend)).Post("/admin/v1/compliance/merchants/{id}/suspend", complianceH.SuspendMerchant)
		r.With(cap(auth.CapAmlFlag)).Post("/admin/v1/compliance/merchants/{id}/flag-aml", complianceH.FlagAML)

		// Settlements
		r.With(cap(auth.CapSettlementManage)).Post("/admin/v1/settlements", settlementH.CreateBatch)
		r.With(cap(auth.CapSettlementView)).Get("/admin/v1/settlements", settlementH.List)
		r.With(cap(auth.CapSettlementView)).Get("/admin/v1/settlements/all", settlementH.ListAll)
		r.With(cap(auth.CapSettlementView)).Get("/admin/v1/settlements/{id}", settlementH.Get)
		r.With(cap(auth.CapSettlementManage)).Post("/admin/v1/settlements/{id}/submit", settlementH.Submit)
		r.With(cap(auth.CapSettlementManage)).Post("/admin/v1/settlements/{id}/confirm", settlementH.Confirm)
		r.With(cap(auth.CapSettlementManage)).Post("/admin/v1/settlements/{id}/fail", settlementH.Fail)

		// Payouts
		r.With(cap(auth.CapPayoutView)).Get("/admin/v1/payouts", payoutH.List)
		r.With(cap(auth.CapPayoutView)).Get("/admin/v1/payouts/all", payoutH.ListAll)
		r.With(cap(auth.CapPayoutView)).Get("/admin/v1/payouts/{id}", payoutH.Get)
		r.With(cap(auth.CapPayoutManage)).Post("/admin/v1/payouts/{id}/process", payoutH.Process)
		r.With(cap(auth.CapPayoutManage)).Post("/admin/v1/payouts/{id}/sent", payoutH.MarkSent)
		r.With(cap(auth.CapPayoutManage)).Post("/admin/v1/payouts/{id}/confirm", payoutH.Confirm)
		r.With(cap(auth.CapPayoutManage)).Post("/admin/v1/payouts/{id}/fail", payoutH.Fail)
		r.With(cap(auth.CapPayoutManage)).Post("/admin/v1/payouts/{id}/returned", payoutH.MarkReturned)

		// Reconciliation (settlement-level)
		r.With(cap(auth.CapReconRun)).Post("/admin/v1/reconciliation/run", reconciliationH.Run)
		r.With(cap(auth.CapReconView)).Get("/admin/v1/reconciliation/runs/{id}", reconciliationH.Get)

		// Risk — freeze/unfreeze, risk flags, audit log, acquiring reconciliation
		r.With(cap(auth.CapRiskFreeze)).Post("/admin/v1/risk/freeze", riskH.FreezeAccount)
		r.With(cap(auth.CapRiskFreeze)).Delete("/admin/v1/risk/freeze/{entity_type}/{entity_id}", riskH.UnfreezeAccount)
		r.With(cap(auth.CapRiskView)).Get("/admin/v1/risk/flags", riskH.ListRiskFlags)
		r.With(cap(auth.CapRiskResolve)).Post("/admin/v1/risk/flags/{id}/resolve", riskH.ResolveRiskFlag)
		r.With(cap(auth.CapRiskView)).Get("/admin/v1/risk/audit-log", riskH.QueryAuditLog)
		r.With(cap(auth.CapRiskResolve)).Post("/admin/v1/risk/acquiring-recon", riskH.RunAcquiringReconciliation)
		r.With(cap(auth.CapRiskView)).Get("/admin/v1/risk/acquiring-recon", riskH.ListAcquiringReconciliationRuns)
		r.With(cap(auth.CapRiskView)).Get("/admin/v1/risk/acquiring-recon/{id}", riskH.GetAcquiringReconciliationRun)

		// Disputes — admin resolution
		r.With(cap(auth.CapDisputeView)).Get("/admin/v1/disputes", disputeH.List)
		r.With(cap(auth.CapDisputeView)).Get("/admin/v1/disputes/{id}", disputeH.Get)
		r.With(cap(auth.CapDisputeResolve)).Post("/admin/v1/disputes/{id}/resolve", disputeH.Resolve)
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

// auditSink keeps a nil *AuditService as a true nil interface so the audit
// middleware short-circuits instead of dereferencing a typed-nil.
func auditSink(a *service.AuditService) middleware.AuditWriter {
	if a == nil {
		return nil
	}
	return a
}

func (s *Server) Start() error {
	return s.httpServer.ListenAndServe()
}

func (s *Server) Shutdown(ctx context.Context) error {
	return s.httpServer.Shutdown(ctx)
}
