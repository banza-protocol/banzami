package service

import (
	"testing"
	"time"
)

// The @handle hold lifecycle: RESERVED while the application is open, kept
// alive while Banzami owes a decision, RELEASED when the application closes or
// is abandoned after a request for information.
func TestSweepHandleHolds_KeepsWhatIsOwedAndReleasesWhatIsClosed(t *testing.T) {
	f := newLifecycle(t)
	svc := NewPostgresMerchantApplicationService(f.pool)

	// In review for longer than its hold: the operator has not decided yet.
	inReview, reviewHandle, _ := f.application("")
	f.exec(`UPDATE merchant_applications SET status='UNDER_REVIEW' WHERE id=$1`, inReview)
	f.exec(`UPDATE handle_registry SET reserved_until = now() - interval '1 day' WHERE handle=$1`, reviewHandle)

	// Rejected, but its hold survived (closed some other way).
	rejected, rejectedHandle, _ := f.application("")
	f.exec(`UPDATE merchant_applications SET status='REJECTED' WHERE id=$1`, rejected)

	// Asked for information 31 days ago and never answered.
	abandoned, abandonedHandle, _ := f.application("")
	f.exec(`UPDATE merchant_applications SET status='INFORMATION_REQUIRED', information_request='o NIF',
	        information_requested_at = now() - interval '31 days' WHERE id=$1`, abandoned)

	// Asked yesterday: still the applicant's turn, and the name stays theirs.
	waiting, waitingHandle, _ := f.application("")
	f.exec(`UPDATE merchant_applications SET status='INFORMATION_REQUIRED', information_request='o NIF',
	        information_requested_at = now() - interval '1 day' WHERE id=$1`, waiting)

	if _, err := svc.SweepHandleHolds(f.ctx); err != nil {
		t.Fatal(err)
	}

	held := func(handle string) (bool, time.Time) {
		var until *time.Time
		err := f.pool.QueryRow(f.ctx, `SELECT reserved_until FROM handle_registry WHERE handle=$1 AND owner_type='APPLICATION'`, handle).Scan(&until)
		if err != nil {
			return false, time.Time{}
		}
		if until == nil {
			return true, time.Time{}
		}
		return true, *until
	}
	if ok, until := held(reviewHandle); !ok || !until.After(time.Now().Add(6*24*time.Hour)) {
		t.Fatalf("the hold of an application in review lapsed (held=%v until=%v) — the next applicant could take the name", ok, until)
	}
	if ok, _ := held(rejectedHandle); ok {
		t.Fatal("a rejected application still holds its name")
	}
	if ok, _ := held(abandonedHandle); ok {
		t.Fatal("an abandoned application still holds its name")
	}
	var status string
	_ = f.pool.QueryRow(f.ctx, `SELECT status FROM merchant_applications WHERE id=$1`, abandoned).Scan(&status)
	if status != "CANCELLED" {
		t.Fatalf("abandoned application status %s", status)
	}
	if ok, _ := held(waitingHandle); !ok {
		t.Fatal("an application waiting on its applicant lost its name early")
	}
	_ = f.pool.QueryRow(f.ctx, `SELECT status FROM merchant_applications WHERE id=$1`, waiting).Scan(&status)
	if status != "INFORMATION_REQUIRED" {
		t.Fatalf("a fresh request was cancelled: %s", status)
	}
	// And the released name is free for the next applicant.
	if ok, reason, err := svc.CheckHandle(f.ctx, rejectedHandle); err != nil || !ok {
		t.Fatalf("released name not available: %v %s", err, reason)
	}
}
