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
// resolveWalletAuthority returns the wallet the caller may operate within.
//
// For a DEVELOPER key the wallet comes from the project binding and nowhere
// else: a client-supplied wallet_id would be a client naming its own owner, so
// it is refused exactly as it is on the payment routes. For a merchant JWT the
// existing behaviour is unchanged — it names its wallet and ownership is
// checked.
//
// Returns (walletID, merchantID, ok). The response is already written when ok
// is false.
func (h *WalletAccountHandler) resolveWalletAuthority(w http.ResponseWriter, r *http.Request, scope, suppliedWalletID string) (string, string, bool) {
	if dp, isDev := middleware.GetDeveloperPrincipal(r.Context()); isDev {
		if !dp.HasScope(scope) {
			apierror.Respond(w, r, http.StatusForbidden, "INSUFFICIENT_SCOPE", "missing required scope: "+scope)
			return "", "", false
		}
		if !dp.Bound || dp.MerchantID == "" || dp.WalletID == "" {
			apierror.Respond(w, r, http.StatusForbidden, "PAYMENTS_UNAVAILABLE",
				"this project is not provisioned to hold funds")
			return "", "", false
		}
		if strings.TrimSpace(suppliedWalletID) != "" {
			apierror.Respond(w, r, http.StatusBadRequest, "PAYEE_NOT_ALLOWED",
				"the wallet is derived from your project binding; remove wallet_id")
			return "", "", false
		}
		return dp.WalletID, dp.MerchantID, true
	}
	wal, ok := h.authorizeOwnedWallet(w, r, suppliedWalletID)
	if !ok {
		return "", "", false
	}
	return wal.ID, wal.MerchantID, true
}

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

// POST /v1/wallet-accounts
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
	walletID, merchantID, ok := h.resolveWalletAuthority(w, r, "wallet_accounts:create", body.WalletID)
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
		WalletID:      walletID,
		MerchantID:    merchantID, // core re-checks ownership
		Purpose:       purpose,
		ReferenceType: strings.TrimSpace(body.ReferenceType),
		ReferenceID:   strings.TrimSpace(body.ReferenceID),
		Label:         strings.TrimSpace(body.Label),
	})
	if err != nil {
		slog.ErrorContext(r.Context(), "wallet_account.create.failed", "wallet_id", walletID, "purpose", purpose, "error", err)
		apierror.Respond(w, r, http.StatusBadGateway, "UPSTREAM_ERROR", "could not create wallet account")
		return
	}
	slog.InfoContext(r.Context(), "wallet_account.created", "wallet_account_id", acc.ID, "purpose", acc.Purpose)
	respond(w, http.StatusCreated, acc)
}

// GET /v1/wallet-accounts?wallet_id=...
func (h *WalletAccountHandler) List(w http.ResponseWriter, r *http.Request) {
	walletID, _, ok := h.resolveWalletAuthority(w, r, "wallet_accounts:read", r.URL.Query().Get("wallet_id"))
	if !ok {
		return
	}
	list, err := h.accounts.ListForWallet(r.Context(), walletID)
	if err != nil {
		apierror.Respond(w, r, http.StatusBadGateway, "UPSTREAM_ERROR", "could not list wallet accounts")
		return
	}
	respond(w, http.StatusOK, map[string]any{"data": list})
}

// GET /v1/wallet-accounts/{id}
//
// A read names no wallet: the account it names says which wallet it belongs to,
// and that wallet says whose it is. Asking a merchant JWT for a wallet_id it
// has nowhere to put answered 400 to every such read.
func (h *WalletAccountHandler) Get(w http.ResponseWriter, r *http.Request) {
	notFound := func() {
		// Ownership: a foreign account is NOT_FOUND, never FORBIDDEN — a status
		// that distinguishes "yours" from "someone else's" is an enumeration
		// oracle.
		apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "wallet account not found")
	}

	var ownWallet string  // a developer key operates inside its bound wallet
	var merchantID string // a merchant JWT operates inside its own wallets
	if dp, isDev := middleware.GetDeveloperPrincipal(r.Context()); isDev {
		if !dp.HasScope("wallet_accounts:read") {
			apierror.Respond(w, r, http.StatusForbidden, "INSUFFICIENT_SCOPE", "missing required scope: wallet_accounts:read")
			return
		}
		if !dp.Bound || dp.WalletID == "" {
			apierror.Respond(w, r, http.StatusForbidden, "PAYMENTS_UNAVAILABLE",
				"this project is not provisioned to hold funds")
			return
		}
		ownWallet = dp.WalletID
	} else {
		principal, ok := middleware.GetPrincipal(r.Context())
		if !ok || principal.MerchantID == "" {
			apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "valid merchant credentials required")
			return
		}
		merchantID = principal.MerchantID
	}

	acc, err := h.accounts.Get(r.Context(), chi.URLParam(r, "id"))
	if err != nil || acc == nil {
		notFound()
		return
	}
	if ownWallet != "" {
		if acc.WalletID != ownWallet {
			notFound()
		} else {
			respond(w, http.StatusOK, acc)
		}
		return
	}
	wal, werr := h.wallets.Get(r.Context(), acc.WalletID)
	if werr != nil || wal == nil || wal.MerchantID != merchantID {
		notFound()
		return
	}
	respond(w, http.StatusOK, acc)
}
