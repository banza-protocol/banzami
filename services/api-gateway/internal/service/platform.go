package service

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

// PlatformReadService reads the central platform mode for the public endpoint.
// It NEVER falls back to LIVE: any failure (missing row, DB error, invalid value)
// resolves to SANDBOX, so a public banner is shown rather than silently assuming
// production.
type PlatformReadService struct {
	pool *pgxpool.Pool
}

func NewPlatformReadService(pool *pgxpool.Pool) *PlatformReadService {
	return &PlatformReadService{pool: pool}
}

// Mode returns "SANDBOX" or "LIVE"; on any failure it returns "SANDBOX".
func (s *PlatformReadService) Mode(ctx context.Context) string {
	if s == nil || s.pool == nil {
		return "SANDBOX"
	}
	var v string
	err := s.pool.QueryRow(ctx,
		`SELECT value FROM platform_settings WHERE key = 'platform_mode'`).Scan(&v)
	if err != nil || (v != "SANDBOX" && v != "LIVE") {
		return "SANDBOX"
	}
	return v
}
