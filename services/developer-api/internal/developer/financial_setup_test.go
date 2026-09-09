package developer

import (
	"strings"
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

	// Pricing assignment, which provisioning must perform before the project is
	// ever READY.
	pricingCalls  int
	gotProfile    string
	gotPricingFor string
	pricingErr    error

	// Business readiness — the @banza handle and Sandbox KYB without which the
	// Business can receive money and never move it.
	readinessCalls  int
	gotReadinessFor string
	gotReadinessPrj string
	readinessErr    error
}

func (f *fakeProvisioner) ProvisionSandboxReadiness(_ context.Context, merchantID, projectID string) (string, string, error) {
	f.mu.Lock()
	f.readinessCalls++
	f.gotReadinessFor, f.gotReadinessPrj = merchantID, projectID
	f.mu.Unlock()
	if f.readinessErr != nil {
		return "", "", f.readinessErr
	}
	h := strings.ReplaceAll(projectID, "-", "")
	for len(h) < 12 {
		h += "0"
	}
	return "p" + h[:12], "APPROVED", nil
}

func (f *fakeProvisioner) readinessCount() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.readinessCalls
}

func (f *fakeProvisioner) AssignPricingProfile(_ context.Context, merchantID, profileCode string) error {
	f.mu.Lock()
	f.pricingCalls++
	f.gotPricingFor, f.gotProfile = merchantID, profileCode
	f.mu.Unlock()
	return f.pricingErr
}

func (f *fakeProvisioner) pricingCount() int { f.mu.Lock(); defer f.mu.Unlock(); return f.pricingCalls }

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

// Adoption must not be adoption of somebody else's owner.
//
// The resumable path finds a partly-provisioned owner by its derived address.
// That derivation is sound, but it is a naming convention, and a naming
// convention is not an authority proof. So before binding to a recovered owner
// the service asks the one question that would matter if the derivation were
// ever wrong: does another project already hold it.
func TestFinancialSetup_WillNotAdoptAnotherProjectsOwner(t *testing.T) {
	s, f, pidA := setupSvc(t)
	wss, _ := s.ListWorkspaces(bg, "u_owner")
	pidB := mkProject(t, s, "u_owner", wss[0].ID)

	// A sets up and holds owner m_1.
	if _, err := s.ConfigureProjectFinancialSandbox(bg, "u_owner", pidA, "", ""); err != nil {
		t.Fatal(err)
	}
	a, _ := s.store.ActiveBindingForProject(bg, pidA)

	// Now B's provisioning returns A's owner — the shape a wrong derivation, a
	// recycled address or a collision would take.
	f.mu.Lock()
	f.seq = 0 // the next call returns m_1 again
	f.mu.Unlock()

	if _, err := s.ConfigureProjectFinancialSandbox(bg, "u_owner", pidB, "", ""); err == nil {
		t.Fatal("B adopted the owner A holds")
	}
	if b, _ := s.store.ActiveBindingForProject(bg, pidB); b != nil {
		t.Errorf("B was bound to %s despite the refusal", b.MerchantID)
	}
	// A is untouched.
	stillA, _ := s.store.ActiveBindingForProject(bg, pidA)
	if stillA == nil || stillA.MerchantID != a.MerchantID {
		t.Error("A's binding changed while B was refused")
	}
}

// A project resuming its OWN partial provisioning is not blocked by its own
// binding — there is none yet — and adopting the owner it made earlier is the
// whole point of the recovery path.
func TestFinancialSetup_ResumesItsOwnPartialProvisioning(t *testing.T) {
	s, f, pid := setupSvc(t)

	// First attempt dies before the PRIMARY account is known.
	f.stopAt = "wallet"
	if _, err := s.ConfigureProjectFinancialSandbox(bg, "u_owner", pid, "", ""); err == nil {
		t.Fatal("a partial provisioning reported success")
	}

	// The retry completes, on the same owner rather than a second one.
	f.stopAt = ""
	f.mu.Lock()
	f.seq = 0 // the provisioner hands back what it made before
	f.mu.Unlock()
	st, err := s.ConfigureProjectFinancialSandbox(bg, "u_owner", pid, "", "")
	if err != nil {
		t.Fatalf("the retry did not converge: %v", err)
	}
	if st.State != FinancialReady {
		t.Errorf("state after recovery = %q", st.State)
	}
	if b, _ := s.store.ActiveBindingForProject(bg, pid); b == nil || b.MerchantID != "m_1" {
		t.Error("the retry bound to a different owner than the one it had already made")
	}
}

// Cardinality, asserted rather than assumed: whatever happened above, the
// project ends with exactly one of each thing.
func TestFinancialSetup_ExactlyOneOfEverything(t *testing.T) {
	s, f, pid := setupSvc(t)
	for i := 0; i < 3; i++ {
		if _, err := s.ConfigureProjectFinancialSandbox(bg, "u_owner", pid, "", ""); err != nil {
			t.Fatalf("call %d: %v", i, err)
		}
	}
	if f.callCount() != 1 {
		t.Errorf("provisioned %d times across three setup calls", f.callCount())
	}
	b, err := s.store.ActiveBindingForProject(bg, pid)
	if err != nil || b == nil {
		t.Fatal("no binding")
	}
	held, err := s.store.ProjectsBoundToMerchant(bg, b.MerchantID)
	if err != nil {
		t.Fatal(err)
	}
	if len(held) != 1 || held[0] != pid {
		t.Errorf("owner %s is held by %v, want exactly [%s]", b.MerchantID, held, pid)
	}
}

// A project is never READY without a pricing policy.
//
// "Unpriced" and "priced at zero" look identical in a fee column and are
// completely different facts. Provisioning assigns the explicit Sandbox default
// so a new project is priced by a rule that says zero, never by nothing
// matching — which is the state that used to be worth the whole fee to whoever
// noticed it.
func TestFinancialSetup_AssignsExplicitDefaultPricing(t *testing.T) {
	s, f, pid := setupSvc(t)

	st, err := s.ConfigureProjectFinancialSandbox(bg, "u_owner", pid, "", "")
	if err != nil {
		t.Fatal(err)
	}
	if st.State != FinancialReady {
		t.Fatalf("state = %q", st.State)
	}
	if f.pricingCount() != 1 {
		t.Errorf("pricing assigned %d times, want 1", f.pricingCount())
	}
	if f.gotProfile != SandboxDefaultPricingProfile {
		t.Errorf("assigned profile %q, want %s", f.gotProfile, SandboxDefaultPricingProfile)
	}
	b, _ := s.store.ActiveBindingForProject(bg, pid)
	if b == nil || f.gotPricingFor != b.MerchantID {
		t.Error("pricing was assigned to a different owner than the one bound")
	}
}

// Pricing comes before the binding, so a project that cannot be priced never
// becomes usable. The alternative is an owner settling unpriced for however
// long it takes somebody to notice.
func TestFinancialSetup_PricingFailureLeavesProjectUnconfigured(t *testing.T) {
	s, f, pid := setupSvc(t)
	f.pricingErr = errors.New("core unavailable")

	if _, err := s.ConfigureProjectFinancialSandbox(bg, "u_owner", pid, "", ""); err == nil {
		t.Fatal("a project with no pricing reported success")
	}
	st, _ := s.ProjectFinancialSetup(bg, "u_owner", pid)
	if st.State != FinancialUnconfigured {
		t.Errorf("state after a pricing failure = %q, want %s", st.State, FinancialUnconfigured)
	}
	if b, _ := s.store.ActiveBindingForProject(bg, pid); b != nil {
		t.Error("a binding was recorded for an owner with no pricing policy")
	}
}

// …and the retry resumes it: same owner, one pricing assignment that sticks.
func TestFinancialSetup_PricingFailureRecovers(t *testing.T) {
	s, f, pid := setupSvc(t)
	f.pricingErr = errors.New("core unavailable")
	_, _ = s.ConfigureProjectFinancialSandbox(bg, "u_owner", pid, "", "")

	f.pricingErr = nil
	f.mu.Lock()
	f.seq = 0 // the provisioner hands back the owner it already made
	f.mu.Unlock()

	st, err := s.ConfigureProjectFinancialSandbox(bg, "u_owner", pid, "", "")
	if err != nil {
		t.Fatalf("the retry did not converge: %v", err)
	}
	if st.State != FinancialReady {
		t.Errorf("state = %q", st.State)
	}
	if f.callCount() != 2 {
		t.Errorf("provisioner called %d times across two attempts", f.callCount())
	}
	b, _ := s.store.ActiveBindingForProject(bg, pid)
	if b == nil || b.MerchantID != "m_1" {
		t.Error("the retry bound a different owner than the one it had already priced")
	}
}
