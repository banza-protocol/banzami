package main

import (
	"context"
	"errors"
	"github.com/banzami/banzami/services/common/env"
	"log/slog"
	"net/http"

	"github.com/banzami/banzami/services/common/obs"
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

	// Fail fast on a genuinely unreachable database, but not on the first attempt.
	// A freshly created container can run its first instruction before Docker's
	// embedded resolver is serving for it, and the DNS lookup comes back
	// "server misbehaving" for a name that resolves correctly seconds later.
	// Observed reproducibly during Stage E0: this service died at boot with
	// `lookup postgres on 127.0.0.11:53: server misbehaving` on three consecutive
	// deploys, while `docker restart` of the same container succeeded every time.
	//
	// Exiting on that is a real fragility, not strictness: the deploy marks the
	// service unhealthy, rolls back — and the rolled-back container boots through
	// the same window, so the service stays down until someone restarts it by
	// hand. Short bounded retry, then still exit; an unreachable database remains
	// a startup failure.
	if err := pingWithRetry(ctx, pool); err != nil {
		slog.Error("database ping failed", "error", err)
		os.Exit(1)
	}

	core := service.NewCorePublicClient(cfg.CoreAPIURL).WithInternalKey(cfg.CoreInternalKey)
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

	// RA-055: environment is parsed ONCE, here, and every downstream decision
	// asks the resulting value a semantic question.
	//
	// Fail closed on an unrecognised value. This service gates Sandbox funding,
	// the consumer balance grant and the KYC provider mode on its environment, so
	// booting with an environment nobody can name is not a degraded mode — it is
	// an unknown one, and the safe response is to refuse to start rather than to
	// guess. All deployments set ENVIRONMENT explicitly.
	environment := env.Parse(cfg.Environment)
	if !environment.IsKnown() {
		slog.Error("boot: refusing to start — ENVIRONMENT is missing or unrecognised",
			"configured", cfg.Environment, "expected", "sandbox or live")
		os.Exit(1)
	}

	// Boot summary — makes environment visible in every deployment log.
	sandboxRoutes := environment.IsSandbox()
	slog.Info("boot: environment",
		"environment", environment.String(),
		"sandbox_routes", sandboxRoutes,
		"core_api_url", cfg.CoreAPIURL,
	)
	// The mode line is DERIVED from the same parsed value as the behaviour it
	// describes, so the log cannot contradict the runtime. Previously an exact
	// match against "SANDBOX" made a Sandbox deployment (which sets "sandbox")
	// announce "LIVE mode — real rails active" — a service claiming live rails
	// while running in the Sandbox, a dangerous operational signal even when
	// nothing else depends on it. An unknown environment can no longer reach this
	// line at all, so it can never be reported as LIVE by omission.
	if sandboxRoutes {
		slog.Warn("SANDBOX mode — fake funding enabled, no real rails, no real settlement")
	} else {
		slog.Info("LIVE mode — sandbox routes disabled, real rails active")
	}

	go func() {
		slog.Info("public-api starting",
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
	slog.SetDefault(slog.New(obs.NewContextHandler(h)))
}

// pingWithRetry probes the database a few times over a few seconds before giving
// up. It deliberately does NOT retry forever: a database that is truly absent
// must still stop the process, so a misconfigured deployment fails loudly instead
// of serving traffic it cannot fulfil.
func pingWithRetry(ctx context.Context, pool *pgxpool.Pool) error {
	const attempts = 6
	const gap = 2 * time.Second
	var err error
	for i := 1; i <= attempts; i++ {
		pingCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
		err = pool.Ping(pingCtx)
		cancel()
		if err == nil {
			if i > 1 {
				slog.Info("database reachable after retry", "attempt", i)
			}
			return nil
		}
		if i < attempts {
			slog.Warn("database not reachable yet, retrying", "attempt", i, "of", attempts)
			time.Sleep(gap)
		}
	}
	return err
}
