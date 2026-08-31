package service

import (
	"errors"
	"fmt"
	"net/http"
)

// CoreError is a DELIBERATE response from core-api — it rejected the request and
// said why. It is not an infrastructure failure, and the distinction is the whole
// point of this type.
//
// Before it existed, `do()` collapsed every non-2xx into a formatted string, so a
// handler could not tell "core says this amount is invalid" from "core is down".
// Handlers defaulted to 502, and the deployed API answered 502 to a zero amount,
// an unsupported currency, and to a merchant reaching for another merchant's
// wallet account. That last one is an authorization refusal reported as a server
// fault (RA-043). A 502 also invites the retry a 400 forbids, so an integrator's
// client library will hammer a request that can never succeed.
//
// Only the status and the core's own safe reason code/message are carried. The
// raw upstream body is deliberately NOT retained: it can contain driver text,
// constraint names or identifiers, and this value travels toward a public
// response.
type CoreError struct {
	Status  int    // upstream HTTP status — the class of the decision
	Code    string // core's safe reason code, when it supplied one
	Message string // core's safe message, when it supplied one
}

func (e *CoreError) Error() string {
	if e.Code != "" {
		return fmt.Sprintf("core-api %d %s: %s", e.Status, e.Code, e.Message)
	}
	return fmt.Sprintf("core-api %d", e.Status)
}

// IsClientError reports whether core rejected the REQUEST rather than failing.
// A 4xx is a decision the caller can act on; a 5xx is not.
func (e *CoreError) IsClientError() bool { return e.Status >= 400 && e.Status < 500 }

// AsCoreError extracts a CoreError from a wrapped error chain.
func AsCoreError(err error) (*CoreError, bool) {
	var ce *CoreError
	if errors.As(err, &ce) {
		return ce, true
	}
	return nil, false
}

// TransportError is a failure to complete the exchange at all — connection
// refused, DNS, TLS, timeout, or an undecodable upstream response. Core never
// formed an opinion about the request, so the caller cannot learn anything about
// its own input from this. THIS is what 502/504 exists for.
type TransportError struct{ Err error }

func (e *TransportError) Error() string { return "core-api transport: " + e.Err.Error() }
func (e *TransportError) Unwrap() error { return e.Err }

// PublicStatusFor maps a core failure onto the status the public API should
// return, preserving the three classes the old code collapsed into one.
//
// A deliberate core 4xx keeps its status, because the caller can act on it. Core
// 5xx and transport failures become 502 — the caller's request may have been
// perfectly valid, and saying "bad request" would be a lie.
//
// 404 is preserved rather than being remapped: whether a route hides existence is
// the route's own privacy decision, made where the ownership rules are known, not
// a blanket rule applied here.
func PublicStatusFor(err error) int {
	if ce, ok := AsCoreError(err); ok && ce.IsClientError() {
		return ce.Status
	}
	return http.StatusBadGateway
}
