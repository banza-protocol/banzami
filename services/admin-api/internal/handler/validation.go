package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/admin-api/internal/auth"
	"github.com/banzami/banzami/services/admin-api/internal/validation"
)

// ValidationHandler is the BANZADMIN Validation Studio control surface.
//
// It is a CONTROL plane (doc 23): it prepares, describes and cancels. It does
// not execute journeys and holds no long-running work — an admin request
// handler that runs a test suite is an admin request handler that times out
// halfway through one, leaving a run whose real state nobody knows.
//
// It also cannot START a run. That is deliberate and guarded
// (tools/check-validation-no-start.mjs), not an omission.
type ValidationHandler struct {
	reg  *validation.Registry
	pre  *validation.Preflighter
	runs *validation.Store
}

func NewValidationHandler(reg *validation.Registry, pre *validation.Preflighter, runs *validation.Store) *ValidationHandler {
	return &ValidationHandler{reg: reg, pre: pre, runs: runs}
}

// vErr uses the package's existing structured error shape, so the Studio's
// failures read exactly like every other BANZADMIN failure.
func vErr(w http.ResponseWriter, status int, code, message string) {
	writeError(w, status, code, message)
}

// unavailable answers when the Studio has no durable store. It is a 503 and not
// an empty list, because "no runs" and "cannot tell you about runs" are
// different answers and only one of them is safe to act on.
func (h *ValidationHandler) unavailable(w http.ResponseWriter) bool {
	if h.runs == nil {
		vErr(w, http.StatusServiceUnavailable, "VALIDATION_STORE_UNAVAILABLE",
			"the Validation Studio has no database connection")
		return true
	}
	return false
}

// Overview answers the one question the page exists for: can I trust the
// Sandbox right now, and is anything running?
//
// GET /admin/v1/validation/overview
func (h *ValidationHandler) Overview(w http.ResponseWriter, r *http.Request) {
	type overview struct {
		Environment     string           `json:"environment"`
		RegistryDigest  string           `json:"registry_digest"`
		Actors          int              `json:"actors"`
		Suites          int              `json:"suites"`
		Profiles        []profileSummary `json:"profiles"`
		ActiveRun       *validation.Run  `json:"active_run"`
		RecentRuns      []validation.Run `json:"recent_runs"`
		RunsEverStarted bool             `json:"runs_ever_started"`

		// The honesty numbers. A surface that listed 24 suites without saying
		// how many are executable would imply 24 things are tested.
		Coverage       validation.CoverageSummary `json:"coverage"`
		Components     []validation.Component     `json:"components"`
		BlockingIssues []validation.KnownIssue    `json:"blocking_issues"`
	}

	out := overview{
		Environment:    "SANDBOX",
		RegistryDigest: h.reg.Digest,
		Actors:         len(h.reg.Actors),
		Suites:         len(h.reg.Suites),
		Profiles:       h.profileSummaries(),
		RecentRuns:     []validation.Run{},
		// Never nil: a consumer counting them would crash on `null`.
		Components:     []validation.Component{},
		BlockingIssues: []validation.KnownIssue{},
	}

	if cov, err := h.reg.Coverage(); err == nil {
		out.Coverage = cov
	}

	// The revisions that WOULD be pinned if a run were prepared right now.
	// Live current state; the caller labels it as such.
	var collected []validation.ProvenanceRow
	if res, perr := h.pre.Run(r.Context(), ""); perr == nil {
		collected = res.Provenance
	}
	out.Components = h.reg.Components(collected)

	if _, issues, err := h.reg.Assurance(); err == nil {
		for _, i := range issues {
			if i.Status == "open" && (i.BlocksGolden || i.BlocksFull) {
				out.BlockingIssues = append(out.BlockingIssues, i)
			}
		}
	}

	if h.runs != nil {
		active, err := h.runs.ActiveRun(r.Context())
		if err != nil {
			vErr(w, http.StatusServiceUnavailable, "VALIDATION_STORE_UNAVAILABLE", err.Error())
			return
		}
		out.ActiveRun = active

		recent, err := h.runs.List(r.Context(), 10)
		if err != nil {
			vErr(w, http.StatusServiceUnavailable, "VALIDATION_STORE_UNAVAILABLE", err.Error())
			return
		}
		out.RecentRuns = recent
		for _, run := range recent {
			// A run that ever reached RUNNING or beyond was started. The
			// overview says so plainly rather than leaving a reader to infer it.
			switch run.State {
			case validation.StateRunning, validation.StateCompleted, validation.StateAbandoned:
				out.RunsEverStarted = true
			}
		}
	}

	writeJSON(w, http.StatusOK, out)
}

type profileSummary struct {
	ID                   string `json:"id"`
	Name                 string `json:"name"`
	NamePT               string `json:"name_pt"`
	Claim                string `json:"claim"`
	ClaimPT              string `json:"claim_pt,omitempty"`
	Version              int    `json:"version"`
	Digest               string `json:"digest"`
	Suites               int    `json:"suites"`
	BlockingSuites       int    `json:"blocking_suites"`
	MinimumPreflight     string `json:"minimum_preflight"`
	MaxPassWithRetry     int    `json:"max_pass_with_retry"`
	MaxCreditVolumeMinor int64  `json:"max_credit_volume_minor"`
}

func (h *ValidationHandler) profileSummaries() []profileSummary {
	out := make([]profileSummary, 0, len(h.reg.Profiles))
	for _, p := range h.reg.Profiles {
		out = append(out, profileSummary{
			ID: p.ID, Name: p.Name, NamePT: p.NamePT, Claim: p.Claim, ClaimPT: p.ClaimPT,
			Version: p.Version, Digest: p.Digest,
			Suites:               len(p.Suites),
			BlockingSuites:       len(h.reg.BlockingSuites(p)),
			MinimumPreflight:     p.Preflight.MinimumVerdict,
			MaxPassWithRetry:     p.Retry.MaxPassWithRetry,
			MaxCreditVolumeMinor: p.Budget.MaxCreditVolumeMinor,
		})
	}
	return out
}

// Actors lists the nine Validation Actors.
//
// The response carries WHICH credentials each actor holds, by name, and never
// a value nor a secret:// reference — see
// validation.TestActor_NeverCarriesACredentialValue.
//
// GET /admin/v1/validation/actors
func (h *ValidationHandler) Actors(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"environment": "SANDBOX",
		"actors":      h.reg.Actors,
	})
}

// Profiles lists the run profiles, with the suites each one covers.
//
// GET /admin/v1/validation/profiles
func (h *ValidationHandler) Profiles(w http.ResponseWriter, r *http.Request) {
	type detail struct {
		profileSummary
		SuiteIDs    []string `json:"suite_ids"`
		BlockingIDs []string `json:"blocking_ids"`
	}
	out := make([]detail, 0, len(h.reg.Profiles))
	for i, p := range h.reg.Profiles {
		out = append(out, detail{
			profileSummary: h.profileSummaries()[i],
			SuiteIDs:       p.Suites,
			BlockingIDs:    h.reg.BlockingSuites(p),
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"profiles": out, "suites": h.reg.Suites})
}

// Preflight computes a preflight and returns it WITHOUT persisting anything.
//
// It is a GET on purpose. The preflight writes no row, moves no money, sends no
// email and authenticates as nobody, so an operator can ask "is the Sandbox
// fit?" as often as they like without spending the budget the answer is about.
// Persisting a preflight happens only when one is attached to a prepared run.
//
// GET /admin/v1/validation/preflight?profile=GOLDEN
func (h *ValidationHandler) Preflight(w http.ResponseWriter, r *http.Request) {
	profileID := r.URL.Query().Get("profile")
	res, err := h.pre.Run(r.Context(), profileID)
	if err != nil {
		vErr(w, http.StatusBadRequest, "UNKNOWN_PROFILE", err.Error())
		return
	}

	body := map[string]any{"preflight": res, "persisted": false}
	if profileID != "" {
		if p, ok := h.reg.Profile(profileID); ok {
			body["meets_minimum"] = validation.MeetsMinimum(res.Verdict, p.Preflight.MinimumVerdict)
			body["minimum_required"] = p.Preflight.MinimumVerdict
		}
	}
	writeJSON(w, http.StatusOK, body)
}

// Catalogue is the validation universe: every suite, the journeys that actually
// exist for it, and how far each has got.
//
// GET /admin/v1/validation/catalogue
func (h *ValidationHandler) Catalogue(w http.ResponseWriter, r *http.Request) {
	cat, err := h.reg.Catalogue()
	if err != nil {
		vErr(w, http.StatusInternalServerError, "CATALOGUE_UNREADABLE", err.Error())
		return
	}
	cov, _ := h.reg.Coverage()
	writeJSON(w, http.StatusOK, map[string]any{"suites": cat, "coverage": cov})
}

// Journey returns one scenario in full: steps, assertions, actors, what it may
// change and what it must not.
//
// GET /admin/v1/validation/journeys/{id}
func (h *ValidationHandler) Journey(w http.ResponseWriter, r *http.Request) {
	js, err := h.reg.Journeys()
	if err != nil {
		vErr(w, http.StatusInternalServerError, "CATALOGUE_UNREADABLE", err.Error())
		return
	}
	id := chi.URLParam(r, "id")
	for _, j := range js {
		if j.ID == id {
			writeJSON(w, http.StatusOK, map[string]any{"journey": j})
			return
		}
	}
	vErr(w, http.StatusNotFound, "JOURNEY_NOT_FOUND", "no such journey: "+id)
}

// Components is the participating service map with the revisions readable now.
//
// GET /admin/v1/validation/components
func (h *ValidationHandler) Components(w http.ResponseWriter, r *http.Request) {
	var collected []validation.ProvenanceRow
	if res, err := h.pre.Run(r.Context(), ""); err == nil {
		collected = res.Provenance
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"as_of":      "current deployment",
		"components": h.reg.Components(collected),
	})
}

// Assurance is the invariant catalogue and the open validation debt.
//
// GET /admin/v1/validation/assurance
func (h *ValidationHandler) Assurance(w http.ResponseWriter, r *http.Request) {
	inv, issues, err := h.reg.Assurance()
	if err != nil {
		vErr(w, http.StatusInternalServerError, "ASSURANCE_UNREADABLE", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"invariants": inv, "known_issues": issues})
}

// ListRuns returns the most recent Validation Runs.
//
// GET /admin/v1/validation/runs
func (h *ValidationHandler) ListRuns(w http.ResponseWriter, r *http.Request) {
	if h.unavailable(w) {
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	runs, err := h.runs.List(r.Context(), limit)
	if err != nil {
		vErr(w, http.StatusServiceUnavailable, "VALIDATION_STORE_UNAVAILABLE", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"runs": runs})
}

// GetRun returns one run and its append-only transition history.
//
// GET /admin/v1/validation/runs/{id}
func (h *ValidationHandler) GetRun(w http.ResponseWriter, r *http.Request) {
	if h.unavailable(w) {
		return
	}
	// Either form of the identifier: the UUID, or the BZV- reference an operator
	// quotes in a report and therefore pastes into the address bar.
	run, err := h.runs.Get(r.Context(), chi.URLParam(r, "id"))
	if errors.Is(err, validation.ErrRunNotFound) {
		vErr(w, http.StatusNotFound, "RUN_NOT_FOUND", "no such validation run")
		return
	}
	if err != nil {
		vErr(w, http.StatusServiceUnavailable, "VALIDATION_STORE_UNAVAILABLE", err.Error())
		return
	}
	id := run.ID
	events, err := h.runs.Events(r.Context(), id)
	if err != nil {
		vErr(w, http.StatusServiceUnavailable, "VALIDATION_STORE_UNAVAILABLE", err.Error())
		return
	}
	// PINNED, not current. A run prepared against gateway 1bf03679 keeps saying
	// so after the gateway moves on; recomputing it from today's deployment
	// would silently re-describe historical evidence.
	provenance, err := h.runs.PinnedProvenance(r.Context(), id)
	if err != nil {
		vErr(w, http.StatusServiceUnavailable, "VALIDATION_STORE_UNAVAILABLE", err.Error())
		return
	}
	preflight, err := h.runs.PinnedPreflight(r.Context(), id)
	if err != nil {
		vErr(w, http.StatusServiceUnavailable, "VALIDATION_STORE_UNAVAILABLE", err.Error())
		return
	}

	// What a reader needs in order not to mistake a prepared run for an
	// executed one, stated rather than left to inference.
	writeJSON(w, http.StatusOK, map[string]any{
		"run":                 run,
		"events":              events,
		"pinned_provenance":   provenance,
		"pinned_preflight":    preflight,
		"provenance_captured": len(provenance) > 0,
		"ever_started":        run.StartedAt != nil,
		"journeys_executed":   0,
		"evidence_rows":       0,
	})
}

// PrepareRun creates a run in PREPARING, preflights it, and leaves it READY or
// BLOCKED. It does NOT start it: READY is where Phase C stops.
//
// Preparation is idempotent on the caller's key, because two operators clicking
// at once is the ordinary case and not an error.
//
// POST /admin/v1/validation/runs
func (h *ValidationHandler) PrepareRun(w http.ResponseWriter, r *http.Request) {
	if h.unavailable(w) {
		return
	}

	var in struct {
		Profile        string `json:"profile"`
		IdempotencyKey string `json:"idempotency_key"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		vErr(w, http.StatusBadRequest, "INVALID_BODY", "the request body is not JSON")
		return
	}

	profile, ok := h.reg.Profile(in.Profile)
	if !ok {
		vErr(w, http.StatusBadRequest, "UNKNOWN_PROFILE",
			"no such run profile: "+in.Profile)
		return
	}

	operator := ""
	if p, ok := auth.FromContext(r.Context()); ok {
		operator = p.ID
	}

	run, created, err := h.runs.Prepare(r.Context(), profile, operator, in.IdempotencyKey)
	if err != nil {
		vErr(w, http.StatusConflict, "PREPARE_FAILED", err.Error())
		return
	}

	// A replay returns what the first call made, untouched. Re-preflighting it
	// would mutate a settled run — and against a cancelled one would attempt an
	// illegal transition — so the second caller gets the same answer and the
	// Sandbox gets no second run.
	if !created {
		writeJSON(w, http.StatusOK, map[string]any{
			"run":     run,
			"replay":  true,
			"started": false,
			"note":    "idempotency key already used; this is the run it made",
		})
		return
	}

	// A prepared run that has not been preflighted tells an operator nothing,
	// so preparation includes it. It costs nothing to run.
	res, err := h.pre.Run(r.Context(), profile.ID)
	if err != nil {
		vErr(w, http.StatusInternalServerError, "PREFLIGHT_FAILED", err.Error())
		return
	}
	run, err = h.runs.RecordPreflight(r.Context(), run.ID, profile, res, operator)
	if err != nil {
		vErr(w, http.StatusInternalServerError, "PREFLIGHT_NOT_RECORDED", err.Error())
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"run":       run,
		"replay":    false,
		"preflight": res,
		// Said explicitly so no caller has to infer it from the state name.
		"started": false,
		"note":    "prepared and preflighted; starting a run is not implemented",
	})
}

// CancelRun closes a run. Every non-terminal state may be cancelled, because an
// operator must always be able to stop something.
//
// POST /admin/v1/validation/runs/{id}/cancel
func (h *ValidationHandler) CancelRun(w http.ResponseWriter, r *http.Request) {
	if h.unavailable(w) {
		return
	}
	var in struct {
		Reason string `json:"reason"`
	}
	_ = json.NewDecoder(r.Body).Decode(&in)
	if in.Reason == "" {
		in.Reason = "cancelled by operator"
	}

	operator := ""
	if p, ok := auth.FromContext(r.Context()); ok {
		operator = p.ID
	}

	run, err := h.runs.Cancel(r.Context(), chi.URLParam(r, "id"), in.Reason, operator)
	if errors.Is(err, validation.ErrRunNotFound) {
		vErr(w, http.StatusNotFound, "RUN_NOT_FOUND", "no such validation run")
		return
	}
	if err != nil {
		vErr(w, http.StatusConflict, "CANCEL_REFUSED", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"run": run})
}
