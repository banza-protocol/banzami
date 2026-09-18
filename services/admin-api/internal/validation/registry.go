// Package validation is the Banzami Validation Studio's control plane.
//
// It is the CONTROL plane, not the execution plane (doc 23). It knows what a
// Validation Run is, which actors and profiles exist, and whether the Sandbox
// is fit to be run against. It does not execute journeys, does not drive
// browsers, and does not hold long-running work: an admin request handler that
// runs a test suite is an admin request handler that times out halfway through
// one.
//
// SECRETS. The Studio never holds a password, PIN, TOTP seed, recovery code,
// session cookie, API key or invite token — not in the database, not in a DTO,
// not in a log line. The registry records which credentials an actor HAS, by
// name, because an operator needs to know that A01 has a TOTP seed registered.
// It never records, resolves or serves what any of them are. See
// TestActor_NeverCarriesACredentialValue.
package validation

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"sync"
)

// Actor is a Validation Actor as the control plane knows it.
type Actor struct {
	ID            string            `json:"id"`
	Type          string            `json:"type"`
	DisplayName   string            `json:"display_name"`
	Handle        string            `json:"handle,omitempty"`
	Email         string            `json:"email,omitempty"`
	Status        string            `json:"status"`
	Lifecycle     string            `json:"lifecycle,omitempty"`
	Purpose       string            `json:"purpose,omitempty"`
	ProvisionedAt string            `json:"provisioned_at,omitempty"`
	ProductIDs    map[string]string `json:"product_ids,omitempty"`

	// CredentialNames says WHICH credentials this actor holds — "pin",
	// "totp_seed" — and nothing else. Not the value, and not the secret://
	// reference either: the reference identifies a secret, and identifying a
	// secret in an API response is a service an operator never needs.
	CredentialNames []string `json:"credential_names"`
}

// Suite is a validation suite. Suites are defined once, in suites.yaml.
type Suite struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	NamePT   string `json:"name_pt"`
	Scope    string `json:"scope,omitempty"`
	Coverage string `json:"existing_coverage,omitempty"`
	Blocking bool   `json:"blocking"`

	// A suite with no executable journey. Carried through to the operator
	// surface deliberately: the Studio must be able to show WHY a suite cannot
	// be proven, in the operator's own language, without anyone reading the
	// registry. Empty means EXECUTABLE.
	RuntimeProof string        `json:"runtime_proof,omitempty"`
	Blocker      *SuiteBlocker `json:"blocker,omitempty"`
}

// SuiteBlocker is why a suite cannot be proven at runtime, and what would
// change that. Never a bare status: an unexplained gap is not a justification.
type SuiteBlocker struct {
	Class       string `json:"class"`
	Detail      string `json:"detail"`
	DetailPT    string `json:"detail_pt"`
	PathToProof string `json:"path_to_proof"`
}

// NotProven reports whether this suite has no runtime proof.
func (s Suite) NotProven() bool { return s.RuntimeProof == "NOT_PROVEN" }

// Profile is a run profile: what a run claims if it passes, and what it may spend.
type Profile struct {
	ID      string `json:"id"`
	Version int    `json:"version"`
	Name    string `json:"name"`
	NamePT  string `json:"name_pt"`
	Claim   string `json:"claim"`
	// ClaimPT is what BANZADMIN renders; Claim stays canonical, the way
	// suites.yaml already carries both name and name_pt.
	ClaimPT          string   `json:"claim_pt,omitempty"`
	Suites           []string `json:"suites"`
	EscalateBlocking []string `json:"escalate_blocking"`

	Preflight struct {
		MinimumVerdict string `json:"minimum_verdict"`
	} `json:"preflight"`

	Retry struct {
		InfrastructureRetries int `json:"infrastructure_retries"`
		MaxPassWithRetry      int `json:"max_pass_with_retry"`
	} `json:"retry"`

	Budget struct {
		MaxCreditVolumeMinor int64 `json:"max_credit_volume_minor"`
		MaxApplications      int   `json:"max_applications"`
		MaxFixtureEmails     int   `json:"max_fixture_emails"`
	} `json:"budget"`

	Evidence struct {
		RequiredForPass []string `json:"required_for_pass"`
	} `json:"evidence"`

	// Digest is the sha256 of this profile alone, so a run that pinned GOLDEN
	// is unaffected by a later edit to FULL.
	Digest string `json:"digest"`
}

// Registry is the compiled-in registry for this build.
type Registry struct {
	Digest   string
	Actors   []Actor
	Suites   []Suite
	Profiles []Profile
}

var (
	once    sync.Once
	loaded  *Registry
	loadErr error
)

// Load returns the registry compiled into this binary. It is parsed once.
func Load() (*Registry, error) {
	once.Do(func() { loaded, loadErr = parse() })
	return loaded, loadErr
}

// MustLoad is Load for start-up paths where a malformed registry is fatal — a
// control plane that cannot read its own registry must not come up pretending
// it can.
func MustLoad() *Registry {
	r, err := Load()
	if err != nil {
		panic(fmt.Sprintf("validation registry is unreadable: %v", err))
	}
	return r
}

func parse() (*Registry, error) {
	var actorsDoc struct {
		Environment string `json:"environment"`
		Actors      []struct {
			ID            string            `json:"id"`
			Type          string            `json:"type"`
			DisplayName   string            `json:"display_name"`
			Handle        string            `json:"handle"`
			Email         string            `json:"email"`
			Status        string            `json:"status"`
			Lifecycle     string            `json:"lifecycle"`
			Purpose       string            `json:"purpose"`
			ProvisionedAt string            `json:"provisioned_at"`
			ProductIDs    map[string]string `json:"product_ids"`
			Credentials   map[string]string `json:"credentials"`
		} `json:"actors"`
	}
	if err := json.Unmarshal([]byte(actorsJSON), &actorsDoc); err != nil {
		return nil, fmt.Errorf("actors: %w", err)
	}
	if actorsDoc.Environment != "" && actorsDoc.Environment != "SANDBOX" {
		return nil, fmt.Errorf("actor registry declares environment %q; SANDBOX is the only one",
			actorsDoc.Environment)
	}

	reg := &Registry{Digest: RegistryDigest}
	for _, a := range actorsDoc.Actors {
		// Names only. The value side of the map is deliberately discarded here
		// and never assigned to anything: this is the single place the
		// distinction is made, so it is the single place to audit.
		names := make([]string, 0, len(a.Credentials))
		for name := range a.Credentials {
			names = append(names, name)
		}
		sort.Strings(names)

		ids := map[string]string{}
		for k, v := range a.ProductIDs {
			if v != "" {
				ids[k] = v
			}
		}

		reg.Actors = append(reg.Actors, Actor{
			ID: a.ID, Type: a.Type, DisplayName: a.DisplayName,
			Handle: a.Handle, Email: a.Email, Status: a.Status,
			Lifecycle: a.Lifecycle, Purpose: a.Purpose,
			ProvisionedAt:   a.ProvisionedAt,
			ProductIDs:      ids,
			CredentialNames: names,
		})
	}
	sort.Slice(reg.Actors, func(i, j int) bool { return reg.Actors[i].ID < reg.Actors[j].ID })

	var suitesDoc struct {
		Suites []Suite `json:"suites"`
	}
	if err := json.Unmarshal([]byte(suitesJSON), &suitesDoc); err != nil {
		return nil, fmt.Errorf("suites: %w", err)
	}
	reg.Suites = suitesDoc.Suites

	var profilesDoc struct {
		Environment string    `json:"environment"`
		Profiles    []Profile `json:"profiles"`
	}
	if err := json.Unmarshal([]byte(profilesJSON), &profilesDoc); err != nil {
		return nil, fmt.Errorf("profiles: %w", err)
	}
	if profilesDoc.Environment != "" && profilesDoc.Environment != "SANDBOX" {
		return nil, fmt.Errorf("profile registry declares environment %q; SANDBOX is the only one",
			profilesDoc.Environment)
	}
	for i := range profilesDoc.Profiles {
		p := &profilesDoc.Profiles[i]
		p.Digest = ProfileDigest[p.ID]
		if p.Digest == "" {
			return nil, fmt.Errorf("profile %s has no digest; regenerate the registry", p.ID)
		}
	}
	reg.Profiles = profilesDoc.Profiles

	return reg, nil
}

// Actor returns one actor by id.
func (r *Registry) Actor(id string) (Actor, bool) {
	for _, a := range r.Actors {
		if a.ID == id {
			return a, true
		}
	}
	return Actor{}, false
}

// Profile returns one profile by id.
func (r *Registry) Profile(id string) (Profile, bool) {
	for _, p := range r.Profiles {
		if strings.EqualFold(p.ID, id) {
			return p, true
		}
	}
	return Profile{}, false
}

// Suite returns one suite by id.
func (r *Registry) Suite(id string) (Suite, bool) {
	for _, s := range r.Suites {
		if s.ID == id {
			return s, true
		}
	}
	return Suite{}, false
}

// BlockingSuites is the set a profile's verdict actually turns on: those the
// suite registry marks blocking, plus any the profile escalates. A profile can
// add to this set and can never subtract from it.
func (r *Registry) BlockingSuites(p Profile) []string {
	set := map[string]bool{}
	for _, id := range p.Suites {
		if s, ok := r.Suite(id); ok && s.Blocking {
			set[id] = true
		}
	}
	for _, id := range p.EscalateBlocking {
		set[id] = true
	}
	out := make([]string, 0, len(set))
	for id := range set {
		out = append(out, id)
	}
	sort.Strings(out)
	return out
}
