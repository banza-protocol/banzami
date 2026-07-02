package email

import (
	"log/slog"

	ce "github.com/banzami/banzami/services/common/email"
)

// The email transport + design system live in the shared module
// services/common/email (ADR-033). admin-api keeps only its domain-specific
// email compositions (template.go) and their sender methods (this file +
// email_onboarding.go).
//
// Config and the design-system primitives are re-exposed here (Config as a type
// alias; primitives via aliases.go) so the domain compositions read unchanged
// and admin-api's public API (email.NewSender, email.Config, email.AssetsHandler,
// email.Render*) is preserved exactly.

// Config is the shared email configuration.
type Config = ce.Config

// Sender wraps the shared sender with admin-api's domain email methods.
type Sender struct {
	*ce.Sender
}

// NewSender builds an admin-api email sender over the shared transport.
func NewSender(cfg Config) *Sender {
	return &Sender{Sender: ce.NewSender(cfg)}
}

// MerchantWelcome sends the welcome email with credentials to a new merchant.
// It is automatic (From noreply@) but Reply-To contact@ so the merchant can
// reach support. Non-blocking — call it in a goroutine.
func (s *Sender) MerchantWelcome(to, merchantName, merchantID, apiKey string) {
	if !s.Enabled() && !s.DryRun() {
		slog.Warn("email not configured — skipping merchant welcome email",
			"merchant_id", merchantID, "to", to)
		return
	}
	html, text := RenderMerchantWelcome(MerchantWelcomeData{
		MerchantName: merchantName, MerchantID: merchantID, APIKey: apiKey,
	})
	s.Deliver(s.Automated("merchant_welcome", to,
		"Bem-vindo à Banzami — as suas credenciais", html, text, s.ReplyTo()))
}
