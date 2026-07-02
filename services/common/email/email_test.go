package email

import (
	"strings"
	"testing"
)

// TestPrimitivesRenderSharedAnatomy proves the extracted design-system primitives
// still emit the shared, email-robust anatomy (Nunito stack, rounded panels via
// border-collapse:separate, hosted-PNG icons, shared footer) — the same output
// the admin-api package produced before extraction.
func TestPrimitivesRenderSharedAnatomy(t *testing.T) {
	body := Title("Olá") + Para("corpo") +
		DetailRows([]InfoRow{{Label: "De", Value: "@joao", Mono: true}}) +
		Notice("clock", "expira") + OTPBoxes("482915") +
		Button("Abrir", "https://x/y") + URLFallback("ou:", "https://x/y")
	html := RenderLayout(LayoutOpts{Subtitle: "Developers", BadgeKind: "security", SafetyKind: "security", Preheader: "pre", Body: body})

	for _, m := range []string{"'Nunito'", "border-collapse:separate", "Pagamentos modernos para África", "banzami.com", "Segurança"} {
		if !strings.Contains(html, m) {
			t.Errorf("missing shared anatomy %q", m)
		}
	}
	if strings.Contains(html, "border-collapse:collapse") {
		t.Error("must not use border-collapse:collapse (square corners)")
	}
	if strings.Contains(html, "<svg") {
		t.Error("must not use inline SVG (Gmail strips it)")
	}
	if !strings.Contains(html, "email-assets/") {
		t.Error("icons must be hosted PNGs (email-assets)")
	}
	// OTP digits render in separate boxes (not contiguous).
	for _, d := range []string{"4", "8", "2", "9", "1", "5"} {
		if !strings.Contains(html, ">"+d+"</td>") {
			t.Errorf("missing OTP digit box for %q", d)
		}
	}
}

// TestSenderIdentitiesAndDryRun proves the two sender identities and the no-op
// dry-run behaviour are preserved.
func TestSenderIdentitiesAndDryRun(t *testing.T) {
	s := NewSender(Config{
		Provider: "resend", ResendAPIKey: "test-key", DryRun: true,
		FromName: "Banzami", FromAddress: "contact@banzami.com", ReplyTo: "contact@banzami.com",
		NoreplyName: "Banzami", NoreplyAddress: "noreply@banzami.com",
	})

	a := s.Automated("p", "to@x", "subj", "<html>", "text", "")
	if a.FromAddr != "noreply@banzami.com" || a.ReplyTo != "" {
		t.Errorf("automated identity wrong: from=%q replyTo=%q", a.FromAddr, a.ReplyTo)
	}
	i := s.Institutional("p", "to@x", "subj", "<html>", "text")
	if i.FromAddr != "contact@banzami.com" || i.ReplyTo != "contact@banzami.com" {
		t.Errorf("institutional identity wrong: from=%q replyTo=%q", i.FromAddr, i.ReplyTo)
	}
	if s.ReplyTo() != "contact@banzami.com" {
		t.Errorf("ReplyTo() = %q", s.ReplyTo())
	}
	// Dry-run must not attempt a real network send.
	s.Deliver(a)
}

func TestProviderSelection(t *testing.T) {
	if _, ok := NewSender(Config{Provider: "resend", ResendAPIKey: "k"}).tx.(*resendTransport); !ok {
		t.Error("explicit resend should select resendTransport")
	}
	if _, ok := NewSender(Config{SMTPHost: "smtp.x"}).tx.(*smtpTransport); !ok {
		t.Error("no resend key should default to smtpTransport")
	}
}
