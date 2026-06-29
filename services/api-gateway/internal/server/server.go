package server

import (
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/redis/go-redis/v9"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"

	"github.com/banzami/banzami/services/api-gateway/internal/config"
	"github.com/banzami/banzami/services/api-gateway/internal/handler"
	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/notify"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// Dependencies holds the runtime dependencies injected into the server.
type Dependencies struct {
	Redis               *redis.Client
	TransactionSvc      service.TransactionService
	WebhookSvc          service.WebhookService
	MerchantSvc         service.MerchantService
	WalletSvc           service.WalletService
	PayoutSvc           service.PayoutService
	ConsumerSvc         service.ConsumerService
	ConsumerWalletSvc   service.ConsumerWalletService
	TransferSvc         service.TransferService
	QrSvc               service.QrService
	PaymentLinkSvc      service.PaymentLinkService
	CollectionSvc       service.CollectionService
	AcquiringSvc        service.AcquiringService
	RefundSvc           service.RefundService
	DisputeSvc          service.DisputeService
	PaymentRequestSvc   service.PaymentRequestService
	MerchantProfileSvc  service.MerchantProfileService
	ConsumerPayLinkSvc  service.ConsumerPayLinkService
	FCMSvc              *notify.FCMService
	TeamSvc             service.TeamService
	MerchantCredSvc     service.MerchantCredentialService
	MerchantAppSvc      service.MerchantApplicationService
	MerchantAppAdminSvc service.MerchantApplicationAdminService
	MerchantDocumentSvc service.MerchantDocumentService
	MerchantKybSvc      *service.PostgresMerchantKybService
	ActivationSvc       service.ActivationService
	ComplianceSvc       service.ComplianceService
	SplitSvc            service.SplitService
	WalletPaymentSvc    service.WalletPaymentReader
	WalletPaymentLister service.WalletPaymentLister
	NotificationsSvc    *service.NotificationsService
}

// New constructs the HTTP server with the full middleware stack and route table.
// The chi router is wrapped with otelhttp so every request gets a trace span;
// RouteSpan then sets the low-cardinality route pattern on that span.
func New(cfg *config.Config, deps Dependencies) *http.Server {
	r := chi.NewRouter()

	// ---------------------------------------------------------------------------
	// Global middleware — applied to every request
	// ---------------------------------------------------------------------------
	r.Use(middleware.CORS)
	r.Use(chimw.RealIP)
	r.Use(middleware.RequestID)
	r.Use(middleware.Logger)
	r.Use(chimw.Recoverer)
	r.Use(chimw.Timeout(60 * time.Second))
	r.Use(middleware.RouteSpan)       // enriches the otelhttp span with chi route pattern
	r.Use(chimw.RequestSize(4 << 20)) // 4 MB global cap — blocks oversized payloads before handlers

	// ---------------------------------------------------------------------------
	// Observability endpoints — no auth, no rate limit, no tracing noise
	// ---------------------------------------------------------------------------
	r.Get("/health", handler.Liveness)
	r.Get("/readyz", handler.Readiness(cfg))
	r.Get("/metrics", promhttp.Handler().ServeHTTP)

	// ---------------------------------------------------------------------------
	// Handlers
	// ---------------------------------------------------------------------------
	authHandler := handler.NewAuthHandler(cfg, deps.MerchantSvc)
	merchantAuthHandler := handler.NewMerchantAuthHandler(cfg, deps.MerchantCredSvc)
	merchantOnboardingHandler := handler.NewMerchantOnboardingHandler(deps.MerchantAppSvc, deps.ActivationSvc)
	merchantAppAdminHandler := handler.NewMerchantApplicationAdminHandler(deps.MerchantAppAdminSvc)
	merchantDocumentHandler := handler.NewMerchantDocumentHandler(deps.MerchantDocumentSvc)
	merchantKybHandler := handler.NewMerchantKybHandler(deps.MerchantKybSvc)
	notificationsHandler := handler.NewNotificationsHandler(deps.NotificationsSvc)
	txHandler := handler.NewTransactionHandler(deps.TransactionSvc)
	wbhHandler := handler.NewWebhookHandler(deps.WebhookSvc)
	mchHandler := handler.NewMerchantHandler(deps.MerchantSvc)
	teamHandler := handler.NewTeamHandler(deps.TeamSvc)
	complianceHandler := handler.NewComplianceHandler(deps.ComplianceSvc)
	wltHandler := handler.NewWalletHandler(deps.WalletSvc)
	payoutHandler := handler.NewPayoutHandler(deps.PayoutSvc, deps.ComplianceSvc)
	consumerHandler := handler.NewConsumerHandler(deps.ConsumerSvc)
	receiptHandler := handler.NewReceiptHandler(deps.WalletPaymentSvc, deps.ConsumerSvc, deps.MerchantSvc)
	walletPaymentsHandler := handler.NewWalletPaymentsHandler(deps.WalletPaymentLister)
	consumerWltHandler := handler.NewConsumerWalletHandler(deps.ConsumerWalletSvc)
	transferHandler := handler.NewTransferHandler(deps.TransferSvc, deps.FCMSvc, deps.ComplianceSvc)
	qrHandler := handler.NewQrHandler(deps.QrSvc)
	splitHandler := handler.NewSplitHandler(deps.SplitSvc)
	paymentLinkHandler := handler.NewPaymentLinkHandler(deps.PaymentLinkSvc, deps.MerchantSvc, deps.WebhookSvc)
	collectionHandler := handler.NewCollectionHandler(deps.CollectionSvc)
	acquiringHandler := handler.NewAcquiringHandler(deps.AcquiringSvc, deps.PaymentLinkSvc, deps.FCMSvc)
	sandboxHandler := handler.NewSandboxHandler(deps.TransactionSvc, deps.WalletSvc)
	refundHandler := handler.NewRefundHandler(deps.RefundSvc)
	disputeHandler := handler.NewDisputeHandler(deps.DisputeSvc)
	paymentReqHandler := handler.NewPaymentRequestHandler(deps.PaymentRequestSvc)
	profileHandler := handler.NewMerchantProfileHandler(deps.MerchantProfileSvc)
	consumerPayLinkPubH := handler.NewConsumerPayLinkHandler(deps.ConsumerPayLinkSvc)

	// Auth — no JWT required; the API key is the credential
	r.Post("/v1/auth/token", authHandler.Token)
	// Merchant app login by @handle + PIN — no JWT required; handle+PIN is the
	// credential. Issues the same merchant JWT as the API-key flow.
	r.Post("/v1/merchant/auth/token", merchantAuthHandler.Token)
	// Non-secret handle lookup — the app prompts for a PIN only when the account
	// exists and can sign in.
	r.Post("/v1/merchant/auth/lookup", merchantAuthHandler.Lookup)
	// Public Business onboarding — no JWT required.
	r.Post("/v1/merchant/applications/check-handle", merchantOnboardingHandler.CheckHandle)
	r.Post("/v1/merchant/applications", merchantOnboardingHandler.SubmitApplication)
	r.Post("/v1/merchant/activation/validate", merchantOnboardingHandler.ValidateActivation)
	r.Post("/v1/merchant/activation/complete", merchantOnboardingHandler.CompleteActivation)
	// KYB documents (Track 3) — public applicant flow. The application id is the
	// unguessable capability token (same model as activation).
	r.Post("/v1/merchant/applications/{id}/documents/upload-url", merchantDocumentHandler.RequestUploadURL)
	r.Post("/v1/merchant/applications/{id}/documents/{document_id}/confirm", merchantDocumentHandler.ConfirmUpload)
	r.Get("/v1/merchant/applications/{id}/documents", merchantDocumentHandler.ListDocuments)

	// Internal service-to-service endpoints — admin-api only (shared secret).
	r.Group(func(r chi.Router) {
		r.Use(middleware.InternalAuth(cfg.InternalAPIKey))
		r.Route("/internal/v1/merchant-applications", func(r chi.Router) {
			r.Get("/", merchantAppAdminHandler.List)
			r.Get("/{id}", merchantAppAdminHandler.Get)
			r.Post("/{id}/approve", merchantAppAdminHandler.Approve)
			r.Post("/{id}/reject", merchantAppAdminHandler.Reject)
			// KYB documents — admin review flow (read-url / accept / reject).
			r.Get("/{id}/documents", merchantDocumentHandler.AdminList)
			r.Post("/{id}/documents/{document_id}/read-url", merchantDocumentHandler.AdminReadURL)
			r.Post("/{id}/documents/{document_id}/accept", merchantDocumentHandler.AdminAccept)
			r.Post("/{id}/documents/{document_id}/reject", merchantDocumentHandler.AdminReject)
		})
		// Merchant KYB documents (post-approval) — admin review.
		r.Route("/internal/v1/merchant-kyb", func(r chi.Router) {
			r.Get("/documents", merchantKybHandler.AdminList)
			r.Post("/documents/{id}/approve", merchantKybHandler.AdminApprove)
			r.Post("/documents/{id}/reject", merchantKybHandler.AdminReject)
		})
		// Operator review-queue summary (sidebar badges).
		r.Get("/internal/v1/notifications/summary", notificationsHandler.Summary)
	})

	r.Group(func(r chi.Router) {
		r.Use(middleware.Auth(cfg))
		r.Use(middleware.RateLimit(deps.Redis, middleware.DefaultRateLimits))
		r.Use(middleware.Idempotency(deps.Redis))

		r.Route("/v1", func(r chi.Router) {
			// Claim/update the merchant @handle + PIN (already authenticated).
			r.Post("/merchant/auth/claim", merchantAuthHandler.Claim)

			r.Post("/transactions", txHandler.Create)
			r.Get("/transactions", txHandler.List)
			r.Get("/transactions/{id}", txHandler.Get)

			// Merchant received wallet-native payments (canonical: wallet_payments).
			r.Get("/merchant/wallet-payments", walletPaymentsHandler.List)
			// Official merchant payment receipt (PDF) — Document Engine, real
			// wallet_payments data.
			r.Get("/merchant/transactions/{id}/receipt.pdf", receiptHandler.MerchantReceipt)

			r.Route("/webhooks", func(r chi.Router) {
				r.Post("/endpoints", wbhHandler.Register)
				r.Get("/endpoints", wbhHandler.ListEndpoints)
				r.Get("/endpoints/{id}", wbhHandler.GetEndpoint)
				r.Delete("/endpoints/{id}", wbhHandler.DeactivateEndpoint)
				r.Get("/endpoints/{id}/health", wbhHandler.EndpointHealth)

				r.Get("/events", wbhHandler.ListEvents)
				r.Get("/events/{id}/deliveries", wbhHandler.ListDeliveries)

				// Replay a permanently-failed delivery (dead-letter recovery).
				r.Post("/deliveries/{id}/replay", wbhHandler.ReplayDelivery)
			})

			r.Route("/merchants", func(r chi.Router) {
				r.Post("/", mchHandler.Create)
				r.Get("/{id}", mchHandler.Get)
				r.Post("/{id}/suspend", mchHandler.Suspend)
				r.Post("/{id}/api-keys", mchHandler.CreateApiKey)
				r.Get("/{id}/api-keys", mchHandler.ListApiKeys)
				r.Delete("/{id}/api-keys/{keyID}", mchHandler.RevokeApiKey)
			})

			r.Route("/compliance", func(r chi.Router) {
				r.Post("/customers/verify", complianceHandler.VerifyCustomer)
				r.Get("/customers/status", complianceHandler.KycStatus)
				r.Post("/merchants/verify", complianceHandler.VerifyMerchant)
				r.Get("/merchants/status", complianceHandler.MerchantStatus)
			})

			// Merchant-authenticated KYB documents (post-approval maintenance).
			// The application form is NOT repeated; here the merchant sees status
			// and updates documents.
			r.Route("/merchant/kyb", func(r chi.Router) {
				r.Get("/status", merchantKybHandler.Status)
				r.Get("/documents", merchantKybHandler.ListDocuments)
				r.Get("/documents/{id}", merchantKybHandler.GetDocument)
				r.Post("/documents/{id}/upload-url", merchantKybHandler.RequestUploadURL) // {id}=document_type
				r.Post("/documents/{id}/complete", merchantKybHandler.CompleteUpload)
			})

			r.Route("/team", func(r chi.Router) {
				r.Get("/members", teamHandler.List)
				r.Post("/members", teamHandler.Invite)
				r.Delete("/members/{id}", teamHandler.Remove)
				r.Get("/access-log", teamHandler.AccessLog)
			})

			r.Route("/wallets", func(r chi.Router) {
				r.Post("/", wltHandler.Create)
				r.Get("/", wltHandler.GetForMerchant)
				r.Get("/{id}", wltHandler.Get)
				r.Get("/{id}/balance", wltHandler.Balance)
				r.Get("/{id}/analytics", wltHandler.Analytics)
			})

			r.Route("/payouts", func(r chi.Router) {
				r.Post("/", payoutHandler.Create)
				r.Get("/", payoutHandler.List)
				r.Get("/{id}", payoutHandler.Get)
			})

			// Consumer identity
			r.Route("/consumers", func(r chi.Router) {
				r.Post("/", consumerHandler.Create)
				r.Get("/handle/{handle}", consumerHandler.GetByHandle)
				r.Get("/{id}", consumerHandler.Get)
				r.Post("/{id}/suspend", consumerHandler.Suspend)
				r.Post("/{id}/close", consumerHandler.Close)
			})

			// Consumer wallets
			r.Route("/consumer-wallets", func(r chi.Router) {
				r.Post("/", consumerWltHandler.Create)
				r.Get("/", consumerWltHandler.GetForConsumer) // ?consumer_id=X&currency=AOA
				r.Get("/{id}", consumerWltHandler.Get)
				r.Get("/{id}/balance", consumerWltHandler.Balance)
			})

			// Instant P2P transfers
			r.Route("/transfers", func(r chi.Router) {
				r.Post("/", transferHandler.Send)
				r.Get("/", transferHandler.List) // ?consumer_id=X&limit=20&cursor=...
				r.Get("/{id}", transferHandler.Get)
			})

			// QR payments
			r.Route("/qr", func(r chi.Router) {
				r.Post("/static", qrHandler.CreateStatic)
				r.Post("/dynamic", qrHandler.CreateDynamic)
				r.Post("/decode", qrHandler.Decode)
				r.Post("/pay", qrHandler.Pay)
				r.Get("/{id}", qrHandler.Get)
				r.Post("/{id}/use", qrHandler.MarkUsed)
			})

			r.Route("/splits", func(r chi.Router) {
				r.Post("/", splitHandler.Create)
				r.Get("/{id}", splitHandler.Get)
				r.Post("/{id}/pay", splitHandler.Pay)
			})

			// Payment links
			r.Route("/payment-links", func(r chi.Router) {
				r.Post("/", paymentLinkHandler.Create)
				r.Get("/", paymentLinkHandler.List)
				r.Get("/{id}", paymentLinkHandler.Get)
				r.Delete("/{id}", paymentLinkHandler.Cancel)
				r.Post("/{id}/mark-used", paymentLinkHandler.MarkUsed)
			})

			// Collections (BANZA ADR-036) + PaymentIntent (ADR-037).
			// merchant_id + environment are derived from the principal; the core
			// returns 404 on cross-tenant access. Not exposed in mobile yet.
			r.Route("/collections", func(r chi.Router) {
				r.Post("/", collectionHandler.Create)
				r.Get("/", collectionHandler.List)
				r.Get("/{id}", collectionHandler.Get)
				r.Patch("/{id}", collectionHandler.Update)
				r.Post("/{id}/close", collectionHandler.Close)
				r.Post("/{id}/cancel", collectionHandler.Cancel)
				r.Get("/{id}/events", collectionHandler.Events)
				r.Post("/{id}/shares", collectionHandler.CreateShare)
				r.Get("/{id}/shares", collectionHandler.ListShares)
			})
			r.Post("/collection-shares/{id}/surface", collectionHandler.SurfaceShare)

			// Refunds
			r.Route("/refunds", func(r chi.Router) {
				r.Post("/", refundHandler.Create)
				r.Get("/", refundHandler.List)
				r.Get("/{id}", refundHandler.Get)
			})

			// Disputes
			r.Route("/disputes", func(r chi.Router) {
				r.Post("/", disputeHandler.Open)
				r.Get("/", disputeHandler.List)
				r.Get("/{id}", disputeHandler.Get)
				r.Post("/{id}/evidence", disputeHandler.SubmitEvidence)
				r.Get("/{id}/evidence", disputeHandler.ListEvidence)
			})

			// Payment requests
			r.Route("/payment-requests", func(r chi.Router) {
				r.Post("/", paymentReqHandler.Create)
				r.Get("/", paymentReqHandler.List)
				r.Get("/{id}", paymentReqHandler.Get)
				r.Post("/{id}/pay", paymentReqHandler.Pay)
				r.Post("/{id}/decline", paymentReqHandler.Decline)
				r.Post("/{id}/cancel", paymentReqHandler.Cancel)
			})

			// Sandbox utilities — only functional with bz_test_ keys.
			// Every handler in this group enforces SANDBOX environment internally.
			r.Route("/sandbox", func(r chi.Router) {
				r.Get("/status", sandboxHandler.Status)
				r.Get("/instruments", sandboxHandler.ListInstruments)
				r.Post("/fund", sandboxHandler.FundWallet)
				r.Post("/simulate/payment", sandboxHandler.SimulatePayment)
			})
		})
	})

	// Acquiring callbacks — no auth (EMIS calls us with HMAC-signed bodies).
	// The Rust core validates the HMAC before processing.
	r.Post("/v1/callbacks/emis", acquiringHandler.EmisCallback)

	// Public endpoints — no auth, no rate limiting.
	// Consumed by the apps/pay Next.js app.
	r.Route("/public/pay", func(r chi.Router) {
		r.Get("/{slug}", paymentLinkHandler.GetPublic)
		r.Get("/{slug}/status", paymentLinkHandler.Status)
		r.Post("/{slug}/pay", acquiringHandler.InitiatePay)
		r.Post("/{slug}/test-confirm", acquiringHandler.TestConfirm) // dev only
	})
	r.Route("/public/profiles", func(r chi.Router) {
		r.Get("/{handle}", profileHandler.GetPublic)
	})
	r.Route("/public/consumer-pay-links", func(r chi.Router) {
		r.Get("/{code}", consumerPayLinkPubH.GetPublic)
	})

	// Wrap the entire chi router with otelhttp. This creates one trace span per
	// request and records http.server.request.duration / active_requests metrics
	// automatically using OTel semantic conventions.
	traced := otelhttp.NewHandler(r, "api-gateway")

	return &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.Port),
		Handler:      traced,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  120 * time.Second,
	}
}
