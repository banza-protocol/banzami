package handler

// The seal is only a guarantee if every route that ISSUES a payment artifact
// goes through it. This reads the handler sources rather than trusting review:
// a new payment route added next year gets the same check.

import (
	"os"
	"regexp"
	"strings"
	"testing"
)

// Every developer-key payment authority call site, with the scope it requires.
var authorityCall = regexp.MustCompile(
	`(developerPaymentAuthority|developerPaymentAuthorityForArtifact|resolveDeveloperPaymentAuthority)\(w, r, ("([a-z_]+:[a-z]+)"|scope)`)

func handlerSources(t *testing.T) map[string]string {
	t.Helper()
	out := map[string]string{}
	entries, err := os.ReadDir(".")
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		n := e.Name()
		if !strings.HasSuffix(n, ".go") || strings.HasSuffix(n, "_test.go") {
			continue
		}
		b, err := os.ReadFile(n)
		if err != nil {
			t.Fatal(err)
		}
		out[n] = string(b)
	}
	return out
}

// ADR-055: a `:write` payment scope issues a payer-facing artifact and must seal;
// a `:read` scope must not.
func TestSeal_EveryWriteScopeUsesTheSealingAuthority(t *testing.T) {
	var checked int
	for name, src := range handlerSources(t) {
		if name == "payment_authz.go" {
			continue // the primitive itself
		}
		for _, m := range authorityCall.FindAllStringSubmatch(src, -1) {
			fn, literal := m[1], m[3]
			if literal == "" {
				continue // `scope` variable — covered by the classifier test below
			}
			checked++
			isWrite := strings.HasSuffix(literal, ":write")
			seals := fn == "developerPaymentAuthorityForArtifact"
			if isWrite && !seals {
				t.Errorf("%s: %q ISSUES an artifact but uses %s — it must use developerPaymentAuthorityForArtifact (ADR-055)", name, literal, fn)
			}
			if !isWrite && seals {
				t.Errorf("%s: %q is a read and must not seal the binding", name, literal)
			}
		}
	}
	if checked == 0 {
		t.Fatal("no authority call sites found — the pattern has drifted and this guard is vacuous")
	}
}

// payment_sessions.go passes the scope through a variable, so its classifier is
// asserted directly: the suffix decides, which is what makes a new read or write
// route correct by construction.
func TestSeal_SessionHandlerClassifiesByScopeSuffix(t *testing.T) {
	src := handlerSources(t)["payment_sessions.go"]
	if !strings.Contains(src, `strings.HasSuffix(scope, ":write")`) {
		t.Error("payment_sessions.go must decide sealing from the scope suffix")
	}
	if !strings.Contains(src, "seal = h.seal") {
		t.Error("payment_sessions.go must pass the sealer for write scopes")
	}
}

// Operations that create no payer-facing artifact must never seal — the boundary
// is economic meaning, not "some Project resource exists" (ADR-055).
func TestSeal_NonPaymentRoutesDoNotSeal(t *testing.T) {
	for _, name := range []string{
		"webhooks.go", "wallet_accounts.go", "wallet_account_transfers.go",
		"refunds.go", "me.go", "business_me.go", "application_settlements.go",
	} {
		src := handlerSources(t)[name]
		if src == "" {
			continue
		}
		if strings.Contains(src, "developerPaymentAuthorityForArtifact") {
			t.Errorf("%s seals a binding — none of these routes issues a payer-facing artifact", name)
		}
	}
}
