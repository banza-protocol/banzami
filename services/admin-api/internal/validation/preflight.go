package validation

import (
	"context"
	"fmt"
	"sort"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Preflight verdicts. The vocabulary is deliberately separate from a run's
// PASS/FAIL: an infrastructure fault must never be reported as a product
// defect, and the only way to keep that true is to never let the two share a
// word.
const (
	VerdictHealthy   = "HEALTHY"
	VerdictDegraded  = "DEGRADED"
	VerdictUnhealthy = "UNHEALTHY"
)

// Check statuses, matching the CHECK constraint on validation_preflight_checks.
const (
	StatusPass        = "PASS"
	StatusWarn        = "WARN"
	StatusFail        = "FAIL"
	StatusSkipped     = "SKIPPED"
	StatusUnavailable = "UNAVAILABLE"
)

// Check is one preflight question and its answer.
//
// Detail is written for the operator who will read it at 2am. It never contains
// a credential, a session, a key or a token — a preflight proves that a secret
// RESOLVES, it never reads one.
type Check struct {
	Group    string           `json:"group"`
	ID       string           `json:"id"`
	Status   string           `json:"status"`
	Detail   string           `json:"detail"`
	Measured map[string]int64 `json:"measured,omitempty"`
}

// PreflightResult is the whole answer to "is the Sandbox fit to be run against?".
type PreflightResult struct {
	Verdict   string    `json:"verdict"`
	ProfileID string    `json:"profile_id,omitempty"`
	Checks    []Check   `json:"checks"`
	StartedAt time.Time `json:"started_at"`
	EndedAt   time.Time `json:"ended_at"`

	// Provenance is what the run, if prepared from this preflight, will be
	// permanently attributable to. It is collected here rather than at
	// preparation so that an unresolvable component FAILS the preflight — which
	// lands the run in BLOCKED through the existing state machine, instead of
	// letting a READY run exist with incomplete evidence.
	Provenance []ProvenanceRow `json:"provenance"`
}

// Preflighter answers the question a Full Run must not start without.
//
// EVERY check here is READ-ONLY and free. It performs no authentication, sends
// no email, submits no application, moves no money and writes no row. That is
// not an implementation detail — it is the reason a preflight can be run as
// often as an operator likes without spending the very budget it is measuring.
// See TestPreflight_ConsumesNoQuota.
type Preflighter struct {
	pool *pgxpool.Pool
	reg  *Registry
	prov *ProvenanceCollector
	now  func() time.Time
}

func NewPreflighter(pool *pgxpool.Pool, reg *Registry, prov *ProvenanceCollector) *Preflighter {
	return &Preflighter{pool: pool, reg: reg, prov: prov, now: time.Now}
}

// Run executes the preflight for a profile. An unknown profile is an error, not
// a DEGRADED verdict: the caller asked about something that does not exist.
func (p *Preflighter) Run(ctx context.Context, profileID string) (PreflightResult, error) {
	started := p.now()
	res := PreflightResult{StartedAt: started, ProfileID: profileID}

	var profile Profile
	if profileID != "" {
		got, ok := p.reg.Profile(profileID)
		if !ok {
			return res, fmt.Errorf("unknown profile %q", profileID)
		}
		profile = got
		res.ProfileID = profile.ID
	}

	add := func(c Check) { res.Checks = append(res.Checks, c) }

	// ── registry ────────────────────────────────────────────────────────────
	add(Check{Group: "registry", ID: "digest", Status: StatusPass,
		Detail: "registry " + shortDigest(p.reg.Digest) + " compiled into this build"})

	provisioned := 0
	for _, a := range p.reg.Actors {
		if a.Status == "provisioned" {
			provisioned++
		}
	}
	switch {
	case len(p.reg.Actors) == 0:
		add(Check{Group: "registry", ID: "actors", Status: StatusFail,
			Detail: "the actor registry is empty"})
	case provisioned < len(p.reg.Actors):
		add(Check{Group: "registry", ID: "actors", Status: StatusFail,
			Detail: fmt.Sprintf("%d of %d actors are not provisioned",
				len(p.reg.Actors)-provisioned, len(p.reg.Actors)),
			Measured: map[string]int64{"provisioned": int64(provisioned), "total": int64(len(p.reg.Actors))}})
	default:
		add(Check{Group: "registry", ID: "actors", Status: StatusPass,
			Detail:   fmt.Sprintf("all %d Validation Actors are provisioned", provisioned),
			Measured: map[string]int64{"provisioned": int64(provisioned)}})
	}

	// ── provenance ──────────────────────────────────────────────────────────
	p.checkProvenance(ctx, add, &res)

	if p.pool == nil {
		add(Check{Group: "database", ID: "reachable", Status: StatusUnavailable,
			Detail: "the control plane has no database pool; every measured check is unavailable"})
		res.EndedAt = p.now()
		res.Verdict = verdictOf(res.Checks)
		return res, nil
	}

	// ── the actors still exist in the product ───────────────────────────────
	p.checkActorsResolve(ctx, add)

	// ── budget: the single number that decides whether the Sandbox survives ──
	p.checkVolumeHeadroom(ctx, add, profile)

	// ── the Studio's own state ──────────────────────────────────────────────
	p.checkStudioState(ctx, add)

	res.EndedAt = p.now()
	res.Verdict = verdictOf(res.Checks)
	return res, nil
}

// checkProvenance resolves every mandatory component's contemporaneous identity
// and records one check per component.
//
// A component that cannot say what revision it is makes the preflight FAIL,
// which makes the verdict UNHEALTHY, which lands the run in BLOCKED. That is
// the invariant "READY => mandatory provenance complete", enforced through the
// state machine that already exists rather than through a new one.
func (p *Preflighter) checkProvenance(ctx context.Context, add func(Check), res *PreflightResult) {
	if p.prov == nil {
		for _, c := range MandatoryComponents() {
			add(Check{Group: "provenance", ID: c, Status: StatusFail,
				Detail: "no provenance collector is configured; a prepared run would be unattributable"})
		}
		return
	}

	rows, err := p.prov.Collect(ctx)
	res.Provenance = rows

	got := map[string]ProvenanceRow{}
	for _, r := range rows {
		got[r.Component] = r
	}
	for _, name := range MandatoryComponents() {
		if r, ok := got[name]; ok {
			add(Check{Group: "provenance", ID: name, Status: StatusPass,
				Detail: "deployed revision " + r.Revision + " (" + r.Detail["source"] + ")"})
			continue
		}
		detail := "revision could not be read"
		if err != nil {
			detail = err.Error()
		}
		add(Check{Group: "provenance", ID: name, Status: StatusFail,
			Detail: detail + " — a run prepared now would be unattributable"})
	}
}

// checkActorsResolve asks whether each actor's product identity still exists.
// A registry that names a consumer the product deleted is a registry that will
// fail a run for a reason the run report cannot explain.
func (p *Preflighter) checkActorsResolve(ctx context.Context, add func(Check)) {
	// Where each kind of product id actually lives. A consumer's wallet is NOT
	// in `wallets` — that table is merchant-scoped (merchant_id, no
	// consumer_id) and consumer wallets live in `consumer_wallets`. The first
	// deployed preflight resolved both against `wallets` and reported C01-C03
	// as missing; they were not missing, the lookup was wrong. Hence the map is
	// keyed by (actor type, id kind) rather than by id kind alone.
	type target struct{ table, column string }
	lookup := map[string]map[string]target{
		"consumer": {
			"consumer_id":          {"consumers", "id"},
			"wallet_id":            {"consumer_wallets", "id"},
			"available_account_id": {"ledger_accounts", "id"},
		},
		"business": {
			"merchant_id":          {"merchants", "id"},
			"wallet_id":            {"wallets", "id"},
			"available_account_id": {"ledger_accounts", "id"},
		},
		"operator": {
			"admin_user_id": {"admin_users", "id"},
		},
		// A developer actor's ids belong to the Console's own tables, which the
		// control plane does not read. Skipped rather than guessed.
		"developer": {},
	}

	missing := []string{}
	checked := 0
	for _, a := range p.reg.Actors {
		byKind, known := lookup[a.Type]
		if !known {
			continue
		}
		keys := make([]string, 0, len(a.ProductIDs))
		for k := range a.ProductIDs {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, key := range keys {
			t, ok := byKind[key]
			if !ok {
				continue // an id this control plane has no table for
			}
			var exists bool
			err := p.pool.QueryRow(ctx,
				fmt.Sprintf(`SELECT EXISTS (SELECT 1 FROM %s WHERE %s = $1::uuid)`, t.table, t.column),
				a.ProductIDs[key]).Scan(&exists)
			if err != nil {
				add(Check{Group: "actors", ID: "resolve", Status: StatusUnavailable,
					Detail: fmt.Sprintf("could not read %s: %v", t.table, err)})
				return
			}
			checked++
			if !exists {
				missing = append(missing, a.ID+"."+key)
			}
		}
	}

	if len(missing) > 0 {
		add(Check{Group: "actors", ID: "resolve", Status: StatusFail,
			Detail:   "product identities the registry names no longer exist: " + join(missing),
			Measured: map[string]int64{"checked": int64(checked), "missing": int64(len(missing))}})
	} else {
		add(Check{Group: "actors", ID: "resolve", Status: StatusPass,
			Detail:   fmt.Sprintf("%d actor product identities resolve", checked),
			Measured: map[string]int64{"checked": int64(checked)}})
	}

	// The operator actor is special: CanHoldSession(status) == (status ==
	// "ACTIVE"), so a suspended A01 cannot approve anything a run needs.
	a01, ok := p.reg.Actor("A01")
	if !ok || a01.ProductIDs["admin_user_id"] == "" {
		add(Check{Group: "actors", ID: "operator_session", Status: StatusSkipped,
			Detail: "no operator actor is registered"})
		return
	}
	var status string
	err := p.pool.QueryRow(ctx, `SELECT status FROM admin_users WHERE id = $1::uuid`,
		a01.ProductIDs["admin_user_id"]).Scan(&status)
	switch {
	case err != nil:
		add(Check{Group: "actors", ID: "operator_session", Status: StatusUnavailable,
			Detail: fmt.Sprintf("could not read the operator actor: %v", err)})
	case status != "ACTIVE":
		add(Check{Group: "actors", ID: "operator_session", Status: StatusFail,
			Detail: "operator actor A01 is " + status + " and cannot hold a session"})
	default:
		add(Check{Group: "actors", ID: "operator_session", Status: StatusPass,
			Detail: "operator actor A01 is ACTIVE"})
	}
}

// checkVolumeHeadroom compares what the profile may spend against what the
// rolling windows still allow. Both the windows and the definition of merchant
// credit volume are extracted from core/compliance (pilot_gen.go), never
// restated here: a preflight that measured headroom differently from the engine
// that enforces it would clear a run the ledger then refuses halfway through.
func (p *Preflighter) checkVolumeHeadroom(ctx context.Context, add func(Check), profile Profile) {
	read := func(window string) (int64, error) {
		var used int64
		err := p.pool.QueryRow(ctx, QueryGlobalRollingVolume, window).Scan(&used)
		return used, err
	}

	for _, w := range []struct {
		id     string
		window string
		limit  int64
	}{
		{"global_24h", "24 hours", GlobalRolling24hMinor},
		{"global_30d", "30 days", GlobalRolling30dMinor},
	} {
		used, err := read(w.window)
		if err != nil {
			add(Check{Group: "budget", ID: w.id, Status: StatusUnavailable,
				Detail: fmt.Sprintf("could not measure the %s window: %v", w.window, err)})
			continue
		}
		headroom := w.limit - used
		measured := map[string]int64{"used_minor": used, "limit_minor": w.limit, "headroom_minor": headroom}

		need := int64(0)
		if profile.ID != "" {
			need = profile.Budget.MaxCreditVolumeMinor
			measured["profile_ceiling_minor"] = need
		}

		switch {
		case headroom <= 0:
			add(Check{Group: "budget", ID: w.id, Status: StatusFail, Measured: measured,
				Detail: fmt.Sprintf("the %s merchant-credit window is exhausted (%d of %d minor used)",
					w.window, used, w.limit)})
		case need > 0 && headroom < need:
			add(Check{Group: "budget", ID: w.id, Status: StatusFail, Measured: measured,
				Detail: fmt.Sprintf("profile %s may spend %d minor but only %d remains in the %s window",
					profile.ID, need, headroom, w.window)})
		case headroom*4 < w.limit: // under a quarter left
			add(Check{Group: "budget", ID: w.id, Status: StatusWarn, Measured: measured,
				Detail: fmt.Sprintf("the %s window is %d%% consumed", w.window, 100*used/w.limit)})
		default:
			add(Check{Group: "budget", ID: w.id, Status: StatusPass, Measured: measured,
				Detail: fmt.Sprintf("%d minor of headroom in the %s window", headroom, w.window)})
		}
	}

	// Per-merchant windows. A run spends against the actor it uses, and the
	// narrowest window is the one that actually stops it.
	worst := int64(-1)
	worstActor := ""
	for _, a := range p.reg.Actors {
		acct := a.ProductIDs["available_account_id"]
		if a.Type != "business" || acct == "" {
			continue
		}
		var used int64
		if err := p.pool.QueryRow(ctx, QueryMerchantRollingVolume, acct, "24 hours").Scan(&used); err != nil {
			add(Check{Group: "budget", ID: "merchant_24h", Status: StatusUnavailable,
				Detail: fmt.Sprintf("could not measure %s: %v", a.ID, err)})
			return
		}
		headroom := MerchantRolling24hMinor - used
		if worst < 0 || headroom < worst {
			worst, worstActor = headroom, a.ID
		}
	}
	switch {
	case worst < 0:
		add(Check{Group: "budget", ID: "merchant_24h", Status: StatusSkipped,
			Detail: "no business actor carries an available account"})
	case worst <= 0:
		add(Check{Group: "budget", ID: "merchant_24h", Status: StatusFail,
			Detail:   "merchant actor " + worstActor + " has exhausted its 24h credit window",
			Measured: map[string]int64{"headroom_minor": worst}})
	default:
		add(Check{Group: "budget", ID: "merchant_24h", Status: StatusPass,
			Detail:   fmt.Sprintf("tightest merchant actor is %s with %d minor of headroom", worstActor, worst),
			Measured: map[string]int64{"headroom_minor": worst}})
	}
}

// checkStudioState asks whether the Studio itself is in a state that permits a
// new run: its schema is present, and nothing already holds the Sandbox.
func (p *Preflighter) checkStudioState(ctx context.Context, add func(Check)) {
	var active int
	err := p.pool.QueryRow(ctx,
		`SELECT count(*) FROM validation_runs WHERE state IN ('QUEUED','RUNNING')`).Scan(&active)
	if err != nil {
		add(Check{Group: "studio", ID: "schema", Status: StatusUnavailable,
			Detail: "the Validation Studio schema is not present (migration 0160): " + err.Error()})
		return
	}
	add(Check{Group: "studio", ID: "schema", Status: StatusPass,
		Detail: "the Validation Run schema is present"})

	if active > 0 {
		add(Check{Group: "studio", ID: "no_active_run", Status: StatusFail,
			Detail:   "a Validation Run already holds the Sandbox",
			Measured: map[string]int64{"active": int64(active)}})
		return
	}
	add(Check{Group: "studio", ID: "no_active_run", Status: StatusPass,
		Detail: "no Validation Run is holding the Sandbox"})
}

// verdictOf collapses the checks into one word.
//
// Any FAIL is UNHEALTHY: the lab is not fit and a run started here would report
// infrastructure faults as product defects. Any WARN or UNAVAILABLE is
// DEGRADED — not healthy, but a FULL run is allowed to proceed and find out
// what a degraded Sandbox does. Everything else is HEALTHY.
func verdictOf(checks []Check) string {
	verdict := VerdictHealthy
	for _, c := range checks {
		switch c.Status {
		case StatusFail:
			return VerdictUnhealthy
		case StatusWarn, StatusUnavailable:
			verdict = VerdictDegraded
		}
	}
	return verdict
}

// MeetsMinimum reports whether a verdict satisfies a profile's requirement.
// HEALTHY satisfies everything; DEGRADED satisfies only DEGRADED; UNHEALTHY
// satisfies nothing, ever, for any profile.
func MeetsMinimum(verdict, minimum string) bool {
	if verdict == VerdictUnhealthy {
		return false
	}
	if minimum == VerdictHealthy {
		return verdict == VerdictHealthy
	}
	return true
}

func shortDigest(d string) string {
	if len(d) > 12 {
		return d[:12] + "…"
	}
	return d
}

func join(xs []string) string {
	out := ""
	for i, x := range xs {
		if i > 0 {
			out += ", "
		}
		out += x
	}
	return out
}
