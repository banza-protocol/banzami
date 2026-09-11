package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/banzami/banzami/services/api-gateway/internal/config"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// A suspended Business does not get a session. The merchant status came back
// from core and was never read: a suspended merchant — or anyone holding its
// key — kept minting 24 h full-scope tokens.
type statusMerchants struct {
	recordingMerchants
	status service.MerchantStatus
}

func (s *statusMerchants) VerifyApiKey(context.Context, string) (*service.MerchantRecord, service.ApiKeyEnvironment, error) {
	return &service.MerchantRecord{ID: "m1", Status: s.status}, service.ApiKeyEnvironmentSandbox, nil
}

func TestTokenExchange_OnlyAnActiveBusinessGetsASession(t *testing.T) {
	cfg := &config.Config{JWTSecret: "0123456789abcdef0123456789abcdef"}
	for status, want := range map[service.MerchantStatus]int{
		service.MerchantStatusActive: http.StatusOK,
		"SUSPENDED":                  http.StatusForbidden,
		"PENDING":                    http.StatusForbidden,
		"":                           http.StatusForbidden,
	} {
		h := NewAuthHandler(cfg, &statusMerchants{status: status})
		w := httptest.NewRecorder()
		h.Token(w, httptest.NewRequest(http.MethodPost, "/v1/auth/token", strings.NewReader(`{"api_key":"bz_test_sk_x"}`)))
		if w.Code != want {
			t.Errorf("status %q: got %d, want %d (%s)", status, w.Code, want, w.Body.String())
		}
	}
}
