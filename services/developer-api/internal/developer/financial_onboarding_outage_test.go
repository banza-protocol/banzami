package developer

import (
	"errors"
	"testing"

	"github.com/banzami/banzami/services/developer-api/internal/gatewayclient"
)

// A2-25 — connecting an existing Business checks first that the Project has no
// application in progress (which would provision a second Business for it).
// The check was skipped whenever the Gateway could not answer. A guard that
// cannot be checked now refuses, and nothing is redeemed or bound.
func TestOnboarding_ConnectingFailsClosedWhenTheApplicationCannotBeRead(t *testing.T) {
	s, _, o, pid := onboardingSvc(t)
	o.latestErr = errors.New("gateway down")
	o.target = &gatewayclient.LinkTarget{MerchantID: "m-existing", WalletID: "w-existing", WalletAccountID: "wa-existing", Handle: "doa"}

	_, err := s.LinkExistingBusiness(bg, "u_owner", pid, "ABCD-EFGH-JKMN", "", "")
	if !errors.Is(err, ErrOnboardingUnavailable) {
		t.Fatalf("err = %v, want ErrOnboardingUnavailable (503)", err)
	}
	if len(o.redeemed) != 0 {
		t.Fatal("the Business's consent code was spent although the guard could not be checked")
	}
	if b, _ := s.store.ActiveBindingForProject(bg, pid); b != nil {
		t.Fatalf("the Project was bound although the guard could not be checked: %+v", b)
	}

	// Once the Gateway answers "no application", the same code connects.
	o.latestErr = nil
	if _, err := s.LinkExistingBusiness(bg, "u_owner", pid, "ABCD-EFGH-JKMN", "", ""); err != nil {
		t.Fatalf("after the outage: %v", err)
	}
}

// A2-26 — a bound Project whose settlement readiness could not be read had no
// readiness and no blockers, which the onboarding view read as READY: the
// Console said "Pronto" on a failed read. It is now READINESS_UNKNOWN, with
// the Business still shown.
func TestOnboarding_AFailedReadinessReadIsNeverReady(t *testing.T) {
	s, _, _, pid := onboardingSvc(t)
	if _, err := configureForTest(s, "u_owner", pid); err != nil {
		t.Fatal(err)
	}
	s.SetReadinessReader(&fakeReadinessReader{err: errors.New("core unavailable")})
	st, err := s.ProjectFinancialSetup(bg, "u_owner", pid)
	if err != nil {
		t.Fatal(err)
	}
	if st.Onboarding.State == OnboardingReady || st.Onboarding.State != OnboardingReadinessUnknown {
		t.Fatalf("onboarding state = %s on a failed readiness read, want %s", st.Onboarding.State, OnboardingReadinessUnknown)
	}
	if st.Onboarding.Business == nil || st.Onboarding.Business.Name != "Loja Existente" || st.Onboarding.CanAct {
		t.Fatalf("the bound Business must still be shown, with nothing to act on: %+v", st.Onboarding)
	}

	// A readiness that answers still decides READY or BLOCKED.
	s.SetReadinessReader(&fakeReadinessReader{out: &ProjectReadiness{}})
	if st, _ := s.ProjectFinancialSetup(bg, "u_owner", pid); st.Onboarding.State != OnboardingReady {
		t.Fatalf("readiness answered: %s", st.Onboarding.State)
	}
}
