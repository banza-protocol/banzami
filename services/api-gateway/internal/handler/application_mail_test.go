package handler

import (
	"strings"
	"testing"

	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

const (
	testRef   = "d7f4a72b-f24b-4dbd-8266-43bc0f4ca7d0"
	testEmail = "alex@exemplo.ao"
)

func receiptFor(locale string) (subject, html, text string) {
	n := &ApplicationMailNotifier{siteURL: "https://banzami.com", support: "contact@banzami.com"}
	notice := service.ApplicationCreatedNotice{
		ApplicationID: testRef, Email: testEmail,
		BusinessName: "Cantina do Kilamba", Environment: "SANDBOX", Locale: locale,
	}
	return renderApplicationReceipt(notice, n.statusURL(notice.ApplicationID, notice.Locale), n.support)
}

// The receipt carries exactly what the applicant needs — business name, the SAME
// reference, a status link, the Sandbox context — and no internal term or PII.
func TestApplicationReceipt_ContentPT(t *testing.T) {
	subject, html, text := receiptFor("pt")
	if subject != "Banzami Business — candidatura recebida" {
		t.Fatalf("subject: %q", subject)
	}
	for _, part := range []string{
		"Cantina do Kilamba",
		testRef,
		"https://banzami.com/comerciantes/candidatura/estado?ref=" + testRef,
		"operações com dinheiro real ainda não estão disponíveis",
		"dinheiro fictício",
		"contact@banzami.com",
	} {
		if !strings.Contains(html, part) {
			t.Errorf("HTML missing %q", part)
		}
		if !strings.Contains(text, part) {
			t.Errorf("text missing %q", part)
		}
	}
}

func TestApplicationReceipt_ContentEN(t *testing.T) {
	subject, html, _ := receiptFor("en")
	if subject != "Banzami Business — application received" {
		t.Fatalf("subject: %q", subject)
	}
	for _, part := range []string{
		"Cantina do Kilamba",
		testRef,
		"https://banzami.com/en/comerciantes/candidatura/estado?ref=" + testRef,
		"Real-money operations are not yet available",
	} {
		if !strings.Contains(html, part) {
			t.Errorf("EN HTML missing %q", part)
		}
	}
}

// The internal term never appears; PII beyond business name + recipient never does.
func TestApplicationReceipt_NoInternalTermNoPII(t *testing.T) {
	for _, loc := range []string{"pt", "en"} {
		_, html, text := receiptFor(loc)
		body := strings.ToLower(html + text)
		for _, forbidden := range []string{"financial live", "5003208729" /* a NIF */, "representante", "reviewer", "sk_", "pin"} {
			if strings.Contains(body, forbidden) {
				t.Errorf("[%s] receipt must not contain %q", loc, forbidden)
			}
		}
	}
}

// A nil mailer must never panic — the application already succeeded.
func TestApplicationNotifier_NilMailerIsSafe(t *testing.T) {
	n := NewApplicationMailNotifier(nil, "https://banzami.com", "contact@banzami.com")
	n.ApplicationCreated(nil, service.ApplicationCreatedNotice{ApplicationID: testRef, Email: testEmail, BusinessName: "X"}) //nolint:staticcheck
}

func TestApplicationNotifier_StatusURLByLocale(t *testing.T) {
	n := NewApplicationMailNotifier(nil, "https://banzami.com/", "c@x")
	if got := n.statusURL("abc 1", "pt"); got != "https://banzami.com/comerciantes/candidatura/estado?ref=abc+1" {
		t.Errorf("pt status url: %q", got)
	}
	if got := n.statusURL("abc", "en"); got != "https://banzami.com/en/comerciantes/candidatura/estado?ref=abc" {
		t.Errorf("en status url: %q", got)
	}
}
