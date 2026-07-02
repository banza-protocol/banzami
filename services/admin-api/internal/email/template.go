package email

import "strings"

// Typed data + Render<Name> per email. Each Render returns (htmlBody, textBody).
// Copy is verbatim from the design handoff (design_handoff_banzami_email). The
// HTML is composed from components + renderLayout; the text body is the
// plain-text alternative (no tokens/secrets beyond the action link).

// ── helpers ──────────────────────────────────────────────────────────────────

func atHandle(h string) string {
	h = strings.TrimSpace(h)
	if h == "" || strings.HasPrefix(h, "@") {
		return h
	}
	return "@" + h
}

func envLabel(env string) string {
	if envIsSandbox(env) {
		return "Sandbox"
	}
	return "Produção"
}

// envIsSandbox reports whether the (platform-status) environment is sandbox. Any
// unknown/empty value is treated as SANDBOX — an email never communicates
// production on a failed read.
func envIsSandbox(env string) bool {
	switch strings.ToUpper(strings.TrimSpace(env)) {
	case "LIVE", "PRODUCTION", "PROD":
		return false
	default:
		return true
	}
}

func roleLabel(role string) string {
	switch strings.ToUpper(strings.TrimSpace(role)) {
	case "SUPER_ADMIN":
		return "Administrador"
	case "OPERATIONS":
		return "Operações"
	case "COMPLIANCE":
		return "Conformidade"
	case "SUPPORT":
		return "Suporte"
	case "":
		return "Administrador"
	default:
		return role
	}
}

// textDoc assembles a simple plain-text alternative.
func textDoc(title string, paras []string, lines []infoRow, ctaLabel, url, safety string) string {
	var b strings.Builder
	b.WriteString("Banzami\n\n")
	b.WriteString(title + "\n\n")
	for _, p := range paras {
		b.WriteString(p + "\n\n")
	}
	for _, l := range lines {
		b.WriteString(l.Label + ": " + l.Value + "\n")
	}
	if len(lines) > 0 {
		b.WriteString("\n")
	}
	if ctaLabel != "" && url != "" {
		b.WriteString(ctaLabel + ": " + url + "\n\n")
	}
	if safety != "" {
		b.WriteString(safety + "\n")
	}
	b.WriteString("\n— Banzami · Pagamentos modernos para África\n" + contactEmail + " · " + siteURL + "\n")
	return b.String()
}

// ── 1. Comerciante Aprovado ──────────────────────────────────────────────────

type MerchantApprovedData struct {
	MerchantName string
	Handle       string
	Environment  string
	ActivateURL  string
}

func RenderMerchantApproved(d MerchantApprovedData) (html, text string) {
	sandbox := envIsSandbox(d.Environment)
	paras := []string{
		"Boas notícias — a sua conta de negócio Banzami foi aprovada. Já pode aceitar pagamentos em Kwanza por QR, link de pagamento ou @banza.",
		"Ative a sua conta para abrir o dashboard e começar a receber em segundos.",
	}
	const sandboxText = "Esta conta foi criada no ambiente de testes da plataforma."
	if sandbox {
		// The explanatory text appears in the plain-text alternative too.
		paras = append([]string{sandboxText}, paras...)
	}
	rows := []infoRow{
		{Label: "Comerciante", Value: d.MerchantName},
		{Label: "Identificador", Value: atHandle(d.Handle), Mono: true},
		{Label: "Ambiente", Value: envLabel(d.Environment)},
	}
	body := emTitle("A sua conta Business está pronta")
	if sandbox {
		body += emNotice("shield", "Ambiente SANDBOX — "+sandboxText)
	}
	body += emPara(paras[0])
	for _, p := range paras[1:] {
		body += emPara(p)
	}
	body += emDetailRows(rows) +
		emButton("Ativar conta", d.ActivateURL) +
		emURLFallback("Ou cole este link no seu navegador:", d.ActivateURL)
	html = renderLayout(layoutOpts{Subtitle: "Business", BadgeKind: "business", SafetyKind: "normal",
		Preheader: "A sua conta de negócio Banzami foi aprovada.", Body: body})
	text = textDoc("A sua conta Business está pronta", paras, rows, "Ativar conta", d.ActivateURL, footerSafety("normal"))
	return
}

// ── 2. Comerciante Recusado ──────────────────────────────────────────────────

type MerchantRejectedData struct {
	Reason  string // optional; defaults to the documents message
	Sandbox bool   // platform is in SANDBOX → show a discrete test-env notice
}

func RenderMerchantRejected(d MerchantRejectedData) (html, text string) {
	reason := strings.TrimSpace(d.Reason)
	if reason == "" {
		reason = "não conseguimos verificar os documentos do negócio submetidos."
	}
	paras := []string{
		"Obrigado por se candidatar ao Banzami Business. Depois de analisarmos a sua submissão, não conseguimos aprovar a sua conta neste momento.",
		"Isto não é definitivo. Assim que o ponto abaixo for resolvido, pode candidatar-se novamente — a nossa equipa está disponível para ajudar.",
	}
	body := emTitle("Sobre o seu pedido Banzami") +
		emPara(paras[0]) + emPara(paras[1]) +
		emNotice("doc", "Motivo — "+esc(reason))
	if d.Sandbox {
		body += emNotice("shield", "Ambiente SANDBOX — este pedido foi feito no ambiente de testes da plataforma.")
		paras = append(paras, "Este pedido foi feito no ambiente de testes da plataforma.")
	}
	body += emButton("Contactar o suporte", "mailto:"+contactEmail) +
		emURLFallback("Ou contacte-nos diretamente em:", contactEmail)
	html = renderLayout(layoutOpts{Subtitle: "Business", BadgeKind: "business", SafetyKind: "normal",
		Preheader: "Atualização sobre o seu pedido Banzami Business.", Body: body})
	text = textDoc("Sobre o seu pedido Banzami", append(paras, "Motivo — "+reason),
		nil, "Contactar o suporte", contactEmail, footerSafety("normal"))
	return
}

// ── 3. Convite BANZADMIN ─────────────────────────────────────────────────────

type AdminInviteData struct {
	Role      string
	InvitedBy string
	AcceptURL string
}

func RenderAdminInvite(d AdminInviteData) (html, text string) {
	invitedBy := strings.TrimSpace(d.InvitedBy)
	if invitedBy == "" {
		invitedBy = "security@banzami.com"
	}
	paras := []string{
		"Foi convidado para o BANZADMIN, a consola de operações do Banzami. Crie a sua palavra-passe para ativar a sua conta.",
		"Por segurança, este link é único e foi gerado apenas para este convite.",
	}
	rows := []infoRow{
		{Label: "Função", Value: roleLabel(d.Role)},
		{Label: "Convidado por", Value: invitedBy, Mono: true},
	}
	body := emTitle("Foi convidado para o BANZADMIN") +
		emPara(paras[0]) + emPara(paras[1]) +
		emDetailRows(rows) +
		emNotice("shield", "Este convite é válido durante 7 dias. Nunca partilhe este link com ninguém.") +
		emButton("Criar palavra-passe", d.AcceptURL) +
		emURLFallback("Ou cole este link no seu navegador:", d.AcceptURL)
	html = renderLayout(layoutOpts{Subtitle: "BANZADMIN", BadgeKind: "security", SafetyKind: "security",
		Preheader: "Foi convidado para o BANZADMIN.", Body: body})
	text = textDoc("Foi convidado para o BANZADMIN", paras, rows, "Criar palavra-passe", d.AcceptURL, footerSafety("security"))
	return
}

// ── 4. Recuperar Palavra-passe ───────────────────────────────────────────────

type AdminResetData struct {
	ResetURL string
}

func RenderAdminPasswordReset(d AdminResetData) (html, text string) {
	paras := []string{
		"Recebemos um pedido para recuperar a palavra-passe da sua conta BANZADMIN. Clique no botão abaixo para escolher uma nova.",
		"Se não fez este pedido, pode ignorar este email com segurança — a sua palavra-passe não será alterada.",
	}
	body := emTitle("Recupere a sua palavra-passe") +
		emPara(paras[0]) + emPara(paras[1]) +
		emNotice("clock", "Este link expira em 30 minutos.") +
		emButton("Recuperar palavra-passe", d.ResetURL) +
		emURLFallback("Ou cole este link no seu navegador:", d.ResetURL)
	html = renderLayout(layoutOpts{Subtitle: "BANZADMIN", BadgeKind: "security", SafetyKind: "security",
		Preheader: "Recupere a sua palavra-passe BANZADMIN.", Body: body})
	text = textDoc("Recupere a sua palavra-passe", paras, nil, "Recuperar palavra-passe", d.ResetURL, footerSafety("security"))
	return
}

// ── 6. Código de Verificação — Developers OTP ────────────────────────────────
// Sent when someone requests access to the developer portal (login → "Continuar").
// The 6-digit code is the whole action: no button, no fallback URL. The real
// code comes from the backend; the placeholder in the design is not used.

type DeveloperOTPData struct {
	Code string // 6-digit verification code from the backend
}

func RenderDeveloperOTP(d DeveloperOTPData) (html, text string) {
	intro := "Bem-vindo(a) de volta. Use o código abaixo para continuar o acesso à plataforma de developers Banzami — basta introduzi-lo no ecrã de verificação."
	notice := "Este código expira em 10 minutos. Se não pediu este código, ignore este email com segurança."
	body := emTitle("O seu código de verificação") +
		emPara(intro) +
		emOTPBoxes(d.Code) +
		emNotice("clock", notice)
	html = renderLayout(layoutOpts{Subtitle: "Developers", BadgeKind: "security", SafetyKind: "security",
		Preheader: "O seu código de verificação Banzami Developers.", Body: body})
	text = textDoc("O seu código de verificação",
		[]string{intro, notice},
		[]infoRow{{Label: "Código de verificação", Value: d.Code, Mono: true}},
		"", "", footerSafety("security"))
	return
}

// ── 5. Comprovativo de transferência (email) ─────────────────────────────────

type ReceiptData struct {
	FromHandle string
	ToHandle   string
	Reference  string
	DateText   string
	AmountText string // e.g. "Kz 25.000,00"
	State      string // e.g. "Confirmado"
	ReceiptURL string
}

func RenderReceipt(d ReceiptData) (html, text string) {
	state := d.State
	if state == "" {
		state = "Confirmado"
	}
	paras := []string{
		"O pagamento abaixo foi creditado na sua carteira Banzami. A liquidação é instantânea, de carteira para carteira, dentro da rede.",
		"Descarregue o comprovativo oficial em PDF para partilhar ou arquivar.",
	}
	rows := []infoRow{
		{Label: "De", Value: atHandle(d.FromHandle), Mono: true},
		{Label: "Para", Value: atHandle(d.ToHandle), Mono: true},
		{Label: "Referência", Value: d.Reference, Mono: true},
		{Label: "Data", Value: d.DateText},
		{Label: "Estado", Value: state},
	}
	body := emHeroAmount("Recebido de "+atHandle(d.FromHandle), d.AmountText) +
		emTitle("Recebeu um pagamento") +
		emPara(paras[0]) + emPara(paras[1]) +
		emDetailRows(rows) +
		emButton("Descarregar comprovativo", d.ReceiptURL) +
		emURLFallback("Ou veja o comprovativo em:", d.ReceiptURL)
	html = renderLayout(layoutOpts{Subtitle: "Carteira", BadgeKind: "receipt", SafetyKind: "receipt",
		Preheader: "Recebeu um pagamento na sua carteira Banzami.", Body: body})
	text = textDoc("Recebeu um pagamento — "+d.AmountText, paras, rows, "Descarregar comprovativo", d.ReceiptURL, footerSafety("receipt"))
	return
}

// ── Merchant Welcome (fluxo existente, fora dos 5 do dossier) ─────────────────
// Mantido para continuidade do fluxo de criação direta de comerciante; é o único
// email cuja função é entregar credenciais. Renderizado com o mesmo design system.

type MerchantWelcomeData struct {
	MerchantName string
	MerchantID   string
	APIKey       string
}

func RenderMerchantWelcome(d MerchantWelcomeData) (html, text string) {
	paras := []string{
		"A sua conta de comerciante Banzami foi criada. Use as credenciais abaixo para configurar a app Banzami Comerciante.",
	}
	rows := []infoRow{
		{Label: "Merchant ID", Value: d.MerchantID, Mono: true},
		{Label: "API Key", Value: d.APIKey, Mono: true},
	}
	body := emTitle("Bem-vindo à Banzami") +
		emPara(paras[0]) +
		emDetailRows(rows) +
		emNotice("shield", "Guarde a API Key em segurança. Não a partilhe. Se a perder, contacte o suporte para gerar uma nova.") +
		emButton("Abrir o Banzami", siteURL)
	html = renderLayout(layoutOpts{Subtitle: "Business", BadgeKind: "business", SafetyKind: "security",
		Preheader: "As suas credenciais Banzami Comerciante.", Body: body})
	// Plain-text intentionally omits the API key value (avoid duplicating the
	// secret in a second body); points the merchant to the HTML email.
	text = textDoc("Bem-vindo à Banzami", paras,
		[]infoRow{{Label: "Merchant ID", Value: d.MerchantID}},
		"Abrir o Banzami", siteURL, footerSafety("security"))
	return
}
