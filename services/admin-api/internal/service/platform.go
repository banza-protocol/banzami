package service

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Platform Mode — the central source of truth for SANDBOX/LIVE. The platform is
// SANDBOX until a SUPER_ADMIN flips it to LIVE with a typed confirmation. Readers
// fall back to SANDBOX on any failure — never LIVE.
type PlatformService struct {
	pool *pgxpool.Pool
}

func NewPlatformService(pool *pgxpool.Pool) *PlatformService {
	return &PlatformService{pool: pool}
}

const platformModeKey = "platform_mode"

var (
	ErrInvalidMode          = errors.New("mode must be SANDBOX or LIVE")
	ErrModeReasonRequired   = errors.New("reason is required")
	ErrConfirmationMismatch = errors.New("confirmation text does not match")
)

type PlatformMode struct {
	Mode      string    `json:"mode"`
	UpdatedAt time.Time `json:"updated_at"`
	UpdatedBy string    `json:"updated_by,omitempty"`
	Reason    string    `json:"reason,omitempty"`
}

// ValidMode reports whether m is an exposable platform mode. MAINTENANCE is not
// exposed until implemented.
func ValidMode(m string) bool { return m == "SANDBOX" || m == "LIVE" }

// ConfirmationFor returns the exact phrase required to switch INTO target.
func ConfirmationFor(target string) string {
	switch target {
	case "LIVE":
		return "CONFIRMO ATIVAR LIVE"
	case "SANDBOX":
		return "CONFIRMO ATIVAR SANDBOX"
	default:
		return ""
	}
}

// GetMode returns the current mode. Any read failure falls back to SANDBOX (the
// safe default) — the platform is never assumed LIVE on error.
func (s *PlatformService) GetMode(ctx context.Context) PlatformMode {
	var m PlatformMode
	err := s.pool.QueryRow(ctx,
		`SELECT value, updated_at, COALESCE(updated_by,''), COALESCE(reason,'')
		   FROM platform_settings WHERE key = $1`, platformModeKey).
		Scan(&m.Mode, &m.UpdatedAt, &m.UpdatedBy, &m.Reason)
	if err != nil || !ValidMode(m.Mode) {
		return PlatformMode{Mode: "SANDBOX", UpdatedAt: time.Time{}, Reason: "fallback"}
	}
	return m
}

// SetMode flips the platform mode. Requires a valid mode, a non-empty reason and
// the exact confirmation phrase for the target. Records immutable history.
func (s *PlatformService) SetMode(ctx context.Context, mode, confirmationText, reason, operator string) (PlatformMode, error) {
	if !ValidMode(mode) {
		return PlatformMode{}, ErrInvalidMode
	}
	if reason == "" {
		return PlatformMode{}, ErrModeReasonRequired
	}
	if confirmationText != ConfirmationFor(mode) {
		return PlatformMode{}, ErrConfirmationMismatch
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return PlatformMode{}, err
	}
	defer tx.Rollback(ctx)

	var old string
	err = tx.QueryRow(ctx, `SELECT value FROM platform_settings WHERE key=$1 FOR UPDATE`, platformModeKey).Scan(&old)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return PlatformMode{}, err
	}

	if _, err := tx.Exec(ctx,
		`INSERT INTO platform_settings (key, value, reason, updated_by, updated_at, version)
		 VALUES ($1, $2, $3, $4, now(), 1)
		 ON CONFLICT (key) DO UPDATE
		    SET value=$2, reason=$3, updated_by=$4, updated_at=now(), version=platform_settings.version+1`,
		platformModeKey, mode, reason, nullStr(operator)); err != nil {
		return PlatformMode{}, err
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO platform_settings_history (setting_key, old_value, new_value, changed_by, reason, confirmation_text)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		platformModeKey, nullStr(old), mode, nullStr(operator), reason, confirmationText); err != nil {
		return PlatformMode{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return PlatformMode{}, err
	}
	return s.GetMode(ctx), nil
}
