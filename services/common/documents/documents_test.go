package documents

import (
	"strings"
	"testing"
	"time"
)

func TestFormatAmount(t *testing.T) {
	cases := map[int64]string{
		2500000: "Kz 25.000,00",
		100:     "Kz 1,00",
		99:      "Kz 0,99",
		123456789: "Kz 1.234.567,89",
		0:       "Kz 0,00",
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
