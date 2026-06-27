package email

import (
	"html"
	"strings"
)

// ─────────────────────────────────────────────────────────────────────────────
// Banzami Email Design System
//
// A single, reusable design system for every transactional email Banzami sends.
// Emails are composed from the components below (header, footer, buttons, badges,
// info rows, …) wrapped in renderLayout — never by hand-writing HTML per email.
// Adding a new email (Payment Received, Refund, KYC, …) is just a new build
// function in templates.go that composes these components.
//
// Brand tokens are taken verbatim from the Banzami website/dashboard palette
// (apps/website/tailwind.config.ts, apps/dashboard/tailwind.config.ts). No new
// colors are invented.
//
// HTML is table-based with inline CSS for broad client support (Gmail, Outlook,
// Apple Mail, Yahoo). A <style> block adds progressive enhancement only:
// responsive (max-width 600), dark-mode, and the Nunito web font — clients that
// strip <style> (Gmail) fall back to the inline light styles.
// ─────────────────────────────────────────────────────────────────────────────

const (
	// Brand reds
	cPrimary     = "#B5101F" // primary cherry — CTAs, accents, logo
	cPrimaryDark = "#9A1B22" // hover / gradient end / security text
	cPrimaryDeep = "#6E0E14" // deep burgundy — gradient base

	// Pink tints (badges, soft callouts)
	cPink50 = "#FFE7E5"

	// Ink (text)
	cInk   = "#2a2024" // headings / strong values
	cBody  = "#6a5a5e" // body text
	cMuted = "#9a8a8e" // captions / footer

	// Surfaces
	cCanvas = "#FBF3F1" // outer canvas (cream)
	cCard   = "#FFFFFF" // card background
	cBorder = "#F3E3E1" // soft border
	cChipBg = "#FFF7F6" // info rows / chips

	// Geometry
	radiusCard   = "20px"
	radiusButton = "12px"
	radiusBadge  = "999px"

	// Typography — Nunito (website font) with a system fallback stack.
	fontStack = "'Nunito',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

	// Assets & brand copy
	logoURL       = "https://pay.banzami.com/banzami_icon_192.png" // 192px, ~1.5KB
	siteURL       = "https://banzami.com"
	contactEmail  = "contact@banzami.com"
	securityEmail = "security@banzami.com"
	brandTagline  = "A carteira Kwanza de Angola"
)

var esc = html.EscapeString

// ─── Components ──────────────────────────────────────────────────────────────

// emHeading is the large email title.
func emHeading(text string) string {
	return `<h1 class="bz-h1" style="margin:0 0 14px;font-family:` + fontStack +
		`;font-size:26px;line-height:1.25;font-weight:800;color:` + cInk + `;">` + esc(text) + `</h1>`
}

// emP is a body paragraph. content is trusted HTML written by us (static copy);
// escape user-supplied values at the call site with esc().
func emP(content string) string {
	return `<p class="bz-p" style="margin:0 0 18px;font-family:` + fontStack +
		`;font-size:16px;line-height:1.65;color:` + cBody + `;">` + content + `</p>`
}

// emBadge is a small uppercase pill (e.g. "Security", "Business").
func emBadge(label string) string {
	return `<span style="display:inline-block;padding:5px 12px;font-family:` + fontStack +
		`;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:` + cPrimary +
		`;background:` + cPink50 + `;border-radius:` + radiusBadge + `;">` + esc(label) + `</span>`
}

// emButton is the primary, bulletproof CTA button (VML for Outlook).
func emButton(label, url string) string {
	return `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:8px auto 6px;">
        <tr><td align="center" bgcolor="` + cPrimary + `" style="border-radius:` + radiusButton + `;">
          <!--[if mso]>
          <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="` + url + `" style="height:48px;v-text-anchor:middle;width:300px;" arcsize="25%" stroke="f" fillcolor="` + cPrimary + `">
            <w:anchorlock/><center style="color:#ffffff;font-family:` + fontStack + `;font-size:16px;font-weight:700;">` + esc(label) + `</center>
          </v:roundrect>
          <![endif]-->
          <!--[if !mso]><!-- -->
          <a href="` + url + `" target="_blank" style="display:inline-block;padding:15px 34px;font-family:` + fontStack +
		`;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:` + radiusButton +
		`;background:` + cPrimary + `;box-shadow:0 8px 18px -6px rgba(181,16,31,.5);">` + esc(label) + `</a>
          <!--<![endif]-->
        </td></tr>
      </table>`
}

// emButtonOutline is a secondary, outlined button (e.g. "Contactar suporte").
func emButtonOutline(label, url string) string {
	return `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:8px auto 6px;">
        <tr><td align="center" style="border-radius:` + radiusButton + `;border:1.5px solid ` + cPrimary + `;">
          <a href="` + url + `" target="_blank" style="display:inline-block;padding:13px 30px;font-family:` + fontStack +
		`;font-size:16px;font-weight:700;color:` + cPrimary + `;text-decoration:none;border-radius:` + radiusButton + `;">` + esc(label) + `</a>
        </td></tr>
      </table>`
}

// emLinkFallback shows the full URL as small copy-paste text under a button.
func emLinkFallback(url string) string {
	return `<p style="margin:2px 0 4px;font-family:` + fontStack +
		`;font-size:13px;line-height:1.5;color:` + cMuted + `;">Ou copie e cole este link no seu navegador:</p>` +
		`<p style="margin:0 0 20px;font-family:` + fontStack +
		`;font-size:13px;line-height:1.5;word-break:break-all;"><a href="` + url +
		`" target="_blank" style="color:` + cPrimary + `;text-decoration:underline;">` + esc(url) + `</a></p>`
}

type infoRow struct{ Label, Value string }

// emInfoTable renders labelled key/value rows in a soft card (name, @handle, …).
func emInfoTable(rows []infoRow) string {
	var b strings.Builder
	b.WriteString(`<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="bz-info" style="margin:6px 0 22px;border:1px solid ` +
		cBorder + `;border-radius:14px;background:` + cChipBg + `;">`)
	for i, r := range rows {
		sep := ""
		if i > 0 {
			sep = "border-top:1px solid " + cBorder + ";"
		}
		b.WriteString(`<tr><td style="padding:13px 18px;` + sep + `font-family:` + fontStack + `;">` +
			`<div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:` + cMuted + `;margin-bottom:3px;">` + esc(r.Label) + `</div>` +
			`<div class="bz-info-v" style="font-size:15px;font-weight:600;color:` + cInk + `;word-break:break-all;">` + esc(r.Value) + `</div>` +
			`</td></tr>`)
	}
	b.WriteString(`</table>`)
	return b.String()
}

// emCredRow renders a monospace credential (Merchant ID, API Key).
func emCredRow(label, value string) string {
	return `<div style="margin-bottom:12px;font-family:` + fontStack + `;">` +
		`<div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:` + cMuted + `;margin-bottom:4px;">` + esc(label) + `</div>` +
		`<div style="background:` + cChipBg + `;border:1px solid ` + cBorder + `;border-radius:10px;padding:12px 16px;font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-size:13px;color:` + cInk + `;word-break:break-all;">` + esc(value) + `</div>` +
		`</div>`
}

// emNotice is a soft callout box (security note, warning).
func emNotice(content string) string {
	return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;"><tr>` +
		`<td style="padding:14px 18px;background:` + cPink50 + `;border-radius:12px;font-family:` + fontStack +
		`;font-size:13px;line-height:1.6;color:` + cPrimaryDark + `;">` + content + `</td></tr></table>`
}

// emQuote renders an admin-supplied message in a neutral quote block.
func emQuote(content string) string {
	return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;"><tr>` +
		`<td style="padding:14px 18px;background:` + cChipBg + `;border-left:3px solid ` + cPrimary + `;border-radius:8px;font-family:` + fontStack +
		`;font-size:15px;line-height:1.6;color:` + cBody + `;">` + content + `</td></tr></table>`
}

// ─── Layout ──────────────────────────────────────────────────────────────────

type layoutOpts struct {
	Subtitle  string // header badge: "Business", "Security", "BANZADMIN", "Merchant Portal"
	Preheader string // hidden inbox preview text
	Body      string // composed inner HTML
	Security  bool   // security footer variant
}

// renderLayout wraps composed body HTML in the shared Banzami shell: hidden
// preheader, header (logo + wordmark + subtitle badge), body card, and footer.
func renderLayout(o layoutOpts) string {
	footerIgnore := `Se não esperava este email, pode ignorá-lo com segurança.`
	if o.Security {
		footerIgnore = `Se não solicitou esta ação, contacte-nos imediatamente em <a href="mailto:` +
			securityEmail + `" style="color:` + cPrimary + `;text-decoration:none;">` + securityEmail + `</a>.`
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
    @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap');
    body { margin:0; padding:0; width:100% !important; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table { border-collapse:collapse; }
    img { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }
    a { text-decoration:none; }
    @media only screen and (max-width:600px) {
      .bz-container { width:100% !important; }
      .bz-pad { padding-left:24px !important; padding-right:24px !important; }
      .bz-h1 { font-size:23px !important; }
    }
    @media (prefers-color-scheme: dark) {
      .bz-canvas { background:#181113 !important; }
      .bz-card { background:#241b1e !important; border-color:#3a2c30 !important; }
      .bz-h1 { color:#ffffff !important; }
      .bz-p { color:#d9cdcf !important; }
      .bz-info { background:#2c2226 !important; border-color:#3a2c30 !important; }
      .bz-info-v, .bz-foot-brand { color:#ffffff !important; }
      .bz-foot { color:#b3a4a8 !important; }
    }
  </style>
</head>
<body class="bz-canvas" style="margin:0;padding:0;background:` + cCanvas + `;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;opacity:0;">` + esc(o.Preheader) + `&#847;&#847;&#847;&#847;&#847;&#847;&#847;&#847;&#847;&#847;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bz-canvas" style="background:` + cCanvas + `;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="bz-container" style="width:600px;max-width:600px;">
        <!-- Card -->
        <tr><td class="bz-card" style="background:` + cCard + `;border:1px solid ` + cBorder + `;border-radius:` + radiusCard +
		`;box-shadow:0 2px 8px rgba(0,0,0,0.06),0 0 1px rgba(0,0,0,0.04);overflow:hidden;">
          <!-- Header -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td class="bz-pad" style="padding:26px 40px;border-bottom:1px solid ` + cBorder + `;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                <td style="vertical-align:middle;padding-right:12px;">
                  <img src="` + logoURL + `" width="40" height="40" alt="Banzami" style="display:block;width:40px;height:40px;border-radius:10px;">
                </td>
                <td style="vertical-align:middle;">
                  <span class="bz-foot-brand" style="font-family:` + fontStack + `;font-size:19px;font-weight:800;color:` + cInk + `;letter-spacing:-.01em;">Banzami</span>` +
		headerSubtitle(o.Subtitle) + `
                </td>
              </tr></table>
            </td></tr>
          </table>
          <!-- Body -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td class="bz-pad" style="padding:36px 40px 32px;">` + o.Body + `</td></tr>
          </table>
        </td></tr>
        <!-- Footer -->
        <tr><td class="bz-pad" style="padding:26px 40px 8px;text-align:center;">
          <p class="bz-foot-brand" style="margin:0 0 4px;font-family:` + fontStack + `;font-size:15px;font-weight:800;color:` + cInk + `;">Banzami</p>
          <p class="bz-foot" style="margin:0 0 10px;font-family:` + fontStack + `;font-size:13px;color:` + cMuted + `;">` + brandTagline + `</p>
          <p class="bz-foot" style="margin:0 0 14px;font-family:` + fontStack + `;font-size:13px;color:` + cMuted + `;">
            <a href="mailto:` + contactEmail + `" style="color:` + cMuted + `;text-decoration:none;">` + contactEmail + `</a>
            &nbsp;·&nbsp;
            <a href="` + siteURL + `" target="_blank" style="color:` + cMuted + `;text-decoration:none;">banzami.com</a>
          </p>
          <p class="bz-foot" style="margin:0 0 12px;font-family:` + fontStack + `;font-size:12px;line-height:1.6;color:` + cMuted + `;">` + footerIgnore + `</p>
          <p class="bz-foot" style="margin:0;font-family:` + fontStack + `;font-size:12px;color:` + cMuted + `;">© Banzami · construído sobre o protocolo aberto BANZA</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

func headerSubtitle(s string) string {
	if s == "" {
		return ""
	}
	return `&nbsp;&nbsp;` + emBadge(s)
}
