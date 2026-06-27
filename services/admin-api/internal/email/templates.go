package email

import (
	"strconv"
	"strings"
)

// Banzami email templates. Each build* composes design-system components into a
// full document via renderLayout — no duplicated HTML. They are pure (no I/O),
// reused by the Sender methods and the preview generator (cmd/email-preview).
// Copy is Portuguese, direct and minimal (fintech voice). Adding a new email =
// a new build* here.

// envLabel maps a raw environment to Portuguese display copy.
func envLabel(env string) string {
	switch strings.ToUpper(strings.TrimSpace(env)) {
	case "", "LIVE", "PRODUCTION", "PROD":
		return "Produção"
	default:
		return "Sandbox"
	}
}

// atHandle ensures a leading "@".
func atHandle(h string) string {
	h = strings.TrimSpace(h)
	if h == "" || h[0] == '@' {
		return h
	}
	return "@" + h
}

// ── Negócios ─────────────────────────────────────────────────────────────────

// buildMerchantApproved — candidatura aprovada (com link de ativação).
func buildMerchantApproved(businessName, handle, environment, activationURL string) string {
	body := emTitle("A sua conta está pronta.") +
		emLead("A sua candidatura foi aprovada. A sua conta Banzami Business pode agora ser ativada.") +
		emInfo([]infoRow{
			{"Negócio", businessName},
			{"Handle", atHandle(handle)},
			{"Ambiente", envLabel(environment)},
		}) +
		emButton("Ativar conta", activationURL) +
		emLinkFallback(activationURL) +
		emAlert("Define o seu PIN durante a ativação. Este link é pessoal e de utilização única.")
	return renderLayout(layoutOpts{Label: "Negócios", Preheader: "A sua conta Banzami Business está pronta para ativação.", Body: body})
}

// buildMerchantRejected — candidatura não aprovada.
func buildMerchantRejected(businessName, message string) string {
	body := emTitle("Precisamos de rever a sua candidatura.")
	if businessName != "" {
		body += emLead("Após análise, não foi possível aprovar a candidatura de <strong style=\"color:" + cText + ";\">" + esc(businessName) + "</strong> neste momento.")
	} else {
		body += emLead("Após análise, não foi possível aprovar a sua candidatura Banzami Business neste momento.")
	}
	if message != "" {
		body += emPara(esc(message))
	}
	body += emNote("A nossa equipa terá todo o gosto em ajudar a esclarecer os próximos passos.") +
		emButton("Falar com o suporte", "mailto:"+contactEmail)
	return renderLayout(layoutOpts{Label: "Negócios", Preheader: "Atualização sobre a sua candidatura Banzami Business.", Body: body})
}

// buildAdditionalDocs — pedido de documentos adicionais (KYB).
func buildAdditionalDocs(businessName string, docs []string, uploadURL string) string {
	body := emTitle("Precisamos de mais alguns documentos.") +
		emLead("Para concluir a verificação da sua conta Banzami Business, precisamos do seguinte.") +
		emList(docs) +
		emButton("Enviar documentos", uploadURL) +
		emLinkFallback(uploadURL) +
		emNote("Assim que recebermos os documentos, retomamos a análise da sua candidatura.")
	return renderLayout(layoutOpts{Label: "Conformidade", Preheader: "Documentos em falta para a sua conta Banzami Business.", Body: body})
}

// ── Administração ────────────────────────────────────────────────────────────

// buildAdminInvite — convite BANZADMIN.
func buildAdminInvite(fullName, inviteURL string) string {
	body := emTitle("Foi convidado para o BANZADMIN.") +
		emLead("Crie a sua palavra-passe para ativar o seu acesso à administração da Banzami.") +
		emButton("Criar palavra-passe", inviteURL) +
		emLinkFallback(inviteURL) +
		emAlert("Este convite é de uso único e expira em 72 horas. Se não esperava este convite, ignore este email.")
	return renderLayout(layoutOpts{Label: "Administração", Preheader: "Convite para aceder ao BANZADMIN.", Body: body})
}

// ── Segurança ────────────────────────────────────────────────────────────────

// buildAdminPasswordReset — reset de palavra-passe BANZADMIN.
func buildAdminPasswordReset(fullName, resetURL string) string {
	body := emTitle("Redefinir a palavra-passe.") +
		emLead("Recebemos um pedido para redefinir a palavra-passe da sua conta BANZADMIN.") +
		emButton("Redefinir palavra-passe", resetURL) +
		emLinkFallback(resetURL) +
		emAlert("Este link é de uso único e expira em breve. Se não fez este pedido, contacte-nos imediatamente.")
	return renderLayout(layoutOpts{Label: "Segurança", Preheader: "Redefina a sua palavra-passe BANZADMIN.", Body: body})
}

// buildAccountActivation — ativação de conta (consumidor).
func buildAccountActivation(activationURL string) string {
	body := emTitle("Ative a sua conta.") +
		emLead("Falta apenas um passo para começar a usar o Banzami.") +
		emButton("Ativar conta", activationURL) +
		emLinkFallback(activationURL) +
		emAlert("Este link expira em 24 horas. Se não criou uma conta Banzami, ignore este email.")
	return renderLayout(layoutOpts{Label: "Segurança", Preheader: "Ative a sua conta Banzami.", Body: body})
}

// buildEmailConfirmation — confirmação de email.
func buildEmailConfirmation(confirmURL string) string {
	body := emTitle("Confirme o seu email.") +
		emLead("Confirme este endereço para proteger a sua conta Banzami.") +
		emButton("Confirmar email", confirmURL) +
		emLinkFallback(confirmURL) +
		emNote("Se não criou uma conta Banzami, ignore este email.")
	return renderLayout(layoutOpts{Label: "Segurança", Preheader: "Confirme o seu endereço de email.", Body: body})
}

// buildOTP — código de uso único.
func buildOTP(code string, minutes int) string {
	body := emTitle("O seu código de acesso.") +
		emLead("Use o código abaixo para concluir a autenticação.") +
		emCode(code) +
		emAlert("O código expira em " + strconv.Itoa(minutes) + " minutos. Nunca partilhe este código — a Banzami nunca o pede.")
	return renderLayout(layoutOpts{Label: "Segurança", Preheader: "O seu código de acesso Banzami.", Body: body})
}

// buildEmailChange — confirmação de alteração de email.
func buildEmailChange(newEmail, confirmURL string) string {
	body := emTitle("Confirme o seu novo email.") +
		emLead("Recebemos um pedido para alterar o email da sua conta Banzami.") +
		emInfo([]infoRow{{"Novo email", newEmail}}) +
		emButton("Confirmar alteração", confirmURL) +
		emLinkFallback(confirmURL) +
		emAlert("Se não pediu esta alteração, contacte-nos imediatamente.")
	return renderLayout(layoutOpts{Label: "Segurança", Preheader: "Confirme a alteração do seu email.", Body: body})
}

// buildPinChanged — notificação de alteração de PIN.
func buildPinChanged() string {
	body := emTitle("O seu PIN foi alterado.") +
		emLead("O PIN da sua conta Banzami foi alterado com sucesso.") +
		emAlert("Se não foi você, proteja a sua conta imediatamente.") +
		emButton("Não fui eu", "mailto:"+contactEmail)
	return renderLayout(layoutOpts{Label: "Segurança", Preheader: "O seu PIN Banzami foi alterado.", Body: body})
}

// buildPasswordChanged — notificação de alteração de palavra-passe.
func buildPasswordChanged() string {
	body := emTitle("A sua palavra-passe foi alterada.") +
		emLead("A palavra-passe da sua conta Banzami foi alterada com sucesso.") +
		emAlert("Se não foi você, proteja a sua conta imediatamente.") +
		emButton("Não fui eu", "mailto:"+contactEmail)
	return renderLayout(layoutOpts{Label: "Segurança", Preheader: "A sua palavra-passe Banzami foi alterada.", Body: body})
}

// buildSecurityAlert — novo início de sessão / dispositivo.
func buildSecurityAlert(device, location, when, secureURL string) string {
	body := emTitle("Nova atividade na sua conta.") +
		emLead("Detetámos um novo início de sessão na sua conta Banzami.") +
		emInfo([]infoRow{
			{"Dispositivo", device},
			{"Localização", location},
			{"Data", when},
		}) +
		emButton("Proteger a minha conta", secureURL) +
		emAlert("Se foi você, pode ignorar este email. Caso contrário, proteja a sua conta imediatamente.")
	return renderLayout(layoutOpts{Label: "Segurança", Preheader: "Novo início de sessão na sua conta Banzami.", Body: body})
}

// ── Pagamentos ───────────────────────────────────────────────────────────────

// buildMerchantWelcome — credenciais de um novo comerciante (mostra a API Key).
func buildMerchantWelcome(merchantName, merchantID, apiKey string) string {
	body := emTitle("Bem-vindo à Banzami.") +
		emLead("A sua conta de comerciante está pronta. Use as credenciais abaixo para configurar a app Banzami Comerciante.") +
		emCredRow("Merchant ID", merchantID) +
		emCredRow("API Key", apiKey) +
		emAlert("Guarde a API Key em segurança. Não a partilhe. Se a perder, contacte o suporte para gerar uma nova.") +
		emButton("Abrir o Banzami", siteURL)
	return renderLayout(layoutOpts{Label: "Pagamentos", Preheader: "As suas credenciais Banzami Comerciante.", Body: body})
}

// buildNotification — notificação institucional genérica.
func buildNotification(label, title, message, ctaLabel, ctaURL string) string {
	body := emTitle(title) + emLead(esc(message))
	if ctaLabel != "" && ctaURL != "" {
		body += emButton(ctaLabel, ctaURL)
	}
	if label == "" {
		label = "Banzami"
	}
	return renderLayout(layoutOpts{Label: label, Preheader: title, Body: body})
}
