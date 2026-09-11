package service

import (
	"context"
	"errors"
	"testing"
)

// A2-01. An application's environment is named, never inferred: anything but
// "SANDBOX" became LIVE. The pool is nil on purpose — the refusal comes before
// any write, and with the guard removed this panics instead of passing.
func TestSubmit_RefusesAnUndeclaredEnvironment(t *testing.T) {
	s := &PostgresMerchantApplicationService{}
	for _, e := range []string{"", "development", "production", "LIVEX"} {
		_, err := s.Submit(context.Background(), MerchantApplicationInput{
			Environment: e, DesiredHandle: "cantina_alex", BusinessName: "Cantina",
			Email: "a@b.co", TermsAccepted: true, Origin: ApplicationOriginStandalone,
		})
		if !errors.Is(err, ErrEnvironmentUndeclared) {
			t.Fatalf("environment %q: want ErrEnvironmentUndeclared, got %v", e, err)
		}
	}
}
