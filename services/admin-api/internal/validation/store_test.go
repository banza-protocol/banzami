package validation

import (
	"context"
	"encoding/json"
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

// fullProvenance is the mandatory set, resolved. A preflight that carries it may
// produce a READY run; one that does not, may not.
func fullProvenance() []ProvenanceRow {
	rows := []ProvenanceRow{}
	for _, c := range MandatoryComponents() {
		rows = append(rows, ProvenanceRow{
			Component: c,
			Revision:  "rev-" + c,
			Detail:    map[string]string{"source": "test"},
		})
	}
	return rows
}

func healthyPreflight() PreflightResult {
	return PreflightResult{Verdict: VerdictHealthy, Provenance: fullProvenance()}
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
	run, _, err := store.Prepare(t.Context(), goldenProfile(t), "", "")
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

	first, firstCreated, err := store.Prepare(t.Context(), p, "", "owner-key-1")
	if err != nil {
		t.Fatalf("first: %v", err)
	}
	second, secondCreated, err := store.Prepare(t.Context(), p, "", "owner-key-1")
	if err != nil {
		t.Fatalf("second: %v", err)
	}
	if first.ID != second.ID {
		t.Errorf("the same key produced two runs: %s and %s", first.RunRef, second.RunRef)
	}
	// The caller must be able to tell a replay from a creation, because a
	// replay must not be preflighted again.
	if !firstCreated {
		t.Error("the first call did not report that it created the run")
	}
	if secondCreated {
		t.Error("a replay reported itself as a creation; the caller would re-preflight a settled run")
	}

	other, _, err := store.Prepare(t.Context(), p, "", "owner-key-2")
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

	run, _, err := store.Prepare(t.Context(), p, "", "")
	if err != nil {
		t.Fatalf("prepare: %v", err)
	}
	run, err = store.RecordPreflight(t.Context(), run.ID, p, PreflightResult{
		Verdict: VerdictUnhealthy,
		Checks: []Check{
			{Group: "budget", ID: "global_24h", Status: StatusFail,
				Detail: "the window is exhausted", Measured: map[string]int64{"headroom_minor": 0}},
		},
		Provenance: fullProvenance(),
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

	run, _, _ := store.Prepare(t.Context(), p, "", "")
	run, err := store.RecordPreflight(t.Context(), run.ID, p,
		healthyPreflight(), "")
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

	r1, _, _ := store.Prepare(t.Context(), full, "", "full-1")
	r1, err := store.RecordPreflight(t.Context(), r1.ID, full, PreflightResult{Verdict: VerdictDegraded, Provenance: fullProvenance()}, "")
	if err != nil {
		t.Fatalf("full: %v", err)
	}
	if r1.State != StateReady {
		t.Errorf("FULL on a DEGRADED lab is %s, want READY", r1.State)
	}

	r2, _, _ := store.Prepare(t.Context(), golden, "", "golden-1")
	r2, err = store.RecordPreflight(t.Context(), r2.ID, golden, PreflightResult{Verdict: VerdictDegraded, Provenance: fullProvenance()}, "")
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

	run, _, _ := store.Prepare(t.Context(), p, "", "")
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

	run, _, _ := store.Prepare(t.Context(), p, "", "")
	if _, err := store.RecordPreflight(t.Context(), run.ID, p,
		healthyPreflight(), ""); err != nil {
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

	a, _, _ := store.Prepare(t.Context(), p, "", "a")
	if _, err := store.RecordPreflight(t.Context(), a.ID, p, healthyPreflight(), ""); err != nil {
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

	b, _, _ := store.Prepare(t.Context(), p, "", "b")
	if _, err := store.RecordPreflight(t.Context(), b.ID, p, healthyPreflight(), ""); err != nil {
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
	run, _, err := store.Prepare(t.Context(), goldenProfile(t), "", "")
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

// ── C10: evidence integrity ─────────────────────────────────────────────────

// A persisted check must carry the material state its verdict was taken from.
// Storing status and detail while dropping `measured` leaves a claim without
// its evidence — which is the defect the first real prepared run exposed.
func TestStore_PreflightMeasurementsSurvivePersistence(t *testing.T) {
	store, pool := storeFixture(t)
	p := goldenProfile(t)

	runtime := PreflightResult{
		Verdict:    VerdictHealthy,
		Provenance: fullProvenance(),
		Checks: []Check{
			{Group: "budget", ID: "global_24h", Status: StatusPass, Detail: "headroom",
				Measured: map[string]int64{
					"used_minor": 1070120, "limit_minor": 50000000,
					"headroom_minor": 48929880, "profile_ceiling_minor": 5000000,
				}},
			{Group: "budget", ID: "merchant_24h", Status: StatusPass, Detail: "tightest actor",
				Measured: map[string]int64{"headroom_minor": 25000000}},
			{Group: "registry", ID: "digest", Status: StatusPass, Detail: "no numbers here"},
		},
	}

	run, _, _ := store.Prepare(t.Context(), p, "", "")
	if _, err := store.RecordPreflight(t.Context(), run.ID, p, runtime, ""); err != nil {
		t.Fatalf("record preflight: %v", err)
	}

	for _, c := range runtime.Checks {
		var raw []byte
		if err := pool.QueryRow(t.Context(),
			`SELECT measured FROM validation_preflight_checks WHERE check_group=$1 AND check_id=$2`,
			c.Group, c.ID).Scan(&raw); err != nil {
			t.Fatalf("read %s/%s: %v", c.Group, c.ID, err)
		}
		var got map[string]int64
		if err := json.Unmarshal(raw, &got); err != nil {
			t.Fatalf("%s/%s measured is not the runtime shape: %v", c.Group, c.ID, err)
		}
		want := c.Measured
		if want == nil {
			want = map[string]int64{}
		}
		if len(got) != len(want) {
			t.Errorf("%s/%s persisted %d measurements, runtime had %d", c.Group, c.ID, len(got), len(want))
		}
		for k, v := range want {
			if got[k] != v {
				// The persisted snapshot disagreeing with the runtime result is
				// the one outcome that would make stored evidence misleading.
				t.Errorf("%s/%s measured[%s] = %d persisted, %d at runtime", c.Group, c.ID, k, got[k], v)
			}
		}
	}
}

// A FAIL keeps its numbers too: the reason a run was blocked is exactly the
// thing a later reader needs.
func TestStore_ABlockingCheckKeepsItsMeasurements(t *testing.T) {
	store, pool := storeFixture(t)
	p := goldenProfile(t)
	run, _, _ := store.Prepare(t.Context(), p, "", "")
	if _, err := store.RecordPreflight(t.Context(), run.ID, p, PreflightResult{
		Verdict:    VerdictUnhealthy,
		Provenance: fullProvenance(),
		Checks: []Check{{Group: "budget", ID: "global_24h", Status: StatusFail,
			Detail: "exhausted", Measured: map[string]int64{"headroom_minor": 0, "limit_minor": 50000000}}},
	}, ""); err != nil {
		t.Fatalf("record: %v", err)
	}
	var raw []byte
	if err := pool.QueryRow(t.Context(),
		`SELECT measured FROM validation_preflight_checks WHERE status='FAIL'`).Scan(&raw); err != nil {
		t.Fatal(err)
	}
	var got map[string]int64
	_ = json.Unmarshal(raw, &got)
	if got["limit_minor"] != 50000000 {
		t.Errorf("a blocking check lost its measurements: %v", got)
	}
}

// Preparation captures provenance, and it does so before READY.
func TestStore_PreparationCapturesMandatoryProvenance(t *testing.T) {
	store, pool := storeFixture(t)
	p := goldenProfile(t)

	run, _, _ := store.Prepare(t.Context(), p, "", "")
	run, err := store.RecordPreflight(t.Context(), run.ID, p, healthyPreflight(), "")
	if err != nil {
		t.Fatalf("record: %v", err)
	}
	if run.State != StateReady {
		t.Fatalf("state %s", run.State)
	}

	rows, err := pool.Query(t.Context(),
		`SELECT component, revision FROM validation_run_provenance WHERE run_id=$1::uuid ORDER BY component`, run.ID)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	got := map[string]string{}
	for rows.Next() {
		var c, r string
		if err := rows.Scan(&c, &r); err != nil {
			t.Fatal(err)
		}
		got[c] = r
	}
	for _, want := range MandatoryComponents() {
		if got[want] == "" {
			t.Errorf("a READY run has no provenance for %s", want)
		}
		if got[want] == "unknown" {
			t.Errorf("%s was recorded as \"unknown\"", want)
		}
	}
	// The profile and registry bindings stay pinned on the run itself.
	if run.ProfileDigest != p.Digest || run.ProfileVersion != p.Version {
		t.Error("the run stopped pinning its profile")
	}
}

// The invariant, end to end: a run cannot reach READY without complete
// provenance, and the failure leaves no half-prepared state behind.
func TestStore_ReadyIsImpossibleWithoutCompleteProvenance(t *testing.T) {
	store, pool := storeFixture(t)
	p := goldenProfile(t)

	run, _, _ := store.Prepare(t.Context(), p, "", "")

	// Drop one mandatory component — a controlled provenance failure.
	partial := fullProvenance()[1:]
	_, err := store.RecordPreflight(t.Context(), run.ID, p,
		PreflightResult{Verdict: VerdictHealthy, Provenance: partial}, "")
	if err == nil {
		t.Fatal("a run reached READY with incomplete provenance")
	}
	if !strings.Contains(err.Error(), "provenance") {
		t.Errorf("refused for the wrong reason: %v", err)
	}

	// Transactionality: the whole preparation rolled back. The run is still
	// PREPARING, and nothing partial was left behind.
	after, err := store.Get(t.Context(), run.ID)
	if err != nil {
		t.Fatal(err)
	}
	if after.State != StatePreparing {
		t.Errorf("state %s after a failed preparation; want %s", after.State, StatePreparing)
	}
	for _, q := range []struct{ what, sql string }{
		{"provenance rows", `SELECT count(*) FROM validation_run_provenance`},
		{"preflight rows", `SELECT count(*) FROM validation_preflights`},
		{"preflight checks", `SELECT count(*) FROM validation_preflight_checks`},
	} {
		var n int
		if err := pool.QueryRow(t.Context(), q.sql).Scan(&n); err != nil {
			t.Fatal(err)
		}
		if n != 0 {
			t.Errorf("%d %s survived a rolled-back preparation", n, q.what)
		}
	}
}

// Provenance is evidence: it cannot be rewritten, and cancelling a run does not
// remove it.
func TestStore_ProvenanceIsImmutableAndSurvivesCancellation(t *testing.T) {
	store, pool := storeFixture(t)
	p := goldenProfile(t)

	run, _, _ := store.Prepare(t.Context(), p, "", "")
	run, _ = store.RecordPreflight(t.Context(), run.ID, p, healthyPreflight(), "")

	var before int
	_ = pool.QueryRow(t.Context(), `SELECT count(*) FROM validation_run_provenance`).Scan(&before)

	if _, err := store.Cancel(t.Context(), run.ID, "phase c proof", ""); err != nil {
		t.Fatalf("cancel: %v", err)
	}

	var after int
	_ = pool.QueryRow(t.Context(), `SELECT count(*) FROM validation_run_provenance`).Scan(&after)
	if after != before || after == 0 {
		t.Errorf("provenance rows went from %d to %d across cancellation", before, after)
	}

	// A run cannot be deleted, so its provenance cannot be dropped that way
	// either — the non-cascading event FK refuses first.
	if _, err := pool.Exec(t.Context(),
		`DELETE FROM validation_runs WHERE id=$1::uuid`, run.ID); err == nil {
		t.Error("a run with provenance was deleted")
	}
}

// BZV-20260918-0001 is what an operator quotes in a report, so it is what they
// paste into the address bar. Accepting only the UUID made the citable form of
// the identifier the one the product refused.
func TestStore_ARunIsAddressableByItsQuotableReference(t *testing.T) {
	store, _ := storeFixture(t)
	p := goldenProfile(t)

	run, _, err := store.Prepare(t.Context(), p, "", "")
	if err != nil {
		t.Fatal(err)
	}

	byRef, err := store.Get(t.Context(), run.RunRef)
	if err != nil {
		t.Fatalf("Get by run_ref %q: %v", run.RunRef, err)
	}
	if byRef.ID != run.ID {
		t.Errorf("run_ref resolved to %s, want %s", byRef.ID, run.ID)
	}

	byID, err := store.Get(t.Context(), run.ID)
	if err != nil {
		t.Fatalf("Get by id: %v", err)
	}
	if byID.RunRef != run.RunRef {
		t.Error("the two forms of the identifier resolve to different runs")
	}

	// An unknown identifier is NOT FOUND, in either shape. It is not a database
	// failure, and reporting it as one sends an operator to look at the wrong
	// thing entirely.
	for _, unknown := range []string{"BZV-19700101-9999", "00000000-0000-0000-0000-000000000000", "not-an-id"} {
		if _, err := store.Get(t.Context(), unknown); err != ErrRunNotFound {
			t.Errorf("Get(%q) = %v, want ErrRunNotFound", unknown, err)
		}
	}

	// And cancellation accepts the same reference the URL does.
	cancelled, err := store.Cancel(t.Context(), run.RunRef, "by reference", "")
	if err != nil {
		t.Fatalf("Cancel by run_ref: %v", err)
	}
	if cancelled.State != StateCancelled {
		t.Errorf("state %s after cancelling by reference", cancelled.State)
	}
}
