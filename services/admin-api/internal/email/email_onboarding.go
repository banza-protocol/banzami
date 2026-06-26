package email

import (
	"bytes"
	"fmt"
	"html/template"
	"log/slog"
	"time"
)

// AdminPasswordReset emails a BANZADMIN operator a single-use link to set their
// password. The link (which contains the token) is NEVER logged. Call in a
// goroutine.
func (s *Sender) AdminPasswordReset(to, fullName, resetURL string) {
	body := fmt.Sprintf(
		`<p>Olá %s,</p>`+
			`<p>Foi gerado um link para definir a sua palavra-passe do <strong>BANZADMIN</strong>. `+
			`O link é de uso único e expira em 24 horas:</p>`+
			`<p><a href="%s">Definir palavra-passe BANZADMIN</a></p>`+
			`<p>Se não esperava este email, ignore-o.</p>`,
		template.HTMLEscapeString(fullName), resetURL)
	s.deliver("admin_password_reset", to, "Definir palavra-passe BANZADMIN", body)
}

// Merchant Lifecycle onboarding emails. The approved email carries ONLY a
// single-use activation link — never a PIN, token value, or API key. The
// merchant sets their own PIN on the activation page.

// deliver sends (or dry-runs) an email, skipping cleanly when neither SMTP nor
// dry-run is configured. Never logs the body.
func (s *Sender) deliver(kind, to, subject, body string) {
	if !s.Enabled() && !s.dryRun {
		slog.Warn("email not configured — skipping", "email", kind, "to", to)
		return
	}
	if err := s.send(to, subject, body); err != nil {
		slog.Error("failed to send email", "email", kind, "error", err, "to", to)
	}
}

// MerchantApplicationApproved emails the activation link for an approved
// Business application. Call in a goroutine.
func (s *Sender) MerchantApplicationApproved(to, businessName, activationURL string) {
	var buf bytes.Buffer
	if err := approvedTmpl.Execute(&buf, approvedData{
		BusinessName:  businessName,
		ActivationURL: activationURL,
		Year:          time.Now().Year(),
	}); err != nil {
		slog.Error("failed to render approved email", "error", err)
		return
	}
	s.deliver("application_approved", to, "A sua conta Banzami Business foi aprovada", buf.String())
}

// MerchantApplicationRejected emails a rejection with an optional message.
func (s *Sender) MerchantApplicationRejected(to, businessName, message string) {
	var buf bytes.Buffer
	if err := rejectedTmpl.Execute(&buf, rejectedData{
		BusinessName: businessName,
		Message:      message,
		Year:         time.Now().Year(),
	}); err != nil {
		slog.Error("failed to render rejected email", "error", err)
		return
	}
	s.deliver("application_rejected", to, "Atualização sobre a sua candidatura Banzami Business", buf.String())
}

type approvedData struct {
	BusinessName  string
	ActivationURL string
	Year          int
}

type rejectedData struct {
	BusinessName string
	Message      string
	Year         int
}

var approvedTmpl = template.Must(template.New("application_approved").Parse(`<!DOCTYPE html>
<html lang="pt"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Conta aprovada</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);">
    <div style="background:#B5101F;padding:36px 40px;">
      <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700;">Banzami Business</h1>
      <p style="margin:8px 0 0;color:rgba(255,255,255,.8);font-size:14px;">A sua conta foi aprovada</p>
    </div>
    <div style="padding:36px 40px;">
      <p style="color:#374151;font-size:15px;line-height:1.6;">Olá <strong>{{.BusinessName}}</strong>,</p>
      <p style="color:#374151;font-size:15px;line-height:1.6;">A sua candidatura Banzami Business foi aprovada. Para começar, ative a sua conta e defina o seu PIN.</p>
      <p style="margin:28px 0;text-align:center;">
        <a href="{{.ActivationURL}}" style="display:inline-block;background:#B5101F;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 28px;border-radius:10px;">Ativar a minha conta</a>
      </p>
      <p style="color:#6b7280;font-size:13px;line-height:1.6;">Por segurança, irá definir o seu PIN durante a ativação. Este link é pessoal e de utilização única.</p>
      <p style="color:#374151;font-size:15px;line-height:1.6;">Dúvidas? Contacte-nos em <a href="mailto:contact@banzami.com" style="color:#B5101F;">contact@banzami.com</a>.</p>
    </div>
    <div style="padding:24px 40px;border-top:1px solid #f3f4f6;">
      <p style="color:#9ca3af;font-size:12px;margin:0;line-height:1.6;">© {{.Year}} Banzami — Todos os direitos reservados.</p>
    </div>
  </div>
</body></html>`))

var rejectedTmpl = template.Must(template.New("application_rejected").Parse(`<!DOCTYPE html>
<html lang="pt"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Candidatura</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);">
    <div style="background:#4A0005;padding:36px 40px;">
      <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700;">Banzami Business</h1>
      <p style="margin:8px 0 0;color:rgba(255,255,255,.75);font-size:14px;">Atualização da sua candidatura</p>
    </div>
    <div style="padding:36px 40px;">
      <p style="color:#374151;font-size:15px;line-height:1.6;">Olá <strong>{{.BusinessName}}</strong>,</p>
      <p style="color:#374151;font-size:15px;line-height:1.6;">Após análise, não foi possível aprovar a sua candidatura Banzami Business neste momento.</p>
      {{if .Message}}<p style="color:#374151;font-size:15px;line-height:1.6;background:#f3f4f6;border-radius:8px;padding:14px 18px;">{{.Message}}</p>{{end}}
      <p style="color:#374151;font-size:15px;line-height:1.6;">Pode contactar-nos em <a href="mailto:contact@banzami.com" style="color:#B5101F;">contact@banzami.com</a> para mais informações.</p>
    </div>
    <div style="padding:24px 40px;border-top:1px solid #f3f4f6;">
      <p style="color:#9ca3af;font-size:12px;margin:0;line-height:1.6;">© {{.Year}} Banzami — Todos os direitos reservados.</p>
    </div>
  </div>
</body></html>`))
