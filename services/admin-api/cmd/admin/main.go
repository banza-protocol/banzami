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

	"github.com/banzami/banzami/services/admin-api/internal/config"
	"github.com/banzami/banzami/services/admin-api/internal/email"
	"github.com/banzami/banzami/services/admin-api/internal/observability"
	"github.com/banzami/banzami/services/admin-api/internal/server"
	"github.com/banzami/banzami/services/admin-api/internal/service"
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
	shutdownOTel, err := observability.Setup(ctx, "admin-api", "0.1.0", "LIVE", cfg.OTLPEndpoint)
	if err != nil {
		slog.Error("otel setup error", "error", err)
		os.Exit(1)
	}

	core := service.NewCoreAdminClient(cfg.CoreAPIURL)
	gw := service.NewGatewayClient(cfg.GatewayInternalURL, cfg.InternalAPIKey)
	mailer := email.NewSender(email.Config{
		Provider:       cfg.EmailProvider,
		DryRun:         cfg.EmailDryRun,
		ResendAPIKey:   cfg.ResendAPIKey,
		SMTPHost:       cfg.SMTPHost,
		SMTPPort:       cfg.SMTPPort,
		SMTPUser:       cfg.SMTPUser,
		SMTPPassword:   cfg.SMTPPassword,
		FromName:       cfg.EmailFromName,
		FromAddress:    cfg.EmailFromAddress,
		ReplyTo:        cfg.EmailReplyTo,
		NoreplyName:    cfg.EmailNoreplyName,
		NoreplyAddress: cfg.EmailNoreplyAddress,
	})
	if cfg.EmailDryRun {
		slog.Warn("EMAIL_DRY_RUN enabled — emails are logged, not sent")
	} else if !mailer.Enabled() {
		slog.Warn("email provider not configured — emails will be skipped", "provider", cfg.EmailProvider)
	}

	// Operator auth (admin_users). Requires DATABASE_URL + ADMIN_JWT_SECRET.
	// Without them the auth endpoints respond 503; the service still starts.
	var users *service.AdminUserService
	var audit *service.AuditService
	var receiptSrc service.ReceiptSource
	var walletLister service.AdminWalletPaymentLister
	if cfg.DatabaseURL != "" {
		pool, perr := pgxpool.New(ctx, cfg.DatabaseURL)
		if perr != nil {
			slog.Error("admin db connect error", "error", perr)
			os.Exit(1)
		}
		defer pool.Close()
		users = service.NewAdminUserService(pool)
		audit = service.NewAuditService(pool)
		receiptSrc = service.NewPostgresReceiptSource(pool)
		walletLister = service.NewPostgresWalletPaymentService(pool)
		if cfg.AdminJWTSecret == "" {
			slog.Warn("ADMIN_JWT_SECRET not set — operator login disabled (503)")
		} else {
			slog.Info("operator auth enabled (email/password + admin JWT)")
		}
	} else {
		slog.Warn("DATABASE_URL not set — operator login disabled (503)")
	}

	srv := server.New(cfg, core, mailer, gw, users, audit, receiptSrc, walletLister)

	sigCtx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	go func() {
		slog.Info("admin-api starting",
			"port", cfg.Port,
			"log_level", cfg.LogLevel,
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

	// Flush and shut down OTel providers.
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
