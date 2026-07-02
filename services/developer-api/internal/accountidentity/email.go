// Package accountidentity is the Account Identity bounded context (ADR-033):
// human accounts, Email + OTP authentication, sessions and audit. It references
// other contexts by opaque id only and owns the account_identity.* schema.
package accountidentity

import ce "github.com/banzami/banzami/services/common/email"

// RenderVerificationCode composes the Developer OTP email from the shared email
// design system (services/common/email). The 6-digit code is the whole action:
// no button, no fallback URL. The real code comes from the OTP service; the
// caller must never log or persist the raw code.
func RenderVerificationCode(code string) (html, text string) {
	const intro = "Bem-vindo(a) de volta. Use o código abaixo para continuar o acesso à plataforma de developers Banzami — basta introduzi-lo no ecrã de verificação."
	const notice = "Este código expira em 10 minutos. Se não pediu este código, ignore este email com segurança."
	body := ce.Title("O seu código de verificação") +
		ce.Para(intro) +
		ce.OTPBoxes(code) +
		ce.Notice("clock", notice)
	html = ce.RenderLayout(ce.LayoutOpts{
		Subtitle: "Developers", BadgeKind: "security", SafetyKind: "security",
		Preheader: "O seu código de verificação Banzami Developers.", Body: body,
	})
	text = ce.TextDoc("O seu código de verificação",
		[]string{intro, notice},
		[]ce.InfoRow{{Label: "Código de verificação", Value: code, Mono: true}},
		"", "", ce.FooterSafety("security"))
	return
}

// Mailer sends Account Identity emails via the shared transport.
type Mailer struct {
	s *ce.Sender
}

// NewMailer builds a Mailer over the shared email sender.
func NewMailer(cfg ce.Config) *Mailer { return &Mailer{s: ce.NewSender(cfg)} }

// SendVerificationCode delivers the OTP email. Security → From noreply@, no
// Reply-To (the code is the action; there is no link). Non-blocking-friendly.
func (m *Mailer) SendVerificationCode(to, code string) {
	html, text := RenderVerificationCode(code)
	m.s.Deliver(m.s.Automated("developer_verification_code", to,
		"O seu código de verificação Banzami", html, text, ""))
}
