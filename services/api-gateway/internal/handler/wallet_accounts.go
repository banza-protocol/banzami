package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// WalletAccountHandler is the app-facing surface for a Business Account to create
// and read SEGREGATED accounts within a wallet it owns (ADR-042) — e.g. DOA opens
// one CAMPAIGN account per campaign to isolate funds. Banzami stays the source of
// truth for balances; the app never sees ledger account ids and never holds
// sub-balances. PRIMARY is created with the wallet and is not creatable here.
type WalletAccountHandler struct {
	accounts  service.WalletAccountService
	wallets   service.WalletService
	merchants merchantLookup
}

func NewWalletAccountHandler(a service.WalletAccountService, w service.WalletService, m merchantLookup) *WalletAccountHandler {
	return &WalletAccountHandler{accounts: a, wallets: w, merchants: m}
}

// authorizeOwnedWallet enforces: authenticated merchant, merchant is ACTIVE
// (KYB/compliance gate — suspended/closed cannot create accounts), and the wallet
// is owned by the caller. Returns the wallet on success, or writes the error.
func (h *WalletAccountHandler) authorizeOwnedWallet(w http.ResponseWriter, r *http.Request, walletID string) (*service.WalletRecord, bool) {
	principal, ok := middleware.GetPrincipal(r.Context())
	if !ok || principal.MerchantID == "" {
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "valid merchant credentials required")
		return nil, false
	}
	if walletID == "" {
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "wallet_id is required")
		return nil, false
	}
	wal, err := h.wallets.Get(r.Context(), walletID)
	if err != nil || wal == nil || wal.MerchantID != principal.MerchantID {
		apierror.Respond(w, r, http.StatusForbidden, "FORBIDDEN", "wallet is not owned by this merchant")
		return nil, false
	}
	// KYB/compliance gate: only an ACTIVE merchant may open accounts.
	if m, merr := h.merchants.Get(r.Context(), principal.MerchantID); merr != nil || m == nil || m.Status != service.MerchantStatusActive {
		apierror.Respond(w, r, http.StatusForbidden, "MERCHANT_NOT_ACTIVE", "merchant is not permitted to create wallet accounts")
		return nil, false
	}
	return wal, true
}

// POST /v1/business/wallet-accounts
func (h *WalletAccountHandler) Create(w http.ResponseWriter, r *http.Request) {
	var body struct {
		WalletID      string `json:"wallet_id"`
		Purpose       string `json:"purpose"`
		ReferenceType string `json:"reference_type"`
		ReferenceID   string `json:"reference_id"`
		Label         string `json:"label"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "request body must be valid JSON")
		return
	}
	wal, ok := h.authorizeOwnedWallet(w, r, body.WalletID)
	if !ok {
		return
	}
	purpose := strings.ToUpper(strings.TrimSpace(body.Purpose))
	if purpose == "" {
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "purpose is required")
		return
	}
	// PRIMARY is provisioned with the wallet; an app cannot create it.
	if purpose == "PRIMARY" {
		apierror.Respond(w, r, http.StatusUnprocessableEntity, "PRIMARY_NOT_CREATABLE", "the PRIMARY account is created with the wallet")
		return
	}

	acc, err := h.accounts.Create(r.Context(), service.CreateWalletAccountInput{
		WalletID:      wal.ID,
		MerchantID:    wal.MerchantID, // core re-checks ownership
		Purpose:       purpose,
		ReferenceType: strings.TrimSpace(body.ReferenceType),
		ReferenceID:   strings.TrimSpace(body.ReferenceID),
		Label:         strings.TrimSpace(body.Label),
	})
	if err != nil {
		slog.ErrorContext(r.Context(), "wallet_account.create.failed", "wallet_id", wal.ID, "purpose", purpose, "error", err)
		apierror.Respond(w, r, http.StatusBadGateway, "UPSTREAM_ERROR", "could not create wallet account")
		return
	}
	slog.InfoContext(r.Context(), "wallet_account.created", "wallet_account_id", acc.ID, "purpose", acc.Purpose)
	respond(w, http.StatusCreated, acc)
}

// GET /v1/business/wallet-accounts?wallet_id=...
func (h *WalletAccountHandler) List(w http.ResponseWriter, r *http.Request) {
	walletID := r.URL.Query().Get("wallet_id")
	wal, ok := h.authorizeOwnedWallet(w, r, walletID)
	if !ok {
		return
	}
	list, err := h.accounts.ListForWallet(r.Context(), wal.ID)
	if err != nil {
		apierror.Respond(w, r, http.StatusBadGateway, "UPSTREAM_ERROR", "could not list wallet accounts")
		return
	}
	respond(w, http.StatusOK, map[string]any{"data": list})
}

// GET /v1/business/wallet-accounts/{id}
func (h *WalletAccountHandler) Get(w http.ResponseWriter, r *http.Request) {
	principal, ok := middleware.GetPrincipal(r.Context())
	if !ok || principal.MerchantID == "" {
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "valid merchant credentials required")
		return
	}
	acc, err := h.accounts.Get(r.Context(), chi.URLParam(r, "id"))
	if err != nil || acc == nil {
		apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "wallet account not found")
		return
	}
	// Ownership: the account's parent wallet must belong to the caller.
	wal, werr := h.wallets.Get(r.Context(), acc.WalletID)
	if werr != nil || wal == nil || wal.MerchantID != principal.MerchantID {
		apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "wallet account not found")
		return
	}
	respond(w, http.StatusOK, acc)
}
