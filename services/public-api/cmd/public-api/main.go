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

	"github.com/banzami/banzami/services/public-api/internal/config"
	"github.com/banzami/banzami/services/public-api/internal/kycstorage"
	"github.com/banzami/banzami/services/public-api/internal/notify"
	"github.com/banzami/banzami/services/public-api/internal/observability"
	"github.com/banzami/banzami/services/public-api/internal/server"
	"github.com/banzami/banzami/services/public-api/internal/service"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		slog.Error("config error", "error", err)
		os.Exit(1)
	}

	initLogger(cfg)

	ctx := context.Background()
	shutdownOTel, err := observability.Setup(ctx, "public-api", "0.1.0", cfg.Environment, cfg.OTLPEndpoint)
	if err != nil {
		slog.Error("otel setup error", "error", err)
		os.Exit(1)
	}

	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		slog.Error("database connection error", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		slog.Error("database ping failed", "error", err)
		os.Exit(1)
	}

	core  := service.NewCorePublicClient(cfg.CoreAPIURL)
	creds := service.NewCredentialStore(pool)

	// Consumer KYC evidence storage (R2). Optional: a nil storage makes upload
	// endpoints respond 503 — it never blocks startup.
	kycStore, err := kycstorage.NewFromConfig(kycstorage.Config{
		Provider:        cfg.KycStorageProvider,
		Bucket:          cfg.KycStorageBucket,
		Endpoint:        cfg.KycStorageEndpoint,
		Region:          cfg.KycStorageRegion,
		AccessKeyID:     cfg.KycStorageAccessKey,
		SecretAccessKey: cfg.KycStorageSecretKey,
	})
	if err != nil {
		if errors.Is(err, kycstorage.ErrNotConfigured) {
			slog.Warn("KYC storage not configured — /v1/kyc upload endpoints will return 503")
			kycStore = nil
		} else {
			slog.Error("kyc storage init error", "error", err)
			os.Exit(1)
		}
	}
	kycSvc := service.NewKycService(pool, kycStore, cfg.Environment)

	fcmSvc, err := notify.NewFCMService(ctx, cfg.FirebaseCredentialsJSON, cfg.Environment)
	if err != nil {
		slog.Error("[FCM] initialization failed", "error", err)
		os.Exit(1)
	}

	srv := server.New(cfg, server.Dependencies{
		CoreClient:  core,
		CredStore:   creds,
		FCMSvc:      fcmSvc,
		KycSvc:      kycSvc,
		ProofClient: service.NewProofClient(cfg.GatewayInternalURL, cfg.InternalAPIKey),
	})

	sigCtx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	// Boot summary — makes environment visible in every deployment log.
	sandboxRoutes := cfg.Environment == "SANDBOX"
	slog.Info("boot: environment",
		"environment",    cfg.Environment,
		"sandbox_routes", sandboxRoutes,
		"core_api_url",   cfg.CoreAPIURL,
	)
	if cfg.Environment == "SANDBOX" {
		slog.Warn("SANDBOX mode — fake funding enabled, no real rails, no real settlement")
	} else {
		slog.Info("LIVE mode — sandbox routes disabled, real rails active")
	}

	go func() {
		slog.Info("public-api starting",
			"port",         cfg.Port,
			"log_level",    cfg.LogLevel,
			"otlp_enabled", cfg.OTLPEndpoint != "",
		)
		if err := srv.Start(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("server error", "error", err)
			os.Exit(1)
		}
	}()

	<-sigCtx.Done()
	stop()
	slog.Info("shutdown signal received — draining requests")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		slog.Error("graceful shutdown failed", "error", err)
	}

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
	var h slog.Handler
	if cfg.LogFormat == "pretty" {
		h = slog.NewTextHandler(os.Stdout, opts)
	} else {
		h = slog.NewJSONHandler(os.Stdout, opts)
	}
	slog.SetDefault(slog.New(h))
}
