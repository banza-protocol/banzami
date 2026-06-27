package email

import (
	"log/slog"
	"strings"
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
	s.deliver(s.automated("merchant_welcome", to,
		"Bem-vindo à Banzami — as suas credenciais",
		buildMerchantWelcome(merchantName, merchantID, apiKey), s.replyTo))
}
