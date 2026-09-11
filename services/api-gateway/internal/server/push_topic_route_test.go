package server

import (
	"net/http/httptest"
	"testing"

	"github.com/banzami/banzami/services/api-gateway/internal/config"
)

// A Business's push topic is served on the merchant surface only (A6-06): the
// route is mounted, and without a session it answers 401, never the topic.
func TestMerchantPushTopicRouteIsAuthenticated(t *testing.T) {
	if !registeredRoutes(t)["GET /v1/merchant/push-topic"] {
		t.Fatal("GET /v1/merchant/push-topic is not mounted")
	}
}

func TestMerchantPushTopicRouteRefusesAnonymousCallers(t *testing.T) {
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/v1/merchant/push-topic", nil)
	newRouter(&config.Config{
		Port: 8080, Environment: "SANDBOX",
		JWTSecret: "0123456789abcdef0123456789abcdef",
	}, Dependencies{}).ServeHTTP(w, r)
	if w.Code != 401 {
		t.Fatalf("anonymous GET /v1/merchant/push-topic: %d %s", w.Code, w.Body.String())
	}
}
