package email

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

// newCapturingSender returns a Resend-backed Sender whose HTTP client captures
// the outbound payloads instead of hitting the network, plus the capture slice.
func newCapturingSender(t *testing.T, captured *[]resendPayload, gotAuth *string) *Sender {
	t.Helper()
	s := NewSender(Config{
		Provider:       "resend",
		ResendAPIKey:   "test-key",
		DryRun:         false,
		FromName:       "Banzami",
		FromAddress:    "contact@banzami.com",
		ReplyTo:        "contact@banzami.com",
		NoreplyName:    "Banzami",
		NoreplyAddress: "noreply@banzami.com",
	})
	rt, ok := s.tx.(*resendTransport)
	if !ok {
		t.Fatalf("expected resendTransport, got %T", s.tx)
	}
	rt.client = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		*gotAuth = r.Header.Get("Authorization")
		var p resendPayload
		if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
			t.Fatalf("decode payload: %v", err)
		}
		*captured = append(*captured, p)
		return &http.Response{
			StatusCode: 200,
			Body:       io.NopCloser(strings.NewReader(`{"id":"test"}`)),
			Header:     make(http.Header),
		}, nil
	})}
	return s
}

func TestProviderSelection(t *testing.T) {
	if _, ok := NewSender(Config{Provider: "resend", ResendAPIKey: "k"}).tx.(*resendTransport); !ok {
		t.Error("explicit resend should select resendTransport")
	}
	if _, ok := NewSender(Config{ResendAPIKey: "k"}).tx.(*resendTransport); !ok {
		t.Error("RESEND_API_KEY present should default to resendTransport")
	}
	if _, ok := NewSender(Config{SMTPHost: "smtp.x"}).tx.(*smtpTransport); !ok {
		t.Error("no resend key should default to smtpTransport")
	}
}

func TestSenderIdentitiesAndReplyTo(t *testing.T) {
	var captured []resendPayload
	var auth string
	s := newCapturingSender(t, &captured, &auth)

	s.AdminOperatorInvite("u@example.test", "User", "https://admin.banzami.com/invite/x")
	s.AdminPasswordReset("u@example.test", "User", "https://admin.banzami.com/reset/y")
	s.MerchantApplicationApproved("m@example.test", "Loja", "loja_ao", "LIVE", "https://banzami.com/comerciantes/activar?token=z")
	s.MerchantApplicationRejected("m@example.test", "Loja", "motivo")

	if len(captured) != 4 {
		t.Fatalf("expected 4 emails captured, got %d", len(captured))
	}

	cases := []struct {
		name    string
		idx     int
		from    string
		replyTo string
	}{
		{"invite", 0, "Banzami <noreply@banzami.com>", ""},
		{"reset", 1, "Banzami <noreply@banzami.com>", ""},
		{"approved", 2, "Banzami <noreply@banzami.com>", "contact@banzami.com"},
		{"rejected", 3, "Banzami <contact@banzami.com>", "contact@banzami.com"},
	}
	for _, c := range cases {
		p := captured[c.idx]
		if p.From != c.from {
			t.Errorf("%s: From = %q, want %q", c.name, p.From, c.from)
		}
		if p.ReplyTo != c.replyTo {
			t.Errorf("%s: ReplyTo = %q, want %q", c.name, p.ReplyTo, c.replyTo)
		}
	}

	if auth != "Bearer test-key" {
		t.Errorf("Authorization header not set correctly")
	}
}

// TestApprovedEmailHasNoSecrets ensures the approval email carries only the
// activation link — never a PIN, token value (other than inside the link), or
// API key marker.
func TestApprovedEmailHasNoSecrets(t *testing.T) {
	var captured []resendPayload
	var auth string
	s := newCapturingSender(t, &captured, &auth)
	s.MerchantApplicationApproved("m@example.test", "Loja", "loja_ao", "LIVE", "https://banzami.com/comerciantes/activar?token=ACTV")
	body := captured[0].HTML
	if !strings.Contains(body, "https://banzami.com/comerciantes/activar?token=ACTV") {
		t.Error("approved email must contain the activation link")
	}
	for _, bad := range []string{"API Key", "api_key", "PIN:", "sk_live", "sk_test"} {
		if strings.Contains(body, bad) {
			t.Errorf("approved email must not contain %q", bad)
		}
	}
}

func TestDryRunDoesNotCallTransport(t *testing.T) {
	called := false
	s := NewSender(Config{
		Provider: "resend", ResendAPIKey: "k", DryRun: true,
		FromName: "Banzami", FromAddress: "contact@banzami.com", ReplyTo: "contact@banzami.com",
		NoreplyName: "Banzami", NoreplyAddress: "noreply@banzami.com",
	})
	s.tx.(*resendTransport).client = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		called = true
		return nil, http.ErrUseLastResponse
	})}
	s.AdminPasswordReset("u@example.test", "User", "https://admin.banzami.com/reset/secret")
	if called {
		t.Error("dry-run must not invoke the transport")
	}
}
