// Command developer-api is the authenticated Developer Platform management API
// (developer-api.banzami.com, ADR-033): Account Identity + Developer contexts
// (workspaces, projects, sandbox API keys). It owns no financial state.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	ce "github.com/banzami/banzami/services/common/email"
	"github.com/banzami/banzami/services/common/obs"
	"github.com/banzami/banzami/services/developer-api/internal/accountidentity"
	"github.com/banzami/banzami/services/developer-api/internal/config"
	"github.com/banzami/banzami/services/developer-api/internal/server"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		slog.Error("config error", "error", err)
		os.Exit(1)
	}
	initLogger(cfg)

	ctx := context.Background()

	// DB is optional at boot so the service can answer /health before the full
	// stack is provisioned; management endpoints require it and fail closed.
	var pool *pgxpool.Pool
	if cfg.DatabaseURL != "" {
		pool, err = pgxpool.New(ctx, cfg.DatabaseURL)
		if err != nil {
			slog.Error("db connect error", "error", err)
			os.Exit(1)
		}
		defer pool.Close()
	} else {
		slog.Warn("DATABASE_URL not set — using in-memory Account Identity store (local dev only)")
	}

	// Redis backs OTP rate limiting / resend cooldown; falls back to in-memory
	// for local dev (sandbox uses its own isolated Redis).
	var rdb *redis.Client
	if cfg.RedisURL != "" {
		opt, perr := redis.ParseURL(cfg.RedisURL)
		if perr != nil {
			slog.Error("invalid REDIS_URL", "error", perr)
			os.Exit(1)
		}
		rdb = redis.NewClient(opt)
		defer rdb.Close()
	}

	// Account Identity wiring.
	var store accountidentity.Store
	if pool != nil {
		store = accountidentity.NewPGStore(pool)
	} else {
		store = accountidentity.NewMemStore()
	}
	var limiter accountidentity.RateLimiter
	if rdb != nil {
		limiter = accountidentity.NewRedisLimiter(rdb)
	} else {
		limiter = accountidentity.NewMemLimiter()
	}
	if cfg.OTPPepper == "" || cfg.SessionSecret == "" {
		slog.Warn("OTP_PEPPER / SESSION_SECRET not set — auth fails closed until configured")
	}
	mailer := accountidentity.NewMailer(ce.Config{
		Provider: cfg.EmailProvider, DryRun: cfg.EmailDryRun, ResendAPIKey: cfg.ResendAPIKey,
		SMTPHost: cfg.SMTPHost, SMTPPort: cfg.SMTPPort, SMTPUser: cfg.SMTPUser, SMTPPassword: cfg.SMTPPassword,
		FromName: cfg.EmailFromName, FromAddress: cfg.EmailFromAddress, ReplyTo: cfg.EmailReplyTo,
		NoreplyName: cfg.EmailNoreplyName, NoreplyAddress: cfg.EmailNoreplyAddress,
	})
	svc := accountidentity.NewService(store, limiter, mailer, accountidentity.ServiceConfig{
		OTPPepper:     cfg.OTPPepper,
		SessionSecret: cfg.SessionSecret,
		SessionTTL:    time.Duration(cfg.SessionTTLHours) * time.Hour,
	})
	auth := accountidentity.NewHandlers(svc, cfg.ConsoleOrigin, cfg.SecureCookies())

	handler := server.New(cfg, server.Deps{Pool: pool, Auth: auth})

	srv := &http.Server{
		Addr:              fmt.Sprintf(":%d", cfg.Port),
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		slog.Info("developer-api listening", "port", cfg.Port, "env", cfg.Environment)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("server error", "error", err)
			os.Exit(1)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	slog.Info("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		slog.Error("graceful shutdown failed", "error", err)
	}
}

func initLogger(cfg *config.Config) {
	level := slog.LevelInfo
	switch strings.ToLower(cfg.LogLevel) {
	case "debug":
		level = slog.LevelDebug
	case "warn":
		level = slog.LevelWarn
	case "error":
		level = slog.LevelError
	}
	var base slog.Handler
	opts := &slog.HandlerOptions{Level: level}
	if strings.ToLower(cfg.LogFormat) == "text" {
		base = slog.NewTextHandler(os.Stdout, opts)
	} else {
		base = slog.NewJSONHandler(os.Stdout, opts)
	}
	slog.SetDefault(slog.New(obs.NewContextHandler(base)))
}
