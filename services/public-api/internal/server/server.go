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

	"github.com/banzami/banzami/services/public-api/internal/config"
	"github.com/banzami/banzami/services/public-api/internal/handler"
	"github.com/banzami/banzami/services/public-api/internal/middleware"
	"github.com/banzami/banzami/services/public-api/internal/service"
)

// transferRateLimit: 20 transfers per minute per consumer.
// Configurable via rate limiter constructor; exported as constant for clarity.
const transferRateLimit = 20
const transferRateWindow = time.Minute

// Dependencies groups all external dependencies for the server.
type Dependencies struct {
	CoreClient  *service.CorePublicClient
	CredStore   *service.CredentialStore
}

// Server wraps the HTTP server lifecycle.
type Server struct {
	httpServer *http.Server
}

func New(cfg *config.Config, deps Dependencies) *Server {
	r := chi.NewRouter()

	r.Use(chimiddleware.RequestID)
	r.Use(chimiddleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(chimiddleware.Recoverer)
	r.Use(chimiddleware.Timeout(30 * time.Second))
	r.Use(middleware.RouteSpan)

	// Infra — unauthenticated
	r.Get("/health", handler.Liveness)
	r.Get("/metrics", promhttp.Handler().ServeHTTP)

	transferLimiter := handler.NewTransferRateLimiter(transferRateLimit, transferRateWindow)

	authH        := handler.NewAuthHandler(cfg, deps.CoreClient, deps.CredStore)
	consumerH    := handler.NewConsumerHandler(deps.CredStore, deps.CoreClient)
	meH          := handler.NewMeHandler(deps.CoreClient)
	transferH    := handler.NewTransferHandler(deps.CoreClient, deps.CredStore, transferLimiter)
	paymentLinkH := handler.NewPaymentLinkHandler(deps.CoreClient)
	sandboxH     := handler.NewSandboxHandler(deps.CoreClient, cfg.Environment)
	onboardingH  := handler.NewOnboardingHandler(deps.CoreClient)

	// Public auth — no JWT required
	r.Post("/v1/auth/register", authH.Register)
	r.Post("/v1/auth/token",    authH.Token)

	// Consumer wallet onboarding — no JWT required (consumer doesn't have one yet)
	r.Post("/v1/consumer/onboarding/start",      onboardingH.Start)
	r.Post("/v1/consumer/onboarding/verify-otp", onboardingH.VerifyOtp)
	r.Post("/v1/consumer/onboarding/complete",   onboardingH.Complete)

	// Public consumer endpoints — no JWT required
	// /search must be registered before /{handle} so chi matches it as a static segment
	r.Get("/v1/consumers/search",   consumerH.Search)
	r.Get("/v1/consumers/{handle}", consumerH.Lookup)

	// Public payment link lookup — no JWT required
	r.Get("/v1/payment-links/{slug}", paymentLinkH.GetBySlug)

	// Authenticated consumer endpoints
	r.Group(func(r chi.Router) {
		r.Use(middleware.Auth(cfg))

		// Profile
		r.Get("/v1/me",                meH.Profile)
		r.Get("/v1/me/wallet",         meH.Wallet)
		r.Get("/v1/me/wallet/balance",  meH.Balance)

		// Transfers
		r.Post("/v1/transfers",       transferH.Send)
		r.Get("/v1/transfers",        transferH.List)
		r.Get("/v1/transfers/{id}",   transferH.Get)

		// Payment link payment
		r.Post("/v1/payment-links/{slug}/pay", paymentLinkH.Pay)

		// Sandbox utilities — 403 when not in SANDBOX environment
		r.Post("/v1/sandbox/fund", sandboxH.FundWallet)
	})

	traced := otelhttp.NewHandler(r, "public-api")

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
