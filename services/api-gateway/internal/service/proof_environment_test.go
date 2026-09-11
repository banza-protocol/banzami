package service

import (
	"context"
	"errors"
	"testing"
)

// A proof names its environment or is not written. It used to default to LIVE,
// so a caller that forgot minted a Sandbox receipt as real money. Refused
// before any database access: the pool here is nil and is never touched.
func TestProofWritersRefuseAnUnnamedEnvironment(t *testing.T) {
	svc := NewProofService(nil, "k", "", "", "", "")
	for _, environment := range []string{"", "  ", "PRODUCTION", "development", "live-ish"} {
		if _, err := svc.Ensure(context.Background(), ProofInput{TransactionID: "t-1", Environment: environment}); !errors.Is(err, ErrProofEnvironmentRequired) {
			t.Fatalf("Ensure(%q): want ErrProofEnvironmentRequired, got %v", environment, err)
		}
		if err := svc.MarkReversed(context.Background(), "t-1", environment); !errors.Is(err, ErrProofEnvironmentRequired) {
			t.Fatalf("MarkReversed(%q): want ErrProofEnvironmentRequired, got %v", environment, err)
		}
	}
}

func TestProofEnvironmentIsCanonical(t *testing.T) {
	for in, want := range map[string]string{"sandbox": "SANDBOX", " SANDBOX ": "SANDBOX", "live": "LIVE", "LIVE": "LIVE"} {
		got, err := proofEnvironment(in)
		if err != nil || got != want {
			t.Fatalf("proofEnvironment(%q) = %q, %v; want %q", in, got, err, want)
		}
	}
}

// A2-17: the public verifier must say which environment a proof belongs to,
// from the proof itself. The payload carried no environment, so the website
// labelled a proof from the stack it happened to ask — which, after a failed
// platform-mode read, was the Sandbox stack by default.
func TestProofPublicPayloadCarriesTheProofsEnvironment(t *testing.T) {
	svc := NewProofService(nil, "k", "", "banzami", "banza", "https://banzami.com/r/")
	for stored, want := range map[string]any{"SANDBOX": "SANDBOX", "LIVE": "LIVE", "sandbox": "SANDBOX", "": nil, "staging-ish": nil} {
		pub := svc.Public(&Proof{Environment: stored, Status: "CONFIRMED"})
		got, ok := pub["environment"]
		if !ok {
			t.Fatalf("Public(%q): no environment field", stored)
		}
		if got != want {
			t.Fatalf("Public(%q).environment = %v, want %v", stored, got, want)
		}
	}
}
