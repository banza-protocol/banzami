package email

// renderLayout wraps a composed body in the shared Banzami email shell:
// <html>/head (Nunito + fallbacks, responsive, dark-mode), page band, centered
// 600px white card (header + body + footer), and the brand caption below.
//
// safetyKind: "normal" | "security" | "receipt" — selects the footer safety line.

type layoutOpts struct {
	Subtitle  string // header subtitle: Business | BANZADMIN | Carteira
	BadgeKind string // business | security | receipt
	SafetyKind string // normal | security | receipt
	Preheader string
	Body      string // composed inner HTML
}

func footerSafety(kind string) string {
	switch kind {
	case "security":
		return "Se não solicitou esta ação, contacte-nos imediatamente em " + contactEmail + "."
	case "receipt":
		return "Este é um comprovativo automático. Se não reconhece este pagamento, contacte-nos em " + contactEmail + "."
	default:
		return "Se não estava à espera deste email, pode ignorá-lo com segurança."
	}
}

func emFooter(safetyKind string) string {
	return `
      <tr><td style="padding:24px 34px 30px;border-top:1px solid ` + cLine + `;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px;"><tr>
          <td style="vertical-align:middle;padding-right:8px;"><img src="` + logoURL + `" width="22" height="22" alt="Banzami" style="display:block;width:22px;height:22px;border-radius:7px;"></td>
          <td style="vertical-align:middle;font-family:` + fSans + `;">
            <span style="font-size:14px;font-weight:900;letter-spacing:-.01em;color:` + cInk + `;">Banzami</span>
            <span style="font-size:13px;font-weight:700;color:` + cLabel + `;">&nbsp;— Pagamentos modernos para África</span>
          </td>
        </tr></table>
        <div style="font-family:` + fMono + `;font-size:12.5px;font-weight:600;color:` + cLabel + `;margin-bottom:14px;">` + contactEmail + `&nbsp;&nbsp;·&nbsp;&nbsp;` + siteURL + `</div>
        <div style="height:1px;line-height:1px;font-size:0;background:` + cLine + `;margin-bottom:14px;">&nbsp;</div>
        <p style="margin:0;font-family:` + fSans + `;font-size:12.5px;line-height:1.55;font-weight:600;color:` + cSafety + `;">` + footerSafety(safetyKind) + `</p>
      </td></tr>`
}

func renderLayout(o layoutOpts) string {
	return `<!DOCTYPE html>
<html lang="pt" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>Banzami</title>
  <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <!--[if mso]><style>* { font-family: Arial, sans-serif !important; }</style><![endif]-->
  <style>
    body { margin:0; padding:0; width:100% !important; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table { border-collapse:collapse; }
    img { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }
    a { text-decoration:none; }
    @media only screen and (max-width:600px) {
      .bz-card { width:100% !important; }
      .bz-pad { padding-left:22px !important; padding-right:22px !important; }
      .bz-h1 { font-size:24px !important; }
    }
    @media (prefers-color-scheme: dark) {
      .bz-band, body { background:#1a1416 !important; }
      .bz-card-bg { background:#221b1d !important; border-color:#3a2c30 !important; }
      .bz-ink { color:#ffffff !important; }
      .bz-body { color:#d9cdcf !important; }
      .bz-field { background:#2a2125 !important; border-color:#3a2c30 !important; }
    }
  </style>
</head>
<body class="bz-band" style="margin:0;padding:0;background:` + cPageBand + `;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;opacity:0;">` + esc(o.Preheader) + `&#847;&#847;&#847;&#847;&#847;&#847;&#847;&#847;&#847;&#847;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bz-band" style="background:` + cPageBand + `;">
    <tr><td align="center" style="padding:40px 16px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="bz-card" style="width:600px;max-width:600px;">
        <tr><td class="bz-card-bg" style="background:` + cWhite + `;border:1px solid ` + cLine + `;border-radius:20px;box-shadow:0 30px 70px -42px rgba(120,20,30,.5);overflow:hidden;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">` +
		emHeader(o.Subtitle, o.BadgeKind) + `
            <tr><td class="bz-pad" style="padding:36px 34px 32px;">` + o.Body + `</td></tr>` +
		emFooter(o.SafetyKind) + `
          </table>
        </td></tr>
        <tr><td align="center" style="padding:16px 16px 0;font-family:` + fSans + `;font-size:12px;font-weight:700;color:` + cMuted + `;">Construído sobre o protocolo aberto BANZA · O Banzami é como Angola paga</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}
