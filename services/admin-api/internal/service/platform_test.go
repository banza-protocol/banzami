package service

import (
	"context"
	"errors"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

func platformPoolOrSkip(ctx context.Context, t *testing.T) *pgxpool.Pool {
	t.Helper()
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set — skipping DB-backed platform test")
	}
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	var reg *string
	_ = pool.QueryRow(ctx, `SELECT to_regclass('public.platform_settings')::text`).Scan(&reg)
	if reg == nil {
		pool.Close()
		t.Skip("platform_settings not migrated — skipping")
	}
	return pool
}

func TestPlatform_SetModeRules(t *testing.T) {
	ctx := context.Background()
	pool := platformPoolOrSkip(ctx, t)
	defer pool.Close()
	svc := NewPlatformService(pool)

	// Restore whatever the mode was after the test (don't disturb shared state).
	start := svc.GetMode(ctx)
	t.Cleanup(func() {
		if ValidMode(start.Mode) {
			_, _ = svc.SetMode(ctx, start.Mode, ConfirmationFor(start.Mode), "test cleanup", "test")
		}
	})

	// Invalid mode rejected (MAINTENANCE is not exposed yet).
	if _, err := svc.SetMode(ctx, "MAINTENANCE", "x", "r", "op"); !errors.Is(err, ErrInvalidMode) {
		t.Fatalf("invalid mode: want ErrInvalidMode, got %v", err)
	}
	// Reason required.
	if _, err := svc.SetMode(ctx, "LIVE", ConfirmationFor("LIVE"), "", "op"); !errors.Is(err, ErrModeReasonRequired) {
		t.Fatalf("missing reason: want ErrModeReasonRequired, got %v", err)
	}
	// Wrong confirmation → no change.
	if _, err := svc.SetMode(ctx, "LIVE", "wrong", "ativar", "op"); !errors.Is(err, ErrConfirmationMismatch) {
		t.Fatalf("bad confirmation: want ErrConfirmationMismatch, got %v", err)
	}

	// Correct LIVE switch.
	m, err := svc.SetMode(ctx, "LIVE", "CONFIRMO ATIVAR LIVE", "go live for demo", "alice")
	if err != nil || m.Mode != "LIVE" {
		t.Fatalf("set LIVE: mode=%v err=%v", m, err)
	}
	if got := svc.GetMode(ctx); got.Mode != "LIVE" || got.Reason != "go live for demo" {
		t.Fatalf("after set LIVE: %+v", got)
	}

	// Back to SANDBOX with its phrase.
	m, err = svc.SetMode(ctx, "SANDBOX", "CONFIRMO ATIVAR SANDBOX", "back to testing", "bob")
	if err != nil || m.Mode != "SANDBOX" {
		t.Fatalf("set SANDBOX: mode=%v err=%v", m, err)
	}

	// History preserved (>= 2 entries from the two successful switches).
	var n int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM platform_settings_history WHERE setting_key='platform_mode'`).Scan(&n); err != nil {
		t.Fatalf("history count: %v", err)
	}
	if n < 2 {
		t.Fatalf("expected >=2 history rows, got %d", n)
	}
}

// GetMode never assumes LIVE: an absent/garbage value resolves to SANDBOX.
func TestPlatform_FallbackSandbox(t *testing.T) {
	ctx := context.Background()
	pool := platformPoolOrSkip(ctx, t)
	defer pool.Close()
	svc := NewPlatformService(pool)

	// Temporarily corrupt the stored value; GetMode must fall back to SANDBOX.
	start := svc.GetMode(ctx)
	if _, err := pool.Exec(ctx, `UPDATE platform_settings SET value='GARBAGE' WHERE key='platform_mode'`); err != nil {
		t.Skipf("cannot mutate platform_settings: %v", err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `UPDATE platform_settings SET value=$1 WHERE key='platform_mode'`, start.Mode)
	})
	if got := svc.GetMode(ctx); got.Mode != "SANDBOX" {
		t.Fatalf("garbage value must fall back to SANDBOX, got %q", got.Mode)
	}
}
