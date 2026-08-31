// Package env is the single canonical representation of which Banzami
// environment a process is running in.
//
// RA-055. Environment is a system state, not a string convention. Before this
// package, 14 raw comparisons across five services decided privileged behaviour
// using four different vocabularies — `== "SANDBOX"`, `== "sandbox" ||
// == "SANDBOX"`, `== "development"`, `== "production"` — and the same
// deployment value was read differently by different components.
//
// That produced two real defects, both silent:
//
//   - Sandbox funding was refused in the real Sandbox, because the gate compared
//     against "SANDBOX" while the deployment set "sandbox".
//   - Consumer registration skipped its Sandbox balance grant for the same
//     reason, so every Sandbox consumer started at zero. A skipped grant is
//     indistinguishable from a grant of nothing, which is why it went unnoticed.
//
// The fix is to parse once, at configuration load, and let business code ask
// semantic questions instead of comparing strings.
package env

import "strings"

// Environment is the parsed environment. The zero value is Unknown, so a struct
// field that was never populated fails closed rather than defaulting to a real
// environment.
type Environment int

const (
	// Unknown is an absent, malformed or unrecognised environment. It grants
	// nothing: not Live rails, not Sandbox privileges, not test fixtures.
	Unknown Environment = iota
	Sandbox
	Live
)

// Canonical wire values. Persisted data and API payloads use these.
const (
	SandboxName = "SANDBOX"
	LiveName    = "LIVE"
)

// Parse maps a configured or stored value to an Environment.
//
// Input is trimmed and matched case-insensitively, because both "sandbox" and
// "SANDBOX" are already in use across deployments and stored rows — rejecting
// one of them would break running systems to make a point. Everything else,
// including the empty string, is Unknown.
//
// "production" and "development" are deliberately NOT accepted as Live/Sandbox.
// They are deployment-topology words from a different vocabulary; treating
// "production" as Live is exactly the kind of silent inference this package
// exists to remove. Callers that need those must keep their own explicit flag.
func Parse(raw string) Environment {
	switch strings.ToUpper(strings.TrimSpace(raw)) {
	case "SANDBOX":
		return Sandbox
	case "LIVE":
		return Live
	default:
		return Unknown
	}
}

// IsSandbox reports whether Sandbox-only behaviour may be enabled: test
// funding, fixtures, simulated rails, auto-grants.
func (e Environment) IsSandbox() bool { return e == Sandbox }

// IsLive reports that the process is configured for Live.
//
// This is NOT authority to move real money. Live activation remains gated
// independently (KYB/KYC prerequisites, platform mode, federation state,
// production secrets). A typed environment must never become a way around
// those gates — it only answers "which environment is configured".
func (e Environment) IsLive() bool { return e == Live }

// IsKnown reports whether the value parsed to a real environment. Use it at
// startup to fail closed on a missing or malformed configuration.
func (e Environment) IsKnown() bool { return e == Sandbox || e == Live }

// String returns the canonical wire value, or "UNKNOWN".
func (e Environment) String() string {
	switch e {
	case Sandbox:
		return SandboxName
	case Live:
		return LiveName
	default:
		return "UNKNOWN"
	}
}
