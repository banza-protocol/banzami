package email

import (
	"html"
	"strings"
)

// ─────────────────────────────────────────────────────────────────────────────
// Banzami Email Design System (v2)
//
// A single institutional identity for every email Banzami sends. Built from the
// official brand hero (docs/diagrams/banzami-hero-v1.svg), adapted to email HTML.
//
// Philosophy: minimalism, generous whitespace, one clear hierarchy, no nested
// cards, no heavy shadows, no scattered gradients. White canvas, a single
// gradient hero band, clean typography, one primary button. The level of Stripe,
// Mercury, Revolut, Linear.
//
// Structure (always): Hero → Label → Title → Lead → Content → CTA → Footer.
//
// Every email is composed from the components below — no email writes raw HTML.
// HTML is single-column with inline CSS for client robustness (Gmail, Outlook,
// Apple Mail, Yahoo); a <style> block adds responsive + dark-mode only.
// ─────────────────────────────────────────────────────────────────────────────

const (
	// Official identity
	cPrimary  = "#C8102E" // primária
	cGradFrom = "#B80E27" // gradiente início
	cGradTo   = "#E12638" // gradiente fim
	cText     = "#231F20" // texto principal
	cSecond   = "#6B7280" // texto secundário
	cBg       = "#FFFFFF" // fundo
	cSep      = "#F3F4F6" // separadores

	fontStack = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
	fontMono  = "ui-monospace,'SF Mono','Roboto Mono',Menlo,Consolas,monospace"

	siteURL      = "https://banzami.com"
	siteLabel    = "www.banzami.com"
	contactEmail = "contact@banzami.com"
	brandTagline = "A infraestrutura moderna de pagamentos para Angola"
)

var esc = html.EscapeString

// ─── Hero ────────────────────────────────────────────────────────────────────

// emHero is the institutional brand band: overline, BANZAMI wordmark, tagline.
// Pure text on a diagonal gradient (solid #C8102E fallback for Outlook).
func emHero() string {
	return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td bgcolor="` + cPrimary + `" class="bz-hero" style="border-radius:16px;background:` + cPrimary +
		`;background:linear-gradient(135deg,` + cGradFrom + ` 0%,` + cGradTo + ` 100%);padding:38px 36px 34px;">
          <div class="bz-hero-over" style="font-family:` + fontMono + `;font-size:11px;line-height:1;letter-spacing:3px;color:rgba(255,255,255,.72);margin:0 0 20px;">REDE DE PAGAMENTOS&nbsp;&nbsp;·&nbsp;&nbsp;KWANZA&nbsp;&nbsp;·&nbsp;&nbsp;WALLET-NATIVE</div>
          <div class="bz-hero-mark" style="font-family:` + fontStack + `;font-size:44px;font-weight:800;letter-spacing:5px;line-height:1;color:#ffffff;margin:0 0 14px;">BANZAMI</div>
          <div class="bz-hero-tag" style="font-family:` + fontStack + `;font-size:17px;font-weight:600;line-height:1.4;color:#ffffff;">` + brandTagline + `</div>
        </td></tr>
      </table>`
}

// ─── Content components ──────────────────────────────────────────────────────

// emLabel is a discrete uppercase section label (e.g. SEGURANÇA, NEGÓCIOS).
func emLabel(text string) string {
	return `<div class="bz-label" style="font-family:` + fontMono + `;font-size:12px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:` + cPrimary + `;margin:0 0 14px;">` + esc(text) + `</div>`
}

// emTitle is the large email title.
func emTitle(text string) string {
	return `<h1 class="bz-title" style="margin:0 0 18px;font-family:` + fontStack + `;font-size:38px;line-height:1.15;font-weight:800;letter-spacing:-.01em;color:` + cText + `;">` + esc(text) + `</h1>`
}

// emLead is the main message under the title. content is trusted HTML written by
// us — escape user values with esc() at the call site.
func emLead(content string) string {
	return `<p class="bz-lead" style="margin:0 0 22px;font-family:` + fontStack + `;font-size:19px;line-height:1.6;color:` + cSecond + `;">` + content + `</p>`
}

// emPara is a content paragraph (primary ink).
func emPara(content string) string {
	return `<p class="bz-text" style="margin:0 0 18px;font-family:` + fontStack + `;font-size:18px;line-height:1.65;color:` + cText + `;">` + content + `</p>`
}

// emNote is a small secondary note.
func emNote(content string) string {
	return `<p class="bz-note" style="margin:0 0 16px;font-family:` + fontStack + `;font-size:15px;line-height:1.6;color:` + cSecond + `;">` + content + `</p>`
}

// emDivider is a thin full-width separator.
func emDivider() string {
	return `<div class="bz-div" style="height:1px;line-height:1px;font-size:0;background:` + cSep + `;margin:26px 0;">&nbsp;</div>`
}

// emButton is the single primary CTA — large, fixed width, centered (VML for Outlook).
func emButton(label, url string) string {
	return `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:30px auto 10px;">
        <tr><td align="center" bgcolor="` + cPrimary + `" style="border-radius:14px;">
          <!--[if mso]>
          <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="` + url + `" style="height:54px;v-text-anchor:middle;width:300px;" arcsize="26%" stroke="f" fillcolor="` + cPrimary + `">
            <w:anchorlock/><center style="color:#ffffff;font-family:` + fontStack + `;font-size:17px;font-weight:700;">` + esc(label) + `</center>
          </v:roundrect>
          <![endif]-->
          <!--[if !mso]><!-- -->
          <a href="` + url + `" target="_blank" class="bz-btn" style="display:inline-block;width:236px;text-align:center;padding:17px 24px;font-family:` + fontStack +
		`;font-size:17px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:14px;background:` + cPrimary + `;">` + esc(label) + `</a>
          <!--<![endif]-->
        </td></tr>
      </table>`
}

// emLinkFallback shows the full URL as small copy-paste text under the button.
func emLinkFallback(url string) string {
	return `<p class="bz-note" style="margin:6px 0 4px;font-family:` + fontStack + `;font-size:14px;line-height:1.5;color:` + cSecond + `;text-align:center;">Ou copie e cole este link no seu navegador:</p>` +
		`<p style="margin:0 0 6px;font-family:` + fontStack + `;font-size:13px;line-height:1.5;text-align:center;word-break:break-all;"><a href="` + url +
		`" target="_blank" style="color:` + cPrimary + `;text-decoration:none;">` + esc(url) + `</a></p>`
}

type infoRow struct{ Label, Value string }

// emInfo renders key/value lines separated by thin dividers — no boxes, no fills.
func emInfo(rows []infoRow) string {
	var b strings.Builder
	b.WriteString(`<div style="margin:8px 0 8px;">`)
	for i, r := range rows {
		top := "border-top:1px solid " + cSep + ";"
		if i == 0 {
			top = "border-top:1px solid " + cSep + ";"
		}
		b.WriteString(`<div style="` + top + `padding:15px 0;">` +
			`<div class="bz-note" style="font-family:` + fontMono + `;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:` + cSecond + `;margin-bottom:5px;">` + esc(r.Label) + `</div>` +
			`<div class="bz-info-v" style="font-family:` + fontStack + `;font-size:19px;font-weight:600;color:` + cText + `;word-break:break-word;">` + esc(r.Value) + `</div>` +
			`</div>`)
	}
	b.WriteString(`<div style="border-top:1px solid ` + cSep + `;height:0;line-height:0;font-size:0;">&nbsp;</div>`)
	b.WriteString(`</div>`)
	return b.String()
}

// emCode renders a one-time code / OTP, large and letter-spaced.
func emCode(code string) string {
	return `<div class="bz-code" style="margin:8px 0 18px;font-family:` + fontMono + `;font-size:40px;font-weight:800;letter-spacing:12px;color:` + cText + `;text-align:center;">` + esc(code) + `</div>`
}

// emAlert is a minimal callout (security note) — a thin primary rule, no fill.
func emAlert(content string) string {
	return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 18px;"><tr>` +
		`<td style="padding:2px 0 2px 16px;border-left:2px solid ` + cPrimary + `;font-family:` + fontStack +
		`;font-size:15px;line-height:1.6;color:` + cSecond + `;">` + content + `</td></tr></table>`
}

// emList renders a simple bulleted list.
func emList(items []string) string {
	var b strings.Builder
	b.WriteString(`<div style="margin:0 0 18px;">`)
	for _, it := range items {
		b.WriteString(`<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 10px;"><tr>` +
			`<td valign="top" style="width:22px;font-family:` + fontStack + `;font-size:18px;line-height:1.5;color:` + cPrimary + `;">·</td>` +
			`<td class="bz-text" style="font-family:` + fontStack + `;font-size:17px;line-height:1.55;color:` + cText + `;">` + it + `</td>` +
			`</tr></table>`)
	}
	b.WriteString(`</div>`)
	return b.String()
}

// emCredRow renders a monospace credential (Merchant ID, API Key) — minimal, no box.
func emCredRow(label, value string) string {
	return `<div style="padding:14px 0;border-top:1px solid ` + cSep + `;">` +
		`<div class="bz-note" style="font-family:` + fontMono + `;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:` + cSecond + `;margin-bottom:6px;">` + esc(label) + `</div>` +
		`<div class="bz-info-v" style="font-family:` + fontMono + `;font-size:16px;font-weight:600;color:` + cText + `;word-break:break-all;">` + esc(value) + `</div>` +
		`</div>`
}

// ─── Layout ──────────────────────────────────────────────────────────────────

type layoutOpts struct {
	Label     string // discrete section label: SEGURANÇA, NEGÓCIOS, ADMINISTRAÇÃO, …
	Preheader string // hidden inbox preview text
	Body      string // composed inner HTML (title → lead → content → cta)
}

// renderLayout wraps composed content in the institutional shell: hidden
// preheader, hero band, content column, and footer.
func renderLayout(o layoutOpts) string {
	label := ""
	if o.Label != "" {
		label = emLabel(o.Label)
	}
	return `<!DOCTYPE html>
<html lang="pt" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>Banzami</title>
  <!--[if mso]><style>* { font-family: Arial, sans-serif !important; }</style><![endif]-->
  <style>
    body { margin:0; padding:0; width:100% !important; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table { border-collapse:collapse; }
    img { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }
    a { text-decoration:none; }
    @media only screen and (max-width:600px) {
      .bz-container { width:100% !important; }
      .bz-pad { padding-left:24px !important; padding-right:24px !important; }
      .bz-hero { padding:30px 24px 28px !important; }
      .bz-hero-mark { font-size:34px !important; letter-spacing:3px !important; }
      .bz-title { font-size:28px !important; }
      .bz-lead { font-size:17px !important; }
      .bz-code { font-size:32px !important; letter-spacing:8px !important; }
    }
    @media (prefers-color-scheme: dark) {
      .bz-bg, body { background:#0f0f10 !important; }
      .bz-title, .bz-info-v { color:#ffffff !important; }
      .bz-text { color:#e7e5e6 !important; }
      .bz-lead, .bz-note, .bz-foot { color:#a8a8ad !important; }
      .bz-div, .bz-info-v + *, .bz-foot-rule { background:#262629 !important; border-color:#262629 !important; }
    }
  </style>
</head>
<body class="bz-bg" style="margin:0;padding:0;background:` + cBg + `;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;opacity:0;">` + esc(o.Preheader) + `&#847;&#847;&#847;&#847;&#847;&#847;&#847;&#847;&#847;&#847;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bz-bg" style="background:` + cBg + `;">
    <tr><td align="center" style="padding:32px 16px 8px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="bz-container" style="width:600px;max-width:600px;">
        <!-- Hero -->
        <tr><td>` + emHero() + `</td></tr>
        <!-- Content -->
        <tr><td class="bz-pad" style="padding:40px 38px 8px;">` + label + o.Body + `</td></tr>
        <!-- Footer -->
        <tr><td class="bz-pad" style="padding:14px 38px 36px;">` + emFooter() + `</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

// emFooter is the institutional footer (constant across all emails).
func emFooter() string {
	return `
      <div class="bz-foot-rule" style="height:1px;line-height:1px;font-size:0;background:` + cSep + `;margin:6px 0 26px;">&nbsp;</div>
      <div style="text-align:center;">
        <div style="font-family:` + fontStack + `;font-size:16px;font-weight:800;letter-spacing:2px;color:` + cText + `;" class="bz-info-v">BANZAMI</div>
        <div class="bz-foot" style="font-family:` + fontStack + `;font-size:14px;line-height:1.6;color:` + cSecond + `;margin:6px 0 12px;">` + brandTagline + `</div>
        <div class="bz-foot" style="font-family:` + fontStack + `;font-size:14px;line-height:1.8;color:` + cSecond + `;">
          <a href="` + siteURL + `" target="_blank" style="color:` + cSecond + `;text-decoration:none;">` + siteLabel + `</a><br>
          <a href="mailto:` + contactEmail + `" style="color:` + cSecond + `;text-decoration:none;">` + contactEmail + `</a>
        </div>
        <div class="bz-foot" style="font-family:` + fontStack + `;font-size:12px;line-height:1.7;color:` + cSecond + `;margin:22px 0 0;">
          Este email foi enviado automaticamente pela plataforma Banzami.<br>
          Se precisar de ajuda contacte <a href="mailto:` + contactEmail + `" style="color:` + cSecond + `;text-decoration:underline;">` + contactEmail + `</a>.
        </div>
      </div>`
}
