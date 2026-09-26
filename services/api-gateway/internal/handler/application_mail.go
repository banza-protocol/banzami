package handler

// Merchant application confirmation receipt (MERCHANT-APPLICATION-RECEIPT-001).
//
// When a Business Sandbox application is genuinely created, the applicant gets a
// durable receipt by email carrying the SAME reference shown on screen and a link
// to the public status page — so nobody loses access to their application because
// they did not copy the code from the browser.
//
// The application is the authority; this email is a consequence. It is dispatched
// fire-and-forget: a provider outage never rolls back or fails the application,
// and it is only ever invoked on a real creation (never an idempotent replay), so
// a double-submit does not send a second receipt. It carries no PII beyond the
// business name and the applicant's own contact address (the recipient); never a
// NIF, representative, phone, document, PIN or internal note.

import (
	"context"
	"log/slog"
	"net/url"
	"strings"

	ce "github.com/banzami/banzami/services/common/email"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
	"github.com/banzami/banzami/services/common/obs"
)

// ApplicationMailNotifier sends the application-received receipt via the shared
// transactional mailer. Nil/disabled-safe.
type ApplicationMailNotifier struct {
	mailer  *ce.Sender
	siteURL string // marketing site origin, no trailing slash
	support string // canonical support/contact address
}

func NewApplicationMailNotifier(mailer *ce.Sender, siteURL, support string) *ApplicationMailNotifier {
	return &ApplicationMailNotifier{mailer: mailer, siteURL: strings.TrimRight(siteURL, "/"), support: support}
}

// statusURL is the public, PII-free status page prefilled with the reference.
func (n *ApplicationMailNotifier) statusURL(appID, locale string) string {
	path := "/comerciantes/candidatura/estado"
	if locale == "en" {
		path = "/en/comerciantes/candidatura/estado"
	}
	return n.siteURL + path + "?ref=" + url.QueryEscape(appID)
}

// ApplicationCreated dispatches the receipt. It never blocks the caller (the
// application already committed) and never returns an error to it: delivery is
// best-effort and its outcome is logged with the masked recipient.
func (n *ApplicationMailNotifier) ApplicationCreated(ctx context.Context, notice service.ApplicationCreatedNotice) {
	if n == nil || n.mailer == nil || !n.mailer.Enabled() {
		slog.InfoContext(ctx, "merchant.application.confirmation_skipped",
			"application_id", obs.MaskID(notice.ApplicationID), "reason", "mailer_disabled")
		return
	}
	subject, html, text := renderApplicationReceipt(notice, n.statusURL(notice.ApplicationID, notice.Locale), n.support)
	// From noreply@, Reply-To support so the applicant can answer.
	msg := n.mailer.Automated("merchant_application_received", notice.Email, subject, html, text, n.mailer.ReplyTo())
	appID := notice.ApplicationID
	go func() {
		defer func() {
			if r := recover(); r != nil {
				slog.Error("merchant.application.confirmation_panic", "application_id", obs.MaskID(appID))
			}
		}()
		if err := n.mailer.DeliverErr(msg); err != nil {
			// No provider error text or recipient to the log — the reason class only.
			slog.Error("merchant.application.confirmation_failed",
				"application_id", obs.MaskID(appID), "reason", ce.DeliveryReason(err))
			return
		}
		slog.Info("merchant.application.confirmation_sent", "application_id", obs.MaskID(appID))
	}()
}

// renderApplicationReceipt composes the receipt in the shared email design
// system, in the applicant's language (PT default, EN when locale=="en").
func renderApplicationReceipt(notice service.ApplicationCreatedNotice, statusURL, support string) (subject, html, text string) {
	en := notice.Locale == "en"
	name := ce.Esc(notice.BusinessName)
	if en {
		subject = "Banzami Business — application received"
		body := ce.Title("Application received") +
			ce.Para("We received the application for <strong>"+name+"</strong> to the Banzami Business Sandbox.") +
			ce.DetailRows([]ce.InfoRow{{Label: "Application reference", Value: notice.ApplicationID, Mono: true}}) +
			ce.Para("Keep this reference. You can use it to check the status of your application.") +
			ce.Button("Check application status", statusURL) +
			ce.Para("This application relates only to the Banzami Business Sandbox, which uses test money. Real-money operations are not yet available.") +
			ce.Para("If you do not recognise this application, contact "+support+".")
		html = ce.RenderLayout(ce.LayoutOpts{
			Subtitle: "Banzami Business", BadgeKind: "app", SafetyKind: "normal",
			Preheader: "We received your Banzami Business Sandbox application.", Body: body,
		})
		text = ce.TextDoc("Application received",
			[]string{
				"We received the application for " + notice.BusinessName + " to the Banzami Business Sandbox.",
				"Application reference: " + notice.ApplicationID,
				"Keep this reference. You can use it to check the status of your application:",
				statusURL,
				"This application relates only to the Banzami Business Sandbox, which uses test money. Real-money operations are not yet available.",
				"If you do not recognise this application, contact " + support + ".",
			},
			nil, "", "", ce.FooterSafety("normal"))
		return
	}
	subject = "Banzami Business — candidatura recebida"
	body := ce.Title("Candidatura recebida") +
		ce.Para("Recebemos a candidatura de <strong>"+name+"</strong> à Banzami Business Sandbox.") +
		ce.DetailRows([]ce.InfoRow{{Label: "Referência da candidatura", Value: notice.ApplicationID, Mono: true}}) +
		ce.Para("Guarde esta referência. Pode utilizá-la para consultar o estado da sua candidatura.") +
		ce.Button("Ver estado da candidatura", statusURL) +
		ce.Para("A candidatura refere-se exclusivamente à Banzami Business Sandbox, que utiliza dinheiro fictício. As operações com dinheiro real ainda não estão disponíveis.") +
		ce.Para("Se não reconhece esta candidatura, contacte "+support+".")
	html = ce.RenderLayout(ce.LayoutOpts{
		Subtitle: "Banzami Business", BadgeKind: "app", SafetyKind: "normal",
		Preheader: "Recebemos a sua candidatura Banzami Business Sandbox.", Body: body,
	})
	text = ce.TextDoc("Candidatura recebida",
		[]string{
			"Recebemos a candidatura de " + notice.BusinessName + " à Banzami Business Sandbox.",
			"Referência da candidatura: " + notice.ApplicationID,
			"Guarde esta referência. Pode utilizá-la para consultar o estado da sua candidatura:",
			statusURL,
			"A candidatura refere-se exclusivamente à Banzami Business Sandbox, que utiliza dinheiro fictício. As operações com dinheiro real ainda não estão disponíveis.",
			"Se não reconhece esta candidatura, contacte " + support + ".",
		},
		nil, "", "", ce.FooterSafety("normal"))
	return
}
