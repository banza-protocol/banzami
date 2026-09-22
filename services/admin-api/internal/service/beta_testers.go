package service

// Beta tester administration (APP-BETA-001).
//
// The public site registers prospective mobile testers into beta_testers (the
// api-gateway owns that write). This service is the operator's side: it reads the
// queue, advances a tester through the lifecycle (PENDING → INVITED → ACTIVE, or
// REMOVED), and records an operator note. It moves no money and touches nothing
// financial — a beta tester is contact detail, not a wallet or a Developer
// resource. Invitations to TestFlight / Google Play testing are sent by hand in
// those consoles; this only records that the operator did so (INVITED), so the
// two sides never fall out of step and Apple/Google are never driven from here.

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	// ErrBetaTesterNotFound is returned when a status transition names a row that
	// does not exist. Reads never surface it (an empty list is a valid answer).
	ErrBetaTesterNotFound = errors.New("beta tester not found")
	// ErrBetaInvalidStatus guards the transition target.
	ErrBetaInvalidStatus = errors.New("status must be INVITED, ACTIVE or REMOVED")
)

// BetaTesterAdminService owns operator reads and lifecycle writes over
// beta_testers. It never inserts (registration is the public endpoint's job) and
// never hard-deletes (REMOVED is a soft state kept for audit).
type BetaTesterAdminService struct {
	pool *pgxpool.Pool
}

func NewBetaTesterAdminService(pool *pgxpool.Pool) *BetaTesterAdminService {
	return &BetaTesterAdminService{pool: pool}
}

// BetaTesterRow is one tester as the operator surface shows them. The email is
// the display spelling (the tester's own casing), never the normalised key.
type BetaTesterRow struct {
	ID           string     `json:"id"`
	FirstName    string     `json:"first_name"`
	LastName     string     `json:"last_name"`
	Email        string     `json:"email"`
	WantsIOS     bool       `json:"wants_ios"`
	WantsAndroid bool       `json:"wants_android"`
	AppBanzami   bool       `json:"app_banzami"`
	AppMerchant  bool       `json:"app_merchant"`
	DeviceModel  string     `json:"device_model,omitempty"`
	OSVersion    string     `json:"os_version,omitempty"`
	Country      string     `json:"country,omitempty"`
	Source       string     `json:"source,omitempty"`
	Status       string     `json:"status"`
	Note         string     `json:"note,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
	InvitedAt    *time.Time `json:"invited_at,omitempty"`
	ActivatedAt  *time.Time `json:"activated_at,omitempty"`
	RemovedAt    *time.Time `json:"removed_at,omitempty"`
}

// BetaListFilter narrows the queue. Every field is optional; the zero value
// lists everyone, newest first.
type BetaListFilter struct {
	Status   string // PENDING | INVITED | ACTIVE | REMOVED, or "" for all
	App      string // APP_BANZAMI | APP_MERCHANT, or "" for either
	Platform string // IOS | ANDROID, or "" for either
	Search   string // matches name or email (case-insensitive substring)
	Limit    int    // page size (clamped 1..200, default 50)
	Offset   int
}

// betaSelect is the shared projection. Both List and Export read it so an export
// is exactly what the operator was looking at, in the same order.
const betaSelect = `
	SELECT id, first_name, last_name, email_display,
	       wants_ios, wants_android, app_banzami, app_merchant,
	       device_model, os_version, country, source,
	       status, note, created_at, updated_at, invited_at, activated_at, removed_at
	FROM beta_testers`

// buildBetaWhere turns a filter into a WHERE clause and its arguments. It is the
// one place the filter is translated, so List and Export cannot drift.
func buildBetaWhere(f BetaListFilter) (string, []any) {
	var conds []string
	var args []any
	add := func(cond string, val any) {
		args = append(args, val)
		conds = append(conds, fmt.Sprintf(cond, len(args)))
	}
	if f.Status != "" {
		add("status = $%d", f.Status)
	}
	switch f.App {
	case "APP_BANZAMI":
		conds = append(conds, "app_banzami")
	case "APP_MERCHANT":
		conds = append(conds, "app_merchant")
	}
	switch f.Platform {
	case "IOS":
		conds = append(conds, "wants_ios")
	case "ANDROID":
		conds = append(conds, "wants_android")
	}
	if s := strings.TrimSpace(f.Search); s != "" {
		// ILIKE over the display name and email. The value is a bound parameter —
		// never interpolated — so the % wrapper cannot inject.
		add("(first_name || ' ' || last_name || ' ' || email_display) ILIKE $%d", "%"+s+"%")
	}
	if len(conds) == 0 {
		return "", args
	}
	return " WHERE " + strings.Join(conds, " AND "), args
}

func scanBetaRow(rows pgx.Rows) (BetaTesterRow, error) {
	var t BetaTesterRow
	var device, os, country, source, note *string
	err := rows.Scan(&t.ID, &t.FirstName, &t.LastName, &t.Email,
		&t.WantsIOS, &t.WantsAndroid, &t.AppBanzami, &t.AppMerchant,
		&device, &os, &country, &source,
		&t.Status, &note, &t.CreatedAt, &t.UpdatedAt, &t.InvitedAt, &t.ActivatedAt, &t.RemovedAt)
	if err != nil {
		return BetaTesterRow{}, err
	}
	deref := func(p *string) string {
		if p != nil {
			return *p
		}
		return ""
	}
	t.DeviceModel, t.OSVersion, t.Country, t.Source, t.Note = deref(device), deref(os), deref(country), deref(source), deref(note)
	return t, nil
}

// List returns a page of testers matching the filter, plus the total count of
// matches (for pagination). Newest registration first.
func (s *BetaTesterAdminService) List(ctx context.Context, f BetaListFilter) ([]BetaTesterRow, int, error) {
	where, args := buildBetaWhere(f)

	var total int
	if err := s.pool.QueryRow(ctx, "SELECT count(*) FROM beta_testers"+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	limit := f.Limit
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	offset := f.Offset
	if offset < 0 {
		offset = 0
	}
	q := betaSelect + where + fmt.Sprintf(" ORDER BY created_at DESC LIMIT $%d OFFSET $%d", len(args)+1, len(args)+2)
	rows, err := s.pool.Query(ctx, q, append(args, limit, offset)...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	var out []BetaTesterRow
	for rows.Next() {
		t, err := scanBetaRow(rows)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, t)
	}
	return out, total, rows.Err()
}

// Export returns every tester matching the filter (no paging), for a CSV
// download. Ordered like the list.
func (s *BetaTesterAdminService) Export(ctx context.Context, f BetaListFilter) ([]BetaTesterRow, error) {
	where, args := buildBetaWhere(f)
	rows, err := s.pool.Query(ctx, betaSelect+where+" ORDER BY created_at DESC", args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []BetaTesterRow
	for rows.Next() {
		t, err := scanBetaRow(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// SetStatus advances a tester's lifecycle and stamps the matching timestamp:
// INVITED sets invited_at, ACTIVE sets activated_at, REMOVED sets removed_at. The
// stamp is set the first time the state is reached and left as it was on a repeat
// (re-marking INVITED does not rewrite the original invite time). A note, when
// given, replaces the operator note. Returns ErrBetaTesterNotFound if the id is
// unknown.
// justInvited (second return) is true only when THIS call moved the tester into
// INVITED from another state — the moment to send the "added to the tests"
// notification exactly once. Re-marking an already-INVITED tester returns false,
// so the email never fires twice.
func (s *BetaTesterAdminService) SetStatus(ctx context.Context, id, status string, note *string) (BetaTesterRow, bool, error) {
	switch status {
	case "INVITED", "ACTIVE", "REMOVED":
	default:
		return BetaTesterRow{}, false, ErrBetaInvalidStatus
	}
	// COALESCE keeps the first timestamp for a state; a REMOVED tester who is
	// re-invited/activated later gets a fresh stamp because removed_at is cleared
	// and the invite/active stamps are re-derived from the new status. The CTE
	// captures the prior status so the caller can tell a first invite from a
	// repeat without a second read.
	var prevStatus string
	err := s.pool.QueryRow(ctx, `
		WITH prev AS (SELECT id, status AS old_status FROM beta_testers WHERE id = $1)
		UPDATE beta_testers b SET
			status      = $2,
			note        = COALESCE($3, note),
			invited_at  = CASE WHEN $2 = 'INVITED' AND b.invited_at   IS NULL THEN now() ELSE b.invited_at   END,
			activated_at= CASE WHEN $2 = 'ACTIVE'  AND b.activated_at IS NULL THEN now() ELSE b.activated_at END,
			removed_at  = CASE WHEN $2 = 'REMOVED' THEN now() ELSE NULL END,
			updated_at  = now()
		FROM prev
		WHERE b.id = prev.id
		RETURNING prev.old_status`, id, status, note).Scan(&prevStatus)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return BetaTesterRow{}, false, ErrBetaTesterNotFound
		}
		return BetaTesterRow{}, false, err
	}
	justInvited := status == "INVITED" && prevStatus != "INVITED"
	row, err := s.get(ctx, id)
	return row, justInvited, err
}

func (s *BetaTesterAdminService) get(ctx context.Context, id string) (BetaTesterRow, error) {
	rows, err := s.pool.Query(ctx, betaSelect+" WHERE id = $1", id)
	if err != nil {
		return BetaTesterRow{}, err
	}
	defer rows.Close()
	if !rows.Next() {
		return BetaTesterRow{}, ErrBetaTesterNotFound
	}
	return scanBetaRow(rows)
}
