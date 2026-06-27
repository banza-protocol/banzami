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

func newCapturingSender(t *testing.T, captured *[]resendPayload, gotAuth *string) *Sender {
	t.Helper()
	s := NewSender(Config{
		Provider: "resend", ResendAPIKey: "test-key", DryRun: false,
		FromName: "Banzami", FromAddress: "contact@banzami.com", ReplyTo: "contact@banzami.com",
		NoreplyName: "Banzami", NoreplyAddress: "noreply@banzami.com",
	})
	rt := s.tx.(*resendTransport)
	rt.client = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		*gotAuth = r.Header.Get("Authorization")
		var p resendPayload
		if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
			t.Fatalf("decode payload: %v", err)
		}
		*captured = append(*captured, p)
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"id":"x"}`)), Header: make(http.Header)}, nil
	})}
	return s
}

func TestProviderSelection(t *testing.T) {
	if _, ok := NewSender(Config{Provider: "resend", ResendAPIKey: "k"}).tx.(*resendTransport); !ok {
		t.Error("explicit resend should select resendTransport")
	}
	if _, ok := NewSender(Config{SMTPHost: "smtp.x"}).tx.(*smtpTransport); !ok {
		t.Error("no resend key should default to smtpTransport")
	}
}

// renderAll returns the HTML of every template for content assertions.
func renderAll() map[string]string {
	a, _ := RenderMerchantApproved(MerchantApprovedData{MerchantName: "Mercado Central, Lda.", Handle: "mercadocentral", Environment: "SANDBOX", ActivateURL: "https://business.banzami.com/activate?token=ABC"})
	r, _ := RenderMerchantRejected(MerchantRejectedData{})
	i, _ := RenderAdminInvite(AdminInviteData{Role: "SUPER_ADMIN", InvitedBy: "security@banzami.com", AcceptURL: "https://admin.banzami.com/invite/accept?token=DEF"})
	rs, _ := RenderAdminPasswordReset(AdminResetData{ResetURL: "https://admin.banzami.com/reset?token=GHI"})
	rc, _ := RenderReceipt(ReceiptData{FromHandle: "joaomanuel", ToHandle: "mercadocentral", Reference: "BZM-7F3A-92K1", DateText: "27 jun 2026, 14:32", AmountText: "Kz 25.000,00", ReceiptURL: "https://banzami.com/r/BZM-7F3A-92K1"})
	return map[string]string{"approved": a, "rejected": r, "invite": i, "reset": rs, "receipt": rc}
}

func TestTemplatesContainExpectedCopy(t *testing.T) {
	all := renderAll()
	cases := map[string][]string{
		"approved": {"A sua conta Business está pronta", "Boas notícias", "@mercadocentral", "Ativar conta", "Sandbox", "business.banzami.com/activate?token=ABC"},
		"rejected": {"Sobre o seu pedido Banzami", "Contactar o suporte", "Motivo"},
		"invite":   {"Foi convidado para o BANZADMIN", "Criar palavra-passe", "Administrador", "security@banzami.com", "7 dias"},
		"reset":    {"Recupere a sua palavra-passe", "Recuperar palavra-passe", "30 minutos"},
		"receipt":  {"Recebeu um pagamento", "Kz 25.000,00", "Recebido de @joaomanuel", "Descarregar comprovativo", "Confirmado"},
	}
	for name, musts := range cases {
		html := all[name]
		for _, m := range musts {
			if !strings.Contains(html, m) {
				t.Errorf("%s: missing %q", name, m)
			}
		}
		// shared anatomy
		for _, m := range []string{"Banzami", "Pagamentos modernos para África", "banzami.com"} {
			if !strings.Contains(html, m) {
				t.Errorf("%s: missing shared anatomy %q", name, m)
			}
		}
	}
}

func TestTemplatesHaveNoSecrets(t *testing.T) {
	for name, html := range renderAll() {
		for _, bad := range []string{"API Key", "sk_live", "sk_test", "PIN:", "Bearer ", "RESEND_API_KEY"} {
			if strings.Contains(html, bad) {
				t.Errorf("%s: must not contain %q", name, bad)
			}
		}
	}
}

func TestSenderIdentitiesAndReplyTo(t *testing.T) {
	var captured []resendPayload
	var auth string
	s := newCapturingSender(t, &captured, &auth)

	s.AdminOperatorInvite("u@x.test", "User", "SUPER_ADMIN", "security@banzami.com", "https://admin.banzami.com/invite/accept?token=X")
	s.AdminPasswordReset("u@x.test", "User", "https://admin.banzami.com/reset?token=Y")
	s.MerchantApplicationApproved("m@x.test", "Loja", "loja", "LIVE", "https://business.banzami.com/activate?token=Z")
	s.MerchantApplicationRejected("m@x.test", "Loja", "motivo de teste")

	if len(captured) != 4 {
		t.Fatalf("expected 4, got %d", len(captured))
	}
	cases := []struct {
		idx           int
		from, replyTo string
	}{
		{0, "Banzami <noreply@banzami.com>", ""},                       // invite
		{1, "Banzami <noreply@banzami.com>", ""},                       // reset
		{2, "Banzami <noreply@banzami.com>", "contact@banzami.com"},    // approved
		{3, "Banzami <contact@banzami.com>", "contact@banzami.com"},    // rejected
	}
	for _, c := range cases {
		if captured[c.idx].From != c.from {
			t.Errorf("idx %d From = %q, want %q", c.idx, captured[c.idx].From, c.from)
		}
		if captured[c.idx].ReplyTo != c.replyTo {
			t.Errorf("idx %d ReplyTo = %q, want %q", c.idx, captured[c.idx].ReplyTo, c.replyTo)
		}
		if captured[c.idx].Text == "" {
			t.Errorf("idx %d missing plain-text alternative", c.idx)
		}
	}
	if auth != "Bearer test-key" {
		t.Error("Authorization header not set")
	}
}

func TestSubjects(t *testing.T) {
	var captured []resendPayload
	var auth string
	s := newCapturingSender(t, &captured, &auth)
	s.MerchantApplicationApproved("m@x.test", "Loja", "loja", "LIVE", "https://x/a?token=Z")
	s.MerchantApplicationRejected("m@x.test", "Loja", "")
	s.AdminOperatorInvite("u@x.test", "U", "SUPER_ADMIN", "s@b.com", "https://x/i?token=X")
	s.AdminPasswordReset("u@x.test", "U", "https://x/r?token=Y")
	s.PaymentReceipt("m@x.test", ReceiptData{AmountText: "Kz 25.000,00", FromHandle: "a", ToHandle: "b", ReceiptURL: "https://x/r"})
	want := []string{
		"A sua conta Business está pronta",
		"Atualização sobre o seu pedido Banzami",
		"Foi convidado para o BANZADMIN",
		"Recupere a sua palavra-passe Banzami",
		"Recebeu um pagamento — Kz 25.000,00",
	}
	for i, w := range want {
		if captured[i].Subject != w {
			t.Errorf("subject %d = %q, want %q", i, captured[i].Subject, w)
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
	s.AdminPasswordReset("u@x.test", "User", "https://admin.banzami.com/reset?token=secret")
	if called {
		t.Error("dry-run must not invoke the transport")
	}
}
