package service

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

// PlatformReadService reads the central platform mode for the public endpoint.
// It NEVER falls back to LIVE.
type PlatformReadService struct {
	pool *pgxpool.Pool
}

func NewPlatformReadService(pool *pgxpool.Pool) *PlatformReadService {
	return &PlatformReadService{pool: pool}
}

// Lookup returns the stored mode ("SANDBOX" or "LIVE") and true, or ("", false)
// when it cannot be read (no pool, missing row, DB error, invalid value).
//
// A caller that acts on the answer — which stack to ask for a proof, what to
// call a payment — needs to know the mode is UNKNOWN rather than receive a
// guess. Before this existed every caller got SANDBOX on a failed read, so the
// public verifier could ask the Sandbox stack while the platform was LIVE and
// present what it found there (A2-17).
func (s *PlatformReadService) Lookup(ctx context.Context) (string, bool) {
	if s == nil || s.pool == nil {
		return "", false
	}
	var v string
	err := s.pool.QueryRow(ctx,
		`SELECT value FROM platform_settings WHERE key = 'platform_mode'`).Scan(&v)
	if err != nil || (v != "SANDBOX" && v != "LIVE") {
		return "", false
	}
	return v, true
}

// Mode returns "SANDBOX" or "LIVE"; on any failure it returns "SANDBOX". For
// callers where the restricted answer is the safe one: the onboarding EnvGate
// (a LIVE stack refuses unless the mode is positively LIVE).
func (s *PlatformReadService) Mode(ctx context.Context) string {
	if v, ok := s.Lookup(ctx); ok {
		return v
	}
	return "SANDBOX"
}
