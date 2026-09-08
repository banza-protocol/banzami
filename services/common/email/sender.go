package email

import (
	"errors"
	"log/slog"
	"net/http"
	"strings"
)

// Sender delivers transactional email through a pluggable transport (Resend HTTP
// API or SMTP). When the transport is not configured it logs a warning and is a
// no-op. Two sender identities are supported per the brand rules:
//
//   - institutional (contact@banzami.com) — emails the recipient may reply to.
//   - automated (noreply@banzami.com) — security / activation / automatic emails.
//
// Reply-To is set per message (see Institutional/Automated).
type Sender struct {
	tx       transport
	dryRun   bool
	provider string

	fromName       string
	fromAddress    string
	replyTo        string
	noreplyName    string
	noreplyAddress string
}

// Config holds the provider selection, credentials, and sender identities.
type Config struct {
	Provider string
	DryRun   bool

	ResendAPIKey string

	SMTPHost     string
	SMTPPort     int
	SMTPUser     string
	SMTPPassword string

	FromName       string
	FromAddress    string
	ReplyTo        string
	NoreplyName    string
	NoreplyAddress string

	// HTTPClient optionally overrides the HTTP client used by the Resend
	// transport. Nil → a default client. Used by tests to capture the outbound
	// request without any network access.
	HTTPClient *http.Client
}

// transport is the wire mechanism that actually delivers a message.
type transport interface {
	send(m Message) error
	configured() bool
}

// Message is a single rendered email ready for delivery. Purpose is a stable
// label (e.g. "application_approved") used only for logging — never the body.
type Message struct {
	FromName string
	FromAddr string
	To       string
	Subject  string
	HTML     string
	Text     string // plain-text alternative (optional)
	ReplyTo  string // optional
	Purpose  string
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
		tx = &resendTransport{apiKey: cfg.ResendAPIKey, client: cfg.HTTPClient}
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

// Enabled reports whether the sender can deliver real email.
func (s *Sender) Enabled() bool {
	return s.tx.configured() && s.fromAddress != "" && s.noreplyAddress != ""
}

// ReplyTo is the institutional reply-to address (contact@).
func (s *Sender) ReplyTo() string { return s.replyTo }

// DryRun reports whether the sender logs instead of sending.
func (s *Sender) DryRun() bool { return s.dryRun }

// Institutional builds a message sent from contact@ with Reply-To contact@.
func (s *Sender) Institutional(purpose, to, subject, html, text string) Message {
	return Message{
		FromName: s.fromName,
		FromAddr: s.fromAddress,
		ReplyTo:  s.replyTo,
		To:       to,
		Subject:  subject,
		HTML:     html,
		Text:     text,
		Purpose:  purpose,
	}
}

// Automated builds a message sent from noreply@ for security/automatic mail.
// replyTo is optional — pass s.ReplyTo() to let the recipient reach support.
func (s *Sender) Automated(purpose, to, subject, html, text, replyTo string) Message {
	return Message{
		FromName: s.noreplyName,
		FromAddr: s.noreplyAddress,
		ReplyTo:  replyTo,
		To:       to,
		Subject:  subject,
		HTML:     html,
		Text:     text,
		Purpose:  purpose,
	}
}

// Deliver sends (or dry-runs) a message, skipping cleanly when the transport is
// not configured and dry-run is off. Never logs the body.
//
// It swallows the error on purpose: almost every caller is a request handler
// where a failed notification must not fail the operation that triggered it.
func (s *Sender) Deliver(m Message) { _ = s.DeliverErr(m) }

// DeliverErr is Deliver for the callers where the send IS the outcome.
//
// One exists: the operator bootstrap. Its whole job is to put an activation
// link in a mailbox, and it printed "activation email sent" while the transport
// had failed with a DNS error — the operator existed, could never activate, and
// could not be created again because duplicates are refused. A log line is the
// wrong channel for a result the caller has to act on.
func (s *Sender) DeliverErr(m Message) error {
	if !s.Enabled() && !s.dryRun {
		slog.Warn("email not configured — skipping", "email", m.Purpose, "to", m.To)
		return ErrNotConfigured
	}
	if err := s.send(m); err != nil {
		slog.Error("failed to send email", "email", m.Purpose, "error", err, "to", m.To)
		return err
	}
	return nil
}

// ErrNotConfigured: no transport, and dry-run off — nothing was sent.
var ErrNotConfigured = errors.New("email transport is not configured")

func (s *Sender) send(m Message) error {
	if s.dryRun {
		slog.Info("email dry-run — not sending",
			"provider", s.provider, "to", m.To, "subject", m.Subject,
			"from", m.FromAddr, "purpose", m.Purpose)
		return nil
	}
	return s.tx.send(m)
}
