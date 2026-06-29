package documents

import (
	"strings"
	"testing"
	"time"
)

func TestFormatAmount(t *testing.T) {
	cases := map[int64]string{
		2500000:   "Kz 25.000,00",
		100:       "Kz 1,00",
		99:        "Kz 0,99",
		123456789: "Kz 1.234.567,89",
		0:         "Kz 0,00",
	}
	for minor, want := range cases {
		if got := FormatAmount(minor, "AOA"); got != want {
			t.Errorf("FormatAmount(%d) = %q, want %q", minor, got, want)
		}
	}
	if got := FormatAmount(2500000, "USD"); got != "$ 25.000,00" {
		t.Errorf("USD format = %q", got)
	}
}

func baseData(p Perspective) ReceiptData {
	t := time.Date(2026, 6, 27, 14, 32, 0, 0, wat)
	return ReceiptData{
		Reference: "BZM-7F3A-92K1", Perspective: p, AmountMinor: 2500000, Currency: "AOA",
		Status: "COMPLETED", CreatedAt: t, CompletedAt: t, IssuedAt: t,
		PayerName: "João Manuel", PayerHandle: "joaomanuel",
		RecipientName: "Mercado Central, Lda.", RecipientHandle: "mercadocentral",
		MerchantName: "Mercado Central, Lda.", MerchantHandle: "mercadocentral",
		PaymentMethod: "Pagamento por QR · @banza", Description: "Compra em loja", Environment: "LIVE",
	}
}

func TestPerspectiveLabels(t *testing.T) {
	consumer, _ := RenderHTML(baseData(PerspectiveConsumer))
	merchant, _ := RenderHTML(baseData(PerspectiveMerchant))
	admin, _ := RenderHTML(baseData(PerspectiveAdmin))

	if !strings.Contains(consumer, "Comprovativo de transferência") {
		t.Error("consumer: wrong doc label")
	}
	if !strings.Contains(merchant, "Comprovativo de pagamento recebido") || !strings.Contains(merchant, "Pagamento recebido") {
		t.Error("merchant: wrong doc label/badge")
	}
	if !strings.Contains(admin, "Comprovativo de transferência") {
		t.Error("admin: wrong doc label")
	}
	for name, html := range map[string]string{"consumer": consumer, "merchant": merchant, "admin": admin} {
		for _, must := range []string{"Kz 25.000,00", "@joaomanuel", "@mercadocentral", "BZM-7F3A-92K1", "Confirmado", "Banzami"} {
			if !strings.Contains(html, must) {
				t.Errorf("%s: missing %q", name, must)
			}
		}
	}
}

func TestNoSecretsInReceipt(t *testing.T) {
	d := baseData(PerspectiveConsumer)
	html, _ := RenderHTML(d)
	for _, bad := range []string{"API Key", "api_key", "sk_live", "PIN", "Bearer ", "token=", "Authorization"} {
		if strings.Contains(html, bad) {
			t.Errorf("receipt must not contain %q", bad)
		}
	}
}

func TestFilename(t *testing.T) {
	if got := Filename("BZM-7F3A-92K1"); got != "banzami-comprovativo-BZM-7F3A-92K1.pdf" {
		t.Errorf("Filename = %q", got)
	}
}

func TestReceiptQRCode(t *testing.T) {
	// The QR URL is always the canonical production verification page — never the
	// PDF, storage, internal API, a temporary URL, localhost or sandbox.
	got := verificationURL("BZM-3JK91A8X")
	if got != "https://banzami.com/r/BZM-3JK91A8X" {
		t.Fatalf("verification URL wrong: %q", got)
	}
	for _, bad := range []string{".pdf", "storage", "localhost", "127.0.0.1", "internal", "sandbox", "?sig="} {
		if strings.Contains(got, bad) {
			t.Fatalf("verification URL leaked %q: %s", bad, got)
		}
	}

	html, err := RenderHTML(baseData(PerspectiveMerchant))
	if err != nil {
		t.Fatalf("render: %v", err)
	}
	// The receipt embeds a real (inline SVG) QR, keeps the textual reference + URL,
	// and carries the anti-fraud scan text.
	for _, must := range []string{
		"<svg", "Digitalize", "banzami.com/r/BZM-7F3A-92K1",
		"BZM-7F3A-92K1", "Não confie apenas em PDFs",
	} {
		if !strings.Contains(html, must) {
			t.Errorf("receipt missing %q", must)
		}
	}

	// The QR is a non-trivial matrix (many black cells) — not an empty placeholder.
	cells := strings.Count(html, `fill="#000"`)
	if cells < 50 {
		t.Fatalf("QR looks empty (only %d cells)", cells)
	}
}
