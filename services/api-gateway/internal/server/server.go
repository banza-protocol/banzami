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
	AcquiringSvc        service.AcquiringService
	FCMSvc              *notify.FCMService
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
	r.Use(middleware.RouteSpan)        // enriches the otelhttp span with chi route pattern
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
	authHandler          := handler.NewAuthHandler(cfg, deps.MerchantSvc)
	txHandler            := handler.NewTransactionHandler(deps.TransactionSvc)
	wbhHandler           := handler.NewWebhookHandler(deps.WebhookSvc)
	mchHandler           := handler.NewMerchantHandler(deps.MerchantSvc)
	wltHandler           := handler.NewWalletHandler(deps.WalletSvc)
	payoutHandler        := handler.NewPayoutHandler(deps.PayoutSvc)
	consumerHandler      := handler.NewConsumerHandler(deps.ConsumerSvc)
	consumerWltHandler   := handler.NewConsumerWalletHandler(deps.ConsumerWalletSvc)
	transferHandler      := handler.NewTransferHandler(deps.TransferSvc, deps.FCMSvc)
	qrHandler            := handler.NewQrHandler(deps.QrSvc)
	paymentLinkHandler   := handler.NewPaymentLinkHandler(deps.PaymentLinkSvc, deps.MerchantSvc)
	acquiringHandler     := handler.NewAcquiringHandler(deps.AcquiringSvc, deps.PaymentLinkSvc, deps.FCMSvc)
	sandboxHandler       := handler.NewSandboxHandler(deps.TransactionSvc, deps.WalletSvc)

	// Auth — no JWT required; the API key is the credential
	r.Post("/v1/auth/token", authHandler.Token)

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

			r.Route("/merchants", func(r chi.Router) {
				r.Post("/", mchHandler.Create)
				r.Get("/{id}", mchHandler.Get)
				r.Post("/{id}/suspend", mchHandler.Suspend)
				r.Post("/{id}/api-keys", mchHandler.CreateApiKey)
				r.Get("/{id}/api-keys", mchHandler.ListApiKeys)
				r.Delete("/{id}/api-keys/{keyID}", mchHandler.RevokeApiKey)
			})

			r.Route("/wallets", func(r chi.Router) {
				r.Post("/", wltHandler.Create)
				r.Get("/", wltHandler.GetForMerchant)
				r.Get("/{id}", wltHandler.Get)
				r.Get("/{id}/balance", wltHandler.Balance)
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
				r.Get("/{id}", qrHandler.Get)
				r.Post("/{id}/use", qrHandler.MarkUsed)
			})

			// Payment links
			r.Route("/payment-links", func(r chi.Router) {
				r.Post("/", paymentLinkHandler.Create)
				r.Get("/", paymentLinkHandler.List)
				r.Get("/{id}", paymentLinkHandler.Get)
				r.Delete("/{id}", paymentLinkHandler.Cancel)
				r.Post("/{id}/mark-used", paymentLinkHandler.MarkUsed)
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
