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

	"github.com/banzami/banzami/services/common/obs"
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
		slog.Warn("DATABASE_URL not set — management endpoints disabled (health only)")
	}

	handler := server.New(cfg, server.Deps{Pool: pool})

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
