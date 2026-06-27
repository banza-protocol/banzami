// Package pdf renders the official Banzami transfer receipt (comprovativo de
// transferência) as an A4 PDF, faithful to the design handoff. The HTML template
// (receipt.html) uses modern CSS because it is rendered by a headless browser,
// not an email client. PDF generation shells out to a headless Chrome/Chromium
// (no extra Go dependency); the binary is resolved from BANZAMI_CHROME_BIN or
// common install paths. If no browser is available, GeneratePDF returns an error
// — it never panics and is independent of the email-sending flow.
package pdf

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
)

//go:embed receipt.html
var receiptHTML string

var receiptTmpl = template.Must(template.New("receipt").Parse(receiptHTML))

// ReceiptData is the typed input for the receipt document. All fields come from
// the real transaction at call time — no placeholder data in production.
type ReceiptData struct {
	Reference   string // BZM-7F3A-92K1
	IssuedDate  string // 27 jun 2026
	AmountText  string // Kz 25.000,00
	AmountWords string // Vinte e cinco mil kwanzas
	FromName    string
	FromHandle  string // @joaomanuel
	ToName      string
	ToHandle    string // @mercadocentral
	DateTime    string // 27 jun 2026, 14:32 (WAT)
	Method      string // Pagamento por QR · @banza
	Description string // Compra em loja
	State       string // Confirmado
	VerifyShort string // banzami.com/r/BZM-7F3A-92K1
}

// SampleData returns the design-handoff example data — for previews only, never
// production.
func SampleData() ReceiptData {
	return ReceiptData{
		Reference:   "BZM-7F3A-92K1",
		IssuedDate:  "27 jun 2026",
		AmountText:  "Kz 25.000,00",
		AmountWords: "Vinte e cinco mil kwanzas",
		FromName:    "João Manuel",
		FromHandle:  "@joaomanuel",
		ToName:      "Mercado Central, Lda.",
		ToHandle:    "@mercadocentral",
		DateTime:    "27 jun 2026, 14:32 (WAT)",
		Method:      "Pagamento por QR · @banza",
		Description: "Compra em loja",
		State:       "Confirmado",
		VerifyShort: "banzami.com/r/BZM-7F3A-92K1",
	}
}

// RenderHTML fills the receipt template with d and returns the HTML document.
func RenderHTML(d ReceiptData) (string, error) {
	if d.State == "" {
		d.State = "Confirmado"
	}
	if d.VerifyShort == "" && d.Reference != "" {
		d.VerifyShort = "banzami.com/r/" + d.Reference
	}
	var b bytes.Buffer
	if err := receiptTmpl.Execute(&b, d); err != nil {
		return "", fmt.Errorf("render receipt html: %w", err)
	}
	return b.String(), nil
}

// GeneratePDF renders the receipt to a PDF (A4) via a headless browser.
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
		"--headless",
		"--disable-gpu",
		"--no-sandbox",
		"--no-pdf-header-footer",
		"--print-to-pdf-no-header",
		"--run-all-compositor-stages-before-draw",
		"--virtual-time-budget=4000",
		"--print-to-pdf=" + pdfPath,
		"file://" + htmlPath,
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

// findChrome resolves a headless-capable browser binary.
func findChrome() (string, error) {
	if env := os.Getenv("BANZAMI_CHROME_BIN"); env != "" {
		if _, err := os.Stat(env); err == nil {
			return env, nil
		}
	}
	candidates := []string{
		"google-chrome-stable", "google-chrome", "chromium", "chromium-browser", "chrome",
	}
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
