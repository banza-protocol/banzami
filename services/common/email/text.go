package email

import "strings"

// TextDoc assembles a simple plain-text alternative for an email.
func TextDoc(title string, paras []string, lines []InfoRow, ctaLabel, url, safety string) string {
	var b strings.Builder
	b.WriteString("Banzami\n\n")
	b.WriteString(title + "\n\n")
	for _, p := range paras {
		b.WriteString(p + "\n\n")
	}
	for _, l := range lines {
		b.WriteString(l.Label + ": " + l.Value + "\n")
	}
	if len(lines) > 0 {
		b.WriteString("\n")
	}
	if ctaLabel != "" && url != "" {
		b.WriteString(ctaLabel + ": " + url + "\n\n")
	}
	if safety != "" {
		b.WriteString(safety + "\n")
	}
	b.WriteString("\n— Banzami · O novo caminho do Kwanza.\n" + ContactEmail + " · " + SiteURL + "\n")
	return b.String()
}
