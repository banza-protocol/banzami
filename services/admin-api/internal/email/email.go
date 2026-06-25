package email

import (
	"bytes"
	"crypto/tls"
	"fmt"
	"html/template"
	"log/slog"
	"net/smtp"
	"strings"
	"time"
)

// Sender sends transactional emails via SMTP.
// When SMTP is not configured it logs a warning and is a no-op.
type Sender struct {
	host     string
	port     int
	user     string
	password string
	from     string
	fromName string
	dryRun   bool
}

// Config holds SMTP connection parameters.
type Config struct {
	Host     string
	Port     int
	User     string
	Password string
	From     string
	FromName string
	// DryRun logs emails instead of sending them (default in sandbox). It never
	// logs the body, so tokens/links/secrets stay out of the logs.
	DryRun bool
}

func NewSender(cfg Config) *Sender {
	return &Sender{
		host:     cfg.Host,
		port:     cfg.Port,
		user:     cfg.User,
		password: cfg.Password,
		from:     cfg.From,
		fromName: cfg.FromName,
		dryRun:   cfg.DryRun,
	}
}

// Enabled reports whether SMTP is configured.
func (s *Sender) Enabled() bool {
	return s.host != "" && s.from != ""
}

// MerchantWelcome sends the welcome email with credentials to a new merchant.
// It is intentionally non-blocking — call it in a goroutine.
func (s *Sender) MerchantWelcome(to, merchantName, merchantID, apiKey string) {
	if !s.Enabled() {
		slog.Warn("email not configured — skipping merchant welcome email",
			"merchant_id", merchantID, "to", to)
		return
	}

	body, err := renderMerchantWelcome(merchantName, merchantID, apiKey)
	if err != nil {
		slog.Error("failed to render merchant welcome email", "error", err)
		return
	}

	if err := s.send(to, "Bem-vindo à Banzami — as suas credenciais", body); err != nil {
		slog.Error("failed to send merchant welcome email",
			"error", err, "merchant_id", merchantID, "to", to)
	}
}

func (s *Sender) send(to, subject, htmlBody string) error {
	// Dry-run (default in sandbox): log the envelope only — never the body, so
	// activation links / tokens / API keys stay out of the logs.
	if s.dryRun {
		slog.Info("email dry-run — not sending", "to", to, "subject", subject)
		return nil
	}

	fromHeader := fmt.Sprintf("%s <%s>", s.fromName, s.from)
	msg := strings.Join([]string{
		fmt.Sprintf("From: %s", fromHeader),
		fmt.Sprintf("To: %s", to),
		fmt.Sprintf("Subject: %s", subject),
		"MIME-Version: 1.0",
		`Content-Type: text/html; charset="UTF-8"`,
		"",
		htmlBody,
	}, "\r\n")

	addr := fmt.Sprintf("%s:%d", s.host, s.port)
	auth := smtp.PlainAuth("", s.user, s.password, s.host)

	// Use STARTTLS on port 587; plain TCP on 25 (dev/internal).
	if s.port == 465 {
		tlsCfg := &tls.Config{ServerName: s.host}
		conn, err := tls.Dial("tcp", addr, tlsCfg)
		if err != nil {
			return fmt.Errorf("tls dial: %w", err)
		}
		client, err := smtp.NewClient(conn, s.host)
		if err != nil {
			return fmt.Errorf("smtp client: %w", err)
		}
		defer client.Close()
		if err := client.Auth(auth); err != nil {
			return fmt.Errorf("smtp auth: %w", err)
		}
		if err := client.Mail(s.from); err != nil {
			return err
		}
		if err := client.Rcpt(to); err != nil {
			return err
		}
		w, err := client.Data()
		if err != nil {
			return err
		}
		_, err = w.Write([]byte(msg))
		if err != nil {
			return err
		}
		return w.Close()
	}

	return smtp.SendMail(addr, auth, s.from, []string{to}, []byte(msg))
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
