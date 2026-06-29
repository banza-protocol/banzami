package email

// Lifecycle email methods. Each renders its template (template.go) and delivers
// with the correct sender identity + dossier subject. Sender identity rules:
//   - automated (noreply@): activation/security/automatic mail
//   - institutional (contact@): mail the recipient may reply to

// MerchantApplicationApproved — "A sua conta Business está pronta". Activation
// link → From noreply@, Reply-To contact@. Non-blocking; call in a goroutine.
func (s *Sender) MerchantApplicationApproved(to, businessName, handle, environment, activationURL string) {
	html, text := RenderMerchantApproved(MerchantApprovedData{
		MerchantName: businessName, Handle: handle, Environment: environment, ActivateURL: activationURL,
	})
	s.deliver(s.automated("application_approved", to,
		"A sua conta Business está pronta", html, text, s.replyTo))
}

// MerchantApplicationRejected — "Sobre o seu pedido Banzami". The merchant may
// reply → From contact@, Reply-To contact@. businessName is accepted for
// interface compatibility; the dossier copy does not display it.
func (s *Sender) MerchantApplicationRejected(to, businessName, message, environment string) {
	html, text := RenderMerchantRejected(MerchantRejectedData{Reason: message, Sandbox: envIsSandbox(environment)})
	s.deliver(s.institutional("application_rejected", to,
		"Atualização sobre o seu pedido Banzami", html, text))
}

// AdminOperatorInvite — "Foi convidado para o BANZADMIN". Security → From
// noreply@, no Reply-To. fullName is accepted for compatibility (not shown).
func (s *Sender) AdminOperatorInvite(to, fullName, role, invitedBy, inviteURL string) {
	html, text := RenderAdminInvite(AdminInviteData{Role: role, InvitedBy: invitedBy, AcceptURL: inviteURL})
	s.deliver(s.automated("admin_operator_invite", to,
		"Foi convidado para o BANZADMIN", html, text, ""))
}

// AdminPasswordReset — "Recupere a sua palavra-passe". Security → From noreply@,
// no Reply-To. fullName is accepted for compatibility (not shown).
func (s *Sender) AdminPasswordReset(to, fullName, resetURL string) {
	html, text := RenderAdminPasswordReset(AdminResetData{ResetURL: resetURL})
	s.deliver(s.automated("admin_password_reset", to,
		"Recupere a sua palavra-passe Banzami", html, text, ""))
}

// PaymentReceipt — "Recebeu um pagamento — <valor>". Automatic notification →
// From noreply@, Reply-To contact@. The subject carries the dynamic amount.
// (Not wired to a payment event yet — no such trigger exists in this service.)
func (s *Sender) PaymentReceipt(to string, d ReceiptData) {
	html, text := RenderReceipt(d)
	s.deliver(s.automated("payment_receipt", to,
		"Recebeu um pagamento — "+d.AmountText, html, text, s.replyTo))
}
