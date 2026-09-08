package developer

import (
	"os"
	"path/filepath"
	"regexp"
	"testing"
)

// gatewaySupportedEvents reads the gateway's own SupportedWebhookEvents map out
// of its source.
//
// Deliberately the source and not a copied constant: the point of the check is
// that the two lists cannot drift, and a shared constant that someone edits in
// one place would not have caught the drift this guard exists for — the
// gateway's list once held three names while core emitted six more.
func gatewaySupportedEvents(t *testing.T) map[string]bool {
	t.Helper()
	path := filepath.Join("..", "..", "..", "api-gateway", "internal", "service", "webhooks.go")
	src, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("cannot read the gateway's event list at %s: %v", path, err)
	}
	start := regexp.MustCompile(`var SupportedWebhookEvents = map\[string\]bool\{`).FindIndex(src)
	if start == nil {
		t.Fatalf("SupportedWebhookEvents not found in %s — was it renamed?", path)
	}
	rest := src[start[1]:]
	end := regexp.MustCompile(`(?m)^\}`).FindIndex(rest)
	if end == nil {
		t.Fatalf("could not find the end of SupportedWebhookEvents")
	}
	out := map[string]bool{}
	for _, m := range regexp.MustCompile(`"([a-z_]+\.[a-z_]+)":\s*true`).FindAllSubmatch(rest[:end[0]], -1) {
		out[string(m[1])] = true
	}
	if len(out) == 0 {
		t.Fatalf("parsed no events out of the gateway's list")
	}
	return out
}
