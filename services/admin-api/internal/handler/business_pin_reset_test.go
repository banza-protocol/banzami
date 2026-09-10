package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
)

func resetPin(h *MerchantApplicationHandler, body string) *httptest.ResponseRecorder {
	r := chi.NewRouter()
	r.Post("/admin/v1/businesses/{id}/app-pin-reset", h.ResetBusinessAppPin)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/admin/v1/businesses/m-1/app-pin-reset", strings.NewReader(body)))
	return rec
}

// An operator gives a Business a new PIN link only with a reason and the
// Business's @handle typed back; the link goes to the Business by email and,
// in the Sandbox, to the operator.
func TestResetBusinessAppPin(t *testing.T) {
	gw := &fakeGW{businessHandle: "loja"}
	mail := &fakeMailer{}
	h := NewMerchantApplicationHandler(gw, nil, mail, "https://banzami.com", stubPlatform{mode: "SANDBOX"})

	if rec := resetPin(h, `{"confirmation":"@loja"}`); rec.Code != http.StatusBadRequest || gw.pinResets != 0 {
		t.Fatalf("no reason: %d resets=%d; want 400 and nothing issued", rec.Code, gw.pinResets)
	}
	if rec := resetPin(h, `{"confirmation":"@outra","reason":"esqueceu o PIN"}`); rec.Code != http.StatusUnprocessableEntity || gw.pinResets != 0 {
		t.Fatalf("wrong handle typed: %d resets=%d; want 422 and nothing issued", rec.Code, gw.pinResets)
	}
	rec := resetPin(h, `{"confirmation":"@Loja","reason":"esqueceu o PIN"}`)
	if rec.Code != http.StatusOK || gw.pinResets != 1 {
		t.Fatalf("confirmed reset: %d resets=%d; want 200 and one reset", rec.Code, gw.pinResets)
	}
	var out map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	want := "https://banzami.com/comerciantes/activar?token=tok-reset"
	if mail.pinResetTo != "loja@example.test" || mail.pinResetURL != want {
		t.Fatalf("email: to=%q url=%q", mail.pinResetTo, mail.pinResetURL)
	}
	if out["activation_url"] != want {
		t.Fatalf("the Sandbox operator should see the link: %v", out)
	}

	// On a LIVE platform the link goes by email only.
	gw2 := &fakeGW{businessHandle: "loja"}
	h2 := NewMerchantApplicationHandler(gw2, nil, &fakeMailer{}, "https://banzami.com", stubPlatform{mode: "LIVE"})
	rec = resetPin(h2, `{"confirmation":"loja","reason":"esqueceu o PIN"}`)
	live := map[string]any{}
	_ = json.Unmarshal(rec.Body.Bytes(), &live)
	if _, shown := live["activation_url"]; rec.Code != http.StatusOK || shown {
		t.Fatalf("a LIVE operator must not see the link: %d %s", rec.Code, rec.Body.String())
	}
}
