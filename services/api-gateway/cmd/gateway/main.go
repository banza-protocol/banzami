package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/banzami/banzami/services/api-gateway/internal/config"
	"github.com/banzami/banzami/services/api-gateway/internal/crypto"
	"github.com/banzami/banzami/services/api-gateway/internal/notify"
	"github.com/banzami/banzami/services/api-gateway/internal/observability"
	"github.com/banzami/banzami/services/api-gateway/internal/server"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		slog.Error("config error", "error", err)
		os.Exit(1)
	}

	initLogger(cfg)

	// Initialise OpenTelemetry. Metrics are always active (Prometheus);
	// tracing is active only when OTLP_ENDPOINT is set.
	ctx := context.Background()
	shutdownOTel, err := observability.Setup(ctx, "api-gateway", "0.1.0", cfg.Environment, cfg.OTLPEndpoint)
	if err != nil {
		slog.Error("otel setup error", "error", err)
		os.Exit(1)
	}

	opt, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		slog.Error("invalid REDIS_URL", "error", err)
		os.Exit(1)
	}
	rdb := redis.NewClient(opt)

	fcmSvc, err := notify.NewFCMService(ctx, cfg.FirebaseCredentialsJSON, cfg.Environment)
	if err != nil {
		slog.Error("[FCM] init error", "error", err)
		os.Exit(1)
	}
	if fcmSvc == nil {
		slog.Warn("[FCM] FIREBASE_CREDENTIALS_JSON not set — push notifications disabled")
	}

	// Real core-api client — delegates all financial operations to the Rust core.
	coreClient := service.NewCoreApiClient(cfg.CoreAPIURL)

	// Webhook service: use PostgreSQL-backed implementation when DATABASE_URL is
	// set; fall back to the in-memory stub for local dev without a full stack.
	var webhookSvc service.WebhookService
	var teamSvc service.TeamService
	if cfg.DatabaseURL != "" {
		dbPool, err := pgxpool.New(ctx, cfg.DatabaseURL)
		if err != nil {
			slog.Error("webhook db connect error", "error", err)
			os.Exit(1)
		}
		secretCipher, err := crypto.NewSecretCipher(cfg.WebhookEncryptionKey)
		if err != nil {
			slog.Error("webhook encryption key error", "error", err)
			os.Exit(1)
		}
		if secretCipher == nil {
			slog.Warn("[SEC-002] WEBHOOK_ENCRYPTION_KEY not set — webhook secrets stored in plaintext (dev only)")
		}
		pgWebhook := service.NewPostgresWebhookService(dbPool, secretCipher)
		pgWebhook.StartWorker(ctx) // background delivery worker; stops on ctx cancel
		webhookSvc = pgWebhook
		teamSvc = service.NewPostgresTeamService(dbPool)
		slog.Info("webhook + team services: postgres backend")
	} else {
		webhookSvc = service.NewStubWebhookService()
		teamSvc = service.NewStubTeamService()
		slog.Warn("webhook + team services: in-memory stub (DATABASE_URL not set)")
	}

	deps := server.Dependencies{
		Redis:              rdb,
		TransactionSvc:     service.NewCoreApiTransactionService(coreClient),
		WebhookSvc:         webhookSvc,
		MerchantSvc:        service.NewCoreApiMerchantService(coreClient),
		WalletSvc:          service.NewCoreApiWalletService(coreClient),
		PayoutSvc:          service.NewCoreApiPayoutService(coreClient),
		ConsumerSvc:        service.NewCoreApiConsumerService(coreClient),
		ConsumerWalletSvc:  service.NewCoreApiConsumerWalletService(coreClient),
		TransferSvc:        service.NewCoreApiTransferService(coreClient),
		QrSvc:              service.NewCoreApiQrService(coreClient),
		PaymentLinkSvc:     service.NewCoreApiPaymentLinkService(coreClient),
		AcquiringSvc:       service.NewCoreApiAcquiringService(coreClient),
		RefundSvc:          service.NewCoreApiRefundService(coreClient),
		DisputeSvc:         service.NewCoreApiDisputeService(coreClient),
		PaymentRequestSvc:  service.NewCoreApiPaymentRequestService(coreClient),
		MerchantProfileSvc: service.NewCoreApiMerchantProfileService(coreClient),
		ConsumerPayLinkSvc: service.NewCoreApiConsumerPayLinkService(coreClient),
		FCMSvc:             fcmSvc,
		TeamSvc:            teamSvc,
		ComplianceSvc:      service.NewCoreApiComplianceService(coreClient),
		SplitSvc:           service.NewCoreApiSplitService(coreClient),
	}

	srv := server.New(cfg, deps)

	// Capture SIGINT / SIGTERM for graceful shutdown.
	sigCtx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	go func() {
		slog.Info("api-gateway starting",
			"port", cfg.Port,
			"environment", cfg.Environment,
			"log_level", cfg.LogLevel,
			"log_format", cfg.LogFormat,
			"otlp_enabled", cfg.OTLPEndpoint != "",
		)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("server error", "error", err)
			os.Exit(1)
		}
	}()

	<-sigCtx.Done()
	stop()
	slog.Info("shutdown signal received — draining requests")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		slog.Error("graceful shutdown failed", "error", err)
	}

	// Flush and shut down OTel providers (ensures all spans/metrics are exported).
	if err := shutdownOTel(shutdownCtx); err != nil {
		slog.Error("otel shutdown error", "error", err)
	}

	slog.Info("shutdown complete")
}

func initLogger(cfg *config.Config) {
	var level slog.Level
	switch cfg.LogLevel {
	case "debug":
		level = slog.LevelDebug
	case "warn":
		level = slog.LevelWarn
	case "error":
		level = slog.LevelError
	default:
		level = slog.LevelInfo
	}

	opts := &slog.HandlerOptions{Level: level}
	var handler slog.Handler
	if cfg.LogFormat == "pretty" {
		handler = slog.NewTextHandler(os.Stdout, opts)
	} else {
		handler = slog.NewJSONHandler(os.Stdout, opts)
	}
	slog.SetDefault(slog.New(handler))
}
