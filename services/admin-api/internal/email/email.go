package email

import (
	"bytes"
	"html/template"
	"log/slog"
	"strings"
	"time"
)

// Sender sends transactional emails through a pluggable transport (Resend HTTP
// API or SMTP). When the transport is not configured it logs a warning and is a
// no-op. Two sender identities are supported per the brand rules:
//
//   - institutional (contact@banzami.com) — emails the recipient may reply to
//     (e.g. rejection, support).
//   - automated (noreply@banzami.com) — security / activation / automatic emails.
//
// Reply-To is set per message (see institutional/automated helpers).
type Sender struct {
	tx       transport
	dryRun   bool
	provider string

	// institutional identity (contact@)
	fromName    string
	fromAddress string
	replyTo     string
	// automated identity (noreply@)
	noreplyName    string
	noreplyAddress string
}

// Config holds the provider selection, credentials, and sender identities.
type Config struct {
	// Provider selects the transport: "resend" (HTTP API) or "smtp".
	Provider string
	// DryRun logs emails instead of sending them (default in sandbox). It never
	// logs the body, so tokens/links/secrets stay out of the logs.
	DryRun bool

	// Resend
	ResendAPIKey string

	// SMTP (legacy fallback, used when Provider != "resend")
	SMTPHost     string
	SMTPPort     int
	SMTPUser     string
	SMTPPassword string

	// Institutional identity (contact@) — replyable mail.
	FromName    string
	FromAddress string
	ReplyTo     string
	// Automated identity (noreply@) — security/automatic mail.
	NoreplyName    string
	NoreplyAddress string
}

// transport is the wire mechanism that actually delivers a message.
type transport interface {
	send(m message) error
	// configured reports whether the transport has the credentials it needs.
	configured() bool
}

// message is a single rendered email ready for delivery. purpose is a stable
// label (e.g. "application_approved") used only for logging — never the body.
type message struct {
	fromName string
	fromAddr string
	to       string
	subject  string
	html     string
	replyTo  string // optional
	purpose  string
}

func NewSender(cfg Config) *Sender {
	provider := strings.ToLower(strings.TrimSpace(cfg.Provider))
	if provider == "" {
		if cfg.ResendAPIKey != "" {
			provider = "resend"
		} else {
			provider = "smtp"
		}
	}

	var tx transport
	switch provider {
	case "resend":
		tx = &resendTransport{apiKey: cfg.ResendAPIKey}
	default:
		provider = "smtp"
		tx = &smtpTransport{
			host:     cfg.SMTPHost,
			port:     cfg.SMTPPort,
			user:     cfg.SMTPUser,
			password: cfg.SMTPPassword,
		}
	}

	return &Sender{
		tx:             tx,
		dryRun:         cfg.DryRun,
		provider:       provider,
		fromName:       cfg.FromName,
		fromAddress:    cfg.FromAddress,
		replyTo:        cfg.ReplyTo,
		noreplyName:    cfg.NoreplyName,
		noreplyAddress: cfg.NoreplyAddress,
	}
}

// Enabled reports whether the sender can deliver real email: the transport is
// configured and both sender identities have a From address.
func (s *Sender) Enabled() bool {
	return s.tx.configured() && s.fromAddress != "" && s.noreplyAddress != ""
}

// institutional builds a message sent from contact@ with Reply-To contact@ —
// for mail the recipient may reply to (rejection, support, welcome).
func (s *Sender) institutional(purpose, to, subject, html string) message {
	return message{
		fromName: s.fromName,
		fromAddr: s.fromAddress,
		replyTo:  s.replyTo,
		to:       to,
		subject:  subject,
		html:     html,
		purpose:  purpose,
	}
}

// automated builds a message sent from noreply@ for security/automatic mail.
// replyTo is optional — pass s.replyTo to let the recipient reach support, or ""
// for a purely automatic message.
func (s *Sender) automated(purpose, to, subject, html, replyTo string) message {
	return message{
		fromName: s.noreplyName,
		fromAddr: s.noreplyAddress,
		replyTo:  replyTo,
		to:       to,
		subject:  subject,
		html:     html,
		purpose:  purpose,
	}
}

// deliver sends (or dry-runs) a message, skipping cleanly when the transport is
// not configured and dry-run is off. Never logs the body.
func (s *Sender) deliver(m message) {
	if !s.Enabled() && !s.dryRun {
		slog.Warn("email not configured — skipping", "email", m.purpose, "to", m.to)
		return
	}
	if err := s.send(m); err != nil {
		slog.Error("failed to send email", "email", m.purpose, "error", err, "to", m.to)
	}
}

func (s *Sender) send(m message) error {
	// Dry-run (default in sandbox): log the envelope only — never the body, so
	// activation links / tokens / API keys stay out of the logs.
	if s.dryRun {
		slog.Info("email dry-run — not sending",
			"provider", s.provider, "to", m.to, "subject", m.subject,
			"from", m.fromAddr, "purpose", m.purpose)
		return nil
	}
	return s.tx.send(m)
}

// MerchantWelcome sends the welcome email with credentials to a new merchant.
// It is automatic (From noreply@) but Reply-To contact@ so the merchant can
// reach support. It is intentionally non-blocking — call it in a goroutine.
func (s *Sender) MerchantWelcome(to, merchantName, merchantID, apiKey string) {
	if !s.Enabled() && !s.dryRun {
		slog.Warn("email not configured — skipping merchant welcome email",
			"merchant_id", merchantID, "to", to)
		return
	}

	body, err := renderMerchantWelcome(merchantName, merchantID, apiKey)
	if err != nil {
		slog.Error("failed to render merchant welcome email", "error", err)
		return
	}

	s.deliver(s.automated("merchant_welcome", to,
		"Bem-vindo à Banzami — as suas credenciais", body, s.replyTo))
}

// ---------------------------------------------------------------------------
// Template
// ---------------------------------------------------------------------------

var welcomeTmpl = template.Must(template.New("merchant_welcome").Parse(`<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Bem-vindo à Banzami</title>
  <style>
    body { margin:0; padding:0; background:#f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .wrap { max-width:560px; margin:40px auto; background:#fff; border-radius:16px; overflow:hidden; box-shadow:0 2px 12px rgba(0,0,0,.08); }
    .header { background:#4A0005; padding:36px 40px; }
    .header img { display:block; width:56px; height:56px; border-radius:12px; margin-bottom:16px; }
    .header h1 { margin:0; color:#fff; font-size:24px; font-weight:700; }
    .header p  { margin:8px 0 0; color:rgba(255,255,255,.75); font-size:14px; }
    .body { padding:36px 40px; }
    .body p { color:#374151; font-size:15px; line-height:1.6; margin:0 0 20px; }
    .cred { margin:24px 0; }
    .cred-row { margin-bottom:12px; }
    .cred-row:last-child { margin-bottom:0; }
    .cred-label { font-size:11px; font-weight:600; color:#6b7280; text-transform:uppercase; letter-spacing:.06em; margin-bottom:4px; }
    .cred-value { display:block; background:#f3f4f6; border:1px solid #e5e7eb; border-radius:8px; padding:12px 16px; font-family:'Courier New',monospace; font-size:13px; color:#111827; word-break:break-all; cursor:text; }
    .warning { background:#fff7ed; border:1px solid #fed7aa; border-radius:10px; padding:14px 18px; margin:20px 0; }
    .warning p { color:#92400e; font-size:13px; margin:0; }
    .footer { padding:24px 40px; border-top:1px solid #f3f4f6; }
    .footer p { color:#9ca3af; font-size:12px; margin:0; line-height:1.6; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <img src="https://pay.banzami.com/banzami-icon.png" alt="Banzami" />
      <h1>Banzami</h1>
      <p>Pagamentos instantâneos para Angola</p>
    </div>
    <div class="body">
      <p>Olá <strong>{{.MerchantName}}</strong>,</p>
      <p>A sua conta de comerciante Banzami foi criada com sucesso. Abaixo encontra as suas credenciais para configurar a app Banzami Comerciante.</p>

      <div class="cred">
        <div class="cred-row">
          <div class="cred-label">Merchant ID</div>
          <span class="cred-value">{{.MerchantID}}</span>
        </div>
        <div class="cred-row">
          <div class="cred-label">API Key</div>
          <span class="cred-value">{{.APIKey}}</span>
        </div>
      </div>

      <div class="warning">
        <p>⚠️ <strong>Guarde a API Key em segurança.</strong> Por razões de segurança, esta chave não deve ser mostrada a ninguém. Se a perder, contacte o suporte para gerar uma nova.</p>
      </div>

      <p>Para começar a receber pagamentos, descarregue a app <strong>Banzami Comerciante</strong> e introduza as credenciais acima quando solicitado.</p>
      <p>Se tiver alguma dúvida, contacte-nos em <a href="mailto:contact@banzami.com">contact@banzami.com</a>.</p>
    </div>
    <div class="footer">
      <p>Este email foi enviado automaticamente pela Banzami.<br>© {{.Year}} Banzami — Todos os direitos reservados.</p>
    </div>
  </div>
</body>
</html>`))

type welcomeData struct {
	MerchantName string
	MerchantID   string
	APIKey       string
	Year         int
}

func renderMerchantWelcome(name, merchantID, apiKey string) (string, error) {
	var buf bytes.Buffer
	if err := welcomeTmpl.Execute(&buf, welcomeData{
		MerchantName: name,
		MerchantID:   merchantID,
		APIKey:       apiKey,
		Year:         time.Now().Year(),
	}); err != nil {
		return "", err
	}
	return buf.String(), nil
}
