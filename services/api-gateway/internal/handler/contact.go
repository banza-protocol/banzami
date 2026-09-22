package handler

// Public contact form (PUBLIC-WEBSITE-CONTACT-001).
//
// A visitor leaves a message on the site; it is delivered by email to the team
// (contact@banzami.com by default), with Reply-To set to the visitor so the
// team can answer directly. No account, no auth — rate-limited per IP at the
// route, and an obvious bot (a filled honeypot) is answered with the same
// success while nothing is sent. It stores nothing and touches no money.

import (
	"encoding/json"
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	ce "github.com/banzami/banzami/services/common/email"
)

// ContactHandler delivers the public contact form by email.
type ContactHandler struct {
	mailer    *ce.Sender
	recipient string
}

func NewContactHandler(mailer *ce.Sender, recipient string) *ContactHandler {
	return &ContactHandler{mailer: mailer, recipient: recipient}
}

type contactBody struct {
	Name    string `json:"name"`
	Email   string `json:"email"`
	Subject string `json:"subject"`
	Message string `json:"message"`
	// Honeypot: a field no human sees or fills. A non-empty value is a bot; the
	// request is answered with the same success and nothing is sent.
	Website string `json:"website"`
}

// POST /v1/contact
func (h *ContactHandler) Submit(w http.ResponseWriter, r *http.Request) {
	if h.mailer == nil || !h.mailer.Enabled() {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "UNAVAILABLE", "contact is not available")
		return
	}
	var body contactBody
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 32<<10)).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "VALIDATION_ERROR", "invalid request body")
		return
	}

	// The bot answer: a 200 that sent nothing. Same shape as success.
	if strings.TrimSpace(body.Website) != "" {
		writeJSON(w, http.StatusOK, map[string]any{"status": "received"})
		return
	}

	name := strings.TrimSpace(body.Name)
	email := strings.TrimSpace(body.Email)
	subject := strings.TrimSpace(body.Subject)
	message := strings.TrimSpace(body.Message)

	if name == "" || utf8.RuneCountInString(name) > 120 {
		apierror.Respond(w, r, http.StatusBadRequest, "VALIDATION_ERROR", "name is required")
		return
	}
	if !looksLikeEmail(email) {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_EMAIL", "a valid email is required")
		return
	}
	if message == "" || utf8.RuneCountInString(message) > 5000 {
		apierror.Respond(w, r, http.StatusBadRequest, "VALIDATION_ERROR", "a message is required")
		return
	}
	if utf8.RuneCountInString(subject) > 160 {
		apierror.Respond(w, r, http.StatusBadRequest, "VALIDATION_ERROR", "subject is too long")
		return
	}
	if subject == "" {
		subject = "Contacto do site"
	}

	html, text := renderContactEmail(name, email, subject, message)
	// From noreply@, Reply-To the visitor: the team replies straight to them.
	msg := h.mailer.Automated("public_contact", h.recipient, "Novo contacto — "+subject, html, text, email)
	if err := h.mailer.DeliverErr(msg); err != nil {
		apierror.Respond(w, r, http.StatusBadGateway, "DELIVERY_FAILED", "could not send your message right now")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"status": "received"})
}

// renderContactEmail composes the internal notification in the shared Banzami
// email design system. The message body is escaped and its line breaks kept.
func renderContactEmail(name, email, subject, message string) (html, text string) {
	rows := []ce.InfoRow{
		{Label: "Nome", Value: name},
		{Label: "E-mail", Value: email, Mono: true},
		{Label: "Assunto", Value: subject},
	}
	// Preserve the visitor's line breaks in HTML.
	msgHTML := strings.ReplaceAll(ce.Esc(message), "\n", "<br>")
	body := ce.Title("Novo contacto do site") +
		ce.DetailRows(rows) +
		ce.Para(msgHTML)
	html = ce.RenderLayout(ce.LayoutOpts{
		Subtitle: "Contacto", BadgeKind: "app", SafetyKind: "normal",
		Preheader: "Novo contacto de " + name + " (" + email + ").", Body: body,
	})
	text = ce.TextDoc("Novo contacto do site",
		[]string{"Nome: " + name, "E-mail: " + email, "Assunto: " + subject, "", message},
		nil, "", "", ce.FooterSafety("normal"))
	return
}
