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
	testKey      = "test-push-topic-key-0123456789abcdef"
	consumerID   = "3f0c9a52-1b2d-4e6f-8a9b-0c1d2e3f4a5b"
	merchantID   = "7d1e2f30-4a5b-4c6d-8e9f-a0b1c2d3e4f5"
	transferID   = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d"
	payerHandle  = "ana.silva"
	amountMinor  = int64(200000) // 2 000 Kz
	sandboxEnvID = "SANDBOX"
)

type fakeSender struct{ sent []*messaging.Message }

func (f *fakeSender) Send(_ context.Context, m *messaging.Message) (string, error) {
	f.sent = append(f.sent, m)
	return "projects/test/messages/1", nil
}

func newTestService(t *testing.T, key, environment string) (*FCMService, *fakeSender, *pushtopic.Namer) {
	t.Helper()
	var topics *pushtopic.Namer
	if key != "" {
		var err error
		topics, err = pushtopic.New(key, environment == sandboxEnvID)
		if err != nil {
			t.Fatal(err)
		}
	}
	f := &fakeSender{}
	return &FCMService{client: f, environment: environment, topics: topics}, f, topics
}

// sendAll exercises every topic send this service makes.
func sendAll(s *FCMService) {
	ctx := context.Background()
	s.SendPaymentReceived(ctx, consumerID, payerHandle, amountMinor, "AOA", transferID)
	s.SendPaymentRequestPaid(ctx, consumerID, payerHandle, amountMinor, "AOA", transferID)
	s.SendPaymentLinkPaid(ctx, merchantID, amountMinor, "AOA")
	_, _, _ = s.SendDebugPush(ctx, consumerID)
}

// A6-06: every push goes to the keyed topic, never to consumer_<id> /
// merchant_<id> that anyone who knows the id can subscribe to.
func TestSendsGoToTheKeyedTopicNotTheIDDerivedOne(t *testing.T) {
	for _, environment := range []string{"PRODUCTION", sandboxEnvID} {
		s, f, topics := newTestService(t, testKey, environment)
		sendAll(s)
		if len(f.sent) != 4 {
			t.Fatalf("%s: sent %d messages, want 4", environment, len(f.sent))
		}
		wantConsumer, _ := topics.Consumer(consumerID)
		wantMerchant, _ := topics.Merchant(merchantID)
		for i, m := range f.sent {
			want := wantConsumer
			if i == 2 {
				want = wantMerchant
			}
			if m.Topic != want {
				t.Errorf("%s message %d: topic %q, want %q", environment, i, m.Topic, want)
			}
			if strings.Contains(m.Topic, consumerID) || strings.Contains(m.Topic, merchantID) {
				t.Errorf("%s message %d: topic %q is derived from the id", environment, i, m.Topic)
			}
		}
	}
}

// The topic depends on the key: another key, another topic.
func TestTopicDependsOnTheKey(t *testing.T) {
	a, fa, _ := newTestService(t, testKey, "PRODUCTION")
	b, fb, _ := newTestService(t, testKey+"-rotated", "PRODUCTION")
	a.SendPaymentReceived(context.Background(), consumerID, payerHandle, amountMinor, "AOA", transferID)
	b.SendPaymentReceived(context.Background(), consumerID, payerHandle, amountMinor, "AOA", transferID)
	if fa.sent[0].Topic == fb.sent[0].Topic {
		t.Fatalf("two keys published to the same topic %q", fa.sent[0].Topic)
	}
}

// Without PUSH_TOPIC_KEY nothing is sent — no fallback to the guessable topic.
func TestNoSendWithoutTheKey(t *testing.T) {
	s, f, _ := newTestService(t, "", "PRODUCTION")
	sendAll(s)
	if len(f.sent) != 0 {
		t.Fatalf("sent %d messages without a key; first topic %q", len(f.sent), f.sent[0].Topic)
	}
	if _, _, err := s.SendDebugPush(context.Background(), consumerID); err == nil {
		t.Fatal("debug push reported success without a key")
	}
}

// A7-10: a person-to-person transfer is a "Transferência recebida", in the
// Banzami money format, from an @handle.
func TestTransferPushCopy(t *testing.T) {
	s, f, _ := newTestService(t, testKey, "PRODUCTION")
	ctx := context.Background()
	s.SendPaymentReceived(ctx, consumerID, payerHandle, amountMinor, "AOA", transferID)
	s.SendPaymentRequestPaid(ctx, consumerID, "@"+payerHandle, 5000050, "AOA", transferID)
	s.SendPaymentRequestPaid(ctx, consumerID, "", amountMinor, "AOA", transferID)

	want := []struct{ title, body string }{
		{"Transferência recebida", "Recebeu 2 000 Kz de @ana.silva"},
		{"Transferência recebida", "Recebeu 50 000,50 Kz de @ana.silva"},
		{"Transferência recebida", "Recebeu 2 000 Kz"}, // payer unknown: no dangling "de "
	}
	for i, w := range want {
		m := f.sent[i]
		if m.Notification.Title != w.title || m.Notification.Body != w.body {
			t.Errorf("message %d: %q / %q, want %q / %q", i, m.Notification.Title, m.Notification.Body, w.title, w.body)
		}
		if m.APNS.Payload.Aps.Alert.Title != w.title || m.APNS.Payload.Aps.Alert.Body != w.body {
			t.Errorf("message %d: APNs alert differs from the notification", i)
		}
	}
}

func TestSandboxTitleIsMarked(t *testing.T) {
	s, f, _ := newTestService(t, testKey, sandboxEnvID)
	s.SendPaymentReceived(context.Background(), consumerID, payerHandle, amountMinor, "AOA", transferID)
	if got := f.sent[0].Notification.Title; got != "[SANDBOX] Transferência recebida" {
		t.Fatalf("title %q", got)
	}
}

// A payment link is a Business's payment: "Pagamento recebido", the amount in
// the Banzami format, and a type the Business App routes (payment_received or
// payment_link_paid — apps/mobile merchant_notification_router.dart).
func TestPaymentLinkPushCopy(t *testing.T) {
	s, f, _ := newTestService(t, testKey, "PRODUCTION")
	s.SendPaymentLinkPaid(context.Background(), merchantID, amountMinor, "AOA")
	m := f.sent[0]
	if m.Notification.Title != "Pagamento recebido" || m.Notification.Body != "Recebeu 2 000 Kz" {
		t.Fatalf("%q / %q", m.Notification.Title, m.Notification.Body)
	}
	if typ := m.Data["type"]; typ != "payment_link_paid" && typ != "payment_received" {
		t.Fatalf("type %q is not one the Business App routes", typ)
	}
}

// A6-14: the push journal names no payer handle, no amount, no whole id, and
// not the topic (which is itself what an eavesdropper would need).
func TestPushLogsCarryNoHandleAmountOrWholeID(t *testing.T) {
	var buf bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelDebug})))
	t.Cleanup(func() { slog.SetDefault(prev) })

	s, f, _ := newTestService(t, testKey, "PRODUCTION")
	sendAll(s)
	logs := buf.String()
	if logs == "" {
		t.Fatal("nothing was logged")
	}
	for _, secret := range []string{payerHandle, "200000", "2 000", consumerID, merchantID, transferID, f.sent[0].Topic, f.sent[2].Topic} {
		if strings.Contains(logs, secret) {
			t.Errorf("logs contain %q:\n%s", secret, logs)
		}
	}
}
