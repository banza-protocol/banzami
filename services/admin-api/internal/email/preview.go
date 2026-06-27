package email

// Previews renders every template with safe sample data for visual QA across
// clients (Gmail, Apple Mail, Outlook, dark mode, mobile). Used by
// cmd/email-preview. Sample tokens/keys/codes here are obviously fake — no real
// secrets, links, or PII.
func Previews() map[string]string {
	const merchantLink = "https://banzami.com/comerciantes/activar?token=SAMPLE-NAO-VALIDO"
	const adminLink = "https://admin.banzami.com/reset-password?token=SAMPLE-NAO-VALIDO"
	const appLink = "https://banzami.com/ativar?token=SAMPLE-NAO-VALIDO"
	const confirmLink = "https://banzami.com/confirmar?token=SAMPLE-NAO-VALIDO"
	const secureLink = "https://banzami.com/seguranca"

	return map[string]string{
		"01-merchant-approved":  buildMerchantApproved("Mercearia Kianda", "kianda", "LIVE", merchantLink),
		"02-merchant-rejected":  buildMerchantRejected("Mercearia Kianda", "Precisamos de uma fotografia mais legível do documento do representante."),
		"03-additional-docs":    buildAdditionalDocs("Mercearia Kianda", []string{"Certidão comercial atualizada", "Comprovativo de morada do estabelecimento", "Documento de identificação do representante"}, merchantLink),
		"04-admin-invite":       buildAdminInvite("Ana Domingos", adminLink),
		"05-admin-reset":        buildAdminPasswordReset("Ana Domingos", adminLink),
		"06-account-activation": buildAccountActivation(appLink),
		"07-email-confirmation": buildEmailConfirmation(confirmLink),
		"08-otp":                buildOTP("482915", 10),
		"09-email-change":       buildEmailChange("novo@exemplo.ao", confirmLink),
		"10-pin-changed":        buildPinChanged(),
		"11-password-changed":   buildPasswordChanged(),
		"12-security-alert":     buildSecurityAlert("iPhone 15 · Safari", "Luanda, Angola", "27 jun 2026, 14:32", secureLink),
		"13-merchant-welcome":   buildMerchantWelcome("Mercearia Kianda", "mch_8a7b6c5d4e3f", "bz_live_SAMPLE_nao_valida_0000"),
		"14-notification":       buildNotification("Pagamentos", "Recebeu um pagamento.", "Recebeu 15.000 Kz de @kianda na sua conta Banzami.", "Ver no Banzami", secureLink),
	}
}
