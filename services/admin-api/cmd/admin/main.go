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
	shutdownOTel, err := observability.Setup(ctx, "admin-api", "0.1.0", cfg.OTLPEndpoint)
	if err != nil {
		slog.Error("otel setup error", "error", err)
		os.Exit(1)
	}

	core   := service.NewCoreAdminClient(cfg.CoreAPIURL)
	mailer := email.NewSender(email.Config{
		Host:     cfg.SMTPHost,
		Port:     cfg.SMTPPort,
		User:     cfg.SMTPUser,
		Password: cfg.SMTPPassword,
		From:     cfg.SMTPFrom,
		FromName: cfg.SMTPFromName,
	})
	if !mailer.Enabled() {
		slog.Warn("SMTP not configured — merchant welcome emails will be skipped")
	}
	srv := server.New(cfg, core, mailer)

	sigCtx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	go func() {
		slog.Info("admin-api starting",
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
