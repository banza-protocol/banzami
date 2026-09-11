package handler

import "testing"

// A pricing rule prices one operation — a settlement or a payout — and may be
// limited to a country. The audit record of a change left both out, so the log
// could not say which fee an operator had changed.
func TestPricingAudit_NamesTheOperationAndCountry(t *testing.T) {
	got := pricingAudit(map[string]any{
		"rule_key": "r1", "pricing_operation": "PAYOUT", "country": "AO", "rate_bps": 75,
	}, map[string]any{"id": "rule-1", "version": 2})
	for k, want := range map[string]any{"pricing_operation": "PAYOUT", "country": "AO", "rate_bps": 75, "resulting_id": "rule-1"} {
		if got[k] != want {
			t.Fatalf("audit %s = %v, want %v (record %v)", k, got[k], want, got)
		}
	}
}
