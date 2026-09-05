package service

import (
	"os"
	"path/filepath"
	"regexp"
	"testing"
)

// An event the system emits but nobody can subscribe to is an event that does
// not exist, from the integrator's side.
//
// SupportedWebhookEvents gates registration and listed three names while core
// emitted six more. `payment_session.paid` — the event the canonical DOA
// integration is built on, shown in the public docs' own webhook sample — was
// rejected at registration with UNSUPPORTED_EVENT. The list was written to catch
// typos and had quietly become the thing blocking real events.
//
// So this reads the emitting Rust source rather than a hand-kept list. It is
// deliberately one-directional: an emitted event MUST be registrable, while a
// registrable event need not be emitted yet (a name can be published ahead of
// the code that fires it).
func TestEveryEmittedEventIsRegistrable(t *testing.T) {
	// Files in core that emit into the webhook outbox.
	sources := []string{
		"../../../../core/api/src/routes/payment_sessions.rs",
		"../../../../core/api/src/routes/application_settlements.rs",
	}
	// `emit(..., "some.event", ...)` / `emit_settlement_event(pool, "x.y", ...)`
	emitted := regexp.MustCompile(`"((?:payment_session|application_settlement|refund|payment_link|payment|payout)\.[a-z_]+)"`)

	found := map[string]string{}
	for _, rel := range sources {
		b, err := os.ReadFile(filepath.Clean(rel))
		if err != nil {
			// If core moves, fail loudly rather than pass on an empty read — a
			// silent zero-match here would make this test permanently vacuous.
			t.Fatalf("cannot read %s: %v (if core moved, update this list)", rel, err)
		}
		for _, m := range emitted.FindAllStringSubmatch(string(b), -1) {
			found[m[1]] = rel
		}
	}
	if len(found) < 4 {
		t.Fatalf("only %d event names parsed from core — the parser has drifted, "+
			"and every assertion below would be vacuous", len(found))
	}

	for ev, src := range found {
		if !SupportedWebhookEvents[ev] {
			t.Errorf("%s is emitted by %s but cannot be registered for", ev, src)
		}
	}
}
