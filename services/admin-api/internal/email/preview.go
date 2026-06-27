package email

// Previews renders every template with safe sample data for visual QA across
// clients (Gmail, Apple Mail, Outlook, dark mode, mobile). It is used by
// cmd/email-preview. The sample tokens/keys here are obviously fake — no real
// secrets, links, or PII.
func Previews() map[string]string {
	const sampleLink = "https://banzami.com/comerciantes/activar?token=SAMPLE-TOKEN-NAO-VALIDO"
	const sampleAdminLink = "https://admin.banzami.com/reset-password?token=SAMPLE-TOKEN-NAO-VALIDO"
	return map[string]string{
		"merchant-approved": buildMerchantApproved(
			"Mercearia Kianda", "kianda", "LIVE", sampleLink),
		"merchant-rejected": buildMerchantRejected(
			"Mercearia Kianda",
			"Precisamos de uma fotografia mais legível do documento do representante. Reenvie a candidatura quando puder."),
		"admin-invite": buildAdminInvite(
			"Ana Domingos", sampleAdminLink),
		"admin-password-reset": buildAdminPasswordReset(
			"Ana Domingos", sampleAdminLink),
		"merchant-welcome": buildMerchantWelcome(
			"Mercearia Kianda", "mch_8a7b6c5d4e3f", "bz_live_SAMPLE_key_nao_valida_0000"),
	}
}
