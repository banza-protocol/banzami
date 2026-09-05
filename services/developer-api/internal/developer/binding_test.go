package developer

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
)

// fakePayee is a stub Core payee validator for tests.
//
// The call counter is mutex-guarded because one of these tests binds
// concurrently on purpose. Without the lock `go test -race` reports a data race
// in the fake — a real race, in test code, that says nothing about the service
// and intermittently fails CI for the wrong reason.
type fakePayee struct {
	mu     sync.Mutex
	valid  bool
	reason string
	err    error
	calls  int
}

func (f *fakePayee) ValidatePayee(_ context.Context, _, _, _ string) (bool, string, error) {
	f.mu.Lock()
	f.calls++
	f.mu.Unlock()
	return f.valid, f.reason, f.err
}

// callCount reads the counter under the same lock.
func (f *fakePayee) callCount() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.calls
}

// boundSvc returns a service whose payee validator accepts (valid) by default,
// so binding tests exercise the record/authorize path.
func boundSvc(t *testing.T) (*Service, *memStore, string) {
	t.Helper()
	s, st, ws := wsWithRoles(t)
	s.SetPayeeValidator(&fakePayee{valid: true})
	s.SetPaymentCapabilityReleased(true) // these tests exercise the released path
	return s, st, ws
}

// ADR-047 (RT04 §2/§3) — Project→Merchant Sandbox binding authority.
//
// developer-api is the single authority for a Project's SANDBOX payee. These
// tests pin the structural invariants the Gateway and Core rely on:
//   * one ACTIVE binding per project;
//   * a valid key with no binding introspects as Bound=false (never a default);
//   * introspection surfaces the operator-provisioned opaque core ids;
//   * sealing an artifact is idempotent and never erases the binding.

// opaque core ids (developer-api never interprets these).
const (
	mID  = "11111111-1111-1111-1111-111111111111"
	wID  = "22222222-2222-2222-2222-222222222222"
	waID = "33333333-3333-3333-3333-333333333333"
)

func TestBinding_OneActivePerProject(t *testing.T) {
	s, _, ws := boundSvc(t)
	pid := mkProject(t, s, "u_owner", ws)

	if _, err := s.BindProjectSandbox(bg, pid, mID, wID, waID, "u_owner", "", ""); err != nil {
		t.Fatalf("first bind should succeed: %v", err)
	}
	// A second ACTIVE binding for the same project must be refused.
	if _, err := s.BindProjectSandbox(bg, pid, "9", "9", "9", "u_owner", "", ""); err != ErrConflict {
		t.Fatalf("second active bind: want ErrConflict, got %v", err)
	}
}

func TestBinding_ConcurrentBindsExactlyOneWins(t *testing.T) {
	// Two+ concurrent binds on the same project must yield EXACTLY one ACTIVE
	// binding — no ambiguous authority. The mem store enforces one-active under a
	// mutex (mirroring the DB partial unique index, which is the production
	// guarantee: dev_project_sandbox_binding_one_active).
	s, st, ws := boundSvc(t)
	pid := mkProject(t, s, "u_owner", ws)

	const n = 12
	errs := make(chan error, n)
	var wg sync.WaitGroup
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := s.BindProjectSandbox(bg, pid, mID, wID, waID, "u_owner", "", "")
			errs <- err
		}()
	}
	wg.Wait()
	close(errs)
	var ok, conflict int
	for err := range errs {
		switch err {
		case nil:
			ok++
		case ErrConflict:
			conflict++
		default:
			t.Errorf("unexpected error: %v", err)
		}
	}
	if ok != 1 || conflict != n-1 {
		t.Fatalf("want exactly 1 winner and %d conflicts, got ok=%d conflict=%d", n-1, ok, conflict)
	}
	// The store holds exactly one ACTIVE binding.
	if b, _ := st.ActiveBindingForProject(bg, pid); b == nil {
		t.Fatal("expected exactly one ACTIVE binding after the race")
	}
}

func TestBinding_FailsClosedWithoutCoreValidation(t *testing.T) {
	// No validator configured → binding must fail closed (never record on an
	// unverified payee), even though everything else is well-formed.
	s, _, ws := wsWithRoles(t)
	pid := mkProject(t, s, "u_owner", ws)
	if _, err := s.BindProjectSandbox(bg, pid, mID, wID, waID, "u_owner", "", ""); err != ErrUnavailable {
		t.Fatalf("no Core validator: want ErrUnavailable (fail closed), got %v", err)
	}
}

func TestBinding_CoreUnavailableFailsClosed(t *testing.T) {
	s, st, ws := wsWithRoles(t)
	s.SetPayeeValidator(&fakePayee{err: errors.New("core down")})
	pid := mkProject(t, s, "u_owner", ws)
	if _, err := s.BindProjectSandbox(bg, pid, mID, wID, waID, "u_owner", "", ""); err != ErrUnavailable {
		t.Fatalf("Core unavailable: want ErrUnavailable, got %v", err)
	}
	if b, _ := st.ActiveBindingForProject(bg, pid); b != nil {
		t.Error("no binding may be recorded when Core is unavailable")
	}
}

func TestBinding_CoreRejectsInvalidPayee(t *testing.T) {
	s, st, ws := wsWithRoles(t)
	fp := &fakePayee{valid: false, reason: "MERCHANT_MISMATCH"}
	s.SetPayeeValidator(fp)
	pid := mkProject(t, s, "u_owner", ws)
	// A submitted-but-invalid Core relationship (cross-merchant wallet, inactive,
	// Live) must be rejected before any binding is recorded.
	if _, err := s.BindProjectSandbox(bg, pid, mID, wID, waID, "u_owner", "", ""); err != ErrValidation {
		t.Fatalf("invalid payee: want ErrValidation, got %v", err)
	}
	if n := fp.callCount(); n != 1 {
		t.Errorf("Core must be consulted exactly once, got %d", n)
	}
	if b, _ := st.ActiveBindingForProject(bg, pid); b != nil {
		t.Error("no binding may be recorded for an invalid payee")
	}
	// The rejection is audited with the machine reason (no secrets).
	var rejected bool
	for _, ev := range st.Audits {
		if ev.Action == "project.sandbox_bind_rejected" {
			rejected = true
			if ev.Metadata["reason"] != "MERCHANT_MISMATCH" {
				t.Errorf("rejection audit must carry the reason, got %v", ev.Metadata["reason"])
			}
		}
	}
	if !rejected {
		t.Error("invalid-payee binding must emit a rejection audit event")
	}
}

func TestBinding_RequiresAllIdsAndProject(t *testing.T) {
	s, _, ws := boundSvc(t)
	pid := mkProject(t, s, "u_owner", ws)

	if _, err := s.BindProjectSandbox(bg, pid, "", wID, waID, "u_owner", "", ""); err != ErrValidation {
		t.Errorf("missing merchant_id: want ErrValidation, got %v", err)
	}
	if _, err := s.BindProjectSandbox(bg, pid, mID, wID, "", "u_owner", "", ""); err != ErrValidation {
		t.Errorf("missing wallet_account_id: want ErrValidation, got %v", err)
	}
	// Unknown project cannot be bound.
	if _, err := s.BindProjectSandbox(bg, "p_missing", mID, wID, waID, "u_owner", "", ""); err != ErrNotFound {
		t.Errorf("unknown project: want ErrNotFound, got %v", err)
	}
}

func TestIntrospect_UnboundProjectIsBoundFalse(t *testing.T) {
	s, _, ws := boundSvc(t)
	pid := mkProject(t, s, "u_owner", ws)
	_, raw, err := s.CreateAPIKey(bg, "u_owner", pid, KindSecret, "srv", []string{"payment_sessions:write"}, "", "")
	if err != nil {
		t.Fatal(err)
	}
	intro, err := s.IntrospectKey(bg, raw)
	if err != nil {
		t.Fatalf("valid key must introspect even with no binding: %v", err)
	}
	if intro.Bound || intro.MerchantID != "" || intro.WalletAccountID != "" {
		t.Errorf("unbound project must yield Bound=false with no payee ids, got %+v", intro)
	}
}

func TestIntrospect_BoundProjectSurfacesPayee(t *testing.T) {
	s, _, ws := boundSvc(t)
	pid := mkProject(t, s, "u_owner", ws)
	if _, err := s.BindProjectSandbox(bg, pid, mID, wID, waID, "u_owner", "", ""); err != nil {
		t.Fatal(err)
	}
	_, raw, _ := s.CreateAPIKey(bg, "u_owner", pid, KindSecret, "srv", []string{"payment_sessions:write"}, "", "")

	intro, err := s.IntrospectKey(bg, raw)
	if err != nil {
		t.Fatal(err)
	}
	if !intro.Bound || intro.MerchantID != mID || intro.WalletID != wID || intro.WalletAccountID != waID {
		t.Errorf("bound project must surface opaque payee ids, got %+v", intro)
	}
}

// sealViaStore marks a binding sealed the way the gateway's atomic UPDATE does
// (ADR-055). The seal is issued by the api-gateway on the request that creates
// the payment artifact; developer-api only has to REFUSE to move a sealed
// binding, which is what these tests exercise.
func sealViaStore(t *testing.T, st *memStore, projectID string) {
	t.Helper()
	b, err := st.ActiveBindingForProject(bg, projectID)
	if err != nil || b == nil {
		t.Fatalf("no active binding to seal for %s: %v", projectID, err)
	}
	if err := st.MarkBindingArtifactCreated(bg, b.ID); err != nil {
		t.Fatalf("seal: %v", err)
	}
}

func TestBinding_SealIsIdempotentAndPreservesTheBinding(t *testing.T) {
	s, st, ws := boundSvc(t)
	pid := mkProject(t, s, "u_owner", ws)
	if _, err := s.BindProjectSandbox(bg, pid, mID, wID, waID, "u_owner", "", ""); err != nil {
		t.Fatal(err)
	}
	sealViaStore(t, st, pid)
	sealViaStore(t, st, pid) // idempotent
	b, _ := st.ActiveBindingForProject(bg, pid)
	if b == nil || !b.ArtifactCreated || b.MerchantID != mID {
		t.Fatalf("binding must remain ACTIVE, sealed and unmoved, got %+v", b)
	}
}

func TestBinding_AuditRecordsNoSecretsAndIdentifiesMerchant(t *testing.T) {
	s, st, ws := boundSvc(t)
	pid := mkProject(t, s, "u_owner", ws)
	if _, err := s.BindProjectSandbox(bg, pid, mID, wID, waID, "u_owner", "1.2.3.4", "req-1"); err != nil {
		t.Fatal(err)
	}
	var found bool
	for _, ev := range st.Audits {
		if ev.Action == "project.sandbox_bound" {
			found = true
			if ev.Metadata["merchant_id"] != mID {
				t.Errorf("audit must record the bound merchant, got %v", ev.Metadata["merchant_id"])
			}
			for k := range ev.Metadata {
				if strings.Contains(strings.ToLower(k), "secret") || strings.Contains(strings.ToLower(k), "key") {
					t.Errorf("audit metadata must not carry secrets, saw key %q", k)
				}
			}
		}
	}
	if !found {
		t.Error("binding must emit a project.sandbox_bound audit event")
	}
}

// ── Rebinding ────────────────────────────────────────────────────────────────
//
// Binding used to be a one-way door: CreateBinding conflicts on the
// one-ACTIVE-per-project index and nothing ever set a binding to DISABLED, so a
// project bound to the wrong merchant stayed bound to it forever. DOA sat in
// exactly that state, resolving an E2E fixture instead of @doa.
//
// The correction has to stay narrow, so what it REFUSES is tested as closely as
// what it does.

func TestRebind_ReplacesTheActiveBinding(t *testing.T) {
	s, st, ws := boundSvc(t)
	pid := mkProject(t, s, "u_owner", ws)
	first, err := s.BindProjectSandbox(bg, pid, mID, wID, waID, "u_owner", "", "")
	if err != nil {
		t.Fatal(err)
	}

	b, superseded, err := s.RebindProjectSandbox(bg, pid, "m2", "w2", "wa2", "u_owner", "", "")
	if err != nil {
		t.Fatalf("rebind: %v", err)
	}
	if superseded != first.ID {
		t.Errorf("superseded = %q, want the previous binding %q", superseded, first.ID)
	}
	if b.MerchantID != "m2" || b.State != "ACTIVE" {
		t.Errorf("new binding = %+v", b)
	}
	// Exactly one ACTIVE binding remains, and it is the new one.
	active, _ := st.ActiveBindingForProject(bg, pid)
	if active == nil || active.ID != b.ID || active.MerchantID != "m2" {
		t.Errorf("active binding after rebind = %+v", active)
	}
	// The old one is retained as DISABLED — the history is not deleted.
	var disabled int
	for _, x := range st.bindings {
		if x.ProjectID == pid && x.State == "DISABLED" {
			disabled++
		}
	}
	if disabled != 1 {
		t.Errorf("disabled bindings = %d, want 1 (the superseded row is kept)", disabled)
	}
}

// ADR-047 §3.2: once a payment artifact exists, the payee can never change.
// Correcting a mistake before any money moved is not the same as reattributing
// money that already did.
func TestRebind_RefusesASealedBinding(t *testing.T) {
	s, st, ws := boundSvc(t)
	pid := mkProject(t, s, "u_owner", ws)
	if _, err := s.BindProjectSandbox(bg, pid, mID, wID, waID, "u_owner", "", ""); err != nil {
		t.Fatal(err)
	}
	sealViaStore(t, st, pid)
	if _, _, err := s.RebindProjectSandbox(bg, pid, "m2", "w2", "wa2", "u_owner", "", ""); err != ErrConflict {
		t.Fatalf("rebind of a sealed binding: want ErrConflict, got %v", err)
	}
	// And the payee is untouched.
	active, _ := st.ActiveBindingForProject(bg, pid)
	if active == nil || active.MerchantID != mID {
		t.Errorf("sealed binding must be unchanged, got %+v", active)
	}
}

// A rebind must be no weaker than a first bind: Core still decides whether the
// payee is real, and a rejection leaves the existing binding in place.
func TestRebind_FailsClosedOnCoreRejection(t *testing.T) {
	s, st, ws := boundSvc(t)
	pid := mkProject(t, s, "u_owner", ws)
	if _, err := s.BindProjectSandbox(bg, pid, mID, wID, waID, "u_owner", "", ""); err != nil {
		t.Fatal(err)
	}
	s.SetPayeeValidator(&fakePayee{valid: false, reason: "WALLET_NOT_OWNED"})
	if _, _, err := s.RebindProjectSandbox(bg, pid, "stolen", "w9", "wa9", "u_owner", "", ""); err != ErrValidation {
		t.Fatalf("rebind to an invalid payee: want ErrValidation, got %v", err)
	}
	active, _ := st.ActiveBindingForProject(bg, pid)
	if active == nil || active.MerchantID != mID {
		t.Errorf("a rejected rebind must leave the payee alone, got %+v", active)
	}

	s.SetPayeeValidator(nil)
	if _, _, err := s.RebindProjectSandbox(bg, pid, "m2", "w2", "wa2", "u_owner", "", ""); err != ErrUnavailable {
		t.Errorf("no validator: want ErrUnavailable, got %v", err)
	}
}

func TestRebind_RequiresAllIdsAndAKnownProject(t *testing.T) {
	s, _, ws := boundSvc(t)
	pid := mkProject(t, s, "u_owner", ws)
	for _, c := range []struct{ name, p, m, w, wa, actor string }{
		{"no project", "", mID, wID, waID, "u_owner"},
		{"no merchant", pid, "", wID, waID, "u_owner"},
		{"no wallet", pid, mID, "", waID, "u_owner"},
		{"no wallet account", pid, mID, wID, "", "u_owner"},
		{"no actor", pid, mID, wID, waID, ""},
	} {
		if _, _, err := s.RebindProjectSandbox(bg, c.p, c.m, c.w, c.wa, c.actor, "", ""); err != ErrValidation {
			t.Errorf("%s: want ErrValidation, got %v", c.name, err)
		}
	}
	if _, _, err := s.RebindProjectSandbox(bg, "p_missing", mID, wID, waID, "u_owner", "", ""); err != ErrNotFound {
		t.Error("unknown project must be NotFound")
	}
}

// A rebind is a change of financial payee, so it must be legible afterwards:
// which project, which new merchant, and which binding it replaced.
func TestRebind_AuditsBothSidesOfTheChange(t *testing.T) {
	s, st, ws := boundSvc(t)
	pid := mkProject(t, s, "u_owner", ws)
	first, _ := s.BindProjectSandbox(bg, pid, mID, wID, waID, "u_owner", "", "")
	b, _, err := s.RebindProjectSandbox(bg, pid, "m2", "w2", "wa2", "u_owner", "1.2.3.4", "req-1")
	if err != nil {
		t.Fatal(err)
	}
	var found bool
	for _, ev := range st.Audits {
		if ev.Action == "project.sandbox_rebound" && ev.Subject == "BINDING:"+b.ID {
			found = true
			if ev.Metadata["superseded_binding_id"] != first.ID {
				t.Errorf("audit must name the replaced binding, got %v", ev.Metadata["superseded_binding_id"])
			}
			if ev.Metadata["merchant_id"] != "m2" {
				t.Errorf("audit must name the new merchant, got %v", ev.Metadata["merchant_id"])
			}
		}
	}
	if !found {
		t.Error("no project.sandbox_rebound audit event")
	}
}

// Non-vacuity: without the rebind path this is what a caller gets, and it is
// why DOA could not be corrected.
func TestRebind_PlainBindStillConflicts(t *testing.T) {
	s, _, ws := boundSvc(t)
	pid := mkProject(t, s, "u_owner", ws)
	if _, err := s.BindProjectSandbox(bg, pid, mID, wID, waID, "u_owner", "", ""); err != nil {
		t.Fatal(err)
	}
	if _, err := s.BindProjectSandbox(bg, pid, "m2", "w2", "wa2", "u_owner", "", ""); err != ErrConflict {
		t.Fatalf("a plain bind must still refuse to replace: got %v", err)
	}
}
