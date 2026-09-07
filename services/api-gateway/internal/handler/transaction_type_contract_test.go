package handler_test

import (
	"os"
	"regexp"
	"sort"
	"strings"
	"testing"

	"github.com/banzami/banzami/services/api-gateway/internal/handler"
)

// The gateway's emitted transaction types, checked against core's OWN enum.
//
// This is the test that was missing. The unit tests exercise a mock service
// that accepts any string, so they agreed with the gateway sending the
// lowercase "payment" while the real core answered
// 400 "unknown transaction_type: payment" for every call — POST /v1/transactions
// never once succeeded, and every unit test was green.
//
// A permissive mock cannot catch a cross-language contract mismatch. Reading the
// other side's source can: core's TransactionType::try_from_str is the
// authority, so this parses its match arms and requires the gateway to emit a
// subset of exactly those values. No live core needed, so it runs in CI.
//
// The DB is checked too, because it is a third party to the same contract: the
// transactions table's CHECK constraint has to accept whatever core writes.
func TestTransactionType_GatewayEmitsOnlyWhatCoreAccepts(t *testing.T) {
	coreAccepted := parseCoreTransactionTypes(t)
	if len(coreAccepted) == 0 {
		t.Fatal("parsed no transaction types from core — the contract source moved")
	}

	for _, emitted := range handler.CoreTransactionTypes() {
		if !coreAccepted[emitted] {
			t.Errorf("gateway can emit %q, which core rejects (core accepts %v)",
				emitted, sortedKeys(coreAccepted))
		}
	}
}

// Every public value a developer may send maps to something core accepts —
// including the omitted-field default, which is where the defect actually lived.
func TestTransactionType_EveryPublicValueMapsToAnAcceptedOne(t *testing.T) {
	coreAccepted := parseCoreTransactionTypes(t)

	for _, public := range []string{"", "payment", "PAYMENT", "  Refund ", "reversal", "payout"} {
		got, ok := handler.CoreTransactionTypeForTest(public)
		if !ok {
			t.Errorf("public value %q was refused, but it is documented as valid", public)
			continue
		}
		if !coreAccepted[got] {
			t.Errorf("public %q maps to %q, which core rejects", public, got)
		}
	}

	if _, ok := handler.CoreTransactionTypeForTest("free_money"); ok {
		t.Error("an unknown transaction_type was accepted")
	}
}

// The database is the third party to this contract: core writes what it parsed,
// and the CHECK constraint has to accept it.
func TestTransactionType_TheDatabaseAcceptsWhatCoreParses(t *testing.T) {
	sql, err := os.ReadFile("../../../../db/migrations/0003_transactions_schema.sql")
	if err != nil {
		t.Skipf("migration not readable from here: %v", err)
	}
	body := string(sql)
	start := strings.Index(body, "CHECK (status IN")
	if i := strings.Index(body, "CHECK (transaction_type IN"); i >= 0 {
		start = i
	}
	if start < 0 {
		t.Fatal("no transaction_type CHECK constraint found")
	}
	constraint := body[start:min(start+300, len(body))]

	for _, emitted := range handler.CoreTransactionTypes() {
		if !strings.Contains(constraint, "'"+emitted+"'") {
			t.Errorf("gateway can emit %q, which the transactions CHECK constraint rejects", emitted)
		}
	}
}

// core's TransactionType::try_from_str — the authority for this contract.
var coreArm = regexp.MustCompile(`"([A-Z_]+)"\s*=>\s*Some\(TransactionType::`)

func parseCoreTransactionTypes(t *testing.T) map[string]bool {
	t.Helper()
	src, err := os.ReadFile("../../../../core/transactions/src/transaction.rs")
	if err != nil {
		t.Fatalf("cannot read core's transaction type source: %v", err)
	}
	out := map[string]bool{}
	for _, m := range coreArm.FindAllStringSubmatch(string(src), -1) {
		out[m[1]] = true
	}
	return out
}

func sortedKeys(m map[string]bool) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
