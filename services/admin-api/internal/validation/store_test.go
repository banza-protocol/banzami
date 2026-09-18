package validation

import (
	"context"
	"os"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

// storeFixture brings up the Validation Run schema on a database the test owns.
//
// It applies db/migrations/0160_validation_runs.sql verbatim rather than a
// hand-written approximation, so these tests exercise the same triggers and
// indexes the Sandbox runs — including the ones whose whole purpose is to
// refuse what this package might otherwise do.
func storeFixture(t *testing.T) (*Store, *pgxpool.Pool) {
	t.Helper()
	dbURL := os.Getenv("VALIDATION_TEST_DATABASE_URL")
	if dbURL == "" {
		t.Skip("VALIDATION_TEST_DATABASE_URL not set — skipping DB-backed Studio tests")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	t.Cleanup(pool.Close)

	// Drop before applying: a Validation Run is undeletable by design (the
	// append-only event trigger plus a non-cascading foreign key), so the only
	// way to give each test an empty Studio is to rebuild the schema.
	for _, tbl := range []string{
		"validation_evidence", "validation_run_journeys", "validation_preflight_checks",
		"validation_preflights", "validation_run_provenance", "validation_run_events",
		"validation_runs",
	} {
		if _, err := pool.Exec(ctx, `DROP TABLE IF EXISTS `+tbl+` CASCADE`); err != nil {
			t.Fatalf("drop %s: %v", tbl, err)
		}
	}

	migration, err := os.ReadFile("../../../../db/migrations/0160_validation_runs.sql")
	if err != nil {
		t.Fatalf("read migration: %v", err)
	}
	for _, stmt := range []string{
		`CREATE EXTENSION IF NOT EXISTS pgcrypto`,
		`CREATE TABLE IF NOT EXISTS admin_users (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email TEXT, status TEXT)`,
	} {
		if _, err := pool.Exec(ctx, stmt); err != nil {
			t.Fatalf("prepare: %v", err)
		}
	}
	if _, err := pool.Exec(ctx, string(migration)); err != nil {
		t.Fatalf("apply 0160: %v", err)
	}
	return NewStore(pool), pool
}

func goldenProfile(t *testing.T) Profile {
	t.Helper()
	p, ok := MustLoad().Profile("GOLDEN")
	if !ok {
		t.Fatal("GOLDEN is not in the registry")
	}
	return p
}

// A prepared run is prepared, not started. The only states reachable from
// PREPARING are PREFLIGHT_RUNNING and CANCELLED, and the database says so.
func TestStore_PrepareDoesNotStart(t *testing.T) {
	store, _ := storeFixture(t)
	run, err := store.Prepare(t.Context(), goldenProfile(t), "", "")
	if err != nil {
		t.Fatalf("prepare: %v", err)
	}
	if run.State != StatePreparing {
		t.Errorf("state %s, want %s", run.State, StatePreparing)
	}
	if run.StartedAt != nil || run.EndedAt != nil {
		t.Error("a prepared run has neither started nor ended")
	}
	if !strings.HasPrefix(run.RunRef, "BZV-") {
		t.Errorf("run_ref %q is not quotable in a report", run.RunRef)
	}
	if run.Environment != "SANDBOX" {
		t.Errorf("environment %s", run.Environment)
	}
	// The profile is pinned, so a later edit cannot re-describe this run.
	if run.ProfileDigest != goldenProfile(t).Digest {
		t.Error("the run did not pin the profile digest it was prepared from")
	}
}

// Two operators clicking at once is the ordinary case, not an error.
func TestStore_PreparationIsIdempotentOnTheCallersKey(t *testing.T) {
	store, _ := storeFixture(t)
	p := goldenProfile(t)

	first, err := store.Prepare(t.Context(), p, "", "owner-key-1")
	if err != nil {
		t.Fatalf("first: %v", err)
	}
	second, err := store.Prepare(t.Context(), p, "", "owner-key-1")
	if err != nil {
		t.Fatalf("second: %v", err)
	}
	if first.ID != second.ID {
		t.Errorf("the same key produced two runs: %s and %s", first.RunRef, second.RunRef)
	}

	other, err := store.Prepare(t.Context(), p, "", "owner-key-2")
	if err != nil {
		t.Fatalf("other: %v", err)
	}
	if other.ID == first.ID {
		t.Error("a different key returned the same run")
	}
}

// A run whose lab is not fit lands in BLOCKED, and BLOCKED cannot be queued —
// the only way forward is to preflight again.
func TestStore_AnUnfitLabBlocksTheRun(t *testing.T) {
	store, pool := storeFixture(t)
	p := goldenProfile(t)

	run, err := store.Prepare(t.Context(), p, "", "")
	if err != nil {
		t.Fatalf("prepare: %v", err)
	}
	run, err = store.RecordPreflight(t.Context(), run.ID, p, PreflightResult{
		Verdict: VerdictUnhealthy,
		Checks: []Check{
			{Group: "budget", ID: "global_24h", Status: StatusFail, Detail: "the window is exhausted"},
		},
	}, "")
	if err != nil {
		t.Fatalf("record preflight: %v", err)
	}
	if run.State != StateBlocked {
		t.Fatalf("state %s, want %s", run.State, StateBlocked)
	}

	// The database, not this package, is what refuses.
	_, err = pool.Exec(t.Context(),
		`UPDATE validation_runs SET state = 'QUEUED' WHERE id = $1::uuid`, run.ID)
	if err == nil {
		t.Error("a BLOCKED run was queued")
	} else if !strings.Contains(err.Error(), "illegal validation run transition") {
		t.Errorf("refused for the wrong reason: %v", err)
	}

	// The checks were recorded, so an operator can see WHY it is blocked.
	var checks int
	if err := pool.QueryRow(t.Context(),
		`SELECT count(*) FROM validation_preflight_checks`).Scan(&checks); err != nil {
		t.Fatal(err)
	}
	if checks == 0 {
		t.Error("the preflight's reasons were not recorded")
	}
}

// A HEALTHY preflight satisfies GOLDEN and the run becomes READY — and READY is
// where Phase C stops.
func TestStore_AFitLabMakesTheRunReadyAndNoFurther(t *testing.T) {
	store, _ := storeFixture(t)
	p := goldenProfile(t)

	run, _ := store.Prepare(t.Context(), p, "", "")
	run, err := store.RecordPreflight(t.Context(), run.ID, p,
		PreflightResult{Verdict: VerdictHealthy}, "")
	if err != nil {
		t.Fatalf("record preflight: %v", err)
	}
	if run.State != StateReady {
		t.Errorf("state %s, want %s", run.State, StateReady)
	}
	if run.StartedAt != nil {
		t.Error("a READY run has not started")
	}
}

// A DEGRADED lab is enough for FULL and not for GOLDEN.
func TestStore_TheProfileDecidesWhatDegradedMeans(t *testing.T) {
	store, _ := storeFixture(t)
	reg := MustLoad()
	full, _ := reg.Profile("FULL")
	golden, _ := reg.Profile("GOLDEN")

	r1, _ := store.Prepare(t.Context(), full, "", "full-1")
	r1, err := store.RecordPreflight(t.Context(), r1.ID, full, PreflightResult{Verdict: VerdictDegraded}, "")
	if err != nil {
		t.Fatalf("full: %v", err)
	}
	if r1.State != StateReady {
		t.Errorf("FULL on a DEGRADED lab is %s, want READY", r1.State)
	}

	r2, _ := store.Prepare(t.Context(), golden, "", "golden-1")
	r2, err = store.RecordPreflight(t.Context(), r2.ID, golden, PreflightResult{Verdict: VerdictDegraded}, "")
	if err != nil {
		t.Fatalf("golden: %v", err)
	}
	if r2.State != StateBlocked {
		t.Errorf("GOLDEN on a DEGRADED lab is %s, want BLOCKED", r2.State)
	}
}

// An operator must always be able to stop something, and the stop must be final.
func TestStore_CancelIsAlwaysAvailableAndTerminal(t *testing.T) {
	store, pool := storeFixture(t)
	p := goldenProfile(t)

	run, _ := store.Prepare(t.Context(), p, "", "")
	run, err := store.Cancel(t.Context(), run.ID, "owner changed their mind", "")
	if err != nil {
		t.Fatalf("cancel: %v", err)
	}
	if run.State != StateCancelled || run.EndedAt == nil {
		t.Errorf("state %s ended=%v", run.State, run.EndedAt != nil)
	}

	_, err = pool.Exec(t.Context(),
		`UPDATE validation_runs SET state = 'PREPARING', ended_at = NULL WHERE id = $1::uuid`, run.ID)
	if err == nil {
		t.Error("a cancelled run was reopened")
	}
}

// The history is evidence. Evidence that can be edited is not evidence.
func TestStore_TheTransitionHistoryIsAppendOnly(t *testing.T) {
	store, pool := storeFixture(t)
	p := goldenProfile(t)

	run, _ := store.Prepare(t.Context(), p, "", "")
	if _, err := store.RecordPreflight(t.Context(), run.ID, p,
		PreflightResult{Verdict: VerdictHealthy}, ""); err != nil {
		t.Fatalf("preflight: %v", err)
	}

	events, err := store.Events(t.Context(), run.ID)
	if err != nil {
		t.Fatalf("events: %v", err)
	}
	if len(events) < 2 {
		t.Fatalf("expected the preparation and the preflight to both be recorded, got %d", len(events))
	}
	for i, e := range events {
		if e.Seq != i+1 {
			t.Errorf("event %d has seq %d; the sequence is not contiguous", i, e.Seq)
		}
	}

	if _, err := pool.Exec(t.Context(),
		`UPDATE validation_run_events SET reason = 'something else' WHERE run_id = $1::uuid`, run.ID); err == nil {
		t.Error("a recorded transition was rewritten")
	}
	if _, err := pool.Exec(t.Context(),
		`DELETE FROM validation_run_events WHERE run_id = $1::uuid`, run.ID); err == nil {
		t.Error("a recorded transition was deleted")
	}
}

// Two runs cannot hold the Sandbox: they would spend the same rolling volume
// budget and interleave in the same nine actors' balances.
func TestStore_OnlyOneRunMayHoldTheSandbox(t *testing.T) {
	store, pool := storeFixture(t)
	p := goldenProfile(t)

	a, _ := store.Prepare(t.Context(), p, "", "a")
	if _, err := store.RecordPreflight(t.Context(), a.ID, p, PreflightResult{Verdict: VerdictHealthy}, ""); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(t.Context(),
		`UPDATE validation_runs SET state='QUEUED' WHERE id=$1::uuid`, a.ID); err != nil {
		t.Fatalf("queue the first run: %v", err)
	}

	active, err := store.ActiveRun(t.Context())
	if err != nil || active == nil {
		t.Fatalf("ActiveRun: %v %v", active, err)
	}

	b, _ := store.Prepare(t.Context(), p, "", "b")
	if _, err := store.RecordPreflight(t.Context(), b.ID, p, PreflightResult{Verdict: VerdictHealthy}, ""); err != nil {
		t.Fatal(err)
	}
	_, err = pool.Exec(t.Context(),
		`UPDATE validation_runs SET state='QUEUED' WHERE id=$1::uuid`, b.ID)
	if err == nil {
		t.Error("two runs hold the Sandbox at once")
	} else if !strings.Contains(err.Error(), "validation_runs_one_active") {
		t.Errorf("refused for the wrong reason: %v", err)
	}
}

// A Validation Run is evidence, so it cannot be deleted — not by the Studio,
// not by an operator with a psql prompt.
func TestStore_ARunCannotBeDeleted(t *testing.T) {
	store, pool := storeFixture(t)
	run, err := store.Prepare(t.Context(), goldenProfile(t), "", "")
	if err != nil {
		t.Fatalf("prepare: %v", err)
	}
	if _, err := pool.Exec(t.Context(),
		`DELETE FROM validation_runs WHERE id = $1::uuid`, run.ID); err == nil {
		t.Error("a Validation Run was deleted")
	}
}

func TestStore_AMissingRunIsNotAnEmptyRun(t *testing.T) {
	store, _ := storeFixture(t)
	_, err := store.Get(t.Context(), "00000000-0000-0000-0000-000000000000")
	if err != ErrRunNotFound {
		t.Errorf("got %v, want ErrRunNotFound", err)
	}
}
