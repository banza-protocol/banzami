package developer

import (
	"errors"
	"testing"

	"github.com/banzami/banzami/services/developer-api/internal/gatewayclient"
	"github.com/google/uuid"
)

// Path B authorisation + flow in the developer service. The crux: a @banza the
// workspace does not manage is a neutral not-found (never an enumeration oracle);
// a managed one with no verified contact asks for enrolment; a managed one with a
// verified contact sends the link code there.

// seedBusiness seeds a resolvable real Business: a @banza -> merchant with a
// server-side stored contact, and whether it has a verified contact — what the
// Postgres LinkableMerchantByHandle would return. No workspace binding is needed
// now: control is proven by the OTP to the stored contact (ADR-060 §7/§8).
func seedBusiness(t *testing.T, s *Service, handle string, verified bool) string {
	t.Helper()
	mem, ok := s.store.(*memStore)
	if !ok {
		t.Skip("not the in-memory store")
	}
	merchantID := uuid.NewString()
	mem.mu.Lock()
	if mem.handles == nil {
		mem.handles = map[string]string{}
		mem.handleContacts = map[string]string{}
		mem.verifiedContacts = map[string]bool{}
	}
	mem.handles[handle] = merchantID
	mem.handleContacts[merchantID] = "contact@negocio.example"
	mem.verifiedContacts[merchantID] = verified
	mem.mu.Unlock()
	return merchantID
}

func pathBSvc(t *testing.T) (*Service, *fakeOnboarding, string, string) {
	t.Helper()
	s, _, o, pid := onboardingSvc(t)
	s.SetSandboxBusinessProvisioner(&fakeSandboxBusinesses{})
	// The workspace id of the returned project.
	p, _ := s.store.Project(bg, pid)
	return s, o, pid, p.WorkspaceID
}

func TestPathB_UnmanagedHandleIsNeutralNotFound(t *testing.T) {
	s, _, pid, _ := pathBSvc(t)
	// No handle seeded → neutral not-found, identical to a nonexistent @banza.
	if _, err := s.StartBusinessLinkByHandle(bg, "u_owner", pid, "@alguem", "", ""); !errors.Is(err, ErrBusinessNotManaged) {
		t.Fatalf("an unmanaged @banza was not neutral: %v", err)
	}
}

func TestPathB_ResolvableWithoutVerifiedContactNeedsEnrolment(t *testing.T) {
	s, o, pid, _ := pathBSvc(t)
	seedBusiness(t, s, "doa", false) // real business, stored contact, not verified
	res, err := s.StartBusinessLinkByHandle(bg, "u_owner", pid, "@doa", "", "")
	if err != nil {
		t.Fatalf("resolvable handle: %v", err)
	}
	if !res.NeedsContact || res.MaskedEmail != "" {
		t.Fatalf("expected needs-contact, got %+v", res)
	}
	if len(o.linkStarts) != 0 {
		t.Fatal("a link OTP was sent to a Business with no verified contact")
	}
}

func TestPathB_VerifiedContactSendsLinkCode(t *testing.T) {
	s, o, pid, _ := pathBSvc(t)
	merchant := seedBusiness(t, s, "doa", true)
	res, err := s.StartBusinessLinkByHandle(bg, "u_owner", pid, "doa", "", "")
	if err != nil || res.NeedsContact || res.MaskedEmail == "" {
		t.Fatalf("start link: %v %+v", err, res)
	}
	if len(o.linkStarts) != 1 {
		t.Fatalf("link OTP not sent: %v", o.linkStarts)
	}
	// Confirm → redeem → bind.
	o.target = &gatewayclient.LinkTarget{MerchantID: merchant, WalletID: uuid.NewString(), WalletAccountID: uuid.NewString(), Handle: "doa", KybStatus: "SANDBOX_SYNTHETIC"}
	if _, err := s.ConfirmBusinessLinkByHandle(bg, "u_owner", pid, "doa", "123456", "", ""); err != nil {
		t.Fatalf("confirm link: %v", err)
	}
	b, _ := s.store.ActiveBindingForProject(bg, pid)
	if b == nil || b.MerchantID != merchant {
		t.Fatalf("project not bound to the existing Business: %+v", b)
	}
}

func TestPathB_CreateVerifiedProvisionsAfterCode(t *testing.T) {
	s, o, pid, _ := pathBSvc(t)
	// A wrong code never provisions.
	o.confirmContactErr = errors.New("gateway says invalid")
	o.confirmContactErr = &gatewayclient.Refusal{Status: 400, Code: "INVALID_CODE"}
	if _, err := s.CreateSandboxBusinessVerified(bg, "u_owner", pid, "STANDARD", "minha_loja", "000000", "", ""); !errors.Is(err, ErrVerificationCode) {
		t.Fatalf("a wrong code should refuse: %v", err)
	}
	if b, _ := s.store.ActiveBindingForProject(bg, pid); b != nil {
		t.Fatal("a wrong code provisioned a Business")
	}
	// A correct code provisions, persists the contact, and binds.
	o.confirmContactErr = nil
	st, err := s.CreateSandboxBusinessVerified(bg, "u_owner", pid, "STANDARD", "minha_loja", "123456", "", "")
	if err != nil || st.State != FinancialReady {
		t.Fatalf("verified create: %v %s", err, st.State)
	}
	if len(o.persisted) != 1 {
		t.Fatalf("the verified contact was not persisted: %v", o.persisted)
	}
}

func TestPathB_StartContactRequiresOwnerOrAdmin(t *testing.T) {
	s, _, pid, _ := pathBSvc(t)
	for _, who := range []string{"u_dev", "u_fin", "u_view"} {
		if _, err := s.StartSandboxBusinessContact(bg, who, pid, "dono@example.com", "", ""); !errors.Is(err, ErrForbidden) {
			t.Fatalf("%s started contact verification: %v", who, err)
		}
	}
}
