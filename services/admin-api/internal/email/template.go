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

// ── 2b. Pedido de informação ────────────────────────────────────────────────

// MerchantInformationRequestedData is what the reviewer asked, and where the
// applicant answers it (the application's status page, by reference).
type MerchantInformationRequestedData struct {
	Request   string
	StatusURL string
	Sandbox   bool
}

// RenderMerchantInformationRequested — the review is waiting for the
// applicant. Not a rejection: the application keeps its @ and its documents.
func RenderMerchantInformationRequested(d MerchantInformationRequestedData) (html, text string) {
	paras := []string{
		"Estamos a analisar a sua candidatura ao Banzami Business e precisamos de um elemento antes de decidir.",
		"A sua candidatura continua aberta e o @negócio pedido continua reservado. Responda no link abaixo — pode enviar documentos e reenviar para análise.",
	}
	body := emTitle("Precisamos de mais informação") +
		emPara(paras[0]) + emPara(paras[1]) +
		emNotice("doc", "Pedido — "+esc(strings.TrimSpace(d.Request)))
	if d.Sandbox {
		body += emNotice("shield", "Ambiente SANDBOX — esta candidatura foi feita no ambiente de testes da plataforma.")
		paras = append(paras, "Esta candidatura foi feita no ambiente de testes da plataforma.")
	}
	body += emButton("Responder ao pedido", d.StatusURL) +
		emURLFallback("Ou abra este endereço:", d.StatusURL)
	html = renderLayout(layoutOpts{Subtitle: "Business", BadgeKind: "business", SafetyKind: "normal",
		Preheader: "A análise da sua candidatura Banzami Business precisa de um elemento.", Body: body})
	text = textDoc("Precisamos de mais informação", append(paras, "Pedido — "+strings.TrimSpace(d.Request)),
		nil, "Responder ao pedido", d.StatusURL, footerSafety("normal"))
	return
}

// MerchantAppPinResetData — an operator reset the Business's app PIN.
type MerchantAppPinResetData struct {
	Handle   string
	ResetURL string
	Sandbox  bool
}

// RenderMerchantAppPinReset — a new PIN for the Banzami Business app. The
// current PIN keeps working until the link is used; using it signs out every
// device signed in with the old one.
func RenderMerchantAppPinReset(d MerchantAppPinResetData) (html, text string) {
	paras := []string{
		"A equipa Banzami preparou um novo PIN para a app Banzami Business de @" + strings.TrimPrefix(d.Handle, "@") + ".",
		"Abra o link abaixo e escolha o novo PIN. Até lá, o PIN atual continua a funcionar; depois, todos os dispositivos terão de entrar com o novo PIN.",
		"Se não pediu esta alteração, ignore este email e contacte a equipa Banzami.",
	}
	body := emTitle("Novo PIN da app Business") + emPara(esc(paras[0])) + emPara(paras[1]) + emPara(paras[2])
	if d.Sandbox {
		body += emNotice("shield", "Ambiente SANDBOX — esta conta pertence ao ambiente de testes da plataforma.")
		paras = append(paras, "Esta conta pertence ao ambiente de testes da plataforma.")
	}
	body += emButton("Escolher novo PIN", d.ResetURL) + emURLFallback("Ou abra este endereço:", d.ResetURL)
	html = renderLayout(layoutOpts{Subtitle: "Business", BadgeKind: "business", SafetyKind: "security",
		Preheader: "Escolha o novo PIN da app Banzami Business.", Body: body})
	text = textDoc("Novo PIN da app Business", paras, nil, "Escolher novo PIN", d.ResetURL, footerSafety("security"))
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

// ── 5. Comprovativo de transferência (email) ─────────────────────────────────

// ── Merchant Welcome (fluxo existente, fora dos 5 do dossier) ─────────────────
// Mantido para continuidade do fluxo de criação direta de comerciante; é o único
// email cuja função é entregar credenciais. Renderizado com o mesmo design system.

// ── Beta tester adicionado aos testes (APP-BETA-001) ─────────────────────────

// BetaTesterAddedData is the notification a prospective tester receives when the
// operator records that they were added to the mobile beta (INVITED). It carries
// no link and no secret: the actual install invite arrives separately from Apple
// (TestFlight) or Google (Play testing), to the same address.
type BetaTesterAddedData struct {
	FirstName    string
	AppBanzami   bool
	AppMerchant  bool
	WantsIOS     bool
	WantsAndroid bool
}

func betaAppsLabel(banzami, merchant bool) string {
	var parts []string
	if banzami {
		parts = append(parts, "App Banzami")
	}
	if merchant {
		parts = append(parts, "App Banzami Business")
	}
	if len(parts) == 0 {
		return "app Banzami"
	}
	return strings.Join(parts, " e ")
}

func betaPlatformLabel(ios, android bool) string {
	switch {
	case ios && android:
		return "iOS e Android"
	case ios:
		return "iOS"
	case android:
		return "Android"
	default:
		return "—"
	}
}

// betaInstallLine explains how the install invite arrives, per the chosen
// platform(s). The operator sends the actual invites by hand in the Apple /
// Google consoles; this only tells the tester what to expect.
func betaInstallLine(ios, android bool) string {
	switch {
	case ios && android:
		return "Vai receber, neste mesmo endereço, o convite do TestFlight (para iPhone) e/ou do Google Play (para Android) para instalar. No iPhone, instale primeiro a app TestFlight a partir da App Store; no Android, basta abrir o link do convite no telemóvel."
	case ios:
		return "Vai receber, neste mesmo endereço, um convite do TestFlight para instalar. Instale primeiro a app TestFlight a partir da App Store e depois abra o convite."
	case android:
		return "Vai receber, neste mesmo endereço, um convite do Google Play para entrar no teste. Abra o link do convite no seu telemóvel Android e siga para instalar."
	default:
		return "Vai receber, neste mesmo endereço, o convite para instalar a app."
	}
}

func RenderBetaTesterAdded(d BetaTesterAddedData) (html, text string) {
	apps := betaAppsLabel(d.AppBanzami, d.AppMerchant)
	greeting := "Boas notícias"
	if fn := strings.TrimSpace(d.FirstName); fn != "" {
		greeting = "Olá " + fn + ", boas notícias"
	}
	paras := []string{
		greeting + " — foi adicionado ao programa de testes da " + apps + ". Obrigado por ajudar a construir a forma mais simples de mover Kwanza.",
		betaInstallLine(d.WantsIOS, d.WantsAndroid),
	}
	rows := []infoRow{
		{Label: "Apps", Value: betaAppsLabel(d.AppBanzami, d.AppMerchant)},
		{Label: "Plataforma", Value: betaPlatformLabel(d.WantsIOS, d.WantsAndroid)},
	}
	body := emTitle("Está nos testes da Banzami") +
		emPara(paras[0]) + emPara(paras[1]) +
		emDetailRows(rows) +
		emNotice("clock", "O convite pode demorar alguns minutos a chegar. Se não o vir, verifique também a pasta de spam.")
	html = renderLayout(layoutOpts{Subtitle: "Beta", BadgeKind: "app", SafetyKind: "normal",
		Preheader: "Foi adicionado aos testes da app Banzami.", Body: body})
	text = textDoc("Está nos testes da Banzami", paras, rows, "", "", footerSafety("normal"))
	return
}
