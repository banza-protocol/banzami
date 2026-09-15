package handler

// Public beta tester registration (APP-BETA-001).
//
// No account, no auth. It validates, drops an obvious bot, records the interest,
// and answers the same way whether the email was new or already known — so it is
// neither an enumeration oracle nor a source of duplicates. It sends no email:
// the site shows an in-page success, and beta traffic must never spend the
// authentication OTP quota (a spent quota locks real developers out — see the
// developer-api delivery guard).

import (
	"encoding/json"
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// BetaTesterHandler exposes the public registration endpoint.
type BetaTesterHandler struct {
	svc service.BetaTesterService
}

func NewBetaTesterHandler(svc service.BetaTesterService) *BetaTesterHandler {
	return &BetaTesterHandler{svc: svc}
}

type betaRegisterBody struct {
	FirstName   string   `json:"first_name"`
	LastName    string   `json:"last_name"`
	Email       string   `json:"email"`
	Platform    string   `json:"platform"` // IOS | ANDROID | BOTH
	Apps        []string `json:"apps"`     // APP_BANZAMI | APP_MERCHANT
	DeviceModel string   `json:"device_model"`
	OSVersion   string   `json:"os_version"`
	Country     string   `json:"country"`
	Source      string   `json:"source"`
	// Honeypot: a field no human sees or fills. A non-empty value is a bot, and
	// the request is answered with the same success so the bot learns nothing.
	Website string `json:"website"`
}

// looksLikeEmail is a deliberately small check: exactly one @, something either
// side, a dot in the domain, no spaces. The real proof an address exists is that
// its owner installs from the store link; the server only rejects the obviously
// malformed.
func looksLikeEmail(e string) bool {
	e = strings.TrimSpace(e)
	if len(e) < 5 || len(e) > 254 || strings.ContainsAny(e, " \t\r\n") {
		return false
	}
	at := strings.IndexByte(e, '@')
	if at <= 0 || at != strings.LastIndexByte(e, '@') || at == len(e)-1 {
		return false
	}
	return strings.Contains(e[at+1:], ".")
}

func boundedName(s string) (string, bool) {
	s = strings.TrimSpace(s)
	// Human names: any Unicode letter, mark, space, hyphen, apostrophe. Never
	// ASCII-only — Angolan and Portuguese names carry accents.
	if s == "" || utf8.RuneCountInString(s) > 80 {
		return "", false
	}
	return s, true
}

// POST /v1/beta/testers
func (h *BetaTesterHandler) Register(w http.ResponseWriter, r *http.Request) {
	if h.svc == nil {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "UNAVAILABLE", "beta registration is not available")
		return
	}
	var body betaRegisterBody
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "VALIDATION_ERROR", "invalid request body")
		return
	}

	// The bot answer: a 200 that recorded nothing. Same shape as success.
	if strings.TrimSpace(body.Website) != "" {
		writeJSON(w, http.StatusOK, map[string]any{"status": "received"})
		return
	}

	first, okF := boundedName(body.FirstName)
	last, okL := boundedName(body.LastName)
	if !okF || !okL {
		apierror.Respond(w, r, http.StatusBadRequest, "VALIDATION_ERROR", "first_name and last_name are required")
		return
	}
	if !looksLikeEmail(body.Email) {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_EMAIL", "a valid email is required")
		return
	}

	wantsIOS := body.Platform == "IOS" || body.Platform == "BOTH"
	wantsAndroid := body.Platform == "ANDROID" || body.Platform == "BOTH"
	if !wantsIOS && !wantsAndroid {
		apierror.Respond(w, r, http.StatusBadRequest, "VALIDATION_ERROR", "platform must be IOS, ANDROID or BOTH")
		return
	}
	var appBanzami, appMerchant bool
	for _, a := range body.Apps {
		switch a {
		case "APP_BANZAMI":
			appBanzami = true
		case "APP_MERCHANT":
			appMerchant = true
		}
	}
	if !appBanzami && !appMerchant {
		apierror.Respond(w, r, http.StatusBadRequest, "VALIDATION_ERROR", "choose at least one app")
		return
	}

	bounded := func(s string, n int) string {
		s = strings.TrimSpace(s)
		if utf8.RuneCountInString(s) > n {
			return string([]rune(s)[:n])
		}
		return s
	}
	err := h.svc.Register(r.Context(), service.BetaRegistration{
		FirstName: first, LastName: last, Email: body.Email,
		WantsIOS: wantsIOS, WantsAndroid: wantsAndroid,
		AppBanzami: appBanzami, AppMerchant: appMerchant,
		DeviceModel: bounded(body.DeviceModel, 120),
		OSVersion:   bounded(body.OSVersion, 60),
		Country:     bounded(body.Country, 80),
		Source:      bounded(body.Source, 40),
	})
	if err != nil {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "UNAVAILABLE", "could not record the registration; try again shortly")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"status": "received"})
}
