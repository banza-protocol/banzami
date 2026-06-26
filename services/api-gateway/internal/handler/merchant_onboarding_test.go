package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

type fakeApps struct {
	available bool
	reason    string
	appID     string
	submitErr error
	checkErr  error
	got       service.MerchantApplicationInput // captured Submit input
}

func (f *fakeApps) CheckHandle(_ context.Context, _ string) (bool, string, error) {
	return f.available, f.reason, f.checkErr
}
func (f *fakeApps) Submit(_ context.Context, in service.MerchantApplicationInput) (string, error) {
	f.got = in
	return f.appID, f.submitErr
}

type fakeActivation struct {
	status      service.ActivationStatus
	completeErr error
}

func (f *fakeActivation) CreateToken(_ context.Context, _, _ string, _ time.Duration) (string, error) {
	return "raw-token", nil
}
func (f *fakeActivation) Validate(_ context.Context, _ string) (service.ActivationStatus, error) {
	return f.status, nil
}
func (f *fakeActivation) Complete(_ context.Context, _, _ string) error { return f.completeErr }

func decodeBody(rec *httptest.ResponseRecorder) map[string]any {
	var m map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &m)
	return m
}

func TestCheckHandle(t *testing.T) {
	t.Run("available", func(t *testing.T) {
		h := NewMerchantOnboardingHandler(&fakeApps{available: true}, nil)
		rec := postJSON(h.CheckHandle, `{"handle":"cantina_alex"}`)
		if rec.Code != http.StatusOK {
			t.Fatalf("status=%d want 200", rec.Code)
		}
		if decodeBody(rec)["available"] != true {
			t.Errorf("expected available true")
		}
	})

	t.Run("taken returns reason", func(t *testing.T) {
		h := NewMerchantOnboardingHandler(&fakeApps{available: false, reason: "TAKEN"}, nil)
		out := decodeBody(postJSON(h.CheckHandle, `{"handle":"doa_sandbox"}`))
		if out["available"] != false || out["reason"] != "TAKEN" {
			t.Errorf("expected available false + reason TAKEN, got %v", out)
		}
	})

	t.Run("missing handle → 400", func(t *testing.T) {
		h := NewMerchantOnboardingHandler(&fakeApps{}, nil)
		if rec := postJSON(h.CheckHandle, `{}`); rec.Code != http.StatusBadRequest {
			t.Fatalf("status=%d want 400", rec.Code)
		}
	})

	t.Run("malformed handle → 400", func(t *testing.T) {
		h := NewMerchantOnboardingHandler(&fakeApps{available: false, reason: service.HandleReasonInvalid}, nil)
		if rec := postJSON(h.CheckHandle, `{"handle":"ab"}`); rec.Code != http.StatusBadRequest {
			t.Fatalf("status=%d want 400", rec.Code)
		}
	})

	t.Run("service unavailable → 503", func(t *testing.T) {
		h := NewMerchantOnboardingHandler(nil, nil)
		if rec := postJSON(h.CheckHandle, `{"handle":"x_business"}`); rec.Code != http.StatusServiceUnavailable {
			t.Fatalf("status=%d want 503", rec.Code)
		}
	})
}

func TestSubmitApplication(t *testing.T) {
	valid := `{"desired_handle":"cantina_alex","business_name":"Cantina","email":"a@b.co","terms_accepted":true}`

	t.Run("success → 201", func(t *testing.T) {
		h := NewMerchantOnboardingHandler(&fakeApps{appID: "app-1"}, nil)
		rec := postJSON(h.SubmitApplication, valid)
		if rec.Code != http.StatusCreated {
			t.Fatalf("status=%d want 201", rec.Code)
		}
		out := decodeBody(rec)
		if out["application_id"] != "app-1" || out["status"] != "SUBMITTED" {
			t.Errorf("unexpected body %v", out)
		}
	})

	t.Run("incomplete → 400", func(t *testing.T) {
		h := NewMerchantOnboardingHandler(&fakeApps{submitErr: service.ErrApplicationIncomplete}, nil)
		if rec := postJSON(h.SubmitApplication, valid); rec.Code != http.StatusBadRequest {
			t.Fatalf("status=%d want 400", rec.Code)
		}
	})

	t.Run("handle taken → 409", func(t *testing.T) {
		h := NewMerchantOnboardingHandler(&fakeApps{submitErr: service.ErrMerchantHandleTaken}, nil)
		if rec := postJSON(h.SubmitApplication, valid); rec.Code != http.StatusConflict {
			t.Fatalf("status=%d want 409", rec.Code)
		}
	})

	t.Run("reserved handle → 409", func(t *testing.T) {
		h := NewMerchantOnboardingHandler(&fakeApps{submitErr: service.ErrHandleReserved}, nil)
		if rec := postJSON(h.SubmitApplication, valid); rec.Code != http.StatusConflict {
			t.Fatalf("status=%d want 409", rec.Code)
		}
	})

	t.Run("structured Business fields map through (no folding)", func(t *testing.T) {
		apps := &fakeApps{appID: "app-9"}
		h := NewMerchantOnboardingHandler(apps, nil)
		body := `{
		  "environment":"SANDBOX","desired_handle":"cantina_alex","business_name":"Cantina do Alex",
		  "category":"Alimentação e bebidas","subcategory":"Cantina","email":"geral@cantina.co.ao",
		  "phone":"+244 923 456 789","nif":"5001234567","country":"Angola",
		  "province":"Luanda","municipality":"Talatona","city":"Benfica",
		  "address":"Rua Direita do Kilamba","address_reference":"Próximo ao supermercado X",
		  "legal_representative":"João da Silva","representative_role":"Proprietário(a)",
		  "representative_email":"joao@email.com","representative_phone":"+244 924 000 000",
		  "business_activity":"Refeições e bebidas para levar","estimated_volume":"100.000 – 500.000 Kz",
		  "terms_accepted":true}`
		if rec := postJSON(h.SubmitApplication, body); rec.Code != http.StatusCreated {
			t.Fatalf("status=%d", rec.Code)
		}
		g := apps.got
		for name, val := range map[string]string{
			"Subcategory": g.Subcategory, "Province": g.Province, "Municipality": g.Municipality,
			"City": g.City, "AddressReference": g.AddressReference, "RepresentativeRole": g.RepresentativeRole,
			"RepresentativeEmail": g.RepresentativeEmail, "RepresentativePhone": g.RepresentativePhone,
			"EstimatedVolume": g.EstimatedVolume, "BusinessActivity": g.BusinessActivity,
		} {
			if val == "" {
				t.Errorf("structured field %s did not map through", name)
			}
		}
		if g.Province != "Luanda" || g.Municipality != "Talatona" {
			t.Errorf("province/municipality mismatch: %q/%q", g.Province, g.Municipality)
		}
	})

	t.Run("proof_of_address is ignored, never folded into address", func(t *testing.T) {
		apps := &fakeApps{appID: "app-1"}
		h := NewMerchantOnboardingHandler(apps, nil)
		body := `{"desired_handle":"loja_x","business_name":"Loja","email":"a@b.co","terms_accepted":true,"proof_of_address":"should-be-ignored"}`
		if rec := postJSON(h.SubmitApplication, body); rec.Code != http.StatusCreated {
			t.Fatalf("status=%d", rec.Code)
		}
		if strings.Contains(apps.got.Address, "should-be-ignored") || strings.Contains(apps.got.AddressReference, "should-be-ignored") {
			t.Error("proof_of_address must be ignored, never folded into address fields")
		}
	})
}

func TestActivation(t *testing.T) {
	t.Run("validate valid (no secret leak)", func(t *testing.T) {
		h := NewMerchantOnboardingHandler(nil, &fakeActivation{status: service.ActivationStatus{
			Valid: true, Reason: "VALID", BusinessName: "Cantina", Handle: "cantina_alex",
		}})
		out := decodeBody(postJSON(h.ValidateActivation, `{"token":"raw"}`))
		if out["valid"] != true || out["business_name"] != "Cantina" {
			t.Errorf("unexpected %v", out)
		}
		if _, leaked := out["token"]; leaked {
			t.Errorf("must not echo the token")
		}
	})

	t.Run("validate expired", func(t *testing.T) {
		h := NewMerchantOnboardingHandler(nil, &fakeActivation{status: service.ActivationStatus{Reason: "EXPIRED"}})
		out := decodeBody(postJSON(h.ValidateActivation, `{"token":"raw"}`))
		if out["valid"] != false || out["reason"] != "EXPIRED" {
			t.Errorf("unexpected %v", out)
		}
	})

	t.Run("complete success → 200", func(t *testing.T) {
		h := NewMerchantOnboardingHandler(nil, &fakeActivation{})
		if rec := postJSON(h.CompleteActivation, `{"token":"raw","pin":"1234"}`); rec.Code != http.StatusOK {
			t.Fatalf("status=%d want 200", rec.Code)
		}
	})

	t.Run("complete expired → 410", func(t *testing.T) {
		h := NewMerchantOnboardingHandler(nil, &fakeActivation{completeErr: service.ErrActivationExpired})
		if rec := postJSON(h.CompleteActivation, `{"token":"raw","pin":"1234"}`); rec.Code != http.StatusGone {
			t.Fatalf("status=%d want 410", rec.Code)
		}
	})

	t.Run("complete used → 410", func(t *testing.T) {
		h := NewMerchantOnboardingHandler(nil, &fakeActivation{completeErr: service.ErrActivationUsed})
		if rec := postJSON(h.CompleteActivation, `{"token":"raw","pin":"1234"}`); rec.Code != http.StatusGone {
			t.Fatalf("status=%d want 410", rec.Code)
		}
	})

	t.Run("complete invalid pin → 400", func(t *testing.T) {
		h := NewMerchantOnboardingHandler(nil, &fakeActivation{completeErr: service.ErrPinInvalid})
		if rec := postJSON(h.CompleteActivation, `{"token":"raw","pin":"12"}`); rec.Code != http.StatusBadRequest {
			t.Fatalf("status=%d want 400", rec.Code)
		}
	})

	t.Run("complete missing fields → 400", func(t *testing.T) {
		h := NewMerchantOnboardingHandler(nil, &fakeActivation{})
		if rec := postJSON(h.CompleteActivation, `{"token":"raw"}`); rec.Code != http.StatusBadRequest {
			t.Fatalf("status=%d want 400", rec.Code)
		}
	})
}
