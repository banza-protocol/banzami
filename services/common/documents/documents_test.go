package documents

import (
	htmltemplate "html/template"
	"strings"
	"testing"
	"time"
)

func TestFormatAmount(t *testing.T) {
	// The Banzami money format (docs/architecture/money-engine.md): space
	// grouping, comma decimals, cêntimos only when present, currency last — the
	// same text the phone and the verifier print.
	cases := map[int64]string{
		200000:    "2 000 Kz",
		2500000:   "25 000 Kz",
		5000050:   "50 000,50 Kz",
		100:       "1 Kz",
		99:        "0,99 Kz",
		1:         "0,01 Kz",
		123456789: "1 234 567,89 Kz",
		0:         "0 Kz",
	}
	for minor, want := range cases {
		if got := FormatAmount(minor, "AOA"); got != want {
			t.Errorf("FormatAmount(%d) = %q, want %q", minor, got, want)
		}
	}
	if got := FormatAmount(2500000, "USD"); got != "25 000 USD" {
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
		for _, must := range []string{"25 000 Kz", "@joaomanuel", "@mercadocentral", "BZM-7F3A-92K1", "Confirmado", "Banzami"} {
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

	// The QR is a non-trivial matrix (many modules) — not an empty placeholder.
	// The canonical engine groups modules under <g fill=…>, so count the module
	// rects rather than per-cell fills.
	if cells := strings.Count(html, `width="1" height="1"`); cells < 50 {
		t.Fatalf("QR looks empty (only %d module cells)", cells)
	}
	// Canonical Banzami QR: data in #111111, the three finder "eyes" in brand red,
	// and a centre logo — the exact style served by the gateway and shown in-app.
	if !strings.Contains(html, `<g fill="`+QRColorData+`">`) {
		t.Error("QR data modules not in canonical #111111 group")
	}
	if !strings.Contains(html, `<g fill="`+QRColorFinder+`">`) {
		t.Error("QR finder eyes not styled in Banzami red")
	}
}

func TestSandboxWatermark(t *testing.T) {
	sb := baseData(PerspectiveConsumer)
	sb.Environment = "SANDBOX"
	html, err := RenderHTML(sb)
	if err != nil {
		t.Fatalf("render: %v", err)
	}
	if !strings.Contains(html, `class="watermark"`) || !strings.Contains(html, ">SANDBOX<") {
		t.Error("sandbox receipt must show the SANDBOX watermark")
	}
	if !strings.Contains(html, "Ambiente de testes") {
		t.Error("sandbox receipt must carry the test-environment note")
	}

	live := baseData(PerspectiveConsumer)
	live.Environment = "LIVE"
	lh, err := RenderHTML(live)
	if err != nil {
		t.Fatalf("render: %v", err)
	}
	if strings.Contains(lh, `class="watermark"`) {
		t.Error("live receipt must NOT show a watermark")
	}
}

// ADR-044 — Interactive Financial Documents: the receipt must carry additive,
// invisible hyperlinks; verification links must contain ONLY the reference
// (never amount/wallet/party/signature), and the layout links must be present.
func TestInteractiveLinks(t *testing.T) {
	html, err := RenderHTML(baseData(PerspectiveConsumer))
	if err != nil {
		t.Fatalf("render: %v", err)
	}
	// Links exist, invisible styling present.
	if !strings.Contains(html, "<a href=") {
		t.Fatal("no hyperlinks in the document")
	}
	if !strings.Contains(html, "text-decoration: none") {
		t.Error("links are not styled invisible")
	}
	// Verification link → /r/<ref>, and the identity/contact links.
	for _, must := range []string{
		"/r/BZM-7F3A-92K1",                  // verification (reference only)
		`href="https://banzami.com"`,        // logo + website → home
		`href="mailto:contact@banzami.com"`, // email
	} {
		if !strings.Contains(html, must) {
			t.Errorf("missing interactive link %q", must)
		}
	}
	// Security: no financial data must ever appear in a URL/query.
	for _, forbidden := range []string{"?amount=", "?wallet=", "?from=", "?to=", "?signature=", "amount=", "signature="} {
		if strings.Contains(html, forbidden) {
			t.Errorf("document URL leaks financial data: %q", forbidden)
		}
	}
}

// The receipt prints the description it was given, character for character —
// the same string the proof and the verification page carry — and html/template
// keeps markup in it inert.
func TestRenderHTML_DescriptionIsVerbatimAndInert(t *testing.T) {
	desc := "  Ação — <script>alert(1)</script> 🙏 "
	html, err := RenderHTML(ReceiptData{
		Reference: "BZM-TEST-0001", AmountMinor: 100000, Currency: "AOA",
		PayerName: "A", RecipientName: "B", Status: "COMPLETED", Description: desc,
		PaymentMethod: "Carteira Banzami", Environment: "SANDBOX",
	})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(html, "<script>alert(1)</script>") {
		t.Fatal("markup in a description was rendered live")
	}
	escaped := htmltemplate.HTMLEscapeString(desc)
	if !strings.Contains(html, escaped) {
		t.Fatalf("the receipt does not print the description verbatim; want %q", escaped)
	}
}

// ── Operation-aware receipts ────────────────────────────────────────────────

func paymentReceipt() Receipt {
	at := time.Date(2026, 9, 10, 19, 13, 27, 0, time.UTC)
	return Receipt{
		ProofReference: "BZM-Q7RT-CFAF-00ZT-ADSF-P4N7-FB0T",
		OperationKind:  OperationPayment, Channel: ChannelPaymentLink, FundingSource: FundingBanzamiBalance,
		Status: "CONFIRMED", AmountMinor: 200000, Currency: "AOA",
		Payer:             Party{Kind: PartyPerson, DisplayName: "Fidel Monteiro", Handle: "fm65"},
		Payee:             Party{Kind: PartyBusiness, DisplayName: "Doa", Handle: "doa"},
		MerchantReference: "DOA-55791091",
		DisplayContext:    "Vaquinha · Jornada economica fresca",
		ConfirmedAt:       &at, Environment: "SANDBOX", Network: "BANZA", Operator: "Banzami",
		TransactionID: "0056ead5-76b4-4831-afa3-6e4061b2095c",
	}
}

func TestPaymentReceiptSaysPayment(t *testing.T) {
	html, err := RenderHTML(ReceiptDataFromReceipt(paymentReceipt(), PerspectiveConsumer))
	if err != nil {
		t.Fatal(err)
	}
	for _, must := range []string{
		"Comprovativo de pagamento", "Pagamento confirmado", "Valor pago", "2 000 Kz",
		"Fidel Monteiro", "@fm65", ">@doa<",
		"Referência do comprovativo", "BZM-Q7RT-CFAF-00ZT-ADSF-P4N7-FB0T",
		"Pagamento · Link de pagamento", "Saldo Banzami",
		"Referência do comerciante", "DOA-55791091", "Finalidade", "Vaquinha · Jornada economica fresca",
		// 19:13 UTC is 20:13 in Luanda, and the document says which clock it is.
		"10 set 2026, 20:13 (WAT)",
	} {
		if !strings.Contains(html, must) {
			t.Errorf("payment receipt missing %q", must)
		}
	}
	for _, bad := range []string{
		"Comprovativo de transferência", "liquidado", "liquidação", "Liquidação",
		"Transferência Banzami · @banza", "Método", "Payment link:", "Sandbox · Doa-Sandbox",
		"0056ead5", "0056EAD5", // the operation id is not a receipt reference
		">Doa<",                // a Business is paid at its @handle
		"Kz 2.000,00",
	} {
		if strings.Contains(html, bad) {
			t.Errorf("payment receipt must not contain %q", bad)
		}
	}
}

func TestTransferReceiptStaysTransfer(t *testing.T) {
	r := paymentReceipt()
	r.OperationKind, r.Channel = OperationP2PTransfer, ChannelHandle
	r.Payee = Party{Kind: PartyPerson, DisplayName: "Ana Silva", Handle: "ana"}
	r.MerchantReference, r.DisplayContext, r.Description = "", "", "jantar"
	html, err := RenderHTML(ReceiptDataFromReceipt(r, PerspectiveConsumer))
	if err != nil {
		t.Fatal(err)
	}
	for _, must := range []string{"Comprovativo de transferência", "Transferência confirmada", "Valor transferido",
		"Transferência · Endereço @banza", "Descrição", "jantar", "@ana"} {
		if !strings.Contains(html, must) {
			t.Errorf("transfer receipt missing %q", must)
		}
	}
	for _, bad := range []string{"Comprovativo de pagamento", "Referência do comerciante", "Finalidade", "liquid"} {
		if strings.Contains(html, bad) {
			t.Errorf("transfer receipt must not contain %q", bad)
		}
	}
}

func TestOptionalRowsAreOmittedNotDashed(t *testing.T) {
	r := paymentReceipt()
	r.MerchantReference, r.DisplayContext, r.Description = "", "", ""
	html, _ := RenderHTML(ReceiptDataFromReceipt(r, PerspectiveConsumer))
	for _, bad := range []string{"Referência do comerciante", "Finalidade", ">Descrição<"} {
		if strings.Contains(html, bad) {
			t.Errorf("an absent optional field rendered as %q", bad)
		}
	}
}

func TestBusinessCopyOfAPayment(t *testing.T) {
	html, _ := RenderHTML(ReceiptDataFromReceipt(paymentReceipt(), PerspectiveMerchant))
	if !strings.Contains(html, "Comprovativo de pagamento recebido") || !strings.Contains(html, "Valor recebido") {
		t.Error("the Business's copy must say it received a payment")
	}
}
