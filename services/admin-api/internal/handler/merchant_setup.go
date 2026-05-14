package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/admin-api/internal/email"
	"github.com/banzami/banzami/services/admin-api/internal/service"
)

type MerchantSetupHandler struct {
	core  *service.CoreAdminClient
	email *email.Sender
}

func NewMerchantSetupHandler(core *service.CoreAdminClient, email *email.Sender) *MerchantSetupHandler {
	return &MerchantSetupHandler{core: core, email: email}
}

// POST /admin/v1/merchants
func (h *MerchantSetupHandler) Create(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name     string `json:"name"`
		Email    string `json:"email"`
		Currency string `json:"currency"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_BODY", "request body must be valid JSON")
		return
	}
	if body.Name == "" || body.Email == "" {
		writeError(w, http.StatusBadRequest, "MISSING_FIELD", "name and email are required")
		return
	}
	currency := body.Currency
	if currency == "" {
		currency = "AOA"
	}

	merchant, err := h.core.CreateMerchant(r.Context(), body.Name, body.Email)
	if err != nil {
		handleCoreErr(w, err)
		return
	}

	merchantID, _ := merchant["id"].(string)

	apiKey, err := h.core.CreateApiKey(r.Context(), merchantID, "default")
	if err != nil {
		handleCoreErr(w, err)
		return
	}

	wallet, err := h.core.CreateWallet(r.Context(), merchantID, currency)
	if err != nil {
		// Wallet may already exist — try to fetch it.
		wallet, err = h.core.GetWallet(r.Context(), merchantID, currency)
		if err != nil {
			handleCoreErr(w, err)
			return
		}
	}

	// Send welcome email with credentials in the background so it never
	// delays or blocks the HTTP response.
	go func() {
		rawKey, _ := apiKey["secret"].(string)
		h.email.MerchantWelcome(body.Email, body.Name, merchantID, rawKey)
	}()

	writeJSON(w, http.StatusCreated, map[string]any{
		"merchant": merchant,
		"api_key":  apiKey,
		"wallet":   wallet,
	})
}

// POST /admin/v1/merchants/{id}/resend-credentials
// Generates a fresh API key and emails it to the merchant.
// The new key is also returned in the response (shown once, like on creation).
func (h *MerchantSetupHandler) ResendCredentials(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	merchant, err := h.core.GetMerchant(r.Context(), id)
	if err != nil {
		handleCoreErr(w, err)
		return
	}

	apiKey, err := h.core.CreateApiKey(r.Context(), id, "resent")
	if err != nil {
		handleCoreErr(w, err)
		return
	}

	currency := "AOA"
	wallet, err := h.core.GetWallet(r.Context(), id, currency)
	if err != nil {
		wallet = map[string]any{}
	}

	name, _   := merchant["name"].(string)
	email, _  := merchant["email"].(string)
	rawKey, _ := apiKey["secret"].(string)

	go func() {
		h.email.MerchantWelcome(email, name, id, rawKey)
	}()

	writeJSON(w, http.StatusOK, map[string]any{
		"merchant": merchant,
		"api_key":  apiKey,
		"wallet":   wallet,
	})
}

// POST /admin/v1/merchants/{id}/api-keys
func (h *MerchantSetupHandler) CreateApiKey(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var body struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Name == "" {
		body.Name = "admin-generated"
	}

	result, err := h.core.CreateApiKey(r.Context(), id, body.Name)
	if err != nil {
		handleCoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, result)
}

// POST /admin/v1/merchants/{id}/wallets
func (h *MerchantSetupHandler) CreateWallet(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var body struct {
		Currency string `json:"currency"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Currency == "" {
		body.Currency = "AOA"
	}

	result, err := h.core.CreateWallet(r.Context(), id, body.Currency)
	if err != nil {
		handleCoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, result)
}
