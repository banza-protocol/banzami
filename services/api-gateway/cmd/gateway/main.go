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

	"github.com/redis/go-redis/v9"

	"github.com/banzami/banzami/services/api-gateway/internal/config"
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

	opt, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		slog.Error("invalid REDIS_URL", "error", err)
		os.Exit(1)
	}
	rdb := redis.NewClient(opt)

	deps := server.Dependencies{
		Redis:          rdb,
		TransactionSvc: service.NewStubTransactionService(),
	}

	srv := server.New(cfg, deps)

	// Capture SIGINT / SIGTERM for graceful shutdown.
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	go func() {
		slog.Info("api-gateway starting",
			"port",        cfg.Port,
			"environment", cfg.Environment,
			"log_level",   cfg.LogLevel,
			"log_format",  cfg.LogFormat,
		)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("server error", "error", err)
			os.Exit(1)
		}
	}()

	<-ctx.Done()
	stop()
	slog.Info("shutdown signal received — draining requests")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		slog.Error("graceful shutdown failed", "error", err)
		os.Exit(1)
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
