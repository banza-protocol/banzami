package handler

import (
	"net/http"
	"strings"

	"github.com/banzami/banzami/services/public-api/internal/apierror"
)

// respondCoreRefusal answers a payment that Core deliberately REFUSED (a 422
// with a code) as what it is, and reports whether it did.
//
// Every pay handler maps the refusals it knows and falls through to a 500 for
// the rest. A Sandbox pilot limit was among "the rest": paying 42 000 Kz against
// the per-payment limit came back as INTERNAL_ERROR, which the app can only
// describe as "could not confirm whether the payment completed — verify" — an
// outage message for a payment that was never going to be taken, however many
// times it is retried.
//
// Only an allow-list of codes is passed through, each with a fixed message.
// Core's own message is never forwarded: it can carry balances and amounts.
func respondCoreRefusal(w http.ResponseWriter, r *http.Request, err error) bool {
	code, ok := coreRefusalCode(err)
	if !ok {
		return false
	}
	apierror.Respond(w, r, http.StatusUnprocessableEntity, code, coreRefusalMessage(code))
	return true
}

func coreRefusalCode(err error) (string, bool) {
	if err == nil || !strings.Contains(err.Error(), "core-api error 422") {
		return "", false
	}
	m := coreErrorCode.FindStringSubmatch(err.Error())
	if m == nil {
		return "", false
	}
	code := m[1]
	if strings.HasPrefix(code, "PILOT_LIMIT_") {
		return code, true
	}
	switch code {
	case "ACCOUNT_FROZEN", "SENDER_WALLET_NOT_ACTIVE", "WALLET_NOT_ACTIVE", "WALLET_CANNOT_RECEIVE":
		return code, true
	}
	return "", false
}

func coreRefusalMessage(code string) string {
	switch {
	case strings.HasPrefix(code, "PILOT_LIMIT_"):
		return "this operation exceeds the controlled pilot limit"
	case code == "ACCOUNT_FROZEN":
		return "account is frozen"
	case code == "WALLET_CANNOT_RECEIVE":
		return "the recipient cannot receive this payment"
	default:
		return "wallet is not active"
	}
}
