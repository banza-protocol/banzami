package middleware

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

// Public proof verification counters.
//
// Per-IP throttling cannot answer a distributed prober — a thousand addresses
// each staying politely inside the per-client budget is still a flood — so the
// global ceiling bounds the damage and THIS bounds the blindness: an operator
// needs to be able to see sustained legacy misses without reading individual
// requests.
//
// Both labels are closed sets. A public proof reference is a bearer capability:
// putting it in a metric label would both explode cardinality and copy the secret
// into every scrape, dashboard and long-term store. Same for transaction ids,
// handles, descriptions and raw IPs — none of them appear here.
var (
	ProofVerifyTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "banzami_proof_verify_total",
		Help: "Public proof verification attempts by reference class and outcome.",
	}, []string{"reference_class", "result"})

	ProofVerifyLegacyBudgetExhausted = promauto.NewCounter(prometheus.CounterOpts{
		Name: "banzami_proof_verify_legacy_budget_exhausted_total",
		Help: "Times the global Sandbox legacy-reference budget refused a request.",
	})
)

// Closed label vocabularies — never build these from request input.
const (
	RefClassLegacyV0 = "legacy_v0"
	RefClassSecureV1 = "secure_v1"
	RefClassInvalid  = "invalid"

	ProofResultVerified    = "verified"
	ProofResultNotFound    = "not_found"
	ProofResultUnavailable = "unavailable"
	ProofResultError       = "error"
	ProofResultRateLimited = "rate_limited"
)

// RecordProofVerify counts one verification outcome.
func RecordProofVerify(refClass, result string) {
	ProofVerifyTotal.WithLabelValues(refClass, result).Inc()
}
