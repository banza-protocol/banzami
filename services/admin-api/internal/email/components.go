package email

import (
	"html"
	"strings"
)

// ─────────────────────────────────────────────────────────────────────────────
// Banzami Email Design System — components
//
// Faithful implementation of the official design handoff
// (design_handoff_banzami_email). One shared set of components (header, footer,
// button, detail rows, notice, badge, hero amount, URL fallback) serves every
// email, rendered as email-robust HTML: tables + inline CSS, 600px, no flex/grid.
// Tokens (colors, type, radius, shadows, spacing) are verbatim from the handoff.
//
// Logo is a hosted PNG (Gmail strips inline SVG). Decorative icons (badge/notice/
// hero check) are inline SVG that degrades gracefully (text always present).
// ─────────────────────────────────────────────────────────────────────────────

const (
	// Brand
	cRed       = "#B5101F" // Vermelho Banzami — marca, botões, valores, acentos
	cRedVivid  = "#D7242E" // Vermelho vivo — faixa de topo
	cCoral     = "#E8434B" // Coral — faixa de topo
	cRedDark   = "#9A1B22" // Vermelho escuro — hover, badge, handles
	cPink      = "#FBD2D0" // Rosa — detalhe do logótipo
	cTint      = "#FFF1F0" // Tint claro — fundo de badges/notices
	cSoftBg    = "#FFF7F6" // Soft bg — hero de valor / notas
	cPageBand  = "#FBF4F3" // Banda de página — fundo atrás do cartão
	cField     = "#FCF9F9" // Campo — fundo das linhas de detalhe
	cCodeBg    = "#F7F2F2" // Código bg — bloco de URL alternativo
	cSecBorder = "#F3DBDB" // Borda segurança — notices/badge Segurança

	cInk    = "#221c1e" // Tinta — texto principal
	cBody   = "#6a5a5e" // Secundário — corpo
	cLabel  = "#9a8a8e" // Secundário — labels
	cMuted  = "#b09a9e" // Muted — kickers, captions
	cSafety = "#a8979b" // Footer safety

	cLine     = "#f2e7e7" // Linhas — separadores
	cLineSoft = "#efe0e0" // Linha do header
	cLineRow  = "#f4ebeb" // Linha entre linhas de detalhe
	cCardBd   = "#f1e6e6" // Borda do cartão / painéis
	cWhite    = "#ffffff"

	// PDF-only state green
	cGreen     = "#22a35a"
	cGreenText = "#1a7a3e"

	// Type
	fSans = "'Nunito',Arial,Helvetica,sans-serif"
	fMono = "'JetBrains Mono','Courier New',monospace"

	// Assets
	logoURL      = "https://pay.banzami.com/banzami_icon_512.png" // red tile PNG (~42KB)
	contactEmail = "contact@banzami.com"
	siteURL      = "https://banzami.com"
)

var esc = html.EscapeString

// ── Header ───────────────────────────────────────────────────────────────────

// emHeader renders logo + "Banzami" + separator + subtitle, with the context
// badge on the right. subtitle: "Business" | "BANZADMIN" | "Carteira".
func emHeader(subtitle, badgeKind string) string {
	return `
      <tr><td style="padding:20px 30px;border-bottom:1px solid ` + cLineSoft + `;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="vertical-align:middle;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="vertical-align:middle;padding-right:11px;">
                <img src="` + logoURL + `" width="36" height="36" alt="Banzami" style="display:block;width:36px;height:36px;border-radius:11px;">
              </td>
              <td style="vertical-align:middle;font-family:` + fSans + `;">
                <span style="font-size:18px;font-weight:900;letter-spacing:-.02em;color:` + cInk + `;">Banzami</span>
                <span style="color:` + cLineSoft + `;">&nbsp;&nbsp;|&nbsp;&nbsp;</span><span style="font-size:13px;font-weight:800;color:` + cLabel + `;">` + esc(subtitle) + `</span>
              </td>
            </tr></table>
          </td>
          <td align="right" style="vertical-align:middle;">` + emBadge(badgeKind) + `</td>
        </tr></table>
      </td></tr>`
}

// emBadge renders the context badge: "business" (dot) | "security" (shield) | "receipt" (check).
func emBadge(kind string) string {
	switch kind {
	case "security":
		return `<span style="display:inline-block;padding:6px 11px;border-radius:30px;background:#FBEFEF;color:` + cRedDark +
			`;font-family:` + fSans + `;font-weight:800;font-size:11.5px;border:1px solid ` + cSecBorder + `;">` +
			`<span style="vertical-align:middle;">` + svgShield(13, cRedDark) + `</span>&nbsp;Segurança</span>`
	case "receipt":
		return `<span style="display:inline-block;padding:6px 11px;border-radius:30px;background:` + cTint + `;color:` + cRedDark +
			`;font-family:` + fSans + `;font-weight:800;font-size:11.5px;">` +
			`<span style="vertical-align:middle;">` + svgCheck(13, cRedDark) + `</span>&nbsp;Recibo</span>`
	default: // business
		return `<span style="display:inline-block;padding:6px 11px;border-radius:30px;background:` + cTint + `;color:` + cRedDark +
			`;font-family:` + fSans + `;font-weight:800;font-size:11.5px;">` +
			`<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:` + cRed + `;vertical-align:middle;"></span>&nbsp;Business</span>`
	}
}

// ── Body components ──────────────────────────────────────────────────────────

// emTitle is the email H1 (27px / 900).
func emTitle(text string) string {
	return `<h1 style="margin:0 0 18px;font-family:` + fSans + `;font-size:27px;font-weight:900;letter-spacing:-.02em;line-height:1.12;color:` + cInk + `;">` + esc(text) + `</h1>`
}

// emPara is a body paragraph (16px / 600, #6a5a5e). content is trusted HTML.
func emPara(content string) string {
	return `<p style="margin:0 0 14px;font-family:` + fSans + `;font-size:16px;line-height:1.6;font-weight:600;color:` + cBody + `;">` + content + `</p>`
}

// emHeroAmount renders the value hero (receipt): red circle check + label + big red amount.
func emHeroAmount(label, amount string) string {
	return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;">
        <tr><td align="center" style="padding:24px 20px;border-radius:16px;background:` + cSoftBg + `;border:1px solid ` + cSecBorder + `;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td align="center" style="width:40px;height:40px;border-radius:50%;background:` + cRed + `;">` + svgCheck(22, cWhite) + `</td></tr></table>
          <div style="font-family:` + fSans + `;font-size:13.5px;font-weight:700;color:` + cLabel + `;margin-top:12px;">` + esc(label) + `</div>
          <div style="font-family:` + fSans + `;font-size:40px;font-weight:900;letter-spacing:-.025em;color:` + cRed + `;margin-top:3px;line-height:1;">` + esc(amount) + `</div>
        </td></tr>
      </table>`
}

type infoRow struct {
	Label, Value string
	Mono         bool
}

// emDetailRows renders the shared detail-rows panel (#FCF9F9 box, dividers).
func emDetailRows(rows []infoRow) string {
	var b strings.Builder
	b.WriteString(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 4px;border:1px solid ` + cCardBd + `;border-radius:14px;background:` + cField + `;">`)
	for i, r := range rows {
		border := "border-bottom:1px solid " + cLineRow + ";"
		if i == len(rows)-1 {
			border = ""
		}
		vFont := fSans
		if r.Mono {
			vFont = fMono
		}
		b.WriteString(`<tr>` +
			`<td style="padding:13px 16px;` + border + `font-family:` + fSans + `;font-size:13.5px;font-weight:700;color:` + cLabel + `;">` + esc(r.Label) + `</td>` +
			`<td align="right" style="padding:13px 16px;` + border + `font-family:` + vFont + `;font-size:14px;font-weight:800;color:` + cInk + `;">` + esc(r.Value) + `</td>` +
			`</tr>`)
	}
	b.WriteString(`</table>`)
	return b.String()
}

// emNotice renders an icon + text callout. kind: "clock" | "shield" | "doc".
func emNotice(kind, text string) string {
	var icon string
	switch kind {
	case "clock":
		icon = svgClock(18, cRedDark)
	case "shield":
		icon = svgShield(18, cRedDark)
	default:
		icon = svgDoc(18, cRedDark)
	}
	return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 4px;">
        <tr><td style="padding:14px 16px;border-radius:14px;background:` + cTint + `;border:1px solid ` + cSecBorder + `;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td valign="top" style="padding-right:11px;line-height:1;">` + icon + `</td>
            <td style="font-family:` + fSans + `;font-size:14px;font-weight:700;line-height:1.5;color:` + cRedDark + `;">` + text + `</td>
          </tr></table>
        </td></tr>
      </table>`
}

// emButton is the primary bulletproof CTA (red, radius 13, VML for Outlook).
func emButton(label, url string) string {
	return `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 0;">
        <tr><td bgcolor="` + cRed + `" style="border-radius:13px;">
          <!--[if mso]>
          <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="` + url + `" style="height:50px;v-text-anchor:middle;width:240px;" arcsize="26%" stroke="f" fillcolor="` + cRed + `">
            <w:anchorlock/><center style="color:#ffffff;font-family:` + fSans + `;font-size:16px;font-weight:800;">` + esc(label) + `</center>
          </v:roundrect>
          <![endif]-->
          <!--[if !mso]><!-- -->
          <a href="` + url + `" target="_blank" style="display:inline-block;background:` + cRed + `;color:#ffffff;font-family:` + fSans +
		`;font-weight:800;font-size:16px;padding:15px 30px;border-radius:13px;text-decoration:none;">` + esc(label) + `</a>
          <!--<![endif]-->
        </td></tr>
      </table>`
}

// emURLFallback renders the hint + full URL in a mono box (always when there's a link).
func emURLFallback(hint, url string) string {
	return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 0;">
        <tr><td>
          <div style="font-family:` + fSans + `;font-size:12.5px;font-weight:700;color:` + cLabel + `;margin-bottom:6px;">` + esc(hint) + `</div>
          <div style="font-family:` + fMono + `;font-size:12.5px;font-weight:600;color:#8a7a7e;word-break:break-all;background:` + cCodeBg + `;border:1px solid ` + cCardBd + `;border-radius:10px;padding:11px 13px;">` + esc(url) + `</div>
        </td></tr>
      </table>`
}

// ── Inline SVG icons (decorative; degrade gracefully in Gmail) ────────────────

func svgCheck(size int, color string) string {
	s := itoa(size)
	return `<svg width="` + s + `" height="` + s + `" viewBox="0 0 24 24" fill="none" style="vertical-align:middle;"><path d="M5 12.5l4 4 10-10" stroke="` + color + `" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></path></svg>`
}

func svgShield(size int, color string) string {
	s := itoa(size)
	return `<svg width="` + s + `" height="` + s + `" viewBox="0 0 24 24" fill="none" style="vertical-align:middle;"><path d="M12 3l7 3v5c0 4.2-2.9 7.5-7 8.5-4.1-1-7-4.3-7-8.5V6l7-3z" stroke="` + color + `" stroke-width="1.8" stroke-linejoin="round"></path></svg>`
}

func svgClock(size int, color string) string {
	s := itoa(size)
	return `<svg width="` + s + `" height="` + s + `" viewBox="0 0 24 24" fill="none" style="vertical-align:middle;"><circle cx="12" cy="12" r="9" stroke="` + color + `" stroke-width="1.8"></circle><path d="M12 7.5V12l3 2" stroke="` + color + `" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path></svg>`
}

func svgDoc(size int, color string) string {
	s := itoa(size)
	return `<svg width="` + s + `" height="` + s + `" viewBox="0 0 24 24" fill="none" style="vertical-align:middle;"><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z" stroke="` + color + `" stroke-width="1.8" stroke-linejoin="round"></path><path d="M14 3v5h5M9 13h6M9 16h4" stroke="` + color + `" stroke-width="1.8" stroke-linecap="round"></path></svg>`
}

// itoa avoids importing strconv across the package for tiny ints.
func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b [12]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	return string(b[i:])
}
