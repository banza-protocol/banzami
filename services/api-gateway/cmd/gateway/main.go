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
	shutdownOTel, err := observability.Setup(ctx, "api-gateway", "0.1.0", cfg.OTLPEndpoint)
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

	// Real core-api client — delegates all financial operations to the Rust core.
	coreClient := service.NewCoreApiClient(cfg.CoreAPIURL)

	// Webhook service: use PostgreSQL-backed implementation when DATABASE_URL is
	// set; fall back to the in-memory stub for local dev without a full stack.
	var webhookSvc service.WebhookService
	if cfg.DatabaseURL != "" {
		dbPool, err := pgxpool.New(ctx, cfg.DatabaseURL)
		if err != nil {
			slog.Error("webhook db connect error", "error", err)
			os.Exit(1)
		}
		pgWebhook := service.NewPostgresWebhookService(dbPool)
		pgWebhook.StartWorker(ctx) // background delivery worker; stops on ctx cancel
		webhookSvc = pgWebhook
		slog.Info("webhook service: postgres backend")
	} else {
		webhookSvc = service.NewStubWebhookService()
		slog.Warn("webhook service: in-memory stub (DATABASE_URL not set)")
	}

	deps := server.Dependencies{
		Redis:             rdb,
		TransactionSvc:    service.NewCoreApiTransactionService(coreClient),
		WebhookSvc:        webhookSvc,
		MerchantSvc:       service.NewCoreApiMerchantService(coreClient),
		WalletSvc:         service.NewCoreApiWalletService(coreClient),
		PayoutSvc:         service.NewCoreApiPayoutService(coreClient),
		ConsumerSvc:       service.NewCoreApiConsumerService(coreClient),
		ConsumerWalletSvc: service.NewCoreApiConsumerWalletService(coreClient),
		TransferSvc:       service.NewCoreApiTransferService(coreClient),
		QrSvc:             service.NewCoreApiQrService(coreClient),
	}

	srv := server.New(cfg, deps)

	// Capture SIGINT / SIGTERM for graceful shutdown.
	sigCtx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	go func() {
		slog.Info("api-gateway starting",
			"port",         cfg.Port,
			"environment",  cfg.Environment,
			"log_level",    cfg.LogLevel,
			"log_format",   cfg.LogFormat,
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
