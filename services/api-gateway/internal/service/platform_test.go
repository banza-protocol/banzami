package service

import (
	"context"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

// The public reader never assumes LIVE: a nil pool, missing row or garbage value
// all resolve to SANDBOX.
func TestPlatformReadService_NeverAssumesLive(t *testing.T) {
	ctx := context.Background()

	// Nil pool → SANDBOX (no DB at all).
	if (&PlatformReadService{}).Mode(ctx) != "SANDBOX" {
		t.Fatalf("nil pool must be SANDBOX")
	}

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set — skipping DB-backed part")
	}
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer pool.Close()
	var reg *string
	_ = pool.QueryRow(ctx, `SELECT to_regclass('public.platform_settings')::text`).Scan(&reg)
	if reg == nil {
		t.Skip("platform_settings not migrated — skipping")
	}
	svc := NewPlatformReadService(pool)
	m := svc.Mode(ctx)
	if m != "SANDBOX" && m != "LIVE" {
		t.Fatalf("mode must be SANDBOX or LIVE, got %q", m)
	}
}

// A2-17: a caller that must not guess (the proof verifier) can tell an unknown
// mode from SANDBOX. Mode() keeps its SANDBOX fallback for the banner and the
// onboarding gate, where the restricted answer is the safe one.
func TestPlatformReadService_LookupReportsAnUnknownMode(t *testing.T) {
	if mode, ok := (&PlatformReadService{}).Lookup(context.Background()); ok || mode != "" {
		t.Fatalf("nil pool: Lookup = (%q, %v), want (\"\", false)", mode, ok)
	}
	if (&PlatformReadService{}).Mode(context.Background()) != "SANDBOX" {
		t.Fatalf("Mode() must keep its SANDBOX fallback")
	}
}
