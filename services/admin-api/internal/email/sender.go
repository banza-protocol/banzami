package email

import (
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
