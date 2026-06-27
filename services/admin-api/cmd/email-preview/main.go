// Command email-preview renders every Banzami email template with sample data to
// standalone .html files, for visual QA across clients (Gmail, Apple Mail,
// Outlook, dark mode, mobile). It sends nothing and needs no credentials.
//
// Usage:
//
//	go run ./cmd/email-preview [output-dir]   # default: ./email-previews
package main

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"

	"github.com/banzami/banzami/services/admin-api/internal/email"
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

	previews := email.Previews()
	names := make([]string, 0, len(previews))
	for name := range previews {
		names = append(names, name)
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
	fmt.Printf("\n%d previews written to %s/\n", len(names), outDir)
}
