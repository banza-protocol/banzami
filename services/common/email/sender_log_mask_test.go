package email

import (
	"bytes"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"testing"
)

// A6-14 — a recipient address is never written whole into a log line. Every
// failed, skipped or dry-run send logged "to", m.To.

const recipient = "fidel.monteiro@example.ao"

func captureLogs(t *testing.T) *bytes.Buffer {
	t.Helper()
	var buf bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&buf, nil)))
	t.Cleanup(func() { slog.SetDefault(prev) })
	return &buf
}

func assertMasked(t *testing.T, logs string) {
	t.Helper()
	if logs == "" {
		t.Fatal("nothing was logged — the path under test did not run")
	}
	if strings.Contains(logs, "fidel.monteiro") {
		t.Fatalf("log carries the recipient's local part: %s", logs)
	}
	if !strings.Contains(logs, "f***@example.ao") {
		t.Fatalf("log does not carry the masked recipient: %s", logs)
	}
}

// echoingTransport fails the way Resend does for a refused address: its
// message quotes the recipient.
type echoingTransport struct{}

func (echoingTransport) RoundTrip(*http.Request) (*http.Response, error) {
	body := `{"message":"Invalid ` + "`to`" + ` field: ` + recipient + ` is not deliverable"}`
	return &http.Response{StatusCode: http.StatusUnprocessableEntity, Body: io.NopCloser(strings.NewReader(body)), Header: http.Header{}}, nil
}

func TestDeliver_FailedSendMasksTheRecipientEvenWhenTheProviderQuotesIt(t *testing.T) {
	logs := captureLogs(t)
	s := NewSender(Config{Provider: "resend", ResendAPIKey: "test-key",
		FromAddress: "contact@banzami.com", NoreplyAddress: "noreply@banzami.com",
		HTTPClient: &http.Client{Transport: echoingTransport{}}})
	if err := s.DeliverErr(s.Automated("otp", recipient, "subj", "<p>x</p>", "x", "")); err == nil {
		t.Fatal("the send was expected to fail")
	}
	out := logs.String()
	if !strings.Contains(out, "failed to send email") || !strings.Contains(out, "is not deliverable") {
		t.Fatalf("the failure path did not run, or lost the provider's reason: %s", out)
	}
	assertMasked(t, out)
}

func TestDeliver_SkippedSendMasksTheRecipient(t *testing.T) {
	logs := captureLogs(t)
	s := NewSender(Config{})
	if err := s.DeliverErr(s.Automated("otp", recipient, "subj", "<p>x</p>", "x", "")); !errors.Is(err, ErrNotConfigured) {
		t.Fatalf("err = %v, want ErrNotConfigured", err)
	}
	assertMasked(t, logs.String())
}

func TestDeliver_DryRunMasksTheRecipient(t *testing.T) {
	logs := captureLogs(t)
	s := NewSender(Config{Provider: "resend", ResendAPIKey: "test-key", DryRun: true})
	if err := s.DeliverErr(s.Automated("otp", recipient, "subj", "<p>x</p>", "x", "")); err != nil {
		t.Fatalf("dry-run: %v", err)
	}
	assertMasked(t, logs.String())
}

func TestMaskAddress(t *testing.T) {
	for in, want := range map[string]string{
		"fidel@banzami.com":        "f***@banzami.com",
		"a@b.co, zé.silva@mail.ao": "a***@b.co,z***@mail.ao",
		"no-at-sign":               "***",
		"":                         "",
		"@banzami.com":             "***",
	} {
		if got := MaskAddress(in); got != want {
			t.Errorf("MaskAddress(%q) = %q, want %q", in, got, want)
		}
	}
}
