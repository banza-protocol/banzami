package server

import (
	"context"
	"fmt"
	"net/http"

	"github.com/banzami/banzami/services/common/clientip"
	"github.com/banzami/banzami/services/common/obs"
	"github.com/banzami/banzami/services/common/pushtopic"
	"time"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"

	"github.com/banzami/banzami/services/public-api/internal/apierror"
	"github.com/banzami/banzami/services/public-api/internal/config"
	"github.com/banzami/banzami/services/public-api/internal/handler"
	"github.com/banzami/banzami/services/public-api/internal/middleware"
	"github.com/banzami/banzami/services/public-api/internal/notify"
	"github.com/banzami/banzami/services/public-api/internal/service"
)

// transferRateLimit: 20 transfers per minute per consumer.
// Configurable via rate limiter constructor; exported as constant for clarity.
const transferRateLimit = 20
const transferRateWindow = time.Minute

// authRateLimit caps unauthenticated credential attempts per client IP per minute
// (register / token). Tight enough to blunt brute-force + account enumeration,
// loose enough for a human's legitimate retries. In-memory + per-instance — the
// gateway uses a Redis sliding window for its equivalent surface.
const authRateLimit = 10

// searchRateLimit: @banza suggestions per signed-in consumer per minute — enough
// to type a name, not enough to page through the directory (A6-08).
const searchRateLimit = 30

// Dependencies groups all external dependencies for the server.
type Dependencies struct {
	CoreClient  *service.CorePublicClient
	CredStore   *service.CredentialStore
	FCMSvc      *notify.FCMService
	KycSvc      *service.KycService
	ProofClient *service.ProofClient // optional; mints receipt proof references

	// PushTopics names the signed-in consumer's FCM topic for
	// GET /v1/me/push-topic. Nil (no PUSH_TOPIC_KEY) answers null.
	PushTopics *pushtopic.Namer
}

// Server wraps the HTTP server lifecycle.
type Server struct {
	httpServer *http.Server
}

func New(cfg *config.Config, deps Dependencies) *Server {
	r := chi.NewRouter()
	// Routing errors in the documented error shape, not chi's text/plain 404
	// and empty 405. Set before any subrouter so they inherit it.
	r.NotFound(func(w http.ResponseWriter, r *http.Request) {
		apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "no such route")
	})
	r.MethodNotAllowed(func(w http.ResponseWriter, r *http.Request) {
		apierror.Respond(w, r, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed on this route")
	})

	r.Use(obs.Correlation) // single source: correlation_id (flow) + request_id (local)
	// Who the client is: the edge's X-Real-IP, believed only from a trusted
	// proxy (TRUSTED_PROXY_CIDRS). chi's RealIP believed True-Client-IP,
	// X-Real-IP and X-Forwarded-For from any peer (A9-09).
	r.Use(cfg.ClientIP.Middleware)
	r.Use(middleware.Logger)
	r.Use(chimiddleware.Recoverer)
	r.Use(chimiddleware.Timeout(30 * time.Second))
	// Every body this API takes is a small JSON document. The edge allowed 10 MB
	// and nothing here set a limit (A9-05).
	r.Use(chimiddleware.RequestSize(64 << 10))
	r.Use(middleware.RouteSpan)

	// Infra — unauthenticated
	r.Get("/health", handler.Liveness)
	r.Get("/metrics", promhttp.Handler().ServeHTTP)

	transferLimiter := handler.NewTransferRateLimiter(transferRateLimit, transferRateWindow)

	authH := handler.NewAuthHandler(cfg, deps.CoreClient, deps.CredStore)
	consumerH := handler.NewConsumerHandler(deps.CredStore, deps.CoreClient)
	meH := handler.NewMeHandler(deps.CoreClient, cfg.Environment)
	transferH := handler.NewTransferHandler(deps.CoreClient, deps.CredStore, transferLimiter, deps.FCMSvc)
	activityH := handler.NewActivityHandler(deps.CoreClient)
	receiptH := handler.NewReceiptHandler(deps.CoreClient, deps.ProofClient, cfg.Environment)
	paymentLinkH := handler.NewPaymentLinkHandler(deps.CoreClient, deps.FCMSvc, deps.ProofClient, cfg.Environment)
	consumerPayLinkH := handler.NewConsumerPayLinkHandler(deps.CoreClient, deps.CredStore, deps.FCMSvc)
	sandboxH := handler.NewSandboxHandler(deps.CoreClient, cfg.Environment)
	onboardingH := handler.NewOnboardingHandler(deps.CoreClient).WithCredentials(deps.CredStore).WithEnvironment(cfg.Environment)
	debugPushH := handler.NewDebugPushHandler(deps.FCMSvc, cfg.Environment)
	pushTopicH := handler.NewPushTopicHandler(deps.PushTopics)
	kycH := handler.NewKycHandler(deps.KycSvc)

	// Public auth — no JWT required. Rate-limited per IP against brute-force +
	// account enumeration (the gateway throttles its equivalent endpoints too).
	authLimiter := handler.NewTransferRateLimiter(authRateLimit, time.Minute)
	authRL := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Keyed per address, per /64 for IPv6: rotating through one's own
			// block bought a fresh allowance per attempt (A9-04).
			if !authLimiter.Allow(clientip.LimiterKey(r.RemoteAddr)) {
				apierror.Respond(w, r, http.StatusTooManyRequests, "RATE_LIMITED",
					"too many attempts — please wait before trying again")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
	r.With(authRL).Post("/v1/auth/register", authH.Register)
	r.With(authRL).Post("/v1/auth/token", authH.Token)

	// Consumer wallet onboarding — no JWT required (consumer doesn't have one yet)
	r.Post("/v1/consumer/onboarding/start", onboardingH.Start)
	r.Post("/v1/consumer/onboarding/verify-otp", onboardingH.VerifyOtp)
	r.Post("/v1/consumer/onboarding/complete", onboardingH.Complete)

	// Handle lookup — no JWT required. Search is NOT here: an unauthenticated,
	// unlimited substring search let anyone page through the consumer directory,
	// names included (A6-08). It lives in the authenticated group below.
	r.Get("/v1/consumers/{handle}", consumerH.Lookup)

	// Public payment link lookup — no JWT required
	r.Get("/v1/payment-links/{slug}", paymentLinkH.GetBySlug)

	// Public consumer pay link lookup — no JWT required (pay web app fetches this)
	r.Get("/v1/consumer-pay-links/{code}", consumerPayLinkH.GetByCode)

	// Authenticated consumer endpoints
	r.Group(func(r chi.Router) {
		r.Use(middleware.Auth(cfg, sessionsOf(deps.CredStore)))

		r.Post("/v1/auth/logout", authH.Logout)

		// @banza suggestions for a signed-in consumer, limited per consumer. The
		// static /search segment wins over the public /{handle} route in chi.
		searchLimiter := handler.NewTransferRateLimiter(searchRateLimit, time.Minute)
		r.With(func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				c, _ := middleware.GetConsumer(r.Context())
				if c == nil || !searchLimiter.Allow(c.ID) {
					apierror.Respond(w, r, http.StatusTooManyRequests, "RATE_LIMITED", "too many searches, slow down")
					return
				}
				next.ServeHTTP(w, r)
			})
		}).Get("/v1/consumers/search", consumerH.Search)

		// Profile
		r.Get("/v1/me", meH.Profile)
		r.Get("/v1/me/wallet", meH.Wallet)
		r.Get("/v1/me/wallet/balance", meH.Balance)
		r.Get("/v1/me/activity", activityH.Activity)
		// The FCM topic this consumer's notifications are published to — a
		// keyed name only its own session learns (A6-06).
		r.Get("/v1/me/push-topic", pushTopicH.Consumer)

		// Transfers
		r.Post("/v1/transfers", transferH.Send)
		r.Get("/v1/transfers", transferH.List)
		r.Get("/v1/transfers/{id}", transferH.Get)

		// Official transfer receipt (PDF) — Document Engine, real transfers data.
		r.Get("/v1/consumer/transactions/{id}/receipt.pdf", receiptH.ConsumerReceipt)
		// The same canonical receipt as JSON — the app's comprovativo screen.
		r.Get("/v1/consumer/transactions/{id}/receipt", receiptH.ConsumerReceiptJSON)

		// Payment link payment
		r.Post("/v1/payment-links/{slug}/pay", paymentLinkH.Pay)

		// Consumer pay links — create + pay
		r.Post("/v1/consumer-pay-links", consumerPayLinkH.Create)
		r.Post("/v1/consumer-pay-links/{code}/pay", consumerPayLinkH.Pay)

		// Consumer identity verification (KYC) — ADR-020. The operator decides
		// the level; the consumer never sends `requested_level`.
		r.Post("/v1/kyc/cases", kycH.CreateCase)
		r.Get("/v1/kyc/cases/current", kycH.GetCurrent)
		r.Get("/v1/kyc/cases/{id}", kycH.GetCase)
		r.Get("/v1/kyc/cases/{id}/status", kycH.GetCase)
		r.Post("/v1/kyc/cases/{id}/evidence/upload-url", kycH.RequestUploadURL)
		r.Post("/v1/kyc/cases/{id}/evidence/complete", kycH.CompleteEvidence)
		r.Post("/v1/kyc/cases/{id}/submit", kycH.Submit)

		// Sandbox utilities — 403 when not in SANDBOX environment
		r.Post("/v1/sandbox/fund", sandboxH.FundWallet)

		// Debug utilities — 403 in PRODUCTION, no-op when FCM not configured
		r.Post("/v1/debug/push-test", debugPushH.PushTest)
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

// sessionsOf keeps a nil store a nil interface, so Auth refuses (503) rather
// than calling a method on a nil pointer.
func sessionsOf(c *service.CredentialStore) middleware.SessionChecker {
	if c == nil {
		return nil
	}
	return c
}
