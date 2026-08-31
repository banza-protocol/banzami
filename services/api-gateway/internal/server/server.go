package server

import (
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"

	"github.com/banzami/banzami/services/common/obs"
	"github.com/jackc/pgx/v5/pgxpool"
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
	Redis *redis.Client
	// DBPool backs the readiness probe. Nil is a legitimate state (the service
	// starts without a database so /health can answer during provisioning), and
	// readiness treats nil as NOT ready rather than silently passing — see
	// handler.Readiness and finding SE-003.
	DBPool                   *pgxpool.Pool
	TransactionSvc           service.TransactionService
	WebhookSvc               service.WebhookService
	MerchantSvc              service.MerchantService
	WalletSvc                service.WalletService
	ApplicationSettlementSvc service.ApplicationSettlementService
	WalletAccountSvc         service.WalletAccountService
	PartyResolverSvc         service.PartyResolver
	PaymentSessionSvc        service.PaymentSessionService
	PayoutSvc                service.PayoutService
	ConsumerSvc              service.ConsumerService
	ConsumerWalletSvc        service.ConsumerWalletService
	QrSvc                    service.QrService
	PaymentLinkSvc           service.PaymentLinkService
	CollectionSvc            service.CollectionService
	AcquiringSvc             service.AcquiringService
	RefundSvc                service.RefundService
	DisputeSvc               service.DisputeService
	PaymentRequestSvc        service.PaymentRequestService
	MerchantProfileSvc       service.MerchantProfileService
	ConsumerPayLinkSvc       service.ConsumerPayLinkService
	FCMSvc                   *notify.FCMService
	TeamSvc                  service.TeamService
	MerchantCredSvc          service.MerchantCredentialService
	MerchantAppSvc           service.MerchantApplicationService
	MerchantAppAdminSvc      service.MerchantApplicationAdminService
	MerchantDocumentSvc      service.MerchantDocumentService
	MerchantKybSvc           *service.PostgresMerchantKybService
	ActivationSvc            service.ActivationService
	ComplianceSvc            service.ComplianceService
	WalletPaymentSvc         service.WalletPaymentReader
	WalletPaymentLister      service.WalletPaymentLister
	NotificationsSvc         *service.NotificationsService
	PlatformSvc              *service.PlatformReadService
	ProofSvc                 *service.ProofService
	BusinessSelfSvc          *service.BusinessSelfService
	ProofHashSalt            string
}

// New constructs the HTTP server with the full middleware stack and route table.
// The chi router is wrapped with otelhttp so every request gets a trace span;
// RouteSpan then sets the low-cardinality route pattern on that span.
func New(cfg *config.Config, deps Dependencies) *http.Server {
	r := newRouter(cfg, deps)

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

// newRouter builds the full route table. Split out from New so the registered
// routes can be asserted directly (chi.Walk) — a security-relevant route being
// absent is otherwise indistinguishable from it being present-but-rejecting,
// because group middleware runs before chi's NotFound handler.
func newRouter(cfg *config.Config, deps Dependencies) chi.Router {
	r := chi.NewRouter()

	// ---------------------------------------------------------------------------
	// Global middleware — applied to every request
	// ---------------------------------------------------------------------------
	r.Use(middleware.CORS)
	r.Use(chimw.RealIP)
	r.Use(obs.Correlation) // single source: correlation_id (flow) + request_id (local)
	r.Use(middleware.Logger)
	r.Use(chimw.Recoverer)
	r.Use(chimw.Timeout(60 * time.Second))
	r.Use(middleware.RouteSpan)       // enriches the otelhttp span with chi route pattern
	r.Use(chimw.RequestSize(4 << 20)) // 4 MB global cap — blocks oversized payloads before handlers

	// ---------------------------------------------------------------------------
	// Observability endpoints — no auth, no rate limit, no tracing noise
	// ---------------------------------------------------------------------------
	r.Get("/health", handler.Liveness)
	r.Get("/readyz", handler.Readiness(cfg, deps.DBPool, deps.Redis))
	r.Get("/metrics", promhttp.Handler().ServeHTTP)

	// ---------------------------------------------------------------------------
	// Handlers
	// ---------------------------------------------------------------------------
	authHandler := handler.NewAuthHandler(cfg, deps.MerchantSvc)
	merchantAuthHandler := handler.NewMerchantAuthHandler(cfg, deps.MerchantCredSvc)
	// Platform Mode is the single source of truth for the onboarding environment
	// (ADR-025): this gate refuses application submission/approval when the gateway
	// stack's environment (cfg.Environment) disagrees with the current mode.
	envGate := service.NewEnvGate(cfg.Environment, deps.PlatformSvc)
	merchantOnboardingHandler := handler.NewMerchantOnboardingHandler(deps.MerchantAppSvc, deps.ActivationSvc, envGate).WithAutoApprove(deps.MerchantAppAdminSvc)
	merchantAppAdminHandler := handler.NewMerchantApplicationAdminHandler(deps.MerchantAppAdminSvc, envGate)
	merchantDocumentHandler := handler.NewMerchantDocumentHandler(deps.MerchantDocumentSvc)
	merchantKybHandler := handler.NewMerchantKybHandler(deps.MerchantKybSvc)
	businessMeHandler := handler.NewBusinessMeHandler(deps.BusinessSelfSvc)
	notificationsHandler := handler.NewNotificationsHandler(deps.NotificationsSvc)
	txHandler := handler.NewTransactionHandler(deps.TransactionSvc)
	wbhHandler := handler.NewWebhookHandler(deps.WebhookSvc)
	mchHandler := handler.NewMerchantHandler(deps.MerchantSvc)
	teamHandler := handler.NewTeamHandler(deps.TeamSvc)
	complianceHandler := handler.NewComplianceHandler(deps.ComplianceSvc)
	wltHandler := handler.NewWalletHandler(deps.WalletSvc)
	payoutHandler := handler.NewPayoutHandler(deps.PayoutSvc, deps.ComplianceSvc)
	consumerHandler := handler.NewConsumerHandler(deps.ConsumerSvc)
	receiptHandler := handler.NewReceiptHandler(deps.WalletPaymentSvc, deps.ConsumerSvc, deps.MerchantSvc, deps.ProofSvc)
	walletPaymentsHandler := handler.NewWalletPaymentsHandler(deps.WalletPaymentLister)
	consumerWltHandler := handler.NewConsumerWalletHandler(deps.ConsumerWalletSvc)
	qrHandler := handler.NewQrHandler(deps.QrSvc)
	// Split Sessions is SUPERSEDED by Collections (ADR-036) — answered at the edge, never proxied.
	splitsSuperseded := handler.SplitsSuperseded()
	paymentLinkHandler := handler.NewPaymentLinkHandler(deps.PaymentLinkSvc, deps.MerchantSvc, deps.WebhookSvc)
	collectionHandler := handler.NewCollectionHandler(deps.CollectionSvc)
	acquiringHandler := handler.NewAcquiringHandler(deps.AcquiringSvc, deps.PaymentLinkSvc, deps.FCMSvc)
	sandboxHandler := handler.NewSandboxHandler(deps.TransactionSvc, deps.WalletSvc)
	refundHandler := handler.NewRefundHandler(deps.RefundSvc)
	disputeHandler := handler.NewDisputeHandler(deps.DisputeSvc)
	paymentReqHandler := handler.NewPaymentRequestHandler(deps.PaymentRequestSvc)
	profileHandler := handler.NewMerchantProfileHandler(deps.MerchantProfileSvc)
	consumerPayLinkPubH := handler.NewConsumerPayLinkHandler(deps.ConsumerPayLinkSvc)
	appSettlementHandler := handler.NewApplicationSettlementHandler(deps.ApplicationSettlementSvc, deps.WalletSvc, deps.WalletAccountSvc, deps.PartyResolverSvc)
	walletAccountHandler := handler.NewWalletAccountHandler(deps.WalletAccountSvc, deps.WalletSvc, deps.MerchantSvc)
	paymentSessionHandler := handler.NewPaymentSessionHandler(deps.PaymentSessionSvc, deps.MerchantSvc)

	// Unauthenticated credential endpoints (login / handle lookup) are a
	// brute-force + account-enumeration surface, so they get a dedicated tight
	// per-IP limiter in a separate key space from the general anonymous limit.
	credLimit := middleware.RateLimitPerIP(deps.Redis, middleware.CredentialPerMinute, "cred")

	// Auth — no JWT required; the API key is the credential
	r.With(credLimit).Post("/v1/auth/token", authHandler.Token)
	// Merchant app login by @handle + PIN — no JWT required; handle+PIN is the
	// credential. Issues the same merchant JWT as the API-key flow.
	r.With(credLimit).Post("/v1/merchant/auth/token", merchantAuthHandler.Token)
	// Non-secret handle lookup — the app prompts for a PIN only when the account
	// exists and can sign in.
	r.With(credLimit).Post("/v1/merchant/auth/lookup", merchantAuthHandler.Lookup)
	// Public platform mode — read-only, no auth. Lets the website show a SANDBOX
	// banner without a rebuild. Never leaks internal config.
	r.Get("/v1/platform-mode", handler.NewPlatformHandler(deps.PlatformSvc).Mode)

	// Public transaction-proof verification (BANZA ADR-023) — no auth, rate-limited,
	// safe fields only. The QR/short link on every receipt resolves here.
	r.With(middleware.RateLimit(deps.Redis, middleware.DefaultRateLimits)).
		Get("/v1/public/proofs/{ref}", handler.NewProofHandler(deps.ProofSvc, deps.ProofHashSalt).Verify)

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

	// Internal service-to-service endpoints — admin-api / public-api only (shared secret).
	r.Group(func(r chi.Router) {
		r.Use(middleware.InternalAuth(cfg.InternalAPIKey))
		// Idempotent proof minting for services that render receipts (public-api).
		r.Post("/internal/v1/proofs/ensure", handler.NewProofHandler(deps.ProofSvc, deps.ProofHashSalt).EnsureProof)
		// Proactive proof reversal — admin-api on dispute WON_BY_CONSUMER (and any
		// future core reversal event). Flips the public proof to REVERSED.
		r.Post("/internal/v1/proofs/reverse", handler.NewProofHandler(deps.ProofSvc, deps.ProofHashSalt).Reverse)
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
			r.Get("/merchants", merchantKybHandler.AdminMerchants)
			r.Get("/merchants/{id}/documents", merchantKybHandler.AdminMerchantDocuments)
			r.Post("/documents/{id}/approve", merchantKybHandler.AdminApprove)
			r.Post("/documents/{id}/reject", merchantKybHandler.AdminReject)
			r.Post("/documents/{id}/read-url", merchantKybHandler.AdminReadURL)
			r.Get("/merchants/{id}/context", merchantKybHandler.AdminContext)
			r.Get("/merchants/{id}/timeline", merchantKybHandler.AdminTimeline)
		})
		// Operator review-queue summary (sidebar badges).
		r.Get("/internal/v1/notifications/summary", notificationsHandler.Summary)
	})

	// ADR-046 external developer-key surface (RT02.1 fail-closed activation).
	// Mounted ONLY when DeveloperKeyAuthActive() holds: DEVELOPER_KEY_AUTH_ENABLED
	// set, ENVIRONMENT=SANDBOX, non-empty internal credential, canonical Sandbox
	// Developer API host. A URL variable alone never activates it. Authenticated
	// by a Console-issued Sandbox key (NOT the merchant JWT); rate-limited on the
	// non-secret key id. GET /v1/me is the released consumption surface (CAP-DEV-002).
	// Hoisted so the canonical payment routes can accept the SAME developer key
	// (ADR-047 dual-credential auth). nil when developer-key auth is inactive —
	// the payment routes then fall back to merchant-JWT-only.
	var devKeyClient *service.DeveloperKeyClient
	if active, reason := cfg.DeveloperKeyAuthActive(); active {
		devKeyClient = service.NewDeveloperKeyClient(cfg.DeveloperAPIURL, cfg.DeveloperInternalKey)
		meHandler := handler.NewMeHandler()
		r.Group(func(r chi.Router) {
			// Per-IP limit BEFORE introspection — caps how many keys an
			// unauthenticated caller can bounce off the Developer API, protecting
			// it from auth-amplification (RT03 §1). Then the resolved key-id
			// limit after auth.
			r.Use(middleware.RateLimitPerIP(deps.Redis, 60, "devkey"))
			r.Use(middleware.DeveloperKeyAuth(devKeyClient))
			r.Use(middleware.DeveloperKeyRateLimit(deps.Redis))
			r.Get("/v1/me", meHandler.Me)
		})
		slog.Info("developer-key auth active", "surface", "GET /v1/me")
	} else {
		slog.Info("developer-key auth disabled", "reason", reason)
	}

	// Single /v1 mount (chi forbids mounting /v1 twice on the same router). The
	// merchant surface and the ADR-047 canonical payment surface live under it as
	// two sibling groups, each keeping its own middleware chain and routes.
	r.Route("/v1", func(r chi.Router) {
		// Merchant surface — merchant JWT auth, default rate limits, idempotency.
		r.Group(func(r chi.Router) {
			r.Use(middleware.Auth(cfg))
			r.Use(middleware.RateLimit(deps.Redis, middleware.DefaultRateLimits))
			r.Use(middleware.Idempotency(deps.Redis))
			// Claim/update the merchant @handle + PIN (already authenticated).
			r.Post("/merchant/auth/claim", merchantAuthHandler.Claim)

			// The authenticated Business account's own consolidated profile
			// (identity, type, category, wallet + KYB readiness) — for an
			// integrating app's "Integration Health" view. Self-scoped.
			r.Get("/business/me", businessMeHandler.Me)

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
				r.Use(middleware.RequireMerchant) // SEC-004
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
				r.Use(middleware.RequireMerchant) // SEC-004
				r.Post("/", wltHandler.Create)
				r.Get("/", wltHandler.GetForMerchant)
				r.Get("/{id}", wltHandler.Get)
				r.Get("/{id}/balance", wltHandler.Balance)
				r.Get("/{id}/analytics", wltHandler.Analytics)
			})

			// Application Settlement (ADR-021) — app-facing: settle a campaign/app
			// wallet to a beneficiary, splitting off an app fee. Money moves in the
			// operator; the app never sees account ids or computes the fee.
			r.Route("/application-settlements", func(r chi.Router) {
				r.Post("/", appSettlementHandler.Create)
				r.Get("/{id}", appSettlementHandler.Get)
			})

			// ADR-029 — app-defined settlement: the app names the source campaign
			// account, beneficiary/fee-destination @banza, and its OWN fee bps; the
			// operator validates + executes. Distinct from the operator-priced path.
			r.Route("/business/application-settlements", func(r chi.Router) {
				r.Post("/", appSettlementHandler.CreateBusiness)
				r.Get("/{id}", appSettlementHandler.Get)
			})

			// Wallet Accounts (ADR-042) — app-facing: a Business Account opens and
			// reads segregated accounts (CAMPAIGN/PROJECT/…) within a wallet it owns,
			// to isolate funds without holding sub-balances. Banzami stays the source
			// of truth; ledger account ids are never exposed. PRIMARY is not creatable.
			r.Route("/business/wallet-accounts", func(r chi.Router) {
				r.Post("/", walletAccountHandler.Create)
				r.Get("/", walletAccountHandler.List)
				r.Get("/{id}", walletAccountHandler.Get)
			})

			// Payment Sessions + Payment Links are mounted separately under
			// dual-credential auth (merchant JWT OR developer key) — see the
			// canonical payment group below. Not registered here.

			r.Route("/payouts", func(r chi.Router) {
				r.Post("/", payoutHandler.Create)
				r.Get("/", payoutHandler.List)
				r.Get("/{id}", payoutHandler.Get)
			})

			// Consumer identity.
			// SEC-004: these consumer-domain routes are part of the MERCHANT
			// surface, so they require a merchant principal — a consumer token
			// (minted by public-api with the same secret and claim shape) must
			// never reach them.
			// SEC-005: the consumer SUSPEND/CLOSE lifecycle actions were removed
			// from this surface. They are operator actions and remain available —
			// capability-gated (CapConsumerSuspend) and audited — through
			// admin-api → core /internal/v1/consumers/{id}/suspend. On the merchant
			// surface they were unauthorised: any authenticated principal could
			// close or suspend ANY consumer account by id.
			r.Route("/consumers", func(r chi.Router) {
				r.Use(middleware.RequireMerchant)
				r.Post("/", consumerHandler.Create)
				r.Get("/handle/{handle}", consumerHandler.GetByHandle)
				r.Get("/{id}", consumerHandler.Get)
			})

			// Consumer wallets
			r.Route("/consumer-wallets", func(r chi.Router) {
				r.Use(middleware.RequireMerchant)
				r.Post("/", consumerWltHandler.Create)
				r.Get("/", consumerWltHandler.GetForConsumer) // ?consumer_id=X&currency=AOA
				r.Get("/{id}", consumerWltHandler.Get)
				r.Get("/{id}/balance", consumerWltHandler.Balance)
			})

			// Consumer P2P transfers are NOT a merchant resource, and the whole
			// /v1/transfers group was REMOVED from this surface (SEC-015, SEC-018).
			//
			// A consumer-to-consumer transfer has two consumer participants and no
			// merchant party. There is no ownership relation a merchant principal
			// could be scoped against — which is not a missing field, it is the
			// absence of authority. The routes took their subject straight from
			// client input, so a merchant credential could:
			//
			//   POST /v1/transfers              — name ANY sender_id and move that
			//                                     consumer's money to any recipient
			//   GET  /v1/transfers/{id}         — read ANY transfer
			//   GET  /v1/transfers?consumer_id= — read ANY consumer's whole history
			//
			// The sender-KYC compliance gate did not help: it authorised the SENDER
			// named in the body, never the caller. This is finding B of
			// docs/security/2026-07-03-transfer-surface-findings.md, recorded then
			// as a hard blocker before Live activation.
			//
			// The capability is not relocated, because it already exists correctly:
			// public-api serves the consumer surface, deriving the sender from the
			// authenticated consumer token and scoping reads to a transfer's own
			// sender/recipient (the RA-022 fix). Nothing was added to the financial
			// model to make a merchant route pass an ownership check.

			// QR payments
			r.Route("/qr", func(r chi.Router) {
				r.Post("/static", qrHandler.CreateStatic)
				r.Post("/dynamic", qrHandler.CreateDynamic)
				r.Post("/decode", qrHandler.Decode)
				// POST /pay is NOT mounted. A merchant JWT is not authority to debit a
				// consumer's wallet, and this route accepted the payer as free text
				// (RA-053). The contract puts the authority with the payer: the Flutter
				// SDK's ConsumerPublicClient documents "[payer] is the authenticated
				// consumer's @banza handle" and targets the consumer surface, where no
				// such route exists. So the only implementation lived on the wrong
				// credential, and nothing in the chain proved the caller could spend the
				// named consumer's money.
				//
				// Removed rather than patched, following SEC-015: a merchant has no
				// generic authority over a consumer's funds, and the fix belongs at the
				// API boundary, not in a consent model invented to justify the route.
				// The consumer-side surface remains to be implemented per the SDK
				// contract, deriving the payer from the authenticated consumer token.
				r.Get("/{id}", qrHandler.Get)
				r.Post("/{id}/use", qrHandler.MarkUsed)
			})

			// Split Sessions — SUPERSEDED by Collections (ADR-036). Every legacy
			// path + method (list/create, detail, pay, nested, malformed) → 410
			// at the edge; never proxied to Core (no upstream 502/500).
			r.Handle("/splits", splitsSuperseded)
			r.Handle("/splits/*", splitsSuperseded)

			// Payment Links are mounted under dual-credential auth below.

			// Collections (BANZA ADR-016) + PaymentIntent (ADR-014).
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

		// Canonical payment surface (ADR-047 §5) — a SINGLE mount per resource that
		// accepts EITHER a merchant JWT or a Console developer key via strictly
		// separated dual-credential auth (no /v1/dev/* duplicate, no cross-credential
		// fallback). A developer key derives its payee ONLY from the Project binding;
		// a merchant JWT retains its existing identity behavior. When developer-key
		// auth is inactive, these routes fall back to merchant-JWT-only.
		r.Group(func(r chi.Router) {
			r.Use(middleware.RateLimitPerIP(deps.Redis, 120, "pay"))
			if devKeyClient != nil {
				r.Use(middleware.DualAuth(cfg, devKeyClient))
			} else {
				r.Use(middleware.Auth(cfg))
			}
			r.Use(middleware.Idempotency(deps.Redis))
			r.Route("/business/payment-sessions", func(r chi.Router) {
				r.Post("/", paymentSessionHandler.Create)
				r.Get("/", paymentSessionHandler.List)
				r.Get("/{id}", paymentSessionHandler.Get)
				r.Get("/{id}/link", paymentSessionHandler.Link)
				r.Get("/{id}/qr", paymentSessionHandler.Qr)
			})
			r.Route("/payment-links", func(r chi.Router) {
				r.Post("/", paymentLinkHandler.Create)
				r.Get("/", paymentLinkHandler.List)
				r.Get("/{id}", paymentLinkHandler.Get)
				r.Delete("/{id}", paymentLinkHandler.Cancel)
				r.Post("/{id}/mark-used", paymentLinkHandler.MarkUsed)
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

	return r
}
