package handler

import "strings"

// The gateway → core transaction_type contract, written down once.
//
// Core's TransactionType::try_from_str accepts exactly four values, all
// SCREAMING_SNAKE_CASE, and the transactions table's CHECK constraint enforces
// the same four. The gateway used to default to the lowercase "payment" and
// send it verbatim, so core answered 400 "unknown transaction_type: payment"
// for every call and POST /v1/transactions never once succeeded.
//
// A table rather than strings.ToUpper, deliberately. Uppercasing would also
// have worked, and would have hidden the same class of bug the next time the
// two sides disagreed about a value rather than about casing — because there
// would be no enumeration of what this gateway actually emits, and nothing for
// a contract test to check against core's enum. This map IS the contract.
//
// Keys are what a developer may send (case- and space-insensitive, idiomatic
// lowercase in the public docs). Values are what core is given.
var transactionTypeToCore = map[string]string{
	"payment":  "PAYMENT",
	"refund":   "REFUND",
	"reversal": "REVERSAL",
	"payout":   "PAYOUT",
}

// DefaultTransactionType is what an omitted transaction_type means.
const DefaultTransactionType = "PAYMENT"

// coreTransactionType maps a caller's value to core's. An empty input is the
// documented default; anything unrecognised is refused here rather than
// discovered upstream as a 400 the caller never sees.
func coreTransactionType(public string) (string, bool) {
	trimmed := strings.TrimSpace(public)
	if trimmed == "" {
		return DefaultTransactionType, true
	}
	core, ok := transactionTypeToCore[strings.ToLower(trimmed)]
	return core, ok
}

// CoreTransactionTypes returns every value this gateway can emit, for the
// contract test that checks them against core's own enum.
func CoreTransactionTypes() []string {
	out := make([]string, 0, len(transactionTypeToCore))
	for _, v := range transactionTypeToCore {
		out = append(out, v)
	}
	out = append(out, DefaultTransactionType)
	return out
}

// CoreTransactionTypeForTest exposes the mapping to the contract test in the
// handler_test package. It is the same function the handler uses; a test that
// re-implemented the mapping would be checking itself.
func CoreTransactionTypeForTest(public string) (string, bool) {
	return coreTransactionType(public)
}
