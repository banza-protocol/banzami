package developer

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"
)

// The Console's refund is the first financial write in this service, so its
// authority is tested as a table over every canonical role rather than by
// checking the two cases that happened to come to mind.

// fakeRefunder records what the service asked Core for, so the tests can assert
// on the derived values — the merchant especially, which must never come from
// the caller.
type fakeRefunder struct {
	mu sync.Mutex

	src    *PaymentSource
	srcErr error

	out    *Refund
	outErr error

	calls       int
	gotMerchant string
	gotSourceID string
	gotAmount   int64
	gotIdemKey  string
	gotCurrency string
}

func (f *fakeRefunder) PaymentSession(_ context.Context, _ string) (*PaymentSource, error) {
	if f.srcErr != nil {
		return nil, f.srcErr
	}
	return f.src, nil
}

func (f *fakeRefunder) CreateRefund(_ context.Context, merchantID, _, sourceID string,
	amountMinor int64, currency, _, idempotencyKey string) (*Refund, error) {
	f.mu.Lock()
	f.calls++
	f.gotMerchant, f.gotSourceID = merchantID, sourceID
	f.gotAmount, f.gotCurrency, f.gotIdemKey = amountMinor, currency, idempotencyKey
	f.mu.Unlock()
	if f.outErr != nil {
		return nil, f.outErr
	}
	return f.out, nil
}

func (f *fakeRefunder) callCount() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.calls
}

// refundSvc: a workspace holding one member of every canonical role, a project,
// and a binding to `mID`, with a Core that would accept the refund. Everything
// below then varies exactly one thing.
func refundSvc(t *testing.T) (*Service, *fakeRefunder, string) {
	t.Helper()
	s, st := newSvc(time.Hour)
	_ = st
	ws, _ := s.CreateWorkspace(bg, "u_owner", "WS", "", "")
	addMember(t, s, "u_owner", ws.ID, "admin@x.co", RoleAdmin, "u_admin")
	addMember(t, s, "u_owner", ws.ID, "dev@x.co", RoleDeveloper, "u_dev")
	addMember(t, s, "u_owner", ws.ID, "fin@x.co", RoleFinance, "u_fin")
	addMember(t, s, "u_owner", ws.ID, "view@x.co", RoleViewer, "u_view")

	s.SetPayeeValidator(&fakePayee{valid: true})
	s.SetPaymentCapabilityReleased(true)
	pid := mkProject(t, s, "u_owner", ws.ID)
	if _, err := s.BindProjectSandbox(bg, pid, mID, wID, waID, "u_owner", "", ""); err != nil {
		t.Fatalf("bind: %v", err)
	}

	f := &fakeRefunder{
		src: &PaymentSource{MerchantID: mID, SourceType: "WALLET_PAYMENT", SourceID: "src-1", Currency: "AOA", Status: "PAID"},
		out: &Refund{ID: "rf_1", Status: "COMPLETED", AmountMinor: 5000, Currency: "AOA"},
	}
	s.SetRefunder(f)
	return s, f, pid
}

func req() RefundRequest {
	return RefundRequest{PaymentID: "pay-1", AmountMinor: 5000, Reason: "duplicado", IdempotencyKey: "idem-1"}
}

// Every canonical role, in one table, with the expected answer written next to
// the reason. A role added to the system later shows up here as a compile-time
// gap rather than as an untested permission.
func TestRefund_RoleMatrix(t *testing.T) {
	cases := []struct {
		actor string
		role  string
		allow bool
		why   string
	}{
		{"u_owner", RoleOwner, true, "accountable for the workspace"},
		{"u_admin", RoleAdmin, true, "manages the workspace and its members"},
		{"u_dev", RoleDeveloper, false, "may build the capability, may not exercise it against real balances"},
		{"u_fin", RoleFinance, false, "the name is not the permission — no financial write has ever been granted by role label"},
		{"u_view", RoleViewer, false, "read-only"},
	}
	for _, c := range cases {
		t.Run(c.role, func(t *testing.T) {
			s, f, pid := refundSvc(t)
			res, err := s.ProjectRefund(bg, c.actor, pid, req())
			if c.allow {
				if err != nil {
					t.Fatalf("%s (%s) should refund: %v", c.role, c.why, err)
				}
				if res.ID != "rf_1" {
					t.Errorf("got refund %q", res.ID)
				}
				if f.callCount() != 1 {
					t.Errorf("Core called %d times, want 1", f.callCount())
				}
				return
			}
			if !errors.Is(err, ErrForbidden) {
				t.Fatalf("%s (%s) must be denied with Forbidden, got %v", c.role, c.why, err)
			}
			// The denial must be BEFORE Core is asked. A refusal that still
			// reached Core would mean the only thing standing between a VIEWER
			// and a refund was Core happening to say no for its own reasons.
			if f.callCount() != 0 {
				t.Errorf("%s reached Core despite being denied", c.role)
			}
		})
	}

	// The capability answer must agree with what actually happens. A Console that
	// hides the button for a role the server would accept, or shows it for one the
	// server would refuse, is telling someone something untrue either way.
	for _, c := range cases {
		s, _, pid := refundSvc(t)
		cap, err := s.ProjectRefundCapability(bg, c.actor, pid)
		if err != nil {
			t.Fatalf("%s capability: %v", c.role, err)
		}
		if cap.Allowed != c.allow {
			t.Errorf("%s: capability says allowed=%v, enforcement says %v", c.role, cap.Allowed, c.allow)
		}
		if cap.Role != c.role {
			t.Errorf("%s: capability reports role %q", c.role, cap.Role)
		}
	}
}

// A non-member gets the same answer as for a project that does not exist. 403
// for a real project and 404 for an imaginary one would tell an outsider which
// project ids are real.
func TestRefund_NonMemberCannotTellTheProjectExists(t *testing.T) {
	s, f, pid := refundSvc(t)
	if _, err := s.ProjectRefund(bg, "u_outsider", pid, req()); !errors.Is(err, ErrNotFound) {
		t.Fatalf("non-member: want NotFound, got %v", err)
	}
	if _, err := s.ProjectRefund(bg, "u_owner", "p_does_not_exist", req()); !errors.Is(err, ErrNotFound) {
		t.Fatalf("missing project: want NotFound, got %v", err)
	}
	if f.callCount() != 0 {
		t.Error("Core was asked about a project the caller cannot see")
	}
}

// The merchant is derived from the binding and never taken from anywhere else.
// This is the assertion that would fail if someone later added a merchant_id
// field to the request "for convenience".
func TestRefund_MerchantComesFromTheBinding(t *testing.T) {
	s, f, pid := refundSvc(t)
	if _, err := s.ProjectRefund(bg, "u_owner", pid, req()); err != nil {
		t.Fatal(err)
	}
	if f.gotMerchant != mID {
		t.Errorf("Core got merchant %q, want the bound %q", f.gotMerchant, mID)
	}
	if f.gotSourceID != "src-1" {
		t.Errorf("Core got source %q, want the one the payment names", f.gotSourceID)
	}
	if f.gotCurrency != "AOA" {
		t.Errorf("Core got currency %q — it must come from the source, not the caller", f.gotCurrency)
	}
}

// Knowing a payment id is not authority over it. A payment belonging to another
// merchant is answered exactly as a payment that does not exist.
func TestRefund_ForeignPaymentIsNotFound(t *testing.T) {
	s, f, pid := refundSvc(t)
	f.src = &PaymentSource{MerchantID: "99999999-9999-9999-9999-999999999999", SourceType: "WALLET_PAYMENT", SourceID: "src-x", Currency: "AOA"}
	if _, err := s.ProjectRefund(bg, "u_owner", pid, req()); !errors.Is(err, ErrNotFound) {
		t.Fatalf("foreign payment: want NotFound, got %v", err)
	}
	if f.callCount() != 0 {
		t.Error("a foreign payment reached Core's refund endpoint")
	}
}

// A payment nobody has paid has nothing to give back, and says so — rather than
// reaching Core to be refused there for a reason the caller cannot read.
func TestRefund_UnpaidPaymentIsNotRefundable(t *testing.T) {
	s, f, pid := refundSvc(t)
	f.srcErr = ErrNoRefundSource
	if _, err := s.ProjectRefund(bg, "u_owner", pid, req()); !errors.Is(err, ErrNoRefundSource) {
		t.Fatalf("want ErrNoRefundSource, got %v", err)
	}
	if f.callCount() != 0 {
		t.Error("an unpaid payment reached Core's refund endpoint")
	}
}

// The idempotency key is the caller's and is never minted here. A financial
// write that invents its own retry key turns one double-submitted form into two
// refunds.
func TestRefund_IdempotencyKeyIsRequiredAndForwarded(t *testing.T) {
	s, f, pid := refundSvc(t)

	r := req()
	r.IdempotencyKey = "   "
	if _, err := s.ProjectRefund(bg, "u_owner", pid, r); !errors.Is(err, ErrValidation) {
		t.Fatalf("blank idempotency key: want Validation, got %v", err)
	}
	if f.callCount() != 0 {
		t.Fatal("a refund with no idempotency key reached Core")
	}

	if _, err := s.ProjectRefund(bg, "u_owner", pid, req()); err != nil {
		t.Fatal(err)
	}
	if f.gotIdemKey != "idem-1" {
		t.Errorf("Core got idempotency key %q, want the caller's", f.gotIdemKey)
	}
}

func TestRefund_AmountMustBePositive(t *testing.T) {
	s, f, pid := refundSvc(t)
	for _, amount := range []int64{0, -1} {
		r := req()
		r.AmountMinor = amount
		if _, err := s.ProjectRefund(bg, "u_owner", pid, r); !errors.Is(err, ErrValidation) {
			t.Errorf("amount %d: want Validation, got %v", amount, err)
		}
	}
	if f.callCount() != 0 {
		t.Error("a non-positive refund reached Core")
	}
}

// Core's refusal is the caller's answer. A ceiling that has been reached, a
// balance that cannot cover it and a reused idempotency key are three different
// things to do next.
func TestRefund_CoreRefusalReachesTheCaller(t *testing.T) {
	s, f, pid := refundSvc(t)
	f.outErr = &RefundRejection{Code: "REFUND_CEILING_EXCEEDED", Message: "amount exceeds the refundable remainder"}

	_, err := s.ProjectRefund(bg, "u_owner", pid, req())
	var rej *RefundRejection
	if !errors.As(err, &rej) {
		t.Fatalf("want the rejection to survive, got %v", err)
	}
	if rej.Code != "REFUND_CEILING_EXCEEDED" {
		t.Errorf("code became %q", rej.Code)
	}
}

// An operator with no refund credential must say so, not offer a control that
// fails when pressed. "You may not" and "nobody can here" are different facts.
func TestRefund_UnconfiguredIsItsOwnAnswer(t *testing.T) {
	s, _, pid := refundSvc(t)
	s.SetRefunder(nil)

	if _, err := s.ProjectRefund(bg, "u_owner", pid, req()); !errors.Is(err, ErrNotConfigured) {
		t.Fatalf("want ErrNotConfigured, got %v", err)
	}
	cap, err := s.ProjectRefundCapability(bg, "u_owner", pid)
	if err != nil {
		t.Fatal(err)
	}
	if cap.Configured {
		t.Error("capability reports configured with no refunder wired")
	}
	if !cap.Allowed {
		t.Error("the OWNER's role still permits refunding — the deployment is what is missing")
	}
}

// An unbound project has no merchant, so it has no payments and no refunds. The
// role check still runs first: a VIEWER on an unbound project must not learn the
// binding state from the shape of the refusal.
func TestRefund_UnboundProjectHasNothingToRefund(t *testing.T) {
	s, st := newSvc(time.Hour)
	_ = st
	ws, _ := s.CreateWorkspace(bg, "u_owner", "WS", "", "")
	addMember(t, s, "u_owner", ws.ID, "view@x.co", RoleViewer, "u_view")
	s.SetRefunder(&fakeRefunder{})
	pid := mkProject(t, s, "u_owner", ws.ID)

	if _, err := s.ProjectRefund(bg, "u_owner", pid, req()); !errors.Is(err, ErrNotFound) {
		t.Fatalf("unbound project: want NotFound, got %v", err)
	}
	if _, err := s.ProjectRefund(bg, "u_view", pid, req()); !errors.Is(err, ErrForbidden) {
		t.Fatalf("VIEWER on an unbound project must be refused for the role, got %v", err)
	}
}
