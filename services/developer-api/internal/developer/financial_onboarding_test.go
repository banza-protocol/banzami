package developer

import (
	"context"
	"errors"
	"github.com/banzami/banzami/services/developer-api/internal/coreclient"
	"testing"

	"github.com/banzami/banzami/services/developer-api/internal/gatewayclient"
)

// A Project gets a Business to receive into by applying (the same review the
// public form goes through) or by connecting one that exists, with its
// consent. It never gets one by pressing a button that approves itself.

type fakeOnboarding struct {
	latest    *gatewayclient.ProjectApplication
	latestErr error
	submitted []gatewayclient.ApplicationInput
	submitErr error
	redeemed  []string
	target    *gatewayclient.LinkTarget
	redeemErr error
}

func (f *fakeOnboarding) LatestForProject(context.Context, string) (*gatewayclient.ProjectApplication, error) {
	return f.latest, f.latestErr
}
func (f *fakeOnboarding) SubmitForProject(_ context.Context, in gatewayclient.ApplicationInput) (string, error) {
	f.submitted = append(f.submitted, in)
	return "app-1", f.submitErr
}
func (f *fakeOnboarding) RedeemLinkCode(_ context.Context, code, projectID string) (*gatewayclient.LinkTarget, error) {
	f.redeemed = append(f.redeemed, code+"@"+projectID)
	return f.target, f.redeemErr
}

type namer string

func (n namer) MerchantName(context.Context, string) (string, error) { return string(n), nil }

func onboardingSvc(t *testing.T) (*Service, *fakeProvisioner, *fakeOnboarding, string) {
	t.Helper()
	s, prov, pid := setupSvc(t)
	o := &fakeOnboarding{}
	s.SetBusinessOnboarding(o)
	s.SetBusinessNamer(namer("Loja Existente"))
	return s, prov, o, pid
}

type fakeSandboxBusinesses struct {
	calls   int
	useCase string
	changed string
	err     error
}

func (f *fakeSandboxBusinesses) ProvisionSandboxBusiness(_ context.Context, projectID, _ string, useCase string) (*coreclient.SandboxBusiness, error) {
	f.calls++
	f.useCase = useCase
	if f.err != nil {
		return nil, f.err
	}
	typ, profile := "MERCHANT", "sandbox-default"
	if useCase == UseCaseApplication {
		typ, profile = "APPLICATION", "sandbox-reference"
	}
	return &coreclient.SandboxBusiness{
		MerchantID: "m_" + projectID, WalletID: "w_" + projectID, WalletAccountID: "wa_" + projectID,
		Handle: "psandbox", UseCase: useCase, BusinessAccountType: typ, PricingProfile: profile, KybStatus: "SANDBOX_SYNTHETIC",
	}, nil
}

func (f *fakeSandboxBusinesses) ChangeSandboxUseCase(_ context.Context, projectID, useCase string) (*coreclient.SandboxBusiness, error) {
	f.changed = useCase
	return &coreclient.SandboxBusiness{MerchantID: "m_" + projectID, UseCase: useCase}, nil
}

// ADR-060: in the Sandbox, a Project gets its Business from a use case, with no
// application and no operator.
func TestSandboxSetup_ProvisionsByUseCaseWithNoReview(t *testing.T) {
	s, _, o, pid := onboardingSvc(t)
	f := &fakeSandboxBusinesses{}
	s.SetSandboxBusinessProvisioner(f)

	st, err := s.ProjectFinancialSetup(bg, "u_owner", pid)
	if err != nil || !st.SelfService || !st.CanConfigure || st.State != FinancialUnconfigured {
		t.Fatalf("a fresh Sandbox Project must offer self-service setup: %v %+v", err, st)
	}
	st, err = s.ConfigureProjectFinancialSandbox(bg, "u_owner", pid, UseCaseApplication, "", "")
	if err != nil || st.State != FinancialReady {
		t.Fatalf("configure: %v %s", err, st.State)
	}
	if f.calls != 1 || f.useCase != UseCaseApplication {
		t.Fatalf("Core was asked %d time(s) for %q", f.calls, f.useCase)
	}
	if len(o.submitted) != 0 {
		t.Fatal("self-service setup submitted a Business application")
	}
	if st.SandboxUseCase == nil || *st.SandboxUseCase != UseCaseApplication {
		t.Fatalf("use case not reported: %v", st.SandboxUseCase)
	}
	// Idempotent: a second press answers with the state and provisions nothing.
	if _, err := s.ConfigureProjectFinancialSandbox(bg, "u_owner", pid, UseCaseStandard, "", ""); err != nil || f.calls != 1 {
		t.Fatalf("second configure: %v, calls %d", err, f.calls)
	}
}

func TestSandboxSetup_RefusesWhatItMust(t *testing.T) {
	s, _, _, pid := onboardingSvc(t)
	f := &fakeSandboxBusinesses{}
	s.SetSandboxBusinessProvisioner(f)
	if _, err := s.ConfigureProjectFinancialSandbox(bg, "u_owner", pid, "PLATFORM", "", ""); !errors.Is(err, ErrInvalidUseCase) {
		t.Fatalf("an unknown use case: %v", err)
	}
	for _, who := range []string{"u_dev", "u_fin", "u_view"} {
		if _, err := s.ConfigureProjectFinancialSandbox(bg, who, pid, UseCaseStandard, "", ""); !errors.Is(err, ErrForbidden) {
			t.Fatalf("%s configured a Project: %v", who, err)
		}
	}
	s.SetSandboxEnvironment(false)
	if _, err := s.ConfigureProjectFinancialSandbox(bg, "u_owner", pid, UseCaseStandard, "", ""); !errors.Is(err, ErrWrongEnvironment) {
		t.Fatalf("outside the Sandbox: %v", err)
	}
	if f.calls != 0 {
		t.Fatal("Core was asked for a Business on a refused request")
	}
}

func TestSandboxSetup_UseCaseIsLockedOnceSealed(t *testing.T) {
	s, _, _, pid := onboardingSvc(t)
	f := &fakeSandboxBusinesses{}
	s.SetSandboxBusinessProvisioner(f)
	if _, err := s.ConfigureProjectFinancialSandbox(bg, "u_owner", pid, UseCaseStandard, "", ""); err != nil {
		t.Fatal(err)
	}
	if _, err := s.ChangeProjectSandboxUseCase(bg, "u_owner", pid, UseCaseApplication, "", ""); err != nil || f.changed != UseCaseApplication {
		t.Fatalf("change before any payment: %v %q", err, f.changed)
	}
	b, _ := s.store.ActiveBindingForProject(bg, pid)
	_ = s.store.MarkBindingArtifactCreated(bg, b.ID)
	f.changed = ""
	if _, err := s.ChangeProjectSandboxUseCase(bg, "u_owner", pid, UseCaseStandard, "", ""); !errors.Is(err, ErrUseCaseSealed) || f.changed != "" {
		t.Fatalf("a sealed Project changed use case: %v", err)
	}
}

func TestOnboarding_AFreshProjectCanApplyOrConnect(t *testing.T) {
	s, _, _, pid := onboardingSvc(t)
	for role, user := range map[string]string{"OWNER": "u_owner", "ADMIN": "u_admin"} {
		st, err := s.ProjectFinancialSetup(bg, user, pid)
		if err != nil {
			t.Fatal(err)
		}
		if st.State != FinancialUnconfigured || st.Onboarding.State != OnboardingNotConfigured || !st.Onboarding.CanAct || !st.CanConfigure {
			t.Fatalf("%s: %+v %+v", role, st, st.Onboarding)
		}
	}
	for _, user := range []string{"u_dev", "u_fin", "u_view"} {
		st, _ := s.ProjectFinancialSetup(bg, user, pid)
		if st.Onboarding.CanAct || st.CanConfigure {
			t.Fatalf("%s may start financial onboarding", user)
		}
	}
}

func TestOnboarding_TheApplicationDrivesTheProjectState(t *testing.T) {
	s, _, o, pid := onboardingSvc(t)
	for status, want := range map[string]string{
		"SUBMITTED": OnboardingInReview, "UNDER_REVIEW": OnboardingInReview,
		"INFORMATION_REQUIRED": OnboardingInformationRequired, "APPROVED": OnboardingApprovedProvisioning,
		"PROVISIONING_FAILED": OnboardingApprovedProvisioning, "REJECTED": OnboardingRejected,
	} {
		o.latest = &gatewayclient.ProjectApplication{ApplicationID: "app-1", Status: status}
		st, err := s.ProjectFinancialSetup(bg, "u_owner", pid)
		if err != nil {
			t.Fatal(err)
		}
		if st.Onboarding.State != want {
			t.Fatalf("%s → %s, want %s", status, st.Onboarding.State, want)
		}
		wantAct := want == OnboardingInformationRequired || want == OnboardingRejected
		if st.Onboarding.CanAct != wantAct {
			t.Fatalf("%s: can_act=%v", status, st.Onboarding.CanAct)
		}
	}
	// An outage reading the application is not a state change.
	o.latest, o.latestErr = nil, errors.New("gateway down")
	if st, err := s.ProjectFinancialSetup(bg, "u_owner", pid); err != nil || st.Onboarding.State != OnboardingNotConfigured {
		t.Fatalf("outage: %v %+v", err, st.Onboarding)
	}
}

func TestOnboarding_ABoundProjectShowsItsBusinessAndWhatBlocksIt(t *testing.T) {
	s, _, _, pid := onboardingSvc(t)
	if _, err := configureForTest(s, "u_owner", pid); err != nil {
		t.Fatal(err)
	}
	r := &ProjectReadiness{}
	h, k := "@loja", "APPROVED"
	r.FinancialIdentity.Handle, r.Kyb.Status = &h, &k
	r.Settlement.Blockers = []string{"FEE_DESTINATION_TYPE_NOT_ALLOWED"}
	s.SetReadinessReader(&fakeReadinessReader{out: r})
	st, err := s.ProjectFinancialSetup(bg, "u_owner", pid)
	if err != nil {
		t.Fatal(err)
	}
	b := st.Onboarding.Business
	if st.Onboarding.State != OnboardingBlocked || b == nil || b.Name != "Loja Existente" || b.Handle != "@loja" || !b.Verified {
		t.Fatalf("%+v %+v", st.Onboarding, b)
	}
	if len(st.Onboarding.Blockers) != 1 || st.Onboarding.Blockers[0] != "FEE_DESTINATION_TYPE_NOT_ALLOWED" {
		t.Fatalf("blockers %v — classification, not KYB, is what blocks this Project", st.Onboarding.Blockers)
	}
	r.Settlement.Blockers = nil
	if st, _ := s.ProjectFinancialSetup(bg, "u_owner", pid); st.Onboarding.State != OnboardingReady || st.Onboarding.CanAct {
		t.Fatalf("ready: %+v", st.Onboarding)
	}
}

func TestOnboarding_TheProjectAndTheMemberComeFromTheSessionNotTheBody(t *testing.T) {
	s, _, o, pid := onboardingSvc(t)
	in := gatewayclient.ApplicationInput{ProjectID: "someone-elses-project", SubmittedByUserID: "u_forged",
		DesiredHandle: "nova_loja", BusinessName: "Nova Loja", Email: "n@x.co", TermsAccepted: true}
	if _, err := s.SubmitFinancialApplication(bg, "u_admin", pid, in, "", ""); err != nil {
		t.Fatal(err)
	}
	got := o.submitted[0]
	if got.ProjectID != pid || got.SubmittedByUserID != "u_admin" {
		t.Fatalf("submitted for %s by %s", got.ProjectID, got.SubmittedByUserID)
	}
	for _, user := range []string{"u_dev", "u_fin", "u_view"} {
		if _, err := s.SubmitFinancialApplication(bg, user, pid, in, "", ""); !errors.Is(err, ErrForbidden) {
			t.Fatalf("%s applied: %v", user, err)
		}
	}
	if _, err := s.SubmitFinancialApplication(bg, "u_stranger", pid, in, "", ""); err == nil {
		t.Fatal("a non-member applied for a Project")
	}
	if _, err := configureForTest(s, "u_owner", pid); err != nil {
		t.Fatal(err)
	}
	if _, err := s.SubmitFinancialApplication(bg, "u_owner", pid, in, "", ""); !errors.Is(err, ErrProjectAlreadyReceiving) {
		t.Fatalf("a bound Project applied for a second Business: %v", err)
	}
}

func TestOnboarding_ConnectingAnExistingBusinessBindsItWithoutRecreatingIt(t *testing.T) {
	s, prov, o, pid := onboardingSvc(t)
	o.target = &gatewayclient.LinkTarget{MerchantID: "m-existing", WalletID: "w-existing", WalletAccountID: "wa-existing",
		Handle: "doa", BusinessName: "Doa", KybStatus: "APPROVED", Environment: "SANDBOX"}
	b, err := s.LinkExistingBusiness(bg, "u_owner", pid, "ABCD-EFGH-JKMN", "", "")
	if err != nil {
		t.Fatal(err)
	}
	if b.Handle != "@doa" || !b.Verified || b.Name != "Doa" {
		t.Fatalf("business %+v", b)
	}
	bound, _ := s.store.ActiveBindingForProject(bg, pid)
	if bound == nil || bound.MerchantID != "m-existing" || bound.WalletID != "w-existing" || bound.WalletAccountID != "wa-existing" {
		t.Fatalf("binding %+v", bound)
	}
	if prov.callCount() != 0 || prov.readinessCount() != 0 || prov.pricingCount() != 0 {
		t.Fatal("connecting an existing Business created, verified or priced something")
	}
	if _, err := s.LinkExistingBusiness(bg, "u_owner", pid, "ABCD-EFGH-JKMN", "", ""); !errors.Is(err, ErrProjectAlreadyReceiving) {
		t.Fatalf("a second connection: %v", err)
	}
}

func TestOnboarding_ConnectingIsRefusedWhileAnApplicationIsInProgressOrTheCodeIsWrong(t *testing.T) {
	s, _, o, pid := onboardingSvc(t)
	o.latest = &gatewayclient.ProjectApplication{Status: "UNDER_REVIEW"}
	var r *gatewayclient.Refusal
	if _, err := s.LinkExistingBusiness(bg, "u_owner", pid, "X", "", ""); !errors.As(err, &r) || r.Code != "APPLICATION_IN_PROGRESS" {
		t.Fatalf("connected over an application in progress: %v", err)
	}
	if len(o.redeemed) != 0 {
		t.Fatal("the code was spent before the refusal")
	}
	o.latest = nil
	o.redeemErr = &gatewayclient.Refusal{Status: 422, Code: "LINK_CODE_INVALID", Message: "the code is not valid"}
	if _, err := s.LinkExistingBusiness(bg, "u_owner", pid, "WRONG", "", ""); !errors.As(err, &r) || r.Code != "LINK_CODE_INVALID" {
		t.Fatalf("a wrong code: %v", err)
	}
	if b, _ := s.store.ActiveBindingForProject(bg, pid); b != nil {
		t.Fatal("a wrong code bound the Project")
	}
	if _, err := s.LinkExistingBusiness(bg, "u_dev", pid, "ABCD", "", ""); !errors.Is(err, ErrForbidden) {
		t.Fatalf("a DEVELOPER connected a Business: %v", err)
	}
}

// identityOnboarding is the Gateway onboarding client as deployed: it also reads
// a Business's public identity.
type identityOnboarding struct {
	fakeOnboarding
	identity *gatewayclient.BusinessIdentity
	err      error
}

func (o *identityOnboarding) BusinessPublicIdentity(context.Context, string) (*gatewayclient.BusinessIdentity, error) {
	return o.identity, o.err
}

// The card under "Este projeto recebe pagamentos no negócio abaixo" names the
// Business by its public identity — never the account name a Project gave it
// ("Sandbox · Doa-Sandbox"). A failed lookup names nobody.
func TestOnboarding_TheBusinessCardIsThePublicIdentityNotTheAccountName(t *testing.T) {
	s, _, pid := setupSvc(t)
	o := &identityOnboarding{identity: &gatewayclient.BusinessIdentity{DisplayName: "Doa", Handle: "doa"}}
	s.SetBusinessOnboarding(o)
	s.SetBusinessNamer(namer("Sandbox · Doa-Sandbox"))
	if _, err := configureForTest(s, "u_owner", pid); err != nil {
		t.Fatal(err)
	}
	r := &ProjectReadiness{}
	k := "APPROVED"
	r.Kyb.Status = &k
	s.SetReadinessReader(&fakeReadinessReader{out: r})

	st, err := s.ProjectFinancialSetup(bg, "u_owner", pid)
	if err != nil {
		t.Fatal(err)
	}
	if b := st.Onboarding.Business; b == nil || b.Name != "Doa" || b.Handle != "@doa" {
		t.Fatalf("business %+v", st.Onboarding.Business)
	}

	o.identity, o.err = nil, errors.New("gateway down")
	st, _ = s.ProjectFinancialSetup(bg, "u_owner", pid)
	if b := st.Onboarding.Business; b == nil || b.Name != "" {
		t.Fatalf("a failed lookup fell back to the account name: %+v", st.Onboarding.Business)
	}
}

func TestOnboarding_AConnectedBusinessIsNamedByItsPublicIdentity(t *testing.T) {
	s, _, pid := setupSvc(t)
	o := &identityOnboarding{identity: &gatewayclient.BusinessIdentity{DisplayName: "Doa", Handle: "doa"}}
	o.target = &gatewayclient.LinkTarget{MerchantID: "m-existing", WalletID: "w-existing", WalletAccountID: "wa-existing",
		Handle: "doa", BusinessName: "Sandbox · Doa-Sandbox", KybStatus: "APPROVED", Environment: "SANDBOX"}
	s.SetBusinessOnboarding(o)
	b, err := s.LinkExistingBusiness(bg, "u_owner", pid, "ABCD-EFGH-JKMN", "", "")
	if err != nil {
		t.Fatal(err)
	}
	if b.Name != "Doa" || b.Handle != "@doa" {
		t.Fatalf("connected business %+v", b)
	}
}
