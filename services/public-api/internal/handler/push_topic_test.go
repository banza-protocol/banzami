package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/banzami/banzami/services/common/pushtopic"

	"github.com/banzami/banzami/services/public-api/internal/middleware"
)

const pushTopicTestKey = "test-push-topic-key-0123456789abcdef"

func getPushTopic(t *testing.T, h *PushTopicHandler, consumer *middleware.Consumer) (int, map[string]any) {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/v1/me/push-topic", nil)
	if consumer != nil {
		req = req.WithContext(middleware.InjectConsumer(req.Context(), consumer))
	}
	rec := httptest.NewRecorder()
	h.Consumer(rec, req)
	var body map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	return rec.Code, body
}

// A6-06: the signed-in consumer learns its own keyed topic — the one the
// sender publishes to — and never the id-derived name.
func TestPushTopicIsTheConsumersKeyedTopic(t *testing.T) {
	topics, err := pushtopic.New(pushTopicTestKey, true)
	if err != nil {
		t.Fatal(err)
	}
	const id = "3f0c9a52-1b2d-4e6f-8a9b-0c1d2e3f4a5b"
	code, body := getPushTopic(t, NewPushTopicHandler(topics), &middleware.Consumer{ID: id})
	if code != http.StatusOK {
		t.Fatalf("status %d", code)
	}
	want, _ := topics.Consumer(id)
	if body["topic"] != want {
		t.Fatalf("topic %v, want %q", body["topic"], want)
	}
	if body["topic"] == "sandbox_consumer_"+id || body["topic"] == "consumer_"+id {
		t.Fatalf("topic is the guessable legacy name %v", body["topic"])
	}
}

// Without PUSH_TOPIC_KEY the answer is null — the app then subscribes to
// nothing, rather than to a guessable topic.
func TestPushTopicIsNullWithoutTheKey(t *testing.T) {
	code, body := getPushTopic(t, NewPushTopicHandler(nil), &middleware.Consumer{ID: "c1"})
	if code != http.StatusOK {
		t.Fatalf("status %d", code)
	}
	if v, present := body["topic"]; !present || v != nil {
		t.Fatalf("topic = %v (present %v), want null", v, present)
	}
}

func TestPushTopicNeedsASession(t *testing.T) {
	topics, _ := pushtopic.New(pushTopicTestKey, false)
	if code, _ := getPushTopic(t, NewPushTopicHandler(topics), nil); code != http.StatusUnauthorized {
		t.Fatalf("status %d, want 401", code)
	}
}
