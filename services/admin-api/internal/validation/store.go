package validation

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Run is a Validation Run as the control plane serves it.
type Run struct {
	ID             string     `json:"id"`
	RunRef         string     `json:"run_ref"`
	Environment    string     `json:"environment"`
	ProfileID      string     `json:"profile_id"`
	ProfileVersion int        `json:"profile_version"`
	ProfileDigest  string     `json:"profile_digest"`
	State          string     `json:"state"`
	Verdict        *string    `json:"verdict"`
	RequestedBy    *string    `json:"requested_by"`
	CancelReason   *string    `json:"cancel_reason,omitempty"`
	RequestedAt    time.Time  `json:"requested_at"`
	StartedAt      *time.Time `json:"started_at"`
	EndedAt        *time.Time `json:"ended_at"`
}

// Run states. The legal transitions between them are enforced by the database
// (migration 0160), not here — a state machine that lives only in the process
// currently writing is a state machine one crash away from being untrue.
const (
	StatePreparing        = "PREPARING"
	StatePreflightRunning = "PREFLIGHT_RUNNING"
	StateBlocked          = "BLOCKED"
	StateReady            = "READY"
	StateQueued           = "QUEUED"
	StateRunning          = "RUNNING"
	StateCompleted        = "COMPLETED"
	StateCancelled        = "CANCELLED"
	StateAbandoned        = "ABANDONED"
)

var (
	// ErrRunNotFound is returned rather than a nil run, so a caller cannot
	// mistake "no such run" for "a run with empty fields".
	ErrRunNotFound = errors.New("validation run not found")
	// ErrRunActive is the concurrency invariant surfacing as a domain error.
	ErrRunActive = errors.New("a validation run already holds the Sandbox")
)

// Store is the durable side of the control plane.
//
// It deliberately offers no way to START a run. Phase C builds the surface that
// can orchestrate one; starting it is a separate, authorised act, and a method
// that exists "for later" is a method someone calls by accident. See
// tools/check-validation-no-start.mjs.
type Store struct {
	pool *pgxpool.Pool
	now  func() time.Time
}

func NewStore(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool, now: time.Now}
}

const runColumns = `id::text, run_ref, environment, profile_id, profile_version,
	profile_digest, state, verdict, requested_by::text, cancel_reason,
	requested_at, started_at, ended_at`

func scanRun(row pgx.Row) (Run, error) {
	var r Run
	err := row.Scan(&r.ID, &r.RunRef, &r.Environment, &r.ProfileID, &r.ProfileVersion,
		&r.ProfileDigest, &r.State, &r.Verdict, &r.RequestedBy, &r.CancelReason,
		&r.RequestedAt, &r.StartedAt, &r.EndedAt)
	return r, err
}

// Prepare creates a run in PREPARING. It does not start it, and cannot: the
// only states reachable from PREPARING are PREFLIGHT_RUNNING and CANCELLED,
// and the database enforces that.
//
// idempotencyKey makes preparation replayable: the same key returns the run it
// already made rather than a second one. That property belongs here and not in
// the caller, because two operators clicking at once is the ordinary case.
// The second return value reports whether a run was CREATED. A replay returns
// the run it already made, and false — the caller must then leave it alone
// rather than preflight it again, which would both mutate a settled run and,
// against a terminal one, attempt an illegal transition.
func (s *Store) Prepare(ctx context.Context, profile Profile, operatorID string, idempotencyKey string) (Run, bool, error) {
	if profile.ID == "" || profile.Digest == "" {
		return Run{}, false, fmt.Errorf("a run must pin a profile and its digest")
	}

	if idempotencyKey != "" {
		if existing, err := s.byIdempotencyKey(ctx, idempotencyKey); err == nil {
			return existing, false, nil
		} else if !errors.Is(err, ErrRunNotFound) {
			return Run{}, false, err
		}
	}

	ref, err := s.nextRunRef(ctx)
	if err != nil {
		return Run{}, false, err
	}

	var operator *string
	if operatorID != "" {
		operator = &operatorID
	}
	var key *string
	if idempotencyKey != "" {
		key = &idempotencyKey
	}

	row := s.pool.QueryRow(ctx, `
		INSERT INTO validation_runs
			(run_ref, profile_id, profile_version, profile_digest, requested_by, idempotency_key)
		VALUES ($1, $2, $3, $4, $5::uuid, $6)
		RETURNING `+runColumns,
		ref, profile.ID, profile.Version, profile.Digest, operator, key)

	run, err := scanRun(row)
	if err != nil {
		return Run{}, false, fmt.Errorf("prepare run: %w", err)
	}
	if err := s.record(ctx, run.ID, "", StatePreparing, "prepared", operator); err != nil {
		return Run{}, false, err
	}
	return run, true, nil
}

// RecordPreflight persists a preflight and moves the run to READY or BLOCKED
// according to the profile's minimum verdict. A run whose lab is not fit lands
// in BLOCKED, from which the only way forward is to preflight again — it cannot
// be queued out of BLOCKED, and the database says so.
func (s *Store) RecordPreflight(ctx context.Context, runID string, profile Profile, res PreflightResult, operatorID string) (Run, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Run{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var operator *string
	if operatorID != "" {
		operator = &operatorID
	}

	if _, err := tx.Exec(ctx,
		`UPDATE validation_runs SET state = $2 WHERE id = $1::uuid`,
		runID, StatePreflightRunning); err != nil {
		return Run{}, fmt.Errorf("enter preflight: %w", err)
	}

	var preflightID string
	if err := tx.QueryRow(ctx, `
		INSERT INTO validation_preflights (run_id, profile_id, verdict, requested_by, ended_at)
		VALUES ($1::uuid, $2, $3, $4::uuid, now())
		RETURNING id::text`,
		runID, profile.ID, res.Verdict, operator).Scan(&preflightID); err != nil {
		return Run{}, fmt.Errorf("record preflight: %w", err)
	}

	for _, c := range res.Checks {
		// `measured` is the material state the verdict was taken FROM. Persisting
		// status and detail while dropping it would leave a stored check that
		// cannot be re-read against the numbers that produced it — a claim
		// without its evidence. The schema already holds JSONB; the runtime shape
		// is kept as-is rather than flattened into prose.
		measured := c.Measured
		if measured == nil {
			measured = map[string]int64{}
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO validation_preflight_checks
				(preflight_id, check_group, check_id, status, detail, measured)
			VALUES ($1::uuid, $2, $3, $4, $5, $6)
			ON CONFLICT (preflight_id, check_group, check_id) DO NOTHING`,
			preflightID, c.Group, c.ID, c.Status, c.Detail, measured); err != nil {
			return Run{}, fmt.Errorf("record check %s/%s: %w", c.Group, c.ID, err)
		}
	}

	// Provenance, in the SAME transaction as the READY transition. There is no
	// window in which a READY run exists without it: either both commit or
	// neither does, and the run stays in PREPARING.
	next := StateBlocked
	if MeetsMinimum(res.Verdict, profile.Preflight.MinimumVerdict) {
		next = StateReady
	}
	if next == StateReady {
		if err := requireCompleteProvenance(res.Provenance); err != nil {
			return Run{}, fmt.Errorf("refusing READY: %w", err)
		}
	}
	for _, pr := range res.Provenance {
		detail, merr := json.Marshal(pr.Detail)
		if merr != nil {
			return Run{}, fmt.Errorf("provenance detail for %s: %w", pr.Component, merr)
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO validation_run_provenance (run_id, component, revision, detail)
			VALUES ($1::uuid, $2, $3, $4::jsonb)
			ON CONFLICT (run_id, component) DO NOTHING`,
			runID, pr.Component, pr.Revision, string(detail)); err != nil {
			return Run{}, fmt.Errorf("record provenance %s: %w", pr.Component, err)
		}
	}

	reason := "preflight " + res.Verdict + " does not meet " + profile.Preflight.MinimumVerdict
	if next == StateReady {
		reason = "preflight " + res.Verdict
	}
	if _, err := tx.Exec(ctx,
		`UPDATE validation_runs SET state = $2 WHERE id = $1::uuid`, runID, next); err != nil {
		return Run{}, fmt.Errorf("leave preflight: %w", err)
	}
	if err := s.recordTx(ctx, tx, runID, StatePreflightRunning, next, reason, operator); err != nil {
		return Run{}, err
	}

	run, err := scanRun(tx.QueryRow(ctx,
		`SELECT `+runColumns+` FROM validation_runs WHERE id = $1::uuid`, runID))
	if err != nil {
		return Run{}, err
	}
	return run, tx.Commit(ctx)
}

// Cancel closes a run. Every non-terminal state may be cancelled, because an
// operator must always be able to stop something.
func (s *Store) Cancel(ctx context.Context, runID, reason, operatorID string) (Run, error) {
	current, err := s.Get(ctx, runID)
	if err != nil {
		return Run{}, err
	}
	var operator *string
	if operatorID != "" {
		operator = &operatorID
	}
	row := s.pool.QueryRow(ctx, `
		UPDATE validation_runs
		   SET state = $2, cancel_reason = $3, ended_at = now()
		 WHERE id = $1::uuid
		RETURNING `+runColumns,
		runID, StateCancelled, reason)
	run, err := scanRun(row)
	if err != nil {
		return Run{}, fmt.Errorf("cancel run: %w", err)
	}
	if err := s.record(ctx, runID, current.State, StateCancelled, reason, operator); err != nil {
		return Run{}, err
	}
	return run, nil
}

// Get returns one run.
func (s *Store) Get(ctx context.Context, runID string) (Run, error) {
	run, err := scanRun(s.pool.QueryRow(ctx,
		`SELECT `+runColumns+` FROM validation_runs WHERE id = $1::uuid`, runID))
	if errors.Is(err, pgx.ErrNoRows) {
		return Run{}, ErrRunNotFound
	}
	return run, err
}

// List returns the most recent runs, newest first.
func (s *Store) List(ctx context.Context, limit int) ([]Run, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := s.pool.Query(ctx,
		`SELECT `+runColumns+` FROM validation_runs ORDER BY requested_at DESC LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Run{}
	for rows.Next() {
		r, err := scanRun(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// Events returns a run's transition history, oldest first.
func (s *Store) Events(ctx context.Context, runID string) ([]RunEvent, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT seq, from_state, to_state, reason, occurred_at
		  FROM validation_run_events WHERE run_id = $1::uuid ORDER BY seq`, runID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []RunEvent{}
	for rows.Next() {
		var e RunEvent
		if err := rows.Scan(&e.Seq, &e.FromState, &e.ToState, &e.Reason, &e.OccurredAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// RunEvent is one recorded transition. It cannot be edited or deleted; the
// database refuses both.
type RunEvent struct {
	Seq        int       `json:"seq"`
	FromState  *string   `json:"from_state"`
	ToState    string    `json:"to_state"`
	Reason     *string   `json:"reason"`
	OccurredAt time.Time `json:"occurred_at"`
}

// ActiveRun returns the run currently holding the Sandbox, if any.
func (s *Store) ActiveRun(ctx context.Context) (*Run, error) {
	run, err := scanRun(s.pool.QueryRow(ctx,
		`SELECT `+runColumns+` FROM validation_runs
		  WHERE state IN ('QUEUED','RUNNING') LIMIT 1`))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &run, nil
}

func (s *Store) byIdempotencyKey(ctx context.Context, key string) (Run, error) {
	run, err := scanRun(s.pool.QueryRow(ctx,
		`SELECT `+runColumns+` FROM validation_runs WHERE idempotency_key = $1`, key))
	if errors.Is(err, pgx.ErrNoRows) {
		return Run{}, ErrRunNotFound
	}
	return run, err
}

// nextRunRef produces BZV-YYYYMMDD-NNNN, the reference an operator quotes in a
// report. Sequential within the day, so two runs are trivially orderable by eye.
func (s *Store) nextRunRef(ctx context.Context) (string, error) {
	day := s.now().UTC().Format("20060102")
	var n int
	err := s.pool.QueryRow(ctx,
		`SELECT count(*) FROM validation_runs WHERE run_ref LIKE $1`, "BZV-"+day+"-%").Scan(&n)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("BZV-%s-%04d", day, n+1), nil
}

func (s *Store) record(ctx context.Context, runID, from, to, reason string, operator *string) error {
	return s.recordRow(ctx, s.pool, runID, from, to, reason, operator)
}

func (s *Store) recordTx(ctx context.Context, tx pgx.Tx, runID, from, to, reason string, operator *string) error {
	return s.recordRow(ctx, tx, runID, from, to, reason, operator)
}

func (s *Store) recordRow(ctx context.Context, q interface {
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
}, runID, from, to, reason string, operator *string) error {
	var fromPtr *string
	if from != "" {
		fromPtr = &from
	}
	_, err := q.Exec(ctx, `
		INSERT INTO validation_run_events (run_id, seq, from_state, to_state, reason, actor_id)
		SELECT $1::uuid,
		       COALESCE((SELECT max(seq) FROM validation_run_events WHERE run_id = $1::uuid), 0) + 1,
		       $2, $3, $4, $5::uuid`,
		runID, fromPtr, to, reason, operator)
	if err != nil {
		return fmt.Errorf("record transition %s -> %s: %w", from, to, err)
	}
	return nil
}

// requireCompleteProvenance is the guard behind "READY => mandatory provenance
// complete". It runs INSIDE the preparation transaction, so a run that cannot
// be attributed never becomes READY — it is not downgraded, not annotated, and
// not allowed through with a placeholder.
func requireCompleteProvenance(rows []ProvenanceRow) error {
	got := map[string]bool{}
	for _, r := range rows {
		if r.Revision != "" && r.Revision != "unknown" {
			got[r.Component] = true
		}
	}
	missing := []string{}
	for _, want := range MandatoryComponents() {
		if !got[want] {
			missing = append(missing, want)
		}
	}
	if len(missing) > 0 {
		return fmt.Errorf("mandatory provenance missing for %v", missing)
	}
	return nil
}
