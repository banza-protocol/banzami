package email

// Banzami email templates. Each build* function composes design-system
// components into a full HTML document via renderLayout. They are pure (no I/O),
// so they are reused by both the Sender methods and the preview generator
// (cmd/email-preview). Adding a new email = a new build* function here.

// buildMerchantApproved — "A sua conta Banzami Business está pronta".
// Shows merchant name, @handle and environment. Carries ONLY the activation
// link — never a PIN, token value or API key.
func buildMerchantApproved(businessName, handle, environment, activationURL string) string {
	env := environment
	if env == "" {
		env = "LIVE"
	}
	handleDisp := handle
	if handleDisp != "" && handleDisp[0] != '@' {
		handleDisp = "@" + handleDisp
	}
	body := emHeading("A sua conta Banzami Business está pronta") +
		emP("Olá <strong style=\"color:"+cInk+";\">"+esc(businessName)+"</strong>, a sua candidatura foi aprovada. "+
			"Ative a sua conta e defina o seu PIN para começar a receber pagamentos.") +
		emInfoTable([]infoRow{
			{"Negócio", businessName},
			{"Banzami handle", handleDisp},
			{"Ambiente", env},
		}) +
		emButton("Ativar conta", activationURL) +
		emLinkFallback(activationURL) +
		emNotice("Por segurança, define o seu PIN durante a ativação. Este link é pessoal e de utilização única.")
	return renderLayout(layoutOpts{
		Subtitle:  "Business",
		Preheader: "A sua conta Banzami Business foi aprovada — ative-a agora.",
		Body:      body,
	})
}

// buildMerchantRejected — "Atualização sobre a sua candidatura".
func buildMerchantRejected(businessName, message string) string {
	body := emHeading("Atualização sobre a sua candidatura") +
		emP("Olá <strong style=\"color:"+cInk+";\">"+esc(businessName)+"</strong>, após análise não foi possível "+
			"aprovar a sua candidatura Banzami Business neste momento.")
	if message != "" {
		body += emQuote(esc(message))
	}
	body += emP("Pode responder a este email ou contactar a nossa equipa para mais informações — teremos todo o gosto em ajudar.") +
		emButtonOutline("Contactar suporte", "mailto:"+contactEmail)
	return renderLayout(layoutOpts{
		Subtitle:  "Business",
		Preheader: "Atualização sobre a sua candidatura Banzami Business.",
		Body:      body,
	})
}

// buildAdminInvite — "Foi convidado para o BANZADMIN".
func buildAdminInvite(fullName, inviteURL string) string {
	body := emHeading("Foi convidado para o BANZADMIN") +
		emP("Olá <strong style=\"color:"+cInk+";\">"+esc(fullName)+"</strong>, foi convidado para aceder ao "+
			"<strong>BANZADMIN</strong>. Crie a sua palavra-passe para ativar a sua conta.") +
		emButton("Criar palavra-passe", inviteURL) +
		emLinkFallback(inviteURL) +
		emNotice("Este convite é de uso único e expira em <strong>72 horas</strong>.")
	return renderLayout(layoutOpts{
		Subtitle:  "Security",
		Preheader: "Foi convidado para aceder ao BANZADMIN.",
		Body:      body,
		Security:  true,
	})
}

// buildAdminPasswordReset — "Redefinir a sua palavra-passe".
func buildAdminPasswordReset(fullName, resetURL string) string {
	body := emHeading("Redefinir a sua palavra-passe") +
		emP("Olá <strong style=\"color:"+cInk+";\">"+esc(fullName)+"</strong>, recebemos um pedido para redefinir a "+
			"palavra-passe da sua conta <strong>BANZADMIN</strong>. Use o botão abaixo para definir uma nova.") +
		emButton("Redefinir palavra-passe", resetURL) +
		emLinkFallback(resetURL) +
		emNotice("Este link é de uso único e <strong>expira em breve</strong> (24 horas).")
	return renderLayout(layoutOpts{
		Subtitle:  "Security",
		Preheader: "Redefina a sua palavra-passe BANZADMIN.",
		Body:      body,
		Security:  true,
	})
}

// buildMerchantWelcome — credentials email for a newly created merchant. This is
// the one email that intentionally carries the API key (its purpose).
func buildMerchantWelcome(merchantName, merchantID, apiKey string) string {
	body := emHeading("Bem-vindo à Banzami") +
		emP("Olá <strong style=\"color:"+cInk+";\">"+esc(merchantName)+"</strong>, a sua conta de comerciante foi "+
			"criada com sucesso. Abaixo encontra as credenciais para configurar a app <strong>Banzami Comerciante</strong>.") +
		emCredRow("Merchant ID", merchantID) +
		emCredRow("API Key", apiKey) +
		emNotice("⚠️ <strong>Guarde a API Key em segurança.</strong> Não a partilhe com ninguém. Se a perder, contacte o suporte para gerar uma nova.") +
		emP("Para começar a receber pagamentos, descarregue a app <strong>Banzami Comerciante</strong> e introduza as credenciais acima quando solicitado.")
	return renderLayout(layoutOpts{
		Subtitle:  "Merchant Portal",
		Preheader: "As suas credenciais Banzami Comerciante.",
		Body:      body,
		Security:  true,
	})
}
