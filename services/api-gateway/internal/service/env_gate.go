package service

import (
	"context"
	"errors"
	"strings"
)

// ErrEnvMismatch is returned by EnvGate.Verify when this gateway stack's
// environment disagrees with the current global Platform Mode. Onboarding writes
// (application submission, approval) MUST be refused on a mismatch so a merchant
// is never provisioned in an environment the platform is not currently operating
// in — the root cause of "approved in LIVE, cannot log in from the SANDBOX app".
var ErrEnvMismatch = errors.New("onboarding environment does not match the current platform mode")

// platformModeReader is the read side of the platform mode (PlatformReadService).
// Defined here (consumer-side) to keep EnvGate decoupled from its construction.
type platformModeReader interface {
	Mode(ctx context.Context) string
}

// EnvGate enforces Platform Mode as the single source of truth for the
// onboarding environment (BANZAMI ADR-025).
//
// Each gateway stack is pinned to one environment (LIVE → DB banzami, SANDBOX →
// DB banzami_staging). The gate is ONE-DIRECTIONAL — it protects production data:
//
//   - The LIVE stack provisions a merchant ONLY while the platform is LIVE.
//     A LIVE stack while the platform is SANDBOX is refused — this is exactly the
//     "@jrm" hazard (a LIVE merchant created during a SANDBOX platform).
//   - The SANDBOX stack ALWAYS provisions, so the developer sandbox keeps working
//     even after launch (when the platform is LIVE).
//
// A stack whose environment is unknown — local "development" — disables the gate:
// local runs use a single database and have no cross-environment hazard.
type EnvGate struct {
	stackEnv string // "LIVE" | "SANDBOX" | "" (disabled)
	platform platformModeReader
}

// NewEnvGate builds the gate from the gateway's raw ENVIRONMENT value and the
// platform-mode reader. A nil reader disables the gate (fail-open in dev only;
// production always wires PlatformReadService).
func NewEnvGate(rawEnv string, platform platformModeReader) *EnvGate {
	return &EnvGate{stackEnv: NormaliseStackEnv(rawEnv), platform: platform}
}

// NormaliseStackEnv maps a gateway ENVIRONMENT value to a platform environment
// label. Anything unrecognised ("development", empty) → "" which disables the
// gate. Mirrors the email/platform LIVE-vs-SANDBOX vocabulary.
func NormaliseStackEnv(s string) string {
	switch strings.ToUpper(strings.TrimSpace(s)) {
	case "LIVE", "PRODUCTION", "PROD":
		return "LIVE"
	case "SANDBOX", "STAGING", "TEST":
		return "SANDBOX"
	default:
		return ""
	}
}

// StackEnv reports the normalised environment of this gateway ("" when disabled).
func (g *EnvGate) StackEnv() string {
	if g == nil {
		return ""
	}
	return g.stackEnv
}

// Verify returns the current platform mode and a non-nil error (ErrEnvMismatch)
// when onboarding must be refused on this stack. A disabled gate (local dev, or
// no reader) always allows and returns an empty mode.
//
// One-directional: only a LIVE stack while the platform is not LIVE is refused.
// The SANDBOX stack always allows (it cannot create production data), so the
// developer sandbox survives a LIVE launch.
func (g *EnvGate) Verify(ctx context.Context) (mode string, err error) {
	if g == nil || g.stackEnv == "" || g.platform == nil {
		return "", nil
	}
	mode = g.platform.Mode(ctx)
	if g.stackEnv == "LIVE" && mode != "LIVE" {
		return mode, ErrEnvMismatch
	}
	return mode, nil
}
