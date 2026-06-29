// Package documents is the official Banzami Document Engine: a single,
// dependency-light renderer for official PDF documents (transfer/payment
// receipts) shared by every backend service (public-api, api-gateway, admin-api).
//
// It is READ-ONLY: callers pass typed data already read from the canonical
// sources (transfers, wallet_payments) and the engine renders the official
// handoff design. It does NOT depend on email/Resend, on any service's business
// logic, or on the ledger — and it never persists anything.
//
// The HTML template (receipt.html) uses modern CSS because it is rendered by a
// headless browser, not an email client. PDF generation shells out to a headless
// Chrome/Chromium resolved from BANZAMI_CHROME_BIN or common install paths; it
// returns an error (never panics) when no browser is available.
package documents

import (
	"bytes"
	"context"
	_ "embed"
	"fmt"
	"html/template"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"

	qrcode "github.com/skip2/go-qrcode"
)

//go:embed receipt.html
var receiptHTML string

var receiptTmpl = template.Must(template.New("receipt").Parse(receiptHTML))

// Perspective selects the copy/context of a receipt; the visual layout is the same.
type Perspective string

const (
	PerspectiveConsumer Perspective = "CONSUMER"
	PerspectiveMerchant Perspective = "MERCHANT"
	PerspectiveAdmin    Perspective = "ADMIN"
)

// ReceiptData is the single typed input for a receipt, filled from the canonical
// sources. No secrets, tokens, PINs, API keys, signed URLs or bank data.
type ReceiptData struct {
	ReceiptID     string
	TransactionID string
	Reference     string // human reference, e.g. BZM-7F3A-92K1
	Perspective   Perspective

	AmountMinor int64
	Currency    string // AOA, USD, EUR
	AmountWords string // optional; omitted if empty
	Status      string // raw ledger status: COMPLETED, PENDING, FAILED, REVERSED

	CreatedAt   time.Time
	CompletedAt time.Time // zero → falls back to CreatedAt
	IssuedAt    time.Time // zero → CompletedAt/CreatedAt

	PayerName, PayerHandle         string
	RecipientName, RecipientHandle string
	MerchantName, MerchantHandle   string

	PaymentMethod string // e.g. "Pagamento por QR · @banza"
	Description   string
	Environment   string // LIVE, SANDBOX

	VerificationReference string // e.g. banzami.com/r/<ref>
}

// receiptView is the flat struct the template consumes.
type receiptView struct {
	DocLabel, HeroBadge                    string
	Reference, IssuedDate                  string
	AmountText, AmountWords                string
	FromName, FromHandle, ToName, ToHandle string
	DateTime, Method, Description, State   string
	VerifyShort                            string
	VerifyURL                              string        // full https URL the QR encodes
	QRSVG                                  template.HTML // inline SVG of the QR
}

// verificationURL returns the canonical public verification URL the QR encodes.
// Always the production https page for a proof_reference — never the PDF, storage,
// internal API, a temporary URL or localhost.
func verificationURL(ref string) string {
	return "https://banzami.com/r/" + ref
}

// qrSVG renders a QR code for url as a crisp inline SVG (rendered to PDF by
// headless Chrome). Inline SVG avoids html/template URL normalization that would
// mangle a base64 data URI. The QR carries only the public URL — no proof data,
// no signature, no secrets.
func qrSVG(url string) template.HTML {
	q, err := qrcode.New(url, qrcode.Medium)
	if err != nil {
		return ""
	}
	bm := q.Bitmap()
	n := len(bm)
	if n == 0 {
		return ""
	}
	var b strings.Builder
	fmt.Fprintf(&b, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" shape-rendering="crispEdges" width="100%%" height="100%%">`, n, n)
	b.WriteString(`<rect width="100%" height="100%" fill="#fff"/>`)
	for y := 0; y < n; y++ {
		for x := 0; x < n; x++ {
			if bm[y][x] {
				fmt.Fprintf(&b, `<rect x="%d" y="%d" width="1" height="1" fill="#000"/>`, x, y)
			}
		}
	}
	b.WriteString(`</svg>`)
	return template.HTML(b.String())
}

var ptMonths = [...]string{"jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"}

// wat is Africa/Luanda (UTC+1, no DST).
var wat = time.FixedZone("WAT", 3600)

func fmtDatePT(t time.Time) string {
	t = t.In(wat)
	return fmt.Sprintf("%d %s %d", t.Day(), ptMonths[int(t.Month())-1], t.Year())
}

func fmtDateTimePT(t time.Time) string {
	t = t.In(wat)
	return fmt.Sprintf("%d %s %d, %02d:%02d (WAT)", t.Day(), ptMonths[int(t.Month())-1], t.Year(), t.Hour(), t.Minute())
}

func statePT(s string) string {
	switch strings.ToUpper(strings.TrimSpace(s)) {
	case "COMPLETED", "CONFIRMED", "CAPTURED", "SUCCEEDED":
		return "Confirmado"
	case "PENDING", "AUTHORIZED":
		return "Pendente"
	case "FAILED":
		return "Falhado"
	case "REVERSED", "REFUNDED":
		return "Revertido"
	default:
		return "Confirmado"
	}
}

func atHandle(h string) string {
	h = strings.TrimSpace(h)
	if h == "" || strings.HasPrefix(h, "@") {
		return h
	}
	return "@" + h
}

// FormatAmount renders minor units as official receipt text (e.g. "Kz 25.000,00").
func FormatAmount(amountMinor int64, currency string) string {
	cur := strings.ToUpper(strings.TrimSpace(currency))
	neg := amountMinor < 0
	if neg {
		amountMinor = -amountMinor
	}
	whole := amountMinor / 100
	cents := amountMinor % 100

	// thousands grouping with '.' (pt-PT)
	ws := strconv.FormatInt(whole, 10)
	var grouped strings.Builder
	for i, c := range ws {
		if i > 0 && (len(ws)-i)%3 == 0 {
			grouped.WriteByte('.')
		}
		grouped.WriteRune(c)
	}
	num := fmt.Sprintf("%s,%02d", grouped.String(), cents)
	if neg {
		num = "-" + num
	}
	switch cur {
	case "AOA", "":
		return "Kz " + num
	case "USD":
		return "$ " + num
	case "EUR":
		return "€ " + num
	default:
		return cur + " " + num
	}
}

func toView(d ReceiptData) receiptView {
	docLabel := "Comprovativo de transferência"
	heroBadge := "Transferência confirmada"
	if d.Perspective == PerspectiveMerchant {
		docLabel = "Comprovativo de pagamento recebido"
		heroBadge = "Pagamento recebido"
	}

	to := d.RecipientName
	toHandle := d.RecipientHandle
	if d.Perspective == PerspectiveMerchant || (to == "" && d.MerchantName != "") {
		to = d.MerchantName
		toHandle = d.MerchantHandle
	}

	when := d.CompletedAt
	if when.IsZero() {
		when = d.CreatedAt
	}
	issued := d.IssuedAt
	if issued.IsZero() {
		issued = when
	}
	method := strings.TrimSpace(d.PaymentMethod)
	if method == "" {
		method = "Carteira Banzami"
	}
	desc := strings.TrimSpace(d.Description)
	if desc == "" {
		desc = "—"
	}
	verify := strings.TrimSpace(d.VerificationReference)
	if verify == "" && d.Reference != "" {
		verify = "banzami.com/r/" + d.Reference
	}
	qrURL := verificationURL(d.Reference)

	return receiptView{
		DocLabel:    docLabel,
		HeroBadge:   heroBadge,
		Reference:   d.Reference,
		IssuedDate:  fmtDatePT(issued),
		AmountText:  FormatAmount(d.AmountMinor, d.Currency),
		AmountWords: strings.TrimSpace(d.AmountWords),
		FromName:    d.PayerName,
		FromHandle:  atHandle(d.PayerHandle),
		ToName:      to,
		ToHandle:    atHandle(toHandle),
		DateTime:    fmtDateTimePT(when),
		Method:      method,
		Description: desc,
		State:       statePT(d.Status),
		VerifyShort: verify,
		VerifyURL:   qrURL,
		QRSVG:       qrSVG(qrURL),
	}
}

// RenderHTML fills the official receipt template with d and returns the HTML.
func RenderHTML(d ReceiptData) (string, error) {
	var b bytes.Buffer
	if err := receiptTmpl.Execute(&b, toView(d)); err != nil {
		return "", fmt.Errorf("render receipt html: %w", err)
	}
	return b.String(), nil
}

// Filename returns the official download filename for a receipt.
func Filename(reference string) string {
	r := strings.TrimSpace(reference)
	if r == "" {
		r = "comprovativo"
	}
	return "banzami-comprovativo-" + r + ".pdf"
}

// GeneratePDF renders the receipt to an A4 PDF via a headless browser.
func GeneratePDF(ctx context.Context, d ReceiptData) ([]byte, error) {
	html, err := RenderHTML(d)
	if err != nil {
		return nil, err
	}
	bin, err := findChrome()
	if err != nil {
		return nil, err
	}

	dir, err := os.MkdirTemp("", "bz-receipt-*")
	if err != nil {
		return nil, fmt.Errorf("tempdir: %w", err)
	}
	defer os.RemoveAll(dir)

	htmlPath := filepath.Join(dir, "receipt.html")
	pdfPath := filepath.Join(dir, "receipt.pdf")
	if err := os.WriteFile(htmlPath, []byte(html), 0o600); err != nil {
		return nil, fmt.Errorf("write html: %w", err)
	}

	args := []string{
		"--headless", "--disable-gpu", "--no-sandbox",
		"--no-pdf-header-footer", "--print-to-pdf-no-header",
		"--run-all-compositor-stages-before-draw", "--virtual-time-budget=4000",
		"--print-to-pdf=" + pdfPath, "file://" + htmlPath,
	}
	cmd := exec.CommandContext(ctx, bin, args...)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("chrome print-to-pdf failed: %w", err)
	}
	out, err := os.ReadFile(pdfPath)
	if err != nil {
		return nil, fmt.Errorf("read pdf: %w", err)
	}
	if len(out) == 0 {
		return nil, fmt.Errorf("chrome produced an empty pdf")
	}
	return out, nil
}

func findChrome() (string, error) {
	if env := os.Getenv("BANZAMI_CHROME_BIN"); env != "" {
		if _, err := os.Stat(env); err == nil {
			return env, nil
		}
	}
	candidates := []string{"google-chrome-stable", "google-chrome", "chromium", "chromium-browser", "chrome"}
	if runtime.GOOS == "darwin" {
		candidates = append(candidates,
			"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
			"/Applications/Chromium.app/Contents/MacOS/Chromium",
		)
	}
	for _, c := range candidates {
		if filepath.IsAbs(c) {
			if _, err := os.Stat(c); err == nil {
				return c, nil
			}
			continue
		}
		if p, err := exec.LookPath(c); err == nil {
			return p, nil
		}
	}
	return "", fmt.Errorf("no headless browser found (set BANZAMI_CHROME_BIN, or install Chrome/Chromium)")
}

// SampleData returns the design-handoff example — for previews/tests only.
func SampleData() ReceiptData {
	t := time.Date(2026, 6, 27, 14, 32, 0, 0, wat)
	return ReceiptData{
		Reference: "BZM-7F3A-92K1", TransactionID: "BZM-7F3A-92K1", Perspective: PerspectiveConsumer,
		AmountMinor: 2500000, Currency: "AOA", AmountWords: "Vinte e cinco mil kwanzas", Status: "COMPLETED",
		CreatedAt: t, CompletedAt: t, IssuedAt: t,
		PayerName: "João Manuel", PayerHandle: "@joaomanuel",
		RecipientName: "Mercado Central, Lda.", RecipientHandle: "@mercadocentral",
		MerchantName: "Mercado Central, Lda.", MerchantHandle: "@mercadocentral",
		PaymentMethod: "Pagamento por QR · @banza", Description: "Compra em loja", Environment: "LIVE",
		VerificationReference: "banzami.com/r/BZM-7F3A-92K1",
	}
}
