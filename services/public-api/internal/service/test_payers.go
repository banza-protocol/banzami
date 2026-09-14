package service

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Sandbox test payers (ADR-060 §4).
//
// A test payer is a consumer that belongs to one Developer Project. The Project
// id is supplied by the gateway from the authenticated Project key and is the
// filter on every read and write here: a payer of Project A does not exist for
// Project B.

// Quotas per Project (ADR-060 §6). Bounded per Project so no Project can
// exhaust the Sandbox for the others.
const (
	TestPayerMaxActivePerProject = 10
	TestPayerGrantMinor          = 1_000_000  // 10 000 Kz
	TestPayerMaxTopUpMinor       = 2_500_000  // 25 000 Kz per top-up
	TestPayerMaxTopUpsPerDay     = 20         // per Project
	TestPayerMaxTopUpMinorPerDay = 10_000_000 // 100 000 Kz per Project per day
)

var (
	ErrTestPayerNotFound = errors.New("test payer not found")
	ErrTestPayerQuota    = errors.New("sandbox test payer quota exceeded")
	ErrFundingKeyReused  = errors.New("this idempotency key was used for a different top-up")
)

// TestPayer is the ownership record plus the consumer's public identity.
type TestPayer struct {
	ConsumerID string
	ProjectID  string
	Handle     string
	Label      *string
	CreatedAt  time.Time
	RetiredAt  *time.Time
	Status     string
}

// TestPayerStore reads and writes ownership and funding records.
type TestPayerStore struct{ pool *pgxpool.Pool }

func NewTestPayerStore(pool *pgxpool.Pool) *TestPayerStore { return &TestPayerStore{pool: pool} }

// CountActive is the number of a Project's payers that are not retired.
func (s *TestPayerStore) CountActive(ctx context.Context, projectID string) (int, error) {
	var n int
	err := s.pool.QueryRow(ctx,
		`SELECT count(*) FROM sandbox_test_payers WHERE project_id = $1 AND retired_at IS NULL`, projectID).Scan(&n)
	return n, err
}

// Record makes a consumer a Project's test payer. Written before the grant, so
// Core sees the payer as a test payer when it checks the funding caps.
func (s *TestPayerStore) Record(ctx context.Context, consumerID, projectID string, label *string) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO sandbox_test_payers (consumer_id, project_id, label) VALUES ($1, $2, $3)`,
		consumerID, projectID, label)
	return err
}

const testPayerCols = `tp.consumer_id::text, tp.project_id::text, c.handle, tp.label, tp.created_at, tp.retired_at, c.status`

func scanTestPayer(row pgx.Row) (*TestPayer, error) {
	var p TestPayer
	if err := row.Scan(&p.ConsumerID, &p.ProjectID, &p.Handle, &p.Label, &p.CreatedAt, &p.RetiredAt, &p.Status); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrTestPayerNotFound
		}
		return nil, err
	}
	return &p, nil
}

// Get returns the Project's own payer, or ErrTestPayerNotFound — also when the
// payer exists but belongs to another Project.
func (s *TestPayerStore) Get(ctx context.Context, projectID, consumerID string) (*TestPayer, error) {
	return scanTestPayer(s.pool.QueryRow(ctx,
		`SELECT `+testPayerCols+` FROM sandbox_test_payers tp JOIN consumers c ON c.id = tp.consumer_id
		  WHERE tp.project_id = $1 AND tp.consumer_id::text = $2`, projectID, consumerID))
}

// List returns the Project's payers, newest first.
func (s *TestPayerStore) List(ctx context.Context, projectID string, includeRetired bool) ([]TestPayer, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT `+testPayerCols+` FROM sandbox_test_payers tp JOIN consumers c ON c.id = tp.consumer_id
		  WHERE tp.project_id = $1 AND ($2 OR tp.retired_at IS NULL)
		  ORDER BY tp.created_at DESC LIMIT 100`, projectID, includeRetired)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []TestPayer{}
	for rows.Next() {
		p, err := scanTestPayer(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *p)
	}
	return out, rows.Err()
}

// ReserveTopUp records a top-up request against the Project's daily quota,
// atomically: two concurrent requests cannot both take the last slot. An
// idempotency key already used for the same payer and amount returns
// replay=true; for anything else it is ErrFundingKeyReused.
func (s *TestPayerStore) ReserveTopUp(ctx context.Context, projectID, consumerID string, amountMinor int64, kind, key string) (replay bool, err error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended('sandbox_topups:' || $1, 0))`, projectID); err != nil {
		return false, err
	}
	var prevConsumer string
	var prevAmount int64
	switch err := tx.QueryRow(ctx,
		`SELECT consumer_id::text, amount_minor FROM sandbox_test_fundings WHERE project_id = $1 AND idempotency_key = $2`,
		projectID, key).Scan(&prevConsumer, &prevAmount); {
	case err == nil:
		if prevConsumer == consumerID && prevAmount == amountMinor {
			return true, nil
		}
		return false, ErrFundingKeyReused
	case !errors.Is(err, pgx.ErrNoRows):
		return false, err
	}
	if kind == "TOP_UP" {
		var count int
		var total int64
		if err := tx.QueryRow(ctx,
			`SELECT count(*), COALESCE(sum(amount_minor), 0) FROM sandbox_test_fundings
			  WHERE project_id = $1 AND kind = 'TOP_UP' AND created_at > now() - interval '24 hours'`,
			projectID).Scan(&count, &total); err != nil {
			return false, err
		}
		if count >= TestPayerMaxTopUpsPerDay || total+amountMinor > TestPayerMaxTopUpMinorPerDay {
			return false, ErrTestPayerQuota
		}
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO sandbox_test_fundings (project_id, consumer_id, amount_minor, kind, idempotency_key)
		 VALUES ($1, $2, $3, $4, $5)`, projectID, consumerID, amountMinor, kind, key); err != nil {
		var pg *pgconn.PgError
		if errors.As(err, &pg) && pg.Code == "23505" {
			return false, ErrFundingKeyReused
		}
		return false, err
	}
	return false, tx.Commit(ctx)
}

// ReleaseTopUp removes a reservation whose credit Core refused, so a refused
// top-up does not consume the quota.
func (s *TestPayerStore) ReleaseTopUp(ctx context.Context, projectID, key string) {
	_, _ = s.pool.Exec(ctx, `DELETE FROM sandbox_test_fundings WHERE project_id = $1 AND idempotency_key = $2`, projectID, key)
}

// MarkRetired records retirement; the consumer and its ledger history remain.
func (s *TestPayerStore) MarkRetired(ctx context.Context, projectID, consumerID string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE sandbox_test_payers SET retired_at = COALESCE(retired_at, now())
		  WHERE project_id = $1 AND consumer_id::text = $2`, projectID, consumerID)
	return err
}
