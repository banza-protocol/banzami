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
	return map[string]string{
		"1-comerciante-aprovado":    approved,
		"2-comerciante-recusado":    rejected,
		"3-convite-banzadmin":       invite,
		"4-recuperar-palavra-passe": reset,
	}
}
