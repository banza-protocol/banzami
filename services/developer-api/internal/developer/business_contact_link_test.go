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
// server-side enrolment contact (email), and whether that contact is VERIFIED —
// what the Postgres VerifiedLinkContactByHandle would return. No workspace binding
// is needed: control is proven by the OTP to the server-side contact (ADR-060
// §7/§8). When verified is false, email models the unverified enrolment contact
// (an approved application email, or the merchant email) — never a link target.
func seedBusiness(t *testing.T, s *Service, handle, email string, verified bool) string {
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
	mem.handleContacts[merchantID] = email
	mem.verifiedContacts[merchantID] = verified
	mem.mu.Unlock()
	return merchantID
}

// markVerified flips a seeded Business's contact to verified, modelling the
// gateway persisting a verified contact after a successful enrolment code.
func markVerified(t *testing.T, s *Service, merchantID string) {
	t.Helper()
	mem := s.store.(*memStore)
	mem.mu.Lock()
	mem.verifiedContacts[merchantID] = true
	mem.mu.Unlock()
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

// (1) A verified Business contact → the link OTP is sent (then confirm → bind).
func TestPathB_VerifiedContactSendsLinkCode(t *testing.T) {
	s, o, pid, _ := pathBSvc(t)
	merchant := seedBusiness(t, s, "doa", "contact@negocio.example", true)
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

// (2) An approved APPLICATION email that is not yet verified must NOT receive a
// link OTP — the flow asks for enrolment instead.
func TestPathB_UnverifiedApplicationEmailDoesNotSendLinkOTP(t *testing.T) {
	s, o, pid, _ := pathBSvc(t)
	seedBusiness(t, s, "doa", "owner@application.example", false) // application email, unverified
	res, err := s.StartBusinessLinkByHandle(bg, "u_owner", pid, "@doa", "", "")
	if err != nil {
		t.Fatalf("resolvable handle: %v", err)
	}
	if !res.NeedsContact || res.MaskedEmail != "" {
		t.Fatalf("expected needs-contact, got %+v", res)
	}
	if len(o.linkStarts) != 0 {
		t.Fatal("a link OTP was sent to an unverified application email")
	}
}

// (3) A MERCHANT email that is not yet verified must NOT receive a link OTP.
func TestPathB_UnverifiedMerchantEmailDoesNotSendLinkOTP(t *testing.T) {
	s, o, pid, _ := pathBSvc(t)
	seedBusiness(t, s, "doa", "billing@merchant.example", false) // merchant email, unverified
	res, err := s.StartBusinessLinkByHandle(bg, "u_owner", pid, "doa", "", "")
	if err != nil {
		t.Fatalf("resolvable handle: %v", err)
	}
	if !res.NeedsContact || res.MaskedEmail != "" {
		t.Fatalf("expected needs-contact, got %+v", res)
	}
	if len(o.linkStarts) != 0 {
		t.Fatal("a link OTP was sent to an unverified merchant email")
	}
}

// (4) Enrolment sends BUSINESS_CONTACT_VERIFY to the server-side contact (never a
// caller address) and, on a correct code, persists a verified contact. (5) After
// that, Path B sends the link OTP. Together they also prove (8): the Business is a
// standalone one — no workspace binding exists to it — yet its owner links it via
// the OTP proof alone.
func TestPathB_EnrolThenLinkStandaloneBusiness(t *testing.T) {
	s, o, pid, _ := pathBSvc(t)
	merchant := seedBusiness(t, s, "doa", "owner@application.example", false)

	// (4) Enrolment: the code goes to the server-side contact, not a typed address.
	masked, err := s.StartBusinessContactEnrolment(bg, "u_owner", pid, "@doa", "", "")
	if err != nil || masked == "" {
		t.Fatalf("start enrolment: %v %q", err, masked)
	}
	if len(o.contactStarts) != 1 || o.contactStarts[0] != merchant+":owner@application.example" {
		t.Fatalf("enrolment OTP not sent to the server-side contact: %v", o.contactStarts)
	}
	if len(o.linkStarts) != 0 {
		t.Fatal("a link OTP went out before any verified contact existed")
	}
	if _, err := s.ConfirmBusinessContactEnrolment(bg, "u_owner", pid, "doa", "123456", "", ""); err != nil {
		t.Fatalf("confirm enrolment: %v", err)
	}
	if len(o.persisted) != 1 {
		t.Fatalf("verified contact not persisted: %v", o.persisted)
	}

	// (5) The contact is now verified → Path B sends the link OTP.
	markVerified(t, s, merchant)
	res, err := s.StartBusinessLinkByHandle(bg, "u_owner", pid, "doa", "", "")
	if err != nil || res.NeedsContact || res.MaskedEmail == "" {
		t.Fatalf("link after verification: %v %+v", err, res)
	}
	if len(o.linkStarts) != 1 {
		t.Fatalf("link OTP not sent after verification: %v", o.linkStarts)
	}
	// (8) No workspace binding to this merchant was ever seeded — a standalone
	// Business linked purely by the OTP proof. Finish the link and bind.
	o.target = &gatewayclient.LinkTarget{MerchantID: merchant, WalletID: uuid.NewString(), WalletAccountID: uuid.NewString(), Handle: "doa", KybStatus: "SANDBOX_SYNTHETIC"}
	if _, err := s.ConfirmBusinessLinkByHandle(bg, "u_owner", pid, "doa", "123456", "", ""); err != nil {
		t.Fatalf("confirm link: %v", err)
	}
	if b, _ := s.store.ActiveBindingForProject(bg, pid); b == nil || b.MerchantID != merchant {
		t.Fatalf("standalone Business not bound: %+v", b)
	}
}

// (6) A synthetic .test placeholder is never a usable contact → neutral not-found,
// and neither a link nor an enrolment OTP is ever sent.
func TestPathB_TestPlaceholderNeverUsed(t *testing.T) {
	s, o, pid, _ := pathBSvc(t)
	seedBusiness(t, s, "synthetic", "merchant@p31f9b262.test", false)
	if _, err := s.StartBusinessLinkByHandle(bg, "u_owner", pid, "@synthetic", "", ""); !errors.Is(err, ErrBusinessNotManaged) {
		t.Fatalf("a .test placeholder was not neutral on link: %v", err)
	}
	if _, err := s.StartBusinessContactEnrolment(bg, "u_owner", pid, "@synthetic", "", ""); !errors.Is(err, ErrBusinessNotManaged) {
		t.Fatalf("a .test placeholder was not neutral on enrolment: %v", err)
	}
	if len(o.linkStarts) != 0 || len(o.contactStarts) != 0 {
		t.Fatalf("an OTP targeted a .test placeholder: link=%v contact=%v", o.linkStarts, o.contactStarts)
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
