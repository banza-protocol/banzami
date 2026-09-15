package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

type fakeBeta struct {
	n    int
	last service.BetaRegistration
	fail error
}

func (f *fakeBeta) Register(_ context.Context, in service.BetaRegistration) error {
	if f.fail != nil {
		return f.fail
	}
	f.n++
	f.last = in
	return nil
}

func betaPost(h *BetaTesterHandler, body string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodPost, "/v1/beta/testers", strings.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.Register(w, r)
	return w
}

func TestBetaRegister_HappyPath(t *testing.T) {
	f := &fakeBeta{}
	h := NewBetaTesterHandler(f)
	w := betaPost(h, `{"first_name":"Ana","last_name":"Sá","email":"Ana.Sa@Example.AO","platform":"IOS","apps":["APP_BANZAMI"],"source":"home"}`)
	if w.Code != 200 {
		t.Fatalf("code=%d body=%s", w.Code, w.Body.String())
	}
	if f.n != 1 || !f.last.WantsIOS || f.last.WantsAndroid || !f.last.AppBanzami || f.last.AppMerchant {
		t.Fatalf("registration = %+v", f.last)
	}
	if f.last.Email != "Ana.Sa@Example.AO" {
		t.Fatalf("original email must be preserved: %q", f.last.Email)
	}
}

func TestBetaRegister_BothPlatformsAndApps(t *testing.T) {
	f := &fakeBeta{}
	w := betaPost(NewBetaTesterHandler(f), `{"first_name":"João","last_name":"Mavolo","email":"j@x.ao","platform":"BOTH","apps":["APP_BANZAMI","APP_MERCHANT"]}`)
	if w.Code != 200 || !f.last.WantsIOS || !f.last.WantsAndroid || !f.last.AppBanzami || !f.last.AppMerchant {
		t.Fatalf("code=%d reg=%+v", w.Code, f.last)
	}
}

func TestBetaRegister_HoneypotRecordsNothing(t *testing.T) {
	f := &fakeBeta{}
	w := betaPost(NewBetaTesterHandler(f), `{"first_name":"A","last_name":"B","email":"a@b.co","platform":"IOS","apps":["APP_BANZAMI"],"website":"http://spam"}`)
	if w.Code != 200 {
		t.Fatalf("a bot must get the same 200: %d", w.Code)
	}
	if f.n != 0 {
		t.Fatal("a honeypot hit must record nothing")
	}
}

func TestBetaRegister_Validation(t *testing.T) {
	for _, tc := range []struct{ name, body, code string }{
		{"no name", `{"first_name":"","last_name":"B","email":"a@b.co","platform":"IOS","apps":["APP_BANZAMI"]}`, "VALIDATION_ERROR"},
		{"bad email", `{"first_name":"A","last_name":"B","email":"nope","platform":"IOS","apps":["APP_BANZAMI"]}`, "INVALID_EMAIL"},
		{"no platform", `{"first_name":"A","last_name":"B","email":"a@b.co","platform":"","apps":["APP_BANZAMI"]}`, "VALIDATION_ERROR"},
		{"no app", `{"first_name":"A","last_name":"B","email":"a@b.co","platform":"IOS","apps":[]}`, "VALIDATION_ERROR"},
	} {
		w := betaPost(NewBetaTesterHandler(&fakeBeta{}), tc.body)
		if w.Code == 200 {
			t.Errorf("%s: accepted invalid input", tc.name)
			continue
		}
		var e struct {
			Code string `json:"code"`
		}
		_ = json.Unmarshal(w.Body.Bytes(), &e)
		if e.Code != tc.code {
			t.Errorf("%s: code=%q body=%s", tc.name, e.Code, w.Body.String())
		}
	}
}

func TestBetaRegister_AcceptsUnicodeAndTrimsOptional(t *testing.T) {
	f := &fakeBeta{}
	long := strings.Repeat("x", 200)
	betaPost(NewBetaTesterHandler(f), `{"first_name":"María-José","last_name":"D'Almeida","email":"m@x.ao","platform":"ANDROID","apps":["APP_MERCHANT"],"device_model":"`+long+`"}`)
	if f.n != 1 {
		t.Fatal("a valid unicode name was rejected")
	}
	if len([]rune(f.last.DeviceModel)) != 120 {
		t.Fatalf("device_model not bounded: %d", len([]rune(f.last.DeviceModel)))
	}
}
