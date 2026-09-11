package documents

import (
	"strings"
	"testing"
	"time"
)

// A7-56. A receipt with no proof reference still printed an empty "Nº", an
// empty QR box captioned "Digitalize para verificar", and "confirme em ." — a
// document inviting a verification that cannot exist. Either the receipt can be
// verified and says how, or it says it cannot be.
func receipt(reference string) string {
	html, err := RenderHTML(ReceiptData{
		Reference:     reference,
		AmountMinor:   250_000,
		Currency:      "AOA",
		PayerName:     "Ana Silva",
		PayerHandle:   "ana",
		RecipientName: "Cantina do Alex",
		Status:        "COMPLETED",
		IssuedAt:      time.Date(2026, 9, 12, 10, 0, 0, 0, time.UTC),
	})
	if err != nil {
		panic(err)
	}
	return html
}

func TestReceipt_WithoutAReferencePromisesNoVerification(t *testing.T) {
	html := receipt("")
	for _, forbidden := range []string{
		`href=""`,
		"Digitalize para verificar",
		"Digitalize o código QR",
		"confirme em <a",
		"Nº <a",
	} {
		if strings.Contains(html, forbidden) {
			t.Errorf("a receipt with no reference still renders %q", forbidden)
		}
	}
	if !strings.Contains(html, "não tem referência de verificação") {
		t.Error("a receipt with no reference must say so")
	}
	// It is still a receipt: the money and the parties are there.
	for _, want := range []string{"2 500 Kz", "Ana Silva", "Cantina do Alex"} {
		if !strings.Contains(html, want) {
			t.Errorf("the receipt lost %q", want)
		}
	}
}

func TestReceipt_WithAReferenceShowsHowToVerifyIt(t *testing.T) {
	html := receipt("BZM-7F3A-92K1")
	for _, want := range []string{"BZM-7F3A-92K1", "Digitalize para verificar", "banzami.com/r/BZM-7F3A-92K1"} {
		if !strings.Contains(html, want) {
			t.Errorf("a verifiable receipt is missing %q", want)
		}
	}
	if strings.Contains(html, `href=""`) {
		t.Error("a verifiable receipt still has an empty link")
	}
}
