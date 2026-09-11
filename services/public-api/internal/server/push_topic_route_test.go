package server

import (
	"net/http/httptest"
	"testing"

	"github.com/banzami/banzami/services/public-api/internal/config"
)

// The consumer's push topic is served only to a signed-in consumer (A6-06):
// the route exists, and without a session it answers 401, never the topic.
func TestPushTopicRouteRequiresASession(t *testing.T) {
	h := New(&config.Config{Port: 8083, Environment: "sandbox", JWTSecret: "0123456789abcdef0123456789abcdef"}, Dependencies{}).httpServer.Handler
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest("GET", "/v1/me/push-topic", nil))
	if w.Code != 401 {
		t.Fatalf("GET /v1/me/push-topic without a session: %d %s", w.Code, w.Body.String())
	}
}
