package email

// Onboarding & lifecycle emails. Each method renders its template via a build*
// function (templates.go) and delivers it with the correct sender identity.

// AdminOperatorInvite emails a new operator a single-use link to define their
// password and activate their BANZADMIN account. Security email — From noreply@,
// no Reply-To. The link (token) is NEVER logged. Call in a goroutine.
func (s *Sender) AdminOperatorInvite(to, fullName, inviteURL string) {
	s.deliver(s.automated("admin_operator_invite", to,
		"Convite para aceder ao BANZADMIN",
		buildAdminInvite(fullName, inviteURL), ""))
}

// AdminPasswordReset emails a BANZADMIN operator a single-use link to reset their
// password. Security email — From noreply@, no Reply-To. The link (which
// contains the token) is NEVER logged. Call in a goroutine.
func (s *Sender) AdminPasswordReset(to, fullName, resetURL string) {
	s.deliver(s.automated("admin_password_reset", to,
		"Redefinir palavra-passe BANZADMIN",
		buildAdminPasswordReset(fullName, resetURL), ""))
}

// MerchantApplicationApproved emails the activation link for an approved
// Business application. Shows name/@handle/environment; carries an activation
// link → From noreply@, Reply-To contact@. Call in a goroutine.
func (s *Sender) MerchantApplicationApproved(to, businessName, handle, environment, activationURL string) {
	s.deliver(s.automated("application_approved", to,
		"A sua conta Banzami Business está pronta",
		buildMerchantApproved(businessName, handle, environment, activationURL), s.replyTo))
}

// MerchantApplicationRejected emails a rejection with an optional message. The
// merchant may reply → From contact@, Reply-To contact@.
func (s *Sender) MerchantApplicationRejected(to, businessName, message string) {
	s.deliver(s.institutional("application_rejected", to,
		"Atualização sobre a sua candidatura Banzami Business",
		buildMerchantRejected(businessName, message)))
}
