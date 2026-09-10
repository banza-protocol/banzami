package developer

import (
	"context"
	"strings"
	"sync"
	"testing"
	"time"
)

// Financial setup for a Project. The one-click Sandbox owner is retired (a
// self-approved Business); a Project applies through the Business review or
// connects an existing Business with its consent (financial_onboarding.go).
// These helpers give tests a Project and, where a test needs one, a bound
// Business — bound the way the onboarding binds it.

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

// configureForTest binds a Project to a Business the way onboarding does once
// a Business exists (an approval, or a consent code): through the binding.
func configureForTest(s *Service, actor, projectID string) (SandboxBinding, error) {
	return s.BindProjectSandbox(bg, projectID, "m_"+projectID, "w_"+projectID, "wa_"+projectID, actor, "", "")
}
