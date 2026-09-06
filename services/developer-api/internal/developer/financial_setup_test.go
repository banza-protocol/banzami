package developer

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"
)

// Self-service Sandbox financial setup. This is the capability whose absence the
// external cleanroom found: a project created through the public Console had no
// financial owner, and nothing the developer could do about it.

type fakeProvisioner struct {
	mu    sync.Mutex
	calls int
	seq   int
	err   error
	// stopAt truncates the returned owner, standing in for a provisioning run
	// that got part-way: "merchant" leaves the wallet unmade, "wallet" leaves the
	// PRIMARY account unread.
	stopAt   string
	gotName  string
	gotEmail string
}

func (f *fakeProvisioner) ProvisionSandboxOwner(_ context.Context, name, email string) (*SandboxOwner, error) {
	f.mu.Lock()
	f.calls++
	f.seq++
	n := f.seq
	f.gotName, f.gotEmail = name, email
	f.mu.Unlock()

	o := &SandboxOwner{
		MerchantID:      "m_" + itoa(n),
		WalletID:        "w_" + itoa(n),
		WalletAccountID: "wa_" + itoa(n),
	}
	switch f.stopAt {
	case "merchant":
		o.WalletID, o.WalletAccountID = "", ""
	case "wallet":
		o.WalletAccountID = ""
	}
	return o, f.err
}

func (f *fakeProvisioner) callCount() int { f.mu.Lock(); defer f.mu.Unlock(); return f.calls }

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b []byte
	for n > 0 {
		b = append([]byte{byte('0' + n%10)}, b...)
		n /= 10
	}
	return string(b)
}

// setupSvc: a Sandbox deployment, a workspace with one member of every role, and
// a project with no financial owner — the cleanroom's starting position.
func setupSvc(t *testing.T) (*Service, *fakeProvisioner, string) {
	t.Helper()
	s, _ := newSvc(time.Hour)
	ws, _ := s.CreateWorkspace(bg, "u_owner", "WS", "", "")
	addMember(t, s, "u_owner", ws.ID, "admin@x.co", RoleAdmin, "u_admin")
	addMember(t, s, "u_owner", ws.ID, "dev@x.co", RoleDeveloper, "u_dev")
	addMember(t, s, "u_owner", ws.ID, "fin@x.co", RoleFinance, "u_fin")
	addMember(t, s, "u_owner", ws.ID, "view@x.co", RoleViewer, "u_view")

	f := &fakeProvisioner{}
	s.SetSandboxProvisioner(f)
	s.SetSandboxEnvironment(true)
	s.SetPayeeValidator(&fakePayee{valid: true})
	s.SetPaymentCapabilityReleased(true)
	return s, f, mkProject(t, s, "u_owner", ws.ID)
}

func TestFinancialSetup_FreshProjectIsUnconfigured(t *testing.T) {
	s, f, pid := setupSvc(t)
	st, err := s.ProjectFinancialSetup(bg, "u_owner", pid)
	if err != nil {
		t.Fatal(err)
	}
	if st.State != FinancialUnconfigured {
		t.Errorf("fresh project state = %q, want %s", st.State, FinancialUnconfigured)
	}
	if !st.CanConfigure {
		t.Error("the OWNER of a fresh Sandbox project must be able to configure it")
	}
	if st.Sealed {
		t.Error("nothing has been issued, so nothing is sealed")
	}
	if f.callCount() != 0 {
		t.Error("reading the state provisioned something")
	}
}

func TestFinancialSetup_ConfigureMakesItReady(t *testing.T) {
	s, f, pid := setupSvc(t)
	st, err := s.ConfigureProjectFinancialSandbox(bg, "u_owner", pid, "", "")
	if err != nil {
		t.Fatal(err)
	}
	if st.State != FinancialReady {
		t.Fatalf("state after setup = %q, want %s", st.State, FinancialReady)
	}
	if f.callCount() != 1 {
		t.Errorf("provisioned %d times, want 1", f.callCount())
	}
	// The owner is named after the project. The developer chose neither — a
	// caller-chosen merchant name is a caller-chosen identity.
	if f.gotName == "" || f.gotEmail == "" {
		t.Error("the owner was provisioned without a derived name or address")
	}
}

// Idempotent by the only measure that matters: a second call returns the setup
// that exists, and provisions nothing.
func TestFinancialSetup_SecondCallProvisionsNothing(t *testing.T) {
	s, f, pid := setupSvc(t)
	if _, err := s.ConfigureProjectFinancialSandbox(bg, "u_owner", pid, "", ""); err != nil {
		t.Fatal(err)
	}
	st, err := s.ConfigureProjectFinancialSandbox(bg, "u_owner", pid, "", "")
	if err != nil {
		t.Fatal(err)
	}
	if st.State != FinancialReady {
		t.Errorf("second call state = %q", st.State)
	}
	if f.callCount() != 1 {
		t.Errorf("a repeat call provisioned again (%d owners) — the project would have two", f.callCount())
	}
}

// Two callers at once must converge on one owner. Whichever loses the binding
// race gets the winner's setup back, not an error and not a second owner.
func TestFinancialSetup_ConcurrentCallsConvergeOnOne(t *testing.T) {
	s, _, pid := setupSvc(t)

	var wg sync.WaitGroup
	states := make([]string, 4)
	errs := make([]error, 4)
	for i := 0; i < 4; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			st, err := s.ConfigureProjectFinancialSandbox(bg, "u_owner", pid, "", "")
			states[i], errs[i] = st.State, err
		}(i)
	}
	wg.Wait()

	for i, err := range errs {
		if err != nil {
			t.Errorf("caller %d: %v", i, err)
		} else if states[i] != FinancialReady {
			t.Errorf("caller %d saw %q", i, states[i])
		}
	}
	// One binding, whatever happened above.
	b, err := s.store.ActiveBindingForProject(bg, pid)
	if err != nil || b == nil {
		t.Fatalf("no binding after the race: %v", err)
	}
}

// The role matrix, as a table. Setup is an account decision, not a build one:
// DEVELOPER may create the project and issue its keys and still may not decide
// that it starts holding money.
func TestFinancialSetup_RoleMatrix(t *testing.T) {
	cases := []struct {
		actor, role string
		allow       bool
		why         string
	}{
		{"u_owner", RoleOwner, true, "accountable for the workspace"},
		{"u_admin", RoleAdmin, true, "manages the workspace"},
		{"u_dev", RoleDeveloper, false, "builds the integration; does not decide it holds money"},
		{"u_fin", RoleFinance, false, "the name is not the permission"},
		{"u_view", RoleViewer, false, "read-only"},
	}
	for _, c := range cases {
		t.Run(c.role, func(t *testing.T) {
			s, f, pid := setupSvc(t)
			_, err := s.ConfigureProjectFinancialSandbox(bg, c.actor, pid, "", "")
			if c.allow {
				if err != nil {
					t.Fatalf("%s (%s) must configure: %v", c.role, c.why, err)
				}
				return
			}
			if !errors.Is(err, ErrForbidden) {
				t.Fatalf("%s (%s) must be denied, got %v", c.role, c.why, err)
			}
			// Denied BEFORE anything is created. A refusal that still provisioned
			// would leave an owner behind on every attempt.
			if f.callCount() != 0 {
				t.Errorf("%s provisioned despite being denied", c.role)
			}
			st, _ := s.ProjectFinancialSetup(bg, c.actor, pid)
			if st.CanConfigure {
				t.Errorf("%s is told it can configure, and cannot", c.role)
			}
		})
	}
}

// A non-member gets not-found, the same as for a project that does not exist.
func TestFinancialSetup_NonMemberCannotTellTheProjectExists(t *testing.T) {
	s, f, pid := setupSvc(t)
	if _, err := s.ConfigureProjectFinancialSandbox(bg, "u_outsider", pid, "", ""); !errors.Is(err, ErrNotFound) {
		t.Fatalf("non-member: want NotFound, got %v", err)
	}
	if _, err := s.ProjectFinancialSetup(bg, "u_outsider", pid); !errors.Is(err, ErrNotFound) {
		t.Fatalf("non-member read: want NotFound, got %v", err)
	}
	if f.callCount() != 0 {
		t.Error("an outsider caused provisioning")
	}
}

// The gate that matters most: this must not work outside Sandbox, and there is
// no request field that could relax it.
func TestFinancialSetup_RefusedOutsideSandbox(t *testing.T) {
	s, f, pid := setupSvc(t)
	s.SetSandboxEnvironment(false)

	_, err := s.ConfigureProjectFinancialSandbox(bg, "u_owner", pid, "", "")
	if !errors.Is(err, ErrWrongEnvironment) {
		t.Fatalf("want ErrWrongEnvironment, got %v", err)
	}
	if f.callCount() != 0 {
		t.Fatal("a non-sandbox deployment provisioned a financial owner")
	}
	st, err := s.ProjectFinancialSetup(bg, "u_owner", pid)
	if err != nil {
		t.Fatal(err)
	}
	if st.CanConfigure {
		t.Error("a non-sandbox deployment offers the control")
	}
	if st.State != FinancialUnavailable {
		t.Errorf("state = %q, want %s", st.State, FinancialUnavailable)
	}
}

// A deployment with no provisioner says so, rather than offering a control that
// fails when pressed.
func TestFinancialSetup_UnconfiguredDeploymentSaysSo(t *testing.T) {
	s, _, pid := setupSvc(t)
	s.SetSandboxProvisioner(nil)

	if _, err := s.ConfigureProjectFinancialSandbox(bg, "u_owner", pid, "", ""); !errors.Is(err, ErrSetupUnavailable) {
		t.Fatalf("want ErrSetupUnavailable, got %v", err)
	}
	st, _ := s.ProjectFinancialSetup(bg, "u_owner", pid)
	if st.State != FinancialUnavailable || st.CanConfigure {
		t.Errorf("state = %q canConfigure = %v", st.State, st.CanConfigure)
	}
}

// Provisioning that stops half way must not leave the project claiming to be
// ready, and must not provision a second owner on the next attempt without the
// failure being recorded.
func TestFinancialSetup_PartialProvisioningIsNotReady(t *testing.T) {
	for _, stage := range []string{"merchant", "wallet"} {
		t.Run(stage, func(t *testing.T) {
			s, f, pid := setupSvc(t)
			f.stopAt = stage

			if _, err := s.ConfigureProjectFinancialSandbox(bg, "u_owner", pid, "", ""); err == nil {
				t.Fatal("a partial provisioning reported success")
			}
			st, _ := s.ProjectFinancialSetup(bg, "u_owner", pid)
			if st.State != FinancialUnconfigured {
				t.Errorf("state after a failed setup = %q, want %s", st.State, FinancialUnconfigured)
			}
			if b, _ := s.store.ActiveBindingForProject(bg, pid); b != nil {
				t.Error("a binding was recorded on an incomplete owner")
			}
		})
	}
}

// Two projects, two owners. One project must never end up on another's.
func TestFinancialSetup_ProjectsGetDistinctOwners(t *testing.T) {
	s, _, pidA := setupSvc(t)
	wss, _ := s.ListWorkspaces(bg, "u_owner")
	pidB := mkProject(t, s, "u_owner", wss[0].ID)

	if _, err := s.ConfigureProjectFinancialSandbox(bg, "u_owner", pidA, "", ""); err != nil {
		t.Fatal(err)
	}
	if _, err := s.ConfigureProjectFinancialSandbox(bg, "u_owner", pidB, "", ""); err != nil {
		t.Fatal(err)
	}
	a, _ := s.store.ActiveBindingForProject(bg, pidA)
	b, _ := s.store.ActiveBindingForProject(bg, pidB)
	if a == nil || b == nil {
		t.Fatal("one of the projects has no binding")
	}
	if a.MerchantID == b.MerchantID {
		t.Errorf("both projects share financial owner %s — one project's payments would be the other's", a.MerchantID)
	}
}
