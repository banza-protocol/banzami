package server

import (
	"context"
	"fmt"
	"net/http"
	"os"

	"github.com/banzami/banzami/services/common/obs"
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

func New(cfg *config.Config, core *service.CoreAdminClient, mailer *email.Sender, gw *service.GatewayClient, users *service.AdminUserService, audit *service.AuditService, receiptSrc handler.ReceiptSource, walletLister handler.AdminWalletPaymentLister, kycReview *service.KycReviewService, kycReviewStaging *service.KycReviewService, notif *service.NotificationService, notifSandbox *service.NotificationService, compliance *service.ComplianceService, complianceSandbox *service.ComplianceService, platform *service.PlatformService, proofAdmin *service.ProofAdminService, proofAdminSandbox *service.ProofAdminService, mfa *service.MFAService) *Server {
	r := chi.NewRouter()

	r.Use(middleware.CORS)
	r.Use(obs.Correlation) // single source: correlation_id (flow) + request_id (local)
	r.Use(chimiddleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(chimiddleware.Recoverer)
	r.Use(chimiddleware.Timeout(30 * time.Second))
	r.Use(middleware.RouteSpan) // enriches otelhttp span with chi route pattern

	// Health and metrics — unauthenticated
	r.Get("/health", handler.Liveness)
	r.Get("/metrics", promhttp.Handler().ServeHTTP)

	// Email icon assets (PNG) — public, read-only. Gmail strips inline SVG, so
	// transactional emails reference these hosted icons.
	r.Handle("/email-assets/*", email.AssetsHandler())

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
	resetH := handler.NewResetHandler(resetStore, mailer, cfg.AdminBaseURL, showResetLink).WithAudit(auditSink(audit))

	// Per-IP rate limit for the unauthenticated auth surface: 20 req/min/IP.
	// Mounted only on these routes so authenticated operators are never throttled
	// on normal endpoints. Protects login + reset-token brute force.
	authLimit := middleware.NewIPRateLimiter(20, time.Minute)

	// The second factor. nil here means the deployment has no MFA tables, and
	// login then behaves as it did before — which is the only way an operator can
	// be onboarded on a deployment that predates this.
	var mfaStore handler.MFAStore
	var mfaGate handler.MFAGate
	if mfa != nil {
		mfaStore = mfa
		mfaGate = mfa
	}
	mfaH := handler.NewMFAHandler(mfaStore, loginStore, cfg.AdminJWTSecret, 12*time.Hour).WithAudit(auditSink(audit))

	// Operator login — public (no token yet). Email + password → MFA challenge.
	authH := handler.NewAuthHandler(loginStore, cfg.AdminJWTSecret, 12*time.Hour).WithAudit(audit).WithMFA(mfaGate)
	r.With(authLimit.Middleware).Post("/admin/v1/auth/login", authH.Login)
	// The second factor. These are outside the session middleware by necessity:
	// the caller has proven a password and does not have a session yet — that is
	// the whole point. Each endpoint states which token purpose it accepts, so a
	// challenge token cannot be used to enrol a new factor and vice versa. Same
	// tight per-IP limiter as login: this is a code-guessing surface.
	r.With(authLimit.Middleware).Post("/admin/v1/auth/mfa/enrol", mfaH.Enrol)
	r.With(authLimit.Middleware).Post("/admin/v1/auth/mfa/enrol/confirm", mfaH.ConfirmEnrol)
	r.With(authLimit.Middleware).Post("/admin/v1/auth/mfa/enrol/acknowledge", mfaH.AcknowledgeRecovery)
	r.With(authLimit.Middleware).Post("/admin/v1/auth/mfa/verify", mfaH.Verify)
	// Password-reset validate/complete are public (the operator has no session).
	r.With(authLimit.Middleware).Post("/admin/v1/auth/password-reset/validate", resetH.Validate)
	r.With(authLimit.Middleware).Post("/admin/v1/auth/password-reset/complete", resetH.Complete)

	// Operator attention sources, per environment. Typed nils stay out of the
	// interfaces (an interface holding a nil pointer is not nil).
	attentionSources := map[string]handler.AttentionSource{}
	if gw != nil {
		src := handler.AttentionSource{Gateway: gw}
		if compliance != nil {
			src.Compliance = compliance
		}
		if notif != nil {
			src.Notifications = notif
		}
		attentionSources["LIVE"] = src
	}
	if cfg.GatewayStagingInternalURL != "" {
		src := handler.AttentionSource{Gateway: service.NewGatewayClient(cfg.GatewayStagingInternalURL, cfg.StagingInternalAPIKey)}
		if complianceSandbox != nil {
			src.Compliance = complianceSandbox
		}
		if notifSandbox != nil {
			src.Notifications = notifSandbox
		}
		attentionSources["SANDBOX"] = src
	}
	attentionH := handler.NewAttentionHandler(attentionSources)

	// All admin routes require an operator JWT (per-operator email/password).
	// The legacy ADMIN_API_KEY no longer authenticates the portal. Every mutation
	// is gated by a single capability middleware (RequireCapability) and recorded
	// in the immutable audit log.
	r.Group(func(r chi.Router) {
		r.Use(middleware.AdminJWT(cfg.AdminJWTSecret, jwtStore))
		r.Use(middleware.Audit(auditSink(audit)))
		// A successful mutation can change what waits for an operator; the next
		// attention summary is computed afresh instead of served from cache.
		r.Use(middleware.AfterMutation(attentionH.InvalidateAttention))

		// cap is a small alias so the route table reads as a permission matrix.
		cap := middleware.RequireCapability

		// Self-service (any authenticated operator). change-password is rate
		// limited too (brute force of the current password).
		r.Get("/admin/v1/auth/me", authH.Me)
		r.Post("/admin/v1/auth/logout", authH.Logout)
		r.Get("/admin/v1/auth/mfa/status", mfaH.Status)
		r.Post("/admin/v1/auth/mfa/recovery-codes", mfaH.RegenerateRecoveryCodes)
		r.Post("/admin/v1/auth/mfa/replace", mfaH.Replace)
		r.With(authLimit.Middleware).Post("/admin/v1/auth/change-password", authH.ChangePassword)
		r.Post("/admin/v1/auth/terminate-sessions", authH.TerminateSessions)

		// Official transaction receipt (PDF) — Document Engine, real sources
		// (wallet_payments / transfers). Capability-gated + audited (in this group).
		docH := handler.NewDocumentHandler(receiptSrc)
		r.With(cap(auth.CapMerchantView)).Get("/admin/v1/transactions/{id}/receipt.pdf", docH.TransactionReceipt)
		// Received wallet-native payments list (canonical: wallet_payments).
		wpH := handler.NewWalletPaymentsHandler(walletLister)
		r.With(cap(auth.CapMerchantView)).Get("/admin/v1/wallet-payments", wpH.List)

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
		// Sandbox gateway client (banzami_staging) for environment-aware routing of
		// Business applications + KYB (ADR-025). Nil when staging is unconfigured;
		// the guard below keeps it a true nil interface (not a typed-nil) so the
		// handler's `!= nil` checks behave.
		var gwSandbox *service.GatewayClient
		if cfg.GatewayStagingInternalURL != "" {
			gwSandbox = service.NewGatewayClient(cfg.GatewayStagingInternalURL, cfg.StagingInternalAPIKey)
		}
		var appStaging handler.GatewayApplications
		if gwSandbox != nil {
			appStaging = gwSandbox
		}
		applicationsH := handler.NewMerchantApplicationHandler(gw, appStaging, mailer, cfg.WebsiteBaseURL, platform)
		reconciliationH := handler.NewReconciliationHandler(core)
		consumerH := handler.NewConsumerHandler(core)
		walletH := handler.NewWalletHandler(core)
		riskH := handler.NewRiskHandler(core)
		walletAccountH := handler.NewWalletAccountHandler(core)
		// This admin instance's environment (live admin → LIVE, admin-api-staging →
		// SANDBOX) selects which gateway's proof to reverse on WON_BY_CONSUMER.
		adminEnv := os.Getenv("ENVIRONMENT")
		if adminEnv == "" {
			adminEnv = "LIVE"
		}
		disputeH := handler.NewDisputeHandler(core, gw, adminEnv)

		// Merchants
		r.With(cap(auth.CapMerchantManage)).Post("/admin/v1/merchants", merchantSetupH.Create)
		r.With(cap(auth.CapMerchantView)).Get("/admin/v1/merchants", merchantH.List)
		r.With(cap(auth.CapMerchantView)).Get("/admin/v1/merchants/{id}", merchantH.Get)
		r.With(cap(auth.CapMerchantManage)).Delete("/admin/v1/merchants/{id}", merchantH.Delete)
		// PATCH /admin/v1/merchants/{id}/verified is retired: "verified" is the
		// KYB decision (migration 0122), made through application review, KYB
		// document review or the compliance actions below — not a toggle.
		r.With(cap(auth.CapMerchantManage)).Patch("/admin/v1/merchants/{id}/business-account-type", merchantH.SetBusinessAccountType)
		// What a customer is charged. Guarded by the pricing capability rather
		// than merchant management: this is a commercial decision, and the people
		// who edit a Business Account's details are not necessarily the people who
		// price it.
		r.With(cap(auth.CapPricingManage)).Put("/admin/v1/merchants/{id}/pricing-profile", merchantH.AssignPricingProfile)
		r.With(cap(auth.CapMerchantManage)).Post("/admin/v1/merchants/{id}/api-keys", merchantSetupH.CreateApiKey)
		r.With(cap(auth.CapMerchantManage)).Post("/admin/v1/merchants/{id}/resend-credentials", merchantSetupH.ResendCredentials)
		r.With(cap(auth.CapMerchantManage)).Post("/admin/v1/merchants/{id}/wallets", merchantSetupH.CreateWallet)

		// Business onboarding applications (Merchant Lifecycle)
		r.With(cap(auth.CapApplicationView)).Get("/admin/v1/merchant-applications", applicationsH.List)
		r.With(cap(auth.CapApplicationView)).Get("/admin/v1/merchant-applications/{id}", applicationsH.Get)
		r.With(cap(auth.CapApplicationApprove)).Post("/admin/v1/merchant-applications/{id}/approve", applicationsH.Approve)
		r.With(cap(auth.CapApplicationReject)).Post("/admin/v1/merchant-applications/{id}/reject", applicationsH.Reject)
		r.With(cap(auth.CapApplicationProcess)).Post("/admin/v1/merchant-applications/{id}/start-review", applicationsH.StartReview)
		r.With(cap(auth.CapApplicationProcess)).Post("/admin/v1/merchant-applications/{id}/request-information", applicationsH.RequestInformation)
		r.With(cap(auth.CapApplicationApprove)).Post("/admin/v1/merchant-applications/{id}/link-existing", applicationsH.LinkExisting)
		r.With(cap(auth.CapApplicationApprove)).Post("/admin/v1/merchant-applications/{id}/reissue-activation", applicationsH.ReissueActivation)
		r.With(cap(auth.CapApplicationView)).Get("/admin/v1/merchant-applications/{id}/link-candidates", applicationsH.LinkCandidates)
		r.With(cap(auth.CapApplicationView)).Get("/admin/v1/merchant-applications/{id}/business-state", applicationsH.BusinessState)
		r.With(cap(auth.CapMerchantView)).Get("/admin/v1/businesses/{id}", applicationsH.BusinessByID)
		r.With(cap(auth.CapMerchantManage)).Post("/admin/v1/businesses/{id}/app-pin-reset", applicationsH.ResetBusinessAppPin)
		// KYB documents (Track 3) — admin review.
		r.With(cap(auth.CapApplicationView)).Get("/admin/v1/merchant-applications/{id}/documents", applicationsH.ListDocuments)
		r.With(cap(auth.CapApplicationView)).Post("/admin/v1/merchant-applications/{id}/documents/{documentId}/read-url", applicationsH.DocumentReadURL)
		r.With(cap(auth.CapKybAccept)).Post("/admin/v1/merchant-applications/{id}/documents/{documentId}/accept", applicationsH.AcceptDocument)
		r.With(cap(auth.CapKybReject)).Post("/admin/v1/merchant-applications/{id}/documents/{documentId}/reject", applicationsH.RejectDocument)

		// Merchant KYB documents (post-approval) — admin review. Reuses gwSandbox.
		merchantKybH := handler.NewMerchantKybHandler(gw, gwSandbox)
		r.With(cap(auth.CapApplicationView)).Get("/admin/v1/merchant-kyb/documents", merchantKybH.List)
		r.With(cap(auth.CapApplicationView)).Get("/admin/v1/merchant-kyb/merchants", merchantKybH.Merchants)
		r.With(cap(auth.CapApplicationView)).Get("/admin/v1/merchant-kyb/merchants/{id}/documents", merchantKybH.MerchantDocuments)
		r.With(cap(auth.CapApplicationView)).Get("/admin/v1/merchant-kyb/merchants/{id}/context", merchantKybH.Context)
		r.With(cap(auth.CapApplicationView)).Get("/admin/v1/merchant-kyb/merchants/{id}/timeline", merchantKybH.Timeline)
		r.With(cap(auth.CapApplicationView)).Post("/admin/v1/merchant-kyb/documents/{id}/read-url", merchantKybH.ReadURL)
		r.With(cap(auth.CapKybAccept)).Post("/admin/v1/merchant-kyb/documents/{id}/approve", merchantKybH.Approve)
		r.With(cap(auth.CapKybReject)).Post("/admin/v1/merchant-kyb/documents/{id}/reject", merchantKybH.Reject)

		// Operator attention (sidebar badges + bell): one read-only summary per
		// environment, RBAC-filtered per category inside the handler. Read-only.
		r.With(cap(auth.CapDashboardView)).Get("/admin/v1/attention-summary", attentionH.Summary)
		notificationsH := handler.NewNotificationsHandler(notif, notifSandbox)
		r.With(cap(auth.CapDashboardView)).Get("/admin/v1/notifications", notificationsH.List)
		r.With(cap(auth.CapApplicationProcess)).Post("/admin/v1/notifications/{id}/read", notificationsH.MarkRead)
		r.With(cap(auth.CapApplicationProcess)).Post("/admin/v1/notifications/{id}/dismiss", notificationsH.Dismiss)

		// Consumer KYC review (ADR-020). View reuses consumer.view; decisions
		// reuse compliance.review (the operator decides the granted level).
		kycH := handler.NewKycReviewHandler(kycReview, kycReviewStaging)
		r.With(cap(auth.CapConsumerView)).Get("/admin/v1/kyc/cases", kycH.List)
		r.With(cap(auth.CapConsumerView)).Get("/admin/v1/kyc/cases/{id}", kycH.Get)
		r.With(cap(auth.CapConsumerView)).Get("/admin/v1/kyc/cases/{id}/timeline", kycH.Timeline)
		r.With(cap(auth.CapConsumerView)).Post("/admin/v1/kyc/evidence/{id}/read-url", kycH.ReadURL)
		r.With(cap(auth.CapComplianceReview)).Post("/admin/v1/kyc/cases/{id}/approve", kycH.Approve)
		r.With(cap(auth.CapComplianceReview)).Post("/admin/v1/kyc/cases/{id}/reject", kycH.Reject)
		r.With(cap(auth.CapComplianceReview)).Post("/admin/v1/kyc/cases/{id}/request-more-info", kycH.RequestMoreInfo)

		// Wallets
		r.With(cap(auth.CapMerchantView)).Get("/admin/v1/wallets", walletH.GetForMerchant)
		r.With(cap(auth.CapMerchantView)).Get("/admin/v1/wallets/{id}/accounts", walletH.ListAccounts)
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

		// Compliance Operations Console — unified case inbox (ADR-023). Read behind
		// application.view; triage/assignment/notes behind compliance.review.
		casesH := handler.NewComplianceCasesHandler(compliance, complianceSandbox)
		r.With(cap(auth.CapApplicationView)).Get("/admin/v1/compliance/cases", casesH.List)
		r.With(cap(auth.CapApplicationView)).Get("/admin/v1/compliance/cases/{id}", casesH.Get)
		r.With(cap(auth.CapApplicationView)).Get("/admin/v1/compliance/cases/{id}/notes", casesH.ListNotes)
		r.With(cap(auth.CapComplianceReview)).Post("/admin/v1/compliance/cases/{id}/notes", casesH.AddNote)
		r.With(cap(auth.CapComplianceReview)).Post("/admin/v1/compliance/cases/{id}/assign", casesH.Assign)
		r.With(cap(auth.CapComplianceReview)).Post("/admin/v1/compliance/cases/{id}/transfer", casesH.Transfer)
		r.With(cap(auth.CapComplianceReview)).Post("/admin/v1/compliance/cases/{id}/release", casesH.Release)
		r.With(cap(auth.CapComplianceReview)).Post("/admin/v1/compliance/cases/{id}/escalate", casesH.Escalate)
		r.With(cap(auth.CapComplianceReview)).Post("/admin/v1/compliance/cases/{id}/resolve", casesH.Resolve)
		r.With(cap(auth.CapComplianceReview)).Post("/admin/v1/compliance/cases/{id}/priority", casesH.SetPriority)
		r.With(cap(auth.CapComplianceReview)).Post("/admin/v1/compliance/cases/{id}/risk", casesH.SetRisk)

		// Platform mode (SANDBOX/LIVE). Any operator reads; only a SUPER_ADMIN may
		// change it (enforced in the handler) with a typed confirmation + reason.
		platformH := handler.NewPlatformHandler(platform)
		r.With(cap(auth.CapDashboardView)).Get("/admin/v1/platform/mode", platformH.Get)
		r.With(cap(auth.CapDashboardView)).Post("/admin/v1/platform/mode", platformH.Set)

		// Transaction proofs — READ-ONLY operator view (ADR-040). Never edits/deletes.
		proofsH := handler.NewProofsHandler(proofAdmin, proofAdminSandbox)
		r.With(cap(auth.CapDashboardView)).Get("/admin/v1/proofs", proofsH.List)
		r.With(cap(auth.CapDashboardView)).Get("/admin/v1/proofs/{ref}", proofsH.Get)

		// Settlements
		r.With(cap(auth.CapSettlementManage)).Post("/admin/v1/settlements", settlementH.CreateBatch)
		r.With(cap(auth.CapSettlementView)).Get("/admin/v1/settlements", settlementH.List)
		r.With(cap(auth.CapSettlementView)).Get("/admin/v1/settlements/all", settlementH.ListAll)
		r.With(cap(auth.CapSettlementView)).Get("/admin/v1/settlements/{id}", settlementH.Get)
		r.With(cap(auth.CapSettlementManage)).Post("/admin/v1/settlements/{id}/submit", settlementH.Submit)
		r.With(cap(auth.CapSettlementManage)).Post("/admin/v1/settlements/{id}/confirm", settlementH.Confirm)
		r.With(cap(auth.CapSettlementManage)).Post("/admin/v1/settlements/{id}/fail", settlementH.Fail)

		// Finance — Pricing Rules (Banzami ADR-021). View is broad; manage is
		// SUPER_ADMIN-only (CapPricingManage is in no role matrix). Every mutation
		// is audited (action map below).
		pricingH := handler.NewPricingRuleHandler(core)
		r.With(cap(auth.CapPricingView)).Get("/admin/v1/finance/pricing-rules", pricingH.List)
		r.With(cap(auth.CapPricingView)).Get("/admin/v1/finance/pricing-rules/{id}", pricingH.Get)
		r.With(cap(auth.CapPricingView)).Get("/admin/v1/finance/pricing-rules/{id}/versions", pricingH.Versions)
		r.With(cap(auth.CapPricingManage)).Post("/admin/v1/finance/pricing-rules", pricingH.Create)
		r.With(cap(auth.CapPricingManage)).Patch("/admin/v1/finance/pricing-rules/{id}", pricingH.Update)
		r.With(cap(auth.CapPricingManage)).Post("/admin/v1/finance/pricing-rules/{id}/disable", pricingH.Disable)
		r.With(cap(auth.CapPricingManage)).Post("/admin/v1/finance/pricing-rules/{id}/enable", pricingH.Enable)
		r.With(cap(auth.CapPricingManage)).Post("/admin/v1/finance/pricing-rules/{id}/duplicate", pricingH.Duplicate)

		// Finance — Pricing catalogs (profiles + fee policies; ADR-021). Read =
		// pricing.view; mutations = pricing.manage (SUPER_ADMIN-only) + audited.
		for _, cat := range []struct {
			path string
			h    *handler.PricingCatalogHandler
		}{
			{"pricing-profiles", handler.NewPricingProfileHandler(core)},
			{"fee-policies", handler.NewFeePolicyHandler(core)},
		} {
			base := "/admin/v1/finance/" + cat.path
			ch := cat.h
			r.With(cap(auth.CapPricingView)).Get(base, ch.List)
			r.With(cap(auth.CapPricingView)).Get(base+"/{id}", ch.Get)
			r.With(cap(auth.CapPricingManage)).Post(base, ch.Create)
			r.With(cap(auth.CapPricingManage)).Patch(base+"/{id}", ch.Update)
			r.With(cap(auth.CapPricingManage)).Post(base+"/{id}/disable", ch.Disable)
			r.With(cap(auth.CapPricingManage)).Post(base+"/{id}/enable", ch.Enable)
		}

		// Finance — Operator Fees (read-only audit) + Application Settlements
		// (read + cancel/fail). Read = finance.view (broad); cancel/fail =
		// finance.manage (SUPER_ADMIN-only) and audited.
		financeH := handler.NewFinanceAuditHandler(core)
		r.With(cap(auth.CapFinanceView)).Get("/admin/v1/finance/dashboard", financeH.Dashboard)
		r.With(cap(auth.CapFinanceView)).Get("/admin/v1/finance/operator-fees", financeH.ListOperatorFees)
		r.With(cap(auth.CapFinanceView)).Get("/admin/v1/finance/operator-fees/{id}", financeH.GetOperatorFee)
		r.With(cap(auth.CapFinanceView)).Get("/admin/v1/finance/application-settlements", financeH.ListSettlements)
		r.With(cap(auth.CapFinanceView)).Get("/admin/v1/finance/application-settlements/{id}", financeH.GetSettlement)
		r.With(cap(auth.CapFinanceManage)).Post("/admin/v1/finance/application-settlements/{id}/cancel", financeH.CancelSettlement)
		r.With(cap(auth.CapFinanceManage)).Post("/admin/v1/finance/application-settlements/{id}/fail", financeH.FailSettlement)

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
		r.With(cap(auth.CapWalletAccountClose)).Post("/admin/v1/wallet-accounts/{id}/close", walletAccountH.Close)
		r.With(cap(auth.CapRiskFreeze)).Delete("/admin/v1/risk/freeze/{entity_type}/{entity_id}", riskH.UnfreezeAccount)
		r.With(cap(auth.CapRiskView)).Get("/admin/v1/risk/flags", riskH.ListRiskFlags)
		r.With(cap(auth.CapRiskResolve)).Post("/admin/v1/risk/flags/{id}/resolve", riskH.ResolveRiskFlag)
		r.With(cap(auth.CapRiskView)).Get("/admin/v1/risk/audit-log", riskH.QueryAuditLog)

		// The OPERATOR audit trail — a different thing from the risk one above.
		//
		// /risk/audit-log is Core's record of what happened to money: refunds,
		// credits, KYC status. admin_audit_log is the record of what an operator
		// did in this console: who signed in, who enrolled a factor, who changed
		// a pricing rule. Every action here has been written since the table
		// existed and no route ever read it, so the only way to answer "who did
		// this" was a psql session on the host — the operator SQL workaround this
		// console is meant to remove.
		adminAuditH := handler.NewAdminAuditHandler(audit)
		r.With(cap(auth.CapAuditView)).Get("/admin/v1/audit-log", adminAuditH.Query)
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
