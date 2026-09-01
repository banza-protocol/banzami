package handler

import (
	"encoding/json"
	"fmt"
	"github.com/banzami/banzami/services/common/env"
	"net/http"
	"time"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// SandboxHandler provides developer utilities for integration testing.
// Every endpoint in this handler enforces that the caller holds a SANDBOX
// principal. Live API keys receive 403 SANDBOX_ONLY on all routes here.
type SandboxHandler struct {
	transactionSvc service.TransactionService
	walletSvc      service.WalletService
}

func NewSandboxHandler(txSvc service.TransactionService, walletSvc service.WalletService) *SandboxHandler {
	return &SandboxHandler{transactionSvc: txSvc, walletSvc: walletSvc}
}

// requireSandbox returns false and writes a 403 when the caller is not in the
// sandbox environment. Call it at the top of every sandbox handler.
func requireSandbox(w http.ResponseWriter, r *http.Request) bool {
	// RA-055: the principal's environment is parsed, not string-compared, so a
	// principal minted as "sandbox" and one minted as "SANDBOX" reach the same
	// decision — and anything unrecognised grants nothing.
	p, ok := middleware.GetPrincipal(r.Context())
	if !ok || !env.Parse(p.Environment).IsSandbox() {
		apierror.Respond(w, r, http.StatusForbidden, "SANDBOX_ONLY",
			"this endpoint is only available in sandbox mode — authenticate with a bz_test_ key")
		return false
	}
	return true
}

// ---------------------------------------------------------------------------
// GET /v1/sandbox/instruments
// ---------------------------------------------------------------------------

// ListInstruments returns the canonical set of test payment instruments and
// the deterministic scenario each one triggers.
func (h *SandboxHandler) ListInstruments(w http.ResponseWriter, r *http.Request) {
	if !requireSandbox(w, r) {
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"test_cards": []map[string]any{
			{
				"number":      "4242 4242 4242 4242",
				"expiry":      "12/30",
				"cvv":         "123",
				"scenario":    "success",
				"description": "Payment completes immediately and transitions to CAPTURED.",
			},
			{
				"number":      "4000 0000 0000 9995",
				"expiry":      "12/30",
				"cvv":         "123",
				"scenario":    "insufficient_funds",
				"description": "Payment fails with INSUFFICIENT_FUNDS failure reason.",
			},
			{
				"number":      "4100 0000 0000 0019",
				"expiry":      "12/30",
				"cvv":         "123",
				"scenario":    "fraud_blocked",
				"description": "Payment is blocked by the risk engine with FRAUD_BLOCKED.",
			},
			{
				"number":      "4000 0000 0000 0069",
				"expiry":      "01/20",
				"cvv":         "123",
				"scenario":    "expired_card",
				"description": "Payment fails at the card level with EXPIRED_CARD.",
			},
			{
				"number":      "4000 0027 6000 3184",
				"expiry":      "12/30",
				"cvv":         "123",
				"scenario":    "auth_challenge",
				"description": "3DS authentication challenge is triggered before completion.",
			},
		},
		"test_mobile_numbers": []map[string]any{
			{
				"number":      "+244 900 000 001",
				"scenario":    "success",
				"description": "Mobile money payment succeeds immediately.",
			},
			{
				"number":      "+244 900 000 002",
				"scenario":    "timeout",
				"description": "Mobile money authorization times out after 30 seconds.",
			},
		},
		"note": "All instruments above are simulated. No real banking rails are invoked in sandbox mode.",
	})
}

// ---------------------------------------------------------------------------
// POST /v1/sandbox/simulate/payment
// ---------------------------------------------------------------------------

// SimulatePayment injects a synthetic payment transaction into the sandbox.
// This is useful for testing your webhook handlers, reconciliation logic,
// and dashboard views without going through a full payment flow.
//
// Request body:
//
//	{
//	  "amount_minor": 50000,
//	  "currency":     "AOA",
//	  "description":  "Test purchase",
//	  "scenario":     "success" | "insufficient_funds" | "fraud_blocked"
//	}
func (h *SandboxHandler) SimulatePayment(w http.ResponseWriter, r *http.Request) {
	if !requireSandbox(w, r) {
		return
	}

	p, _ := middleware.GetPrincipal(r.Context())

	var body struct {
		AmountMinor int64  `json:"amount_minor"`
		Currency    string `json:"currency"`
		Description string `json:"description"`
		Scenario    string `json:"scenario"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY",
			"request body must be valid JSON")
		return
	}
	if body.AmountMinor <= 0 {
		apierror.Respond(w, r, http.StatusBadRequest, "VALIDATION_ERROR",
			"amount_minor must be a positive integer in minor units")
		return
	}
	if body.Currency == "" {
		body.Currency = "AOA"
	}
	if body.Scenario == "" {
		body.Scenario = "success"
	}

	validScenarios := map[string]string{
		"success":            "CAPTURED",
		"insufficient_funds": "FAILED",
		"fraud_blocked":      "FAILED",
		"expired_card":       "FAILED",
		"auth_challenge":     "PENDING",
	}
	finalStatus, ok := validScenarios[body.Scenario]
	if !ok {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_SCENARIO",
			fmt.Sprintf("unknown scenario %q — valid values: success, insufficient_funds, fraud_blocked, expired_card, auth_challenge", body.Scenario))
		return
	}

	idempKey := fmt.Sprintf("sandbox-sim-%s-%d", body.Scenario, time.Now().UnixNano())
	desc := body.Description
	if desc == "" {
		desc = "[SANDBOX] Simulated payment"
	} else {
		desc = "[SANDBOX] " + desc
	}

	tx, err := h.transactionSvc.Create(r.Context(), service.CreateTransactionRequest{
		IdempotencyKey:  idempKey,
		TransactionType: "PAYMENT",
		AmountMinor:     body.AmountMinor,
		Currency:        body.Currency,
		Description:     desc,
		MerchantID:      p.MerchantID,
		Environment:     "SANDBOX",
	})
	if err != nil {
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	// Override status to reflect the simulated outcome.
	tx.Status = finalStatus

	writeJSON(w, http.StatusCreated, map[string]any{
		"transaction": tx,
		"scenario":    body.Scenario,
		"note":        "Simulated sandbox transaction. No real money was moved.",
	})
}

// ---------------------------------------------------------------------------
// POST /v1/sandbox/fund
// ---------------------------------------------------------------------------

// FundWallet credits the sandbox merchant wallet with virtual balance via the
// ledger engine. This ensures that wallet balances and payment flows work
// identically to production ("fake money, real flows").
//
// Request body:
//
//	{"amount_minor": 10000000, "currency": "AOA"}
//
// Capped at 100,000,000 AOA per request (10,000,000,000 in minor units).
func (h *SandboxHandler) FundWallet(w http.ResponseWriter, r *http.Request) {
	if !requireSandbox(w, r) {
		return
	}

	p, _ := middleware.GetPrincipal(r.Context())

	var body struct {
		AmountMinor int64  `json:"amount_minor"`
		Currency    string `json:"currency"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY",
			"request body must be valid JSON")
		return
	}
	if body.AmountMinor <= 0 {
		apierror.Respond(w, r, http.StatusBadRequest, "VALIDATION_ERROR",
			"amount_minor must be a positive integer in minor units")
		return
	}
	const maxFundMinor = 10_000_000_000 // 100,000,000 AOA
	if body.AmountMinor > maxFundMinor {
		apierror.Respond(w, r, http.StatusBadRequest, "VALIDATION_ERROR",
			"sandbox top-up is capped at 100,000,000 AOA (10,000,000,000 minor units) per request")
		return
	}
	if body.Currency == "" {
		body.Currency = "AOA"
	}

	// Resolve the merchant's wallet for the requested currency.
	wallet, err := h.walletSvc.GetForMerchant(r.Context(), p.MerchantID, body.Currency)
	if err != nil {
		apierror.Respond(w, r, http.StatusNotFound, "WALLET_NOT_FOUND",
			"no active wallet for this merchant in "+body.Currency)
		return
	}

	// Credit the wallet's available ledger account directly (ledger-backed,
	// persisted, immediately reflected in balance queries).
	balance, err := h.walletSvc.SandboxFund(r.Context(), wallet.ID, body.AmountMinor, body.Currency)
	if err != nil {
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"funded":         true,
		"wallet_id":      wallet.ID,
		"currency":       body.Currency,
		"credited_minor": body.AmountMinor,
		"new_balance":    balance,
		"note":           "Sandbox wallet credited via ledger. Virtual balance — no real funds moved.",
	})
}

// ---------------------------------------------------------------------------
// GET /v1/sandbox/status
// ---------------------------------------------------------------------------

// Status confirms the caller is in sandbox mode and returns environment metadata.
func (h *SandboxHandler) Status(w http.ResponseWriter, r *http.Request) {
	if !requireSandbox(w, r) {
		return
	}
	p, _ := middleware.GetPrincipal(r.Context())
	writeJSON(w, http.StatusOK, map[string]any{
		"environment": "SANDBOX",
		"merchant_id": p.MerchantID,
		"message":     "You are operating in sandbox mode. All financial operations are simulated.",
		"docs":        "https://docs.banzami.com/sandbox",
	})
}
