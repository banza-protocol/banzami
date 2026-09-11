package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/banzami/banzami/services/common/pushtopic"

	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
)

const pushTopicTestKey = "test-push-topic-key-0123456789abcdef"

func getMerchantPushTopic(t *testing.T, h *PushTopicHandler, p *middleware.Principal) (int, map[string]any) {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/v1/merchant/push-topic", nil)
	if p != nil {
		req = req.WithContext(middleware.ContextWithPrincipal(req.Context(), p))
	}
	rec := httptest.NewRecorder()
	h.Merchant(rec, req)
	var body map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	return rec.Code, body
}

// A6-06: a signed-in Business learns its own keyed topic — the one the
// gateway publishes to — never the id-derived merchant_<id>.
func TestMerchantPushTopicIsTheKeyedTopic(t *testing.T) {
	topics, err := pushtopic.New(pushTopicTestKey, true)
	if err != nil {
		t.Fatal(err)
	}
	const id = "3f0c9a52-1b2d-4e6f-8a9b-0c1d2e3f4a5b"
	code, body := getMerchantPushTopic(t, NewPushTopicHandler(topics), &middleware.Principal{MerchantID: id, Environment: "SANDBOX"})
	if code != http.StatusOK {
		t.Fatalf("status %d", code)
	}
	want, _ := topics.Merchant(id)
	if body["topic"] != want {
		t.Fatalf("topic %v, want %q", body["topic"], want)
	}
	if body["topic"] == "sandbox_merchant_"+id || body["topic"] == "merchant_"+id {
		t.Fatalf("topic is the guessable legacy name %v", body["topic"])
	}
}

func TestMerchantPushTopicIsNullWithoutTheKey(t *testing.T) {
	code, body := getMerchantPushTopic(t, NewPushTopicHandler(nil), &middleware.Principal{MerchantID: "m1"})
	if code != http.StatusOK {
		t.Fatalf("status %d", code)
	}
	if v, present := body["topic"]; !present || v != nil {
		t.Fatalf("topic = %v (present %v), want null", v, present)
	}
}

// A consumer token (no merchant id) learns no Business topic.
func TestMerchantPushTopicNeedsABusiness(t *testing.T) {
	topics, _ := pushtopic.New(pushTopicTestKey, false)
	for _, p := range []*middleware.Principal{nil, {CustomerID: "c1"}} {
		if code, body := getMerchantPushTopic(t, NewPushTopicHandler(topics), p); code != http.StatusForbidden {
			t.Fatalf("principal %+v: status %d body %v", p, code, body)
		}
	}
}
