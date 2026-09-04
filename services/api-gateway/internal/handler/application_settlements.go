package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// ApplicationSettlementHandler is the app-facing surface for an application (e.g.
// DOA) to settle accumulated net value from one of its own wallets to a
// beneficiary, splitting off an application fee — all money movement done by the
// operator. The app never sees ledger account ids and never computes the fee.
type ApplicationSettlementHandler struct {
	settlements service.ApplicationSettlementService
	wallets     service.WalletService
	accounts    service.WalletAccountService
	parties     service.PartyResolver
}

func NewApplicationSettlementHandler(s service.ApplicationSettlementService, w service.WalletService, a service.WalletAccountService, p service.PartyResolver) *ApplicationSettlementHandler {
	return &ApplicationSettlementHandler{settlements: s, wallets: w, accounts: a, parties: p}
}

// POST /v1/application-settlements
func (h *ApplicationSettlementHandler) Create(w http.ResponseWriter, r *http.Request) {
	principal, ok := middleware.GetPrincipal(r.Context())
	if !ok || principal.MerchantID == "" {
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "valid merchant credentials required")
		return
	}
	var body struct {
		IdempotencyKey         string `json:"idempotency_key"`
		OwnerRef               string `json:"owner_ref"`
		SourceWalletID         string `json:"source_wallet_id"`
		SourceWalletAccountID  string `json:"source_wallet_account_id"`
		BeneficiaryWalletID    string `json:"beneficiary_wallet_id"`
		ApplicationFeeWalletID string `json:"application_fee_wallet_id"`
		FeePolicyRef           string `json:"fee_policy_ref"`
		BusinessCategory       string `json:"business_category"`
		PricingProfile         string `json:"pricing_profile"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "request body must be valid JSON")
		return
	}
	switch {
	case body.IdempotencyKey == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "idempotency_key is required")
		return
	case body.SourceWalletID == "" && body.SourceWalletAccountID == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "source_wallet_id or source_wallet_account_id is required")
		return
	case body.BeneficiaryWalletID == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "beneficiary_wallet_id is required")
		return
	}

	// Resolve the source: either a specific segregated account (ADR-042) or the
	// wallet's default account. In both cases the app may only settle FROM funds
	// it owns, and the gross is read from Banzami (never sent by the app).
	var (
		grossMinor      int64
		sourceCurrency  string
		sourceAccountID string // ledger account, set only for the segregated path
	)
	if body.SourceWalletAccountID != "" {
		acc, aerr := h.accounts.Get(r.Context(), body.SourceWalletAccountID)
		if aerr != nil || acc == nil {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "source wallet account not found")
			return
		}
		// Ownership: the account's parent wallet must belong to the caller.
		wal, werr := h.wallets.Get(r.Context(), acc.WalletID)
		if werr != nil || wal == nil || wal.MerchantID != principal.MerchantID {
			apierror.Respond(w, r, http.StatusForbidden, "FORBIDDEN", "source_wallet_account_id is not owned by this merchant")
			return
		}
		if acc.AvailableBalanceMinor <= 0 {
			apierror.Respond(w, r, http.StatusUnprocessableEntity, "NOTHING_TO_SETTLE", "source account has no available balance")
			return
		}
		coreAcct, cerr := h.accounts.CoreAccountID(r.Context(), body.SourceWalletAccountID)
		if cerr != nil || coreAcct == "" {
			apierror.Respond(w, r, http.StatusBadGateway, "UPSTREAM_ERROR", "could not resolve source account")
			return
		}
		grossMinor = acc.AvailableBalanceMinor
		sourceCurrency = acc.Currency
		sourceAccountID = coreAcct
	} else {
		src, err := h.wallets.Get(r.Context(), body.SourceWalletID)
		if err != nil || src == nil || src.MerchantID != principal.MerchantID {
			apierror.Respond(w, r, http.StatusForbidden, "FORBIDDEN", "source_wallet_id is not owned by this merchant")
			return
		}
		bal, berr := h.wallets.Balance(r.Context(), body.SourceWalletID)
		if berr != nil || bal == nil {
			apierror.Respond(w, r, http.StatusBadGateway, "UPSTREAM_ERROR", "could not read source wallet balance")
			return
		}
		if bal.AvailableMinor <= 0 {
			apierror.Respond(w, r, http.StatusUnprocessableEntity, "NOTHING_TO_SETTLE", "source wallet has no available balance")
			return
		}
		grossMinor = bal.AvailableMinor
		sourceCurrency = src.Currency
	}

	// The application fee may only be directed to a wallet the caller owns. The
	// beneficiary is unrestricted.
	if body.ApplicationFeeWalletID != "" {
		fee, ferr := h.wallets.Get(r.Context(), body.ApplicationFeeWalletID)
		if ferr != nil || fee == nil || fee.MerchantID != principal.MerchantID {
			apierror.Respond(w, r, http.StatusForbidden, "FORBIDDEN", "application_fee_wallet_id is not owned by this merchant")
			return
		}
	}

	st, err := h.settlements.Create(r.Context(), service.CreateApplicationSettlementInput{
		IdempotencyKey: body.IdempotencyKey,
		OwnerRef:       body.OwnerRef,
		ApplicationID:  principal.MerchantID, // SEC-002 authorisation binding

		SourceWalletID:         body.SourceWalletID,
		SourceAccountID:        sourceAccountID,
		BeneficiaryWalletID:    body.BeneficiaryWalletID,
		ApplicationFeeWalletID: body.ApplicationFeeWalletID,
		GrossAmountMinor:       grossMinor,
		Currency:               sourceCurrency,
		FeePolicyRef:           body.FeePolicyRef,
		BusinessCategory:       body.BusinessCategory,
		PricingProfile:         body.PricingProfile,
	})
	if err != nil {
		apierror.Respond(w, r, http.StatusBadGateway, "UPSTREAM_ERROR", "could not create settlement")
		return
	}

	// Execute it: a fresh settlement is CREATED → complete it to post the ledger.
	// An idempotent retry may already be terminal — return it as-is.
	if st.Status == "CREATED" || st.Status == "PENDING" {
		completed, cerr := h.settlements.Complete(r.Context(), st.ID)
		if cerr != nil {
			// The settlement exists but could not be completed (e.g. insufficient
			// funds). Surface it; the app keeps the campaign settlement-pending/failed.
			slog.ErrorContext(r.Context(), "application_settlement.complete.failed", "settlement_id", st.ID, "error", cerr)
			apierror.Respond(w, r, http.StatusUnprocessableEntity, "SETTLEMENT_NOT_COMPLETED", "settlement could not be completed")
			return
		}
		st = completed
	}

	slog.InfoContext(r.Context(), "application_settlement.executed",
		"settlement_id", st.ID, "owner_ref", st.OwnerRef, "status", st.Status)
	respond(w, http.StatusCreated, st)
}

// GET /v1/application-settlements/{id}
func (h *ApplicationSettlementHandler) Get(w http.ResponseWriter, r *http.Request) {
	principal, ok := middleware.GetPrincipal(r.Context())
	if !ok || principal.MerchantID == "" {
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "valid merchant credentials required")
		return
	}
	st, err := h.settlements.Get(r.Context(), chi.URLParam(r, "id"))
	if err != nil || st == nil {
		apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "settlement not found")
		return
	}
	// SEC-002: authentication is not authorisation. A settlement is readable only
	// by the Business Account that created it. Settlements with no binding (rows
	// written before the binding existed) are NOT readable on this app-facing
	// route — unknown ownership fails closed rather than leaking another
	// merchant's gross/fee/net amounts. Reported as NOT_FOUND so the route cannot
	// be used to enumerate settlement ids.
	if st.ApplicationID == "" || st.ApplicationID != principal.MerchantID {
		slog.WarnContext(r.Context(), "application_settlement.get.denied",
			"settlement_id", st.ID, "caller_merchant_id", principal.MerchantID)
		apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "settlement not found")
		return
	}
	respond(w, http.StatusOK, st)
}

// CreateBusiness handles POST /v1/business/application-settlements (ADR-029).
//
// The app closes a campaign: it names the source segregated account, the
// beneficiary @banza, an optional fee destination @banza, and its OWN fee rate
// (application_fee_bps). The operator reads the real balance as the gross,
// resolves the @names to accounts, validates ownership/type/KYB/bounds, executes
// the split (fee → app, net → beneficiary) and audits it. The app sends no
// amount, never sees ledger ids, and never sets an operator pricing rule.
func (h *ApplicationSettlementHandler) CreateBusiness(w http.ResponseWriter, r *http.Request) {
	// Dual credential. A developer key settles from an account beneath its own
	// project binding; a merchant JWT keeps its existing identity. Either way the
	// source account's ownership is re-checked below — the caller never asserts
	// whose money is moving.
	var callerMerchantID string
	if dp, isDev := middleware.GetDeveloperPrincipal(r.Context()); isDev {
		if !dp.HasScope("application_settlements:write") {
			apierror.Respond(w, r, http.StatusForbidden, "INSUFFICIENT_SCOPE", "missing required scope: application_settlements:write")
			return
		}
		if !dp.Bound || dp.MerchantID == "" {
			apierror.Respond(w, r, http.StatusForbidden, "PAYMENTS_UNAVAILABLE", "this project is not provisioned to settle")
			return
		}
		callerMerchantID = dp.MerchantID
	} else {
		principal, ok := middleware.GetPrincipal(r.Context())
		if !ok || principal.MerchantID == "" {
			apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "valid merchant credentials required")
			return
		}
		callerMerchantID = principal.MerchantID
	}
	var body struct {
		SourceAccountID         string `json:"source_account_id"` // the campaign wallet_account id
		BeneficiaryBanzaName    string `json:"beneficiary_banza_name"`
		FeeDestinationBanzaName string `json:"fee_destination_banza_name"`
		ApplicationFeeBps       int    `json:"application_fee_bps"`
		Reason                  string `json:"reason"`
		ReferenceType           string `json:"reference_type"`
		ReferenceID             string `json:"reference_id"`
		IdempotencyKey          string `json:"idempotency_key"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "request body must be valid JSON")
		return
	}
	switch {
	case body.IdempotencyKey == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "idempotency_key is required")
		return
	case body.SourceAccountID == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "source_account_id is required")
		return
	case body.BeneficiaryBanzaName == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "beneficiary_banza_name is required")
		return
	case body.ApplicationFeeBps < 0:
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_FEE", "application_fee_bps must not be negative")
		return
	}

	// Source: a segregated account the caller owns (not the PRIMARY/default).
	acc, aerr := h.accounts.Get(r.Context(), body.SourceAccountID)
	if aerr != nil || acc == nil {
		apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "source account not found")
		return
	}
	wal, werr := h.wallets.Get(r.Context(), acc.WalletID)
	if werr != nil || wal == nil || wal.MerchantID != callerMerchantID {
		apierror.Respond(w, r, http.StatusForbidden, "FORBIDDEN", "source account is not owned by this merchant")
		return
	}
	if acc.Purpose == "PRIMARY" {
		apierror.Respond(w, r, http.StatusUnprocessableEntity, "SOURCE_NOT_SEGREGATED", "settle from a segregated (e.g. CAMPAIGN) account, not the primary")
		return
	}
	if acc.AvailableBalanceMinor <= 0 {
		apierror.Respond(w, r, http.StatusUnprocessableEntity, "NOTHING_TO_SETTLE", "source account has no available balance")
		return
	}
	currency := acc.Currency
	coreSource, cerr := h.accounts.CoreAccountID(r.Context(), body.SourceAccountID)
	if cerr != nil || coreSource == "" {
		apierror.Respond(w, r, http.StatusBadGateway, "UPSTREAM_ERROR", "could not resolve source account")
		return
	}

	// Beneficiary @banza → its account.
	ben, berr := h.parties.Resolve(r.Context(), body.BeneficiaryBanzaName, currency)
	if berr != nil || ben == nil || ben.AvailableAccountID == "" {
		apierror.Respond(w, r, http.StatusUnprocessableEntity, "BENEFICIARY_NOT_FOUND", "beneficiary_banza_name has no active wallet in this currency")
		return
	}

	// Fee destination @banza → its account (only when a fee is charged). It must
	// be the caller's OWN business account; core further enforces APPLICATION/PLATFORM
	// type + KYB (ADR-028).
	feeAccountID := ""
	if body.ApplicationFeeBps > 0 {
		if body.FeeDestinationBanzaName == "" {
			apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "fee_destination_banza_name is required when application_fee_bps > 0")
			return
		}
		fd, ferr := h.parties.Resolve(r.Context(), body.FeeDestinationBanzaName, currency)
		if ferr != nil || fd == nil || fd.AvailableAccountID == "" {
			apierror.Respond(w, r, http.StatusUnprocessableEntity, "FEE_DESTINATION_NOT_FOUND", "fee_destination_banza_name has no active wallet in this currency")
			return
		}
		if fd.OwnerType != "MERCHANT" || fd.OwnerID != callerMerchantID {
			apierror.Respond(w, r, http.StatusForbidden, "FEE_DESTINATION_NOT_OWNED", "fee destination must be your own business account")
			return
		}
		feeAccountID = fd.AvailableAccountID
	}

	ownerRef := body.ReferenceID
	if ownerRef == "" {
		ownerRef = body.Reason
	}

	st, err := h.settlements.Create(r.Context(), service.CreateApplicationSettlementInput{
		IdempotencyKey: body.IdempotencyKey,
		OwnerRef:       ownerRef,
		ApplicationID:  callerMerchantID, // SEC-002 authorisation binding

		SourceAccountID:         coreSource,
		BeneficiaryAccountID:    ben.AvailableAccountID,
		ApplicationFeeAccountID: feeAccountID,
		ApplicationFeeBps:       body.ApplicationFeeBps,
		GrossAmountMinor:        acc.AvailableBalanceMinor,
		Currency:                currency,
	})
	if err != nil {
		slog.ErrorContext(r.Context(), "business_settlement.create.failed", "owner_ref", ownerRef, "error", err)
		apierror.Respond(w, r, http.StatusBadGateway, "UPSTREAM_ERROR", "could not create settlement")
		return
	}
	if st.Status == "CREATED" || st.Status == "PENDING" {
		completed, cerr := h.settlements.Complete(r.Context(), st.ID)
		if cerr != nil {
			slog.ErrorContext(r.Context(), "business_settlement.complete.failed", "settlement_id", st.ID, "error", cerr)
			apierror.Respond(w, r, http.StatusUnprocessableEntity, "SETTLEMENT_NOT_COMPLETED", "settlement could not be completed")
			return
		}
		st = completed
	}
	slog.InfoContext(r.Context(), "business_settlement.executed", "settlement_id", st.ID, "owner_ref", st.OwnerRef, "status", st.Status)
	respond(w, http.StatusCreated, st)
}
