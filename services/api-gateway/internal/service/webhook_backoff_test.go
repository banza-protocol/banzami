package service

import "testing"

// WH-003 — automatic retry with exponential backoff.
//
// The schedule is production-grade (minutes→hours, not the seconds noted in an
// older spec). This test pins the contract: at least 5 attempts, strictly
// increasing (exponential) delays.

func TestBackoffSchedule_FiveAttemptsExponential(t *testing.T) {
	if len(backoffSchedule) < 5 {
		t.Fatalf("WH-003 requires at least 5 retry attempts, got %d", len(backoffSchedule))
	}
	for i := 1; i < len(backoffSchedule); i++ {
		if backoffSchedule[i] <= backoffSchedule[i-1] {
			t.Fatalf("backoff must strictly increase (exponential): step %d (%s) <= step %d (%s)",
				i, backoffSchedule[i], i-1, backoffSchedule[i-1])
		}
		// Each step should be a meaningful multiple of the previous one.
		if backoffSchedule[i] < 2*backoffSchedule[i-1] {
			t.Fatalf("backoff step %d (%s) is not at least 2x the previous (%s)",
				i, backoffSchedule[i], backoffSchedule[i-1])
		}
	}
}
