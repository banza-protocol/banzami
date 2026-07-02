package email

// Previews renders every email template with safe sample data (from the design
// handoff) for visual QA across clients. Used by cmd/email-preview. Sample
// tokens are obviously fake — no real secrets, links, or PII.
func Previews() map[string]string {
	approved, _ := RenderMerchantApproved(MerchantApprovedData{
		MerchantName: "Mercado Central, Lda.", Handle: "mercadocentral", Environment: "SANDBOX",
		ActivateURL: "https://business.banzami.com/activate?token=SAMPLE-NAO-VALIDO",
	})
	rejected, _ := RenderMerchantRejected(MerchantRejectedData{})
	invite, _ := RenderAdminInvite(AdminInviteData{
		Role: "SUPER_ADMIN", InvitedBy: "security@banzami.com",
		AcceptURL: "https://admin.banzami.com/invite/accept?token=SAMPLE-NAO-VALIDO",
	})
	reset, _ := RenderAdminPasswordReset(AdminResetData{
		ResetURL: "https://admin.banzami.com/reset?token=SAMPLE-NAO-VALIDO",
	})
	receipt, _ := RenderReceipt(ReceiptData{
		FromHandle: "joaomanuel", ToHandle: "mercadocentral", Reference: "BZM-7F3A-92K1",
		DateText: "27 jun 2026, 14:32", AmountText: "Kz 25.000,00", State: "Confirmado",
		ReceiptURL: "https://banzami.com/r/BZM-7F3A-92K1",
	})
	welcome, _ := RenderMerchantWelcome(MerchantWelcomeData{
		MerchantName: "Mercado Central, Lda.", MerchantID: "mch_8a7b6c5d4e3f", APIKey: "bz_live_SAMPLE_nao_valida_0000",
	})
	return map[string]string{
		"1-comerciante-aprovado":    approved,
		"2-comerciante-recusado":    rejected,
		"3-convite-banzadmin":       invite,
		"4-recuperar-palavra-passe": reset,
		"5-comprovativo":            receipt,
		"6-comerciante-welcome":     welcome,
	}
}
