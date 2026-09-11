package notify

import (
	"bytes"
	"context"
	"log/slog"
	"strings"
	"testing"

	"firebase.google.com/go/v4/messaging"

	"github.com/banzami/banzami/services/common/pushtopic"
)

const (
	testKey     = "test-push-topic-key-0123456789abcdef"
	merchantID  = "3f0c9a52-1b2d-4e6f-8a9b-0c1d2e3f4a5b"
	payerHandle = "ana.silva"
)

type fakeSender struct{ sent []*messaging.Message }

func (f *fakeSender) Send(_ context.Context, m *messaging.Message) (string, error) {
	f.sent = append(f.sent, m)
	return "projects/test/messages/1", nil
}

func newTestService(t *testing.T, key, environment string) (*FCMService, *fakeSender) {
	t.Helper()
	var topics *pushtopic.Namer
	if key != "" {
		var err error
		if topics, err = pushtopic.New(key, environment == "SANDBOX"); err != nil {
			t.Fatal(err)
		}
	}
	f := &fakeSender{}
	return &FCMService{client: f, environment: environment, topics: topics}, f
}

// A6-06: the Business's push goes to its keyed topic — the one public-api
// publishes payment-link pushes to (same key, same name: the fixed vector in
// services/common/pushtopic) — never to merchant_<id>.
func TestMerchantPushGoesToTheKeyedTopic(t *testing.T) {
	for environment, want := range map[string]string{
		"LIVE":    "m_9db3b08df4b8f6f166e9052ffb76810f",
		"SANDBOX": "sandbox_m_9db3b08df4b8f6f166e9052ffb76810f",
	} {
		s, f := newTestService(t, testKey, environment)
		s.SendPaymentToMerchant(context.Background(), merchantID, payerHandle, 200000, "AOA")
		if len(f.sent) != 1 {
			t.Fatalf("%s: sent %d", environment, len(f.sent))
		}
		got := f.sent[0].Topic
		if got != want {
			t.Errorf("%s: topic %q, want %q", environment, got, want)
		}
		if got == "merchant_"+merchantID || got == "sandbox_merchant_"+merchantID || strings.Contains(got, merchantID) {
			t.Errorf("%s: topic %q is derived from the id", environment, got)
		}
	}
}

func TestTopicDependsOnTheKey(t *testing.T) {
	a, fa := newTestService(t, testKey, "LIVE")
	b, fb := newTestService(t, testKey+"-rotated", "LIVE")
	a.SendPaymentToMerchant(context.Background(), merchantID, "", 100, "AOA")
	b.SendPaymentToMerchant(context.Background(), merchantID, "", 100, "AOA")
	if fa.sent[0].Topic == fb.sent[0].Topic {
		t.Fatalf("two keys published to the same topic %q", fa.sent[0].Topic)
	}
}

// Without PUSH_TOPIC_KEY nothing is sent — no fallback to merchant_<id>.
func TestNoSendWithoutTheKey(t *testing.T) {
	s, f := newTestService(t, "", "LIVE")
	s.SendPaymentToMerchant(context.Background(), merchantID, payerHandle, 200000, "AOA")
	if len(f.sent) != 0 {
		t.Fatalf("sent to %q without a key", f.sent[0].Topic)
	}
}

// A7-10: the Banzami money format ("2 000 Kz"), and the payer as an @handle.
func TestMerchantPushCopy(t *testing.T) {
	s, f := newTestService(t, testKey, "LIVE")
	ctx := context.Background()
	s.SendPaymentToMerchant(ctx, merchantID, payerHandle, 200000, "AOA")
	s.SendPaymentToMerchant(ctx, merchantID, "@"+payerHandle, 123456789, "AOA")
	s.SendPaymentToMerchant(ctx, merchantID, "", 5000050, "AOA")
	for i, want := range []string{
		"Recebeu 2 000 Kz de @ana.silva",
		"Recebeu 1 234 567,89 Kz de @ana.silva",
		"Recebeu 50 000,50 Kz",
	} {
		m := f.sent[i]
		if m.Notification.Title != "Pagamento recebido" || m.Notification.Body != want {
			t.Errorf("message %d: %q / %q, want body %q", i, m.Notification.Title, m.Notification.Body, want)
		}
		if m.Data["type"] != "payment_received" {
			t.Errorf("message %d: type %q", i, m.Data["type"])
		}
	}
}

// A6-14: no payer handle, no amount, no whole merchant id, and not the topic.
func TestMerchantPushLogsCarryNoHandleAmountOrWholeID(t *testing.T) {
	var buf bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelDebug})))
	t.Cleanup(func() { slog.SetDefault(prev) })

	s, f := newTestService(t, testKey, "LIVE")
	s.SendPaymentToMerchant(context.Background(), merchantID, payerHandle, 200000, "AOA")
	logs := buf.String()
	if logs == "" {
		t.Fatal("nothing was logged")
	}
	for _, secret := range []string{payerHandle, "200000", "2 000", merchantID, f.sent[0].Topic} {
		if strings.Contains(logs, secret) {
			t.Errorf("logs contain %q:\n%s", secret, logs)
		}
	}
}
