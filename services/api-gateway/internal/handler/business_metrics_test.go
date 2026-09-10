package handler

import (
	"errors"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/testutil"

	"github.com/banzami/banzami/services/api-gateway/internal/config"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// The Business counters move when the thing they count happens — and only
// then, and only under their closed labels.

func TestBusinessMetrics_SignInResultsAreCountedApart(t *testing.T) {
	cfg := &config.Config{JWTSecret: testSecret}
	cases := []struct {
		err    error
		result string
	}{
		{nil, authResultIssued},
		{service.ErrMerchantCredsInvalid, authResultRefused},
		{service.ErrMerchantLocked, authResultLocked},
		{service.ErrHandleOwnerMismatch, authResultOwnerMismatch},
	}
	for _, c := range cases {
		before := testutil.ToFloat64(businessAuthAttempts.WithLabelValues(c.result))
		h := NewMerchantAuthHandler(cfg, &fakeCreds{mid: "m-1", env: "SANDBOX", verifyErr: c.err})
		postJSON(h.Token, `{"handle":"loja","pin":"123456"}`)
		if got := testutil.ToFloat64(businessAuthAttempts.WithLabelValues(c.result)) - before; got != 1 {
			t.Errorf("%s: counted %v, want 1", c.result, got)
		}
	}
}

func TestBusinessMetrics_OwnerMismatchStillAnswersAsAWrongPin(t *testing.T) {
	h := NewMerchantAuthHandler(&config.Config{JWTSecret: testSecret},
		&fakeCreds{verifyErr: service.ErrHandleOwnerMismatch})
	rec := postJSON(h.Token, `{"handle":"loja","pin":"123456"}`)
	if rec.Code != 401 || !strings.Contains(rec.Body.String(), "invalid handle or pin") {
		t.Fatalf("a data defect must not be distinguishable from a wrong PIN: %d %s", rec.Code, rec.Body.String())
	}
}

func TestBusinessMetrics_ReachingForAnotherBusinessWalletIsCounted(t *testing.T) {
	before := testutil.ToFloat64(businessTenantDenials.WithLabelValues(tenantSurfaceWallet))
	h := NewWalletHandler(&fakeWallets{merchantID: "victim-merchant"})
	h.Balance(httptest.NewRecorder(), walletReq("GET", "/v1/wallets/w/balance", "w", "attacker-merchant"))
	if got := testutil.ToFloat64(businessTenantDenials.WithLabelValues(tenantSurfaceWallet)) - before; got != 1 {
		t.Fatalf("cross-Business wallet read counted %v times, want 1", got)
	}
	// The owner reading their own wallet is not a denial.
	before++
	h.Balance(httptest.NewRecorder(), walletReq("GET", "/v1/wallets/w/balance", "w", "victim-merchant"))
	if got := testutil.ToFloat64(businessTenantDenials.WithLabelValues(tenantSurfaceWallet)); got != before {
		t.Fatalf("an owner's own read was counted as a denial")
	}
}

func TestBusinessMetrics_DocumentOutcomes(t *testing.T) {
	for err, want := range map[error]string{
		nil:                             docResultUploaded,
		service.ErrStorageNotConfigured: docResultStorageOff,
		service.ErrContentMismatch:      docResultContentRefused,
		service.ErrFileTooLarge:         docResultRefused,
		errors.New("database gone"):     docResultFailed,
	} {
		before := testutil.ToFloat64(businessApplicationDocuments.WithLabelValues(want))
		observeDocument(err)
		if got := testutil.ToFloat64(businessApplicationDocuments.WithLabelValues(want)) - before; got != 1 {
			t.Errorf("%v → %s counted %v", err, want, got)
		}
	}
}

// No series may carry an identifier. Every label value that exists after the
// tests above ran must come from this file's closed vocabularies.
func TestBusinessMetrics_LabelsAreAClosedVocabulary(t *testing.T) {
	closed := map[string]bool{}
	for _, v := range []string{
		appActionSubmit, appActionStartReview, appActionApprove, appActionLink, appActionReject, appActionReissueActivation,
		appResultOK, appResultReplayed, appResultRefused, appResultFailed,
		authResultIssued, authResultRefused, authResultLocked, authResultOwnerMismatch,
		tenantSurfaceWallet,
		docResultUploaded, docResultContentRefused, docResultRefused, docResultStorageOff, docResultFailed,
	} {
		closed[v] = true
	}
	reg := prometheus.NewPedanticRegistry()
	for _, c := range []prometheus.Collector{businessApplicationEvents, businessAuthAttempts, businessTenantDenials, businessApplicationDocuments} {
		reg.MustRegister(c)
	}
	families, err := reg.Gather()
	if err != nil {
		t.Fatal(err)
	}
	for _, f := range families {
		for _, m := range f.GetMetric() {
			for _, l := range m.GetLabel() {
				if !closed[l.GetValue()] {
					t.Errorf("%s{%s=%q}: label value is not from the closed vocabulary", f.GetName(), l.GetName(), l.GetValue())
				}
			}
		}
	}
}
