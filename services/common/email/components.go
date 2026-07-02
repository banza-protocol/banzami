// Package email is the shared Banzami email module: the transactional-email
// transport (Resend / SMTP), the Sender with its two identities, and the neutral
// Banzami email design system (layout + components) used to compose messages.
//
// It is domain-neutral — it renders and delivers, but owns no business/product
// composition. Each product (admin-api, developer-api, …) keeps its own
// Render<Name> compositions and calls these primitives. Behaviour is byte-for-
// byte the same as the previous admin-api/internal/email package it was
// extracted from (ADR-033 shared-module extraction).
package email

import (
	"html"
	"strings"
)

const (
	// Brand
	cRed       = "#B5101F"
	cRedVivid  = "#D7242E"
	cCoral     = "#E8434B"
	cRedDark   = "#9A1B22"
	cPink      = "#FBD2D0"
	cTint      = "#FFF1F0"
	cSoftBg    = "#FFF7F6"
	cPageBand  = "#FBF4F3"
	cField     = "#FCF9F9"
	cCodeBg    = "#F7F2F2"
	cSecBorder = "#F3DBDB"

	cInk    = "#221c1e"
	cBody   = "#6a5a5e"
	cLabel  = "#9a8a8e"
	cMuted  = "#b09a9e"
	cSafety = "#a8979b"
	cURLTxt = "#8a7a7e"

	cLine     = "#f2e7e7"
	cLineSoft = "#efe0e0"
	cLineRow  = "#f4ebeb"
	cCardBd   = "#f1e6e6"
	cSepLine  = "#ecdcdc"
	cWhite    = "#ffffff"

	cGreen     = "#22a35a"
	cGreenText = "#1a7a3e"

	// Type
	fSans = "'Nunito',Arial,Helvetica,sans-serif"
	fMono = "'JetBrains Mono','SFMono-Regular',Consolas,'Courier New',monospace"

	// Shadows (verbatim from handoff)
	shCard   = "0 30px 70px -42px rgba(120,20,30,.5)"
	shButton = "0 12px 26px -12px rgba(181,16,31,.75)"
	shLogo   = "0 6px 14px -5px rgba(181,16,31,.6)"
	shCircle = "0 8px 18px -8px rgba(181,16,31,.7)"

	// Assets
	logoURL   = "https://pay.banzami.com/banzami_icon_512.png"
	assetBase = "https://admin.banzami.com/api/email-assets" // served by AssetsHandler

	// ContactEmail / SiteURL are exported — product compositions reference them.
	ContactEmail = "contact@banzami.com"
	SiteURL      = "https://banzami.com"
)

// Esc HTML-escapes untrusted text for inclusion in an email body.
var Esc = html.EscapeString

// ── Header ───────────────────────────────────────────────────────────────────

// header: logo tile + "Banzami" + thin separator + subtitle (left), badge (right).
func header(subtitle, badgeKind string) string {
	return `
      <tr><td style="padding:20px 30px;border-bottom:1px solid ` + cLineSoft + `;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-spacing:0;"><tr>
          <td style="vertical-align:middle;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-spacing:0;"><tr>
              <td style="vertical-align:middle;padding-right:11px;">
                <img src="` + logoURL + `" width="36" height="36" alt="Banzami" style="display:block;width:36px;height:36px;border-radius:11px;box-shadow:` + shLogo + `;">
              </td>
              <td style="vertical-align:middle;">
                <span style="font-family:` + fSans + `;font-size:18px;font-weight:900;letter-spacing:-.02em;color:` + cInk + `;vertical-align:middle;">Banzami</span>` +
		`<span style="display:inline-block;width:1px;height:16px;background:` + cSepLine + `;vertical-align:middle;margin:0 11px;"></span>` +
		`<span style="font-family:` + fSans + `;font-size:13px;font-weight:800;letter-spacing:.01em;color:` + cLabel + `;vertical-align:middle;">` + Esc(subtitle) + `</span>
              </td>
            </tr></table>
          </td>
          <td align="right" style="vertical-align:middle;">` + badge(badgeKind) + `</td>
        </tr></table>
      </td></tr>`
}

// badge: "business" (dot) | "security" (shield+border) | "receipt" (check).
func badge(kind string) string {
	switch kind {
	case "security":
		return `<span style="display:inline-block;padding:6px 11px;border-radius:30px;background:#FBEFEF;color:` + cRedDark +
			`;font-family:` + fSans + `;font-weight:800;font-size:11.5px;border:1px solid ` + cSecBorder + `;white-space:nowrap;">` +
			iconImg("badge-shield.png", 13) + `&nbsp;Segurança</span>`
	case "receipt":
		return `<span style="display:inline-block;padding:6px 11px;border-radius:30px;background:` + cTint + `;color:` + cRedDark +
			`;font-family:` + fSans + `;font-weight:800;font-size:11.5px;white-space:nowrap;">` +
			iconImg("badge-check.png", 13) + `&nbsp;Recibo</span>`
	default:
		return `<span style="display:inline-block;padding:6px 11px;border-radius:30px;background:` + cTint + `;color:` + cRedDark +
			`;font-family:` + fSans + `;font-weight:800;font-size:11.5px;white-space:nowrap;">` +
			`<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:` + cRed + `;vertical-align:middle;"></span>&nbsp;Business</span>`
	}
}

// ── Body components ──────────────────────────────────────────────────────────

// Title renders the email H1.
func Title(text string) string {
	return `<h1 style="margin:0 0 18px;font-family:` + fSans + `;font-size:27px;font-weight:900;letter-spacing:-.02em;line-height:1.12;color:` + cInk + `;">` + Esc(text) + `</h1>`
}

// Para renders a body paragraph. `content` may contain safe inline HTML.
func Para(content string) string {
	return `<p style="margin:0 0 14px;font-family:` + fSans + `;font-size:16px;line-height:1.6;font-weight:600;color:` + cBody + `;">` + content + `</p>`
}

// HeroAmount: value hero (receipt) — single rounded element, red circle + label + amount.
func HeroAmount(label, amount string) string {
	return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-spacing:0;margin:0 0 22px;">
        <tr><td align="center" style="background:` + cSoftBg + `;border:1px solid ` + cSecBorder + `;border-radius:16px;padding:24px 20px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:separate;border-spacing:0;margin:0 auto 12px;"><tr>
            <td width="40" height="40" align="center" valign="middle" style="width:40px;height:40px;background:` + cRed + `;border-radius:50%;box-shadow:` + shCircle + `;">` + iconImg("hero-check.png", 22) + `</td>
          </tr></table>
          <div style="font-family:` + fSans + `;font-size:13.5px;font-weight:700;color:` + cLabel + `;">` + Esc(label) + `</div>
          <div style="font-family:` + fSans + `;font-size:40px;font-weight:900;letter-spacing:-.025em;color:` + cRed + `;margin-top:3px;line-height:1;">` + Esc(amount) + `</div>
        </td></tr>
      </table>`
}

// InfoRow is a label/value pair for DetailRows. Mono renders the value in the mono face.
type InfoRow struct {
	Label, Value string
	Mono         bool
}

// DetailRows: single rounded wrapper (bg+border+radius+overflow:hidden) with
// internal dividers — no square corners.
func DetailRows(rows []InfoRow) string {
	var inner strings.Builder
	for i, r := range rows {
		border := "border-bottom:1px solid " + cLineRow + ";"
		if i == len(rows)-1 {
			border = ""
		}
		vFont := fSans
		if r.Mono {
			vFont = fMono
		}
		inner.WriteString(`<tr>` +
			`<td style="padding:13px 16px;` + border + `font-family:` + fSans + `;font-size:13.5px;font-weight:700;color:` + cLabel + `;vertical-align:middle;white-space:nowrap;">` + Esc(r.Label) + `</td>` +
			`<td align="right" style="padding:13px 16px;` + border + `font-family:` + vFont + `;font-size:14px;font-weight:800;color:` + cInk + `;vertical-align:middle;text-align:right;word-break:break-word;overflow-wrap:anywhere;">` + Esc(r.Value) + `</td>` +
			`</tr>`)
	}
	return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-spacing:0;margin:22px 0 4px;">
        <tr><td style="background:` + cField + `;border:1px solid ` + cCardBd + `;border-radius:14px;overflow:hidden;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-spacing:0;">` + inner.String() + `</table>
        </td></tr>
      </table>`
}

// OTPBoxes: verification-code panel — blush rounded box with a label and six
// white digit boxes (46×58, radius 12, cherry 27px/700 mono). The code is the
// action; the template carries no button/URL. Email-robust: a centred table of
// boxes with border-spacing for the inter-box gap.
func OTPBoxes(code string) string {
	var cells strings.Builder
	for _, r := range code {
		cells.WriteString(
			`<td align="center" valign="middle" width="46" height="58" ` +
				`style="width:46px;height:58px;background:` + cWhite + `;border:1.5px solid ` + cSecBorder +
				`;border-radius:12px;font-family:` + fMono + `;font-size:27px;font-weight:700;color:` + cRed +
				`;box-shadow:0 6px 14px -10px rgba(181,16,31,.4);">` + Esc(string(r)) + `</td>`)
	}
	return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-spacing:0;margin:20px 0 4px;">
        <tr><td align="center" style="background:` + cSoftBg + `;border:1px solid ` + cSecBorder + `;border-radius:16px;padding:26px 20px;">
          <div style="font-family:` + fSans + `;font-size:12px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:` + cMuted + `;margin-bottom:15px;">Código de verificação</div>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:separate;border-spacing:8px 0;margin:0 auto;">
            <tr>` + cells.String() + `</tr>
          </table>
        </td></tr>
      </table>`
}

// Notice: icon + text callout — single rounded element. kind: clock|shield|doc.
func Notice(kind, text string) string {
	var icon string
	switch kind {
	case "clock":
		icon = iconImg("notice-clock.png", 18)
	case "shield":
		icon = iconImg("notice-shield.png", 18)
	default:
		icon = iconImg("notice-doc.png", 18)
	}
	return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-spacing:0;margin:22px 0 4px;">
        <tr><td style="background:` + cTint + `;border:1px solid ` + cSecBorder + `;border-radius:14px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-spacing:0;"><tr>
            <td valign="top" style="padding:14px 0 14px 16px;line-height:1;width:18px;">` + icon + `</td>
            <td valign="top" style="padding:14px 16px 14px 11px;font-family:` + fSans + `;font-size:14px;font-weight:700;line-height:1.5;color:` + cRedDark + `;">` + text + `</td>
          </tr></table>
        </td></tr>
      </table>`
}

// Button: primary CTA — left-aligned, content-width, red, radius 13, shadow, VML for Outlook.
func Button(label, url string) string {
	return `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-spacing:0;margin:26px 0 0;">
        <tr><td bgcolor="` + cRed + `" style="border-radius:13px;">
          <!--[if mso]>
          <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="` + url + `" style="height:50px;v-text-anchor:middle;width:200px;" arcsize="26%" stroke="f" fillcolor="` + cRed + `">
            <w:anchorlock/><center style="color:#ffffff;font-family:` + fSans + `;font-size:16px;font-weight:800;">` + Esc(label) + `</center>
          </v:roundrect>
          <![endif]-->
          <!--[if !mso]><!-- -->
          <a href="` + url + `" target="_blank" style="display:inline-block;background:` + cRed + `;color:#ffffff;font-family:` + fSans +
		`;font-weight:800;font-size:16px;padding:15px 30px;border-radius:13px;text-decoration:none;box-shadow:` + shButton + `;">` + Esc(label) + `</a>
          <!--<![endif]-->
        </td></tr>
      </table>`
}

// URLFallback: hint + full URL in a mono box (div rounds cleanly).
func URLFallback(hint, url string) string {
	return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-spacing:0;margin:20px 0 0;">
        <tr><td>
          <div style="font-family:` + fSans + `;font-size:12.5px;font-weight:700;color:` + cLabel + `;margin-bottom:6px;">` + Esc(hint) + `</div>
          <div style="font-family:` + fMono + `;font-size:12.5px;font-weight:600;color:` + cURLTxt + `;word-break:break-all;overflow-wrap:anywhere;background:` + cCodeBg + `;border:1px solid ` + cCardBd + `;border-radius:10px;padding:11px 13px;">` + Esc(url) + `</div>
        </td></tr>
      </table>`
}

// ── Icons (hosted PNG — Gmail strips inline SVG) ──────────────────────────────

func iconImg(file string, size int) string {
	s := itoa(size)
	return `<img src="` + assetBase + `/` + file + `" width="` + s + `" height="` + s + `" alt="" style="display:inline-block;vertical-align:middle;border:0;outline:none;">`
}

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
