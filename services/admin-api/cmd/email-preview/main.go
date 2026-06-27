// Command email-preview renders every Banzami email template + the receipt PDF
// with sample data to standalone files, for visual QA across clients (Gmail,
// Apple Mail, Outlook, dark mode, mobile). It sends nothing and needs no
// credentials. The PDF is generated only if a headless browser is available.
//
// Usage:
//
//	go run ./cmd/email-preview [output-dir]   # default: ./email-previews
package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"time"

	"github.com/banzami/banzami/services/admin-api/internal/email"
	documents "github.com/banzami/banzami/services/common/documents"
)

func main() {
	outDir := "email-previews"
	if len(os.Args) > 1 {
		outDir = os.Args[1]
	}
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		fmt.Fprintln(os.Stderr, "mkdir:", err)
		os.Exit(1)
	}

	// 5 dossier emails + welcome.
	previews := email.Previews()
	names := make([]string, 0, len(previews))
	for n := range previews {
		names = append(names, n)
	}
	sort.Strings(names)
	for _, name := range names {
		path := filepath.Join(outDir, name+".html")
		if err := os.WriteFile(path, []byte(previews[name]), 0o644); err != nil {
			fmt.Fprintln(os.Stderr, "write:", err)
			os.Exit(1)
		}
		fmt.Printf("wrote %s (%d bytes)\n", path, len(previews[name]))
	}

	// Receipt PDF — HTML always; PDF if a headless browser is present.
	sample := documents.SampleData()
	if html, err := documents.RenderHTML(sample); err == nil {
		p := filepath.Join(outDir, "pdf-comprovativo.html")
		_ = os.WriteFile(p, []byte(html), 0o644)
		fmt.Printf("wrote %s (%d bytes)\n", p, len(html))
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if pdfBytes, err := documents.GeneratePDF(ctx, sample); err != nil {
		fmt.Printf("pdf: skipped (%v)\n", err)
	} else {
		p := filepath.Join(outDir, "pdf-comprovativo.pdf")
		_ = os.WriteFile(p, pdfBytes, 0o644)
		fmt.Printf("wrote %s (%d bytes)\n", p, len(pdfBytes))
	}

	fmt.Printf("\n%d emails + receipt rendered to %s/\n", len(names), outDir)
}
