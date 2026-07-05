package developer

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
)

// fakePayee is a stub Core payee validator for tests.
type fakePayee struct {
	valid  bool
	reason string
	err    error
	calls  int
}

func (f *fakePayee) ValidatePayee(_ context.Context, _, _, _ string) (bool, string, error) {
	f.calls++
	return f.valid, f.reason, f.err
}

// boundSvc returns a service whose payee validator accepts (valid) by default,
// so binding tests exercise the record/authorize path.
func boundSvc(t *testing.T) (*Service, *memStore, string) {
	t.Helper()
	s, st, ws := wsWithRoles(t)
	s.SetPayeeValidator(&fakePayee{valid: true})
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
	if fp.calls != 1 {
		t.Errorf("Core must be consulted exactly once, got %d", fp.calls)
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

func TestBinding_SealArtifactIdempotentAndPreservesBinding(t *testing.T) {
	s, st, ws := boundSvc(t)
	pid := mkProject(t, s, "u_owner", ws)
	if _, err := s.BindProjectSandbox(bg, pid, mID, wID, waID, "u_owner", "", ""); err != nil {
		t.Fatal(err)
	}
	if err := s.SealBindingArtifact(bg, pid); err != nil {
		t.Fatalf("first seal: %v", err)
	}
	if err := s.SealBindingArtifact(bg, pid); err != nil {
		t.Fatalf("seal must be idempotent: %v", err)
	}
	b, _ := st.ActiveBindingForProject(bg, pid)
	if b == nil || !b.ArtifactCreated {
		t.Fatalf("binding must remain ACTIVE and sealed, got %+v", b)
	}
	// Sealing a project with no binding is a NotFound, never a silent success.
	if err := s.SealBindingArtifact(bg, "p_missing"); err != ErrNotFound {
		t.Errorf("seal unbound: want ErrNotFound, got %v", err)
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
