package validation

import (
	"context"
	"fmt"
	"sort"
	"time"
)

// Workspace capacity — two resources, per actor, neither of which existed as a
// gate when BZV-20260921-0001 was abandoned against one of them.
//
// A Developer workspace is limited PER ACTOR in two independent ways, and using
// one formula for both is the defect this file exists to prevent:
//
//	ACTIVE        concurrency. Archiving frees it.
//	24H CREATION  cumulative over a sliding window. Archiving frees NOTHING —
//	              a slot returns only when its creation ages out.
//
// The PLAN half (what a run will create, and whose) is derived once, from the
// harness sources, by tools/lib/validation-workspace-capacity.mjs, and compiled
// into registry_gen.go. Nothing here re-derives it: two answers to "what will
// this cost" is two chances to disagree, which the application-submit
// classifier already demonstrated.
//
// What happens here is the LIVE reading and the arithmetic — the same division
// of labour the aggregate-funds check already uses.

// WorkspaceActorPlan is one actor's share of a profile's workspace consumption.
type WorkspaceActorPlan struct {
	// Empty for an ephemeral identity the run mints at execution time. Such an
	// actor has spent nothing BY DERIVATION — from a successful reading that
	// returned no row, never from an unavailable measurement read as zero.
	Actor string
	Kind  string // SHARED | EPHEMERAL

	Planned             int // every creation; the rolling window keeps all of them
	ConcurrentBarrier   int // most held at once when each journey is proven clean first
	ConcurrentNoBarrier int // …and when a journey may leave its workspaces behind

}

// reserveFor applies the DECLARED reserve model. An unimplemented model is not
// a reserve of zero — it is an unknown, and the caller refuses on it.
func reserveFor(profileID string, need int) (int, bool) {
	switch WorkspaceReserveModel[profileID] {
	case "one_full_retry":
		// One whole plan's worth for each permitted retry, on top of what this
		// run spends, because a failed run does not give its consumption back
		// inside the window.
		return WorkspacePermittedRetries[profileID] * need, true
	default:
		return 0, false
	}
}

// WorkspaceActorCapacity is one actor's answer for one resource.
type WorkspaceActorCapacity struct {
	Actor    string `json:"actor"`
	Kind     string `json:"kind"`
	Used     int    `json:"used"`
	Limit    int    `json:"limit"`
	Free     int    `json:"free"`
	Planned  int    `json:"planned"`
	Reserve  int    `json:"retry_reserve"`
	Required int    `json:"required"`
	OK       bool   `json:"ok"`

	// NextUsefulExpiry is when enough creations age out for this actor to fit,
	// assuming nothing else is created. A FORECAST, never an authorisation: the
	// window slides, and the number that governs is the one read at the gate.
	NextUsefulExpiry *time.Time `json:"next_useful_expiry,omitempty"`
}

// WorkspaceCapacity is the whole answer for one resource family.
type WorkspaceCapacity struct {
	Family string                   `json:"family"`
	OK     bool                     `json:"ok"`
	Reason string                   `json:"reason,omitempty"`
	Detail string                   `json:"detail"`
	Actors []WorkspaceActorCapacity `json:"actors"`
}

const (
	FamilyWorkspaceActive   = "WORKSPACE_ACTIVE_CAPACITY"
	FamilyWorkspaceCreation = "WORKSPACE_24H_CREATION_CAPACITY"

	// ReasonUnknownCapacity is used wherever a measurement did not happen. An
	// unreadable quota and an empty one are different claims, and only one of
	// them may authorise a run.
	ReasonUnknownCapacity = "UNKNOWN_CAPACITY"
	ReasonInsufficient    = "INSUFFICIENT_CAPACITY"
)

type workspaceUsage struct {
	active    int
	created   int
	creations []time.Time
}

// readWorkspaceUsage asks the limiter's own question
// (developer.dev_workspaces, filtered exactly as WorkspaceCreationCounts does).
// Note what `created` does NOT filter on: status. Archiving changes status and
// leaves created_at where it was, which is the whole reason these are two
// resources.
func (p *Preflighter) readWorkspaceUsage(ctx context.Context) (map[string]workspaceUsage, error) {
	rows, err := p.pool.Query(ctx, fmt.Sprintf(`
		SELECT created_by::text,
		       count(*) FILTER (WHERE status = 'ACTIVE'),
		       count(*) FILTER (WHERE created_at >= now() - interval '%d hours'),
		       coalesce(array_agg(created_at ORDER BY created_at)
		                FILTER (WHERE created_at >= now() - interval '%d hours'),
		                ARRAY[]::timestamptz[])
		  FROM developer.dev_workspaces
		 GROUP BY created_by`, WorkspaceWindowHours, WorkspaceWindowHours))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]workspaceUsage{}
	for rows.Next() {
		var actor string
		var u workspaceUsage
		if err := rows.Scan(&actor, &u.active, &u.created, &u.creations); err != nil {
			return nil, err
		}
		out[actor] = u
	}
	return out, rows.Err()
}

// WorkspaceCapacities answers both families for a profile, from live state.
//
// An error is never converted into a zero: the caller receives families marked
// UNKNOWN_CAPACITY, which refuse.
func (p *Preflighter) WorkspaceCapacities(ctx context.Context, profileID string) []WorkspaceCapacity {
	plan, ok := WorkspacePlan[profileID]
	if !ok {
		return unknownFamilies("this build carries no derived workspace plan for " + profileID)
	}
	if p.pool == nil {
		return unknownFamilies("the control plane has no database pool")
	}
	usage, err := p.readWorkspaceUsage(ctx)
	if err != nil {
		return unknownFamilies("workspace usage is unreadable: " + err.Error())
	}

	// Which concurrency bound applies is a property of the EXECUTOR, never of
	// the numbers. Without the cleanup barrier a journey may leave its
	// workspaces behind, so the bound becomes the sum.
	barrier := p.cleanupBarrierArmed(ctx)

	active := WorkspaceCapacity{Family: FamilyWorkspaceActive, OK: true}
	creation := WorkspaceCapacity{Family: FamilyWorkspaceCreation, OK: true}

	for _, row := range plan {
		u, seen := usage[row.Actor]
		if row.Kind == "EPHEMERAL" {
			// Derived, not defaulted: the run mints this identity, so nothing
			// can have been spent under it.
			u, seen = workspaceUsage{}, true
		}
		if !seen {
			// An actor the database has never seen has spent nothing — and this
			// IS a successful reading that returned no row, which is why it is
			// allowed to be zero here and nowhere else.
			u, seen = workspaceUsage{}, true
		}

		concurrent := row.ConcurrentBarrier
		if !barrier {
			concurrent = row.ConcurrentNoBarrier
		}
		reserveConcurrent, okC := reserveFor(profileID, concurrent)
		reservePlanned, okP := reserveFor(profileID, row.Planned)
		if !okC || !okP {
			return unknownFamilies(fmt.Sprintf(
				"profile %s declares reserve model %q, which this build does not implement",
				profileID, WorkspaceReserveModel[profileID]))
		}

		active.Actors = append(active.Actors, actorCapacity(
			row, u.active, WorkspaceActiveLimit, concurrent, reserveConcurrent, nil))
		creation.Actors = append(creation.Actors, actorCapacity(
			row, u.created, WorkspaceCreationLimit24h, row.Planned, reservePlanned, u.creations))
	}

	finish(&active)
	finish(&creation)
	return []WorkspaceCapacity{active, creation}
}

func actorCapacity(row WorkspaceActorPlan, used, limit, need, reserve int, creations []time.Time) WorkspaceActorCapacity {
	free := limit - used
	if free < 0 {
		free = 0
	}
	required := need + reserve
	c := WorkspaceActorCapacity{
		Actor: row.Actor, Kind: row.Kind, Used: used, Limit: limit, Free: free,
		Planned: need, Reserve: reserve, Required: required, OK: free >= required,
	}
	if !c.OK && len(creations) > 0 {
		// The instant the Nth slot returns, where N is what is missing. Naming
		// the FIRST expiry would promise capacity that the first slot alone
		// does not provide.
		missing := required - free
		if missing <= len(creations) {
			sort.Slice(creations, func(i, j int) bool { return creations[i].Before(creations[j]) })
			at := creations[missing-1].Add(time.Duration(WorkspaceWindowHours) * time.Hour)
			c.NextUsefulExpiry = &at
		}
	}
	return c
}

func finish(c *WorkspaceCapacity) {
	var blocked []string
	for _, a := range c.Actors {
		if !a.OK {
			c.OK = false
			blocked = append(blocked, fmt.Sprintf("%s free %d < required %d (%d planned + %d retry)",
				shortActor(a), a.Free, a.Required, a.Planned, a.Reserve))
		}
	}
	if len(blocked) > 0 {
		c.Reason = ReasonInsufficient
		c.Detail = joinDetail(blocked)
		return
	}
	var oks []string
	for _, a := range c.Actors {
		oks = append(oks, fmt.Sprintf("%s %d free >= %d required", shortActor(a), a.Free, a.Required))
	}
	c.Detail = joinDetail(oks)
	if c.Detail == "" {
		c.Detail = "no actor consumes this resource"
	}
}

func unknownFamilies(detail string) []WorkspaceCapacity {
	return []WorkspaceCapacity{
		{Family: FamilyWorkspaceActive, OK: false, Reason: ReasonUnknownCapacity, Detail: detail},
		{Family: FamilyWorkspaceCreation, OK: false, Reason: ReasonUnknownCapacity, Detail: detail},
	}
}

func shortActor(a WorkspaceActorCapacity) string {
	if a.Kind == "EPHEMERAL" || a.Actor == "" {
		return "ephemeral"
	}
	if len(a.Actor) > 8 {
		return a.Actor[:8] + "…"
	}
	return a.Actor
}

func joinDetail(xs []string) string {
	out := ""
	for i, x := range xs {
		if i > 0 {
			out += " | "
		}
		out += x
	}
	return out
}

// cleanupBarrierArmed reports whether migration 0161 is applied, which is what
// makes the per-journey concurrency bound legitimate. Unreadable is treated as
// NOT armed: the larger bound is the safe one.
func (p *Preflighter) cleanupBarrierArmed(ctx context.Context) bool {
	var n int
	err := p.pool.QueryRow(ctx, `
		SELECT count(*) FROM information_schema.columns
		 WHERE table_name = 'validation_run_journeys'
		   AND column_name IN ('functional_result','cleanup_result','cleanup_detail')`).Scan(&n)
	return err == nil && n == 3
}
