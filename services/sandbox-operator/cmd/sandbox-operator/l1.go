// L1 conformance-shaped sandbox surface.
//
// This file adds a *simulated*, in-memory BANZA L1 (Core Payment Capability)
// API surface — wallets, transfers, traces, events — shaped to the contract the
// official `banza-conformance --level 1` runner expects (root paths, no auth).
//
// It is conformance EVIDENCE tooling, NOT a production money API and NOT
// certification:
//   - It is gated behind SANDBOX_L1_ENABLED (default OFF), so the public L0
//     sandbox behaviour is unchanged unless explicitly enabled for a dry run.
//   - It holds money only in memory; it touches no database, no ledger, no real
//     funds. `simulated=true` / `production_allowed=false` remain invariants.
//   - It does NOT reuse or expose the production `/internal/v1` Rust core API.
//
// L1 is not validated and Banzami is not certified by the existence of this
// surface; it only lets us run an L1 dry run locally and produce pre-validation
// evidence.
package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"os"
	"sync"
	"time"
)

// l1Enabled reports whether the L1 conformance surface should be mounted.
func l1Enabled() bool {
	v := os.Getenv("SANDBOX_L1_ENABLED")
	return v == "true" || v == "1"
}

// ── In-memory simulated state ────────────────────────────────────────────────

type l1Wallet struct {
	ID           string `json:"id"`
	Label        string `json:"label"`
	Currency     string `json:"currency"`
	BalanceMinor int64  `json:"balance_minor"`
	Status       string `json:"status"`
	CreatedAt    string `json:"created_at"`
}

type l1Transfer struct {
	ID           string `json:"id"`
	FromWalletID string `json:"from_wallet_id"`
	ToWalletID   string `json:"to_wallet_id"`
	AmountMinor  int64  `json:"amount_minor"`
	Currency     string `json:"currency"`
	Status       string `json:"status"`
	TraceID      string `json:"trace_id"`
	CreatedAt    string `json:"created_at"`
}

type l1Event struct {
	EventType     string `json:"event_type"`
	TraceID       string `json:"trace_id"`
	CorrelationID string `json:"correlation_id"`
	Timestamp     string `json:"timestamp"`
	TransferID    string `json:"transfer_id,omitempty"`
	WalletID      string `json:"wallet_id,omitempty"`
	AmountMinor   int64  `json:"amount_minor,omitempty"`
}

type l1Store struct {
	mu        sync.Mutex
	wallets   map[string]*l1Wallet
	transfers map[string]*l1Transfer
	idem      map[string]string    // idempotency_key → transfer id
	traces    map[string][]l1Event // trace_id → timeline
	events    []l1Event            // newest-first global feed
}

func newL1Store() *l1Store {
	return &l1Store{
		wallets:   map[string]*l1Wallet{},
		transfers: map[string]*l1Transfer{},
		idem:      map[string]string{},
		traces:    map[string][]l1Event{},
	}
}

// ── Helpers ──────────────────────────────────────────────────────────────────

func token(prefix string) string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return prefix + hex.EncodeToString(b)
}

func nowISO() string { return time.Now().UTC().Format(time.RFC3339) }

func writeStatusJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	_ = enc.Encode(v)
}

func apiError(w http.ResponseWriter, status int, code, msg string) {
	writeStatusJSON(w, status, map[string]any{"error": code, "message": msg})
}

// record appends an event to a transfer's trace timeline and the global feed.
func (s *l1Store) record(e l1Event) {
	s.traces[e.TraceID] = append(s.traces[e.TraceID], e)
	s.events = append([]l1Event{e}, s.events...) // newest first
}

// ── Handlers ─────────────────────────────────────────────────────────────────

func (s *l1Store) handleCreateWallet(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Label    string `json:"label"`
		Currency string `json:"currency"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		apiError(w, http.StatusBadRequest, "bad_request", "invalid JSON body")
		return
	}
	if in.Currency == "" {
		in.Currency = "AOA"
	}
	s.mu.Lock()
	wallet := &l1Wallet{
		ID:           token("wlt-"),
		Label:        in.Label,
		Currency:     in.Currency,
		BalanceMinor: 0,
		Status:       "ACTIVE",
		CreatedAt:    nowISO(),
	}
	s.wallets[wallet.ID] = wallet
	s.mu.Unlock()
	writeStatusJSON(w, http.StatusCreated, wallet)
}

func (s *l1Store) handleGetWallet(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	s.mu.Lock()
	wallet, ok := s.wallets[id]
	s.mu.Unlock()
	if !ok {
		apiError(w, http.StatusNotFound, "not_found", "wallet not found")
		return
	}
	writeStatusJSON(w, http.StatusOK, wallet)
}

func (s *l1Store) handleSeedWallet(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var in struct {
		AmountMinor int64  `json:"amount_minor"`
		Currency    string `json:"currency"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		apiError(w, http.StatusBadRequest, "bad_request", "invalid JSON body")
		return
	}
	s.mu.Lock()
	wallet, ok := s.wallets[id]
	if !ok {
		s.mu.Unlock()
		apiError(w, http.StatusNotFound, "not_found", "wallet not found")
		return
	}
	if in.AmountMinor < 0 {
		s.mu.Unlock()
		apiError(w, http.StatusUnprocessableEntity, "invalid_amount", "amount_minor must be >= 0")
		return
	}
	wallet.BalanceMinor += in.AmountMinor
	balance := wallet.BalanceMinor
	traceID := token("tr-")
	s.record(l1Event{
		EventType: "sandbox.wallet.seeded", TraceID: traceID, CorrelationID: token("corr-"),
		Timestamp: nowISO(), WalletID: id, AmountMinor: in.AmountMinor,
	})
	s.mu.Unlock()
	writeStatusJSON(w, http.StatusOK, map[string]any{
		"wallet_id": id, "amount_minor": in.AmountMinor, "balance_minor": balance, "currency": wallet.Currency,
	})
}

func (s *l1Store) handleCreateTransfer(w http.ResponseWriter, r *http.Request) {
	var in struct {
		FromWalletID   string `json:"from_wallet_id"`
		ToWalletID     string `json:"to_wallet_id"`
		AmountMinor    int64  `json:"amount_minor"`
		Currency       string `json:"currency"`
		IdempotencyKey string `json:"idempotency_key"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		apiError(w, http.StatusBadRequest, "bad_request", "invalid JSON body")
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	// Idempotency: same key → return the existing transfer, never double-debit.
	if in.IdempotencyKey != "" {
		if existingID, ok := s.idem[in.IdempotencyKey]; ok {
			writeStatusJSON(w, http.StatusOK, s.transfers[existingID])
			return
		}
	}

	from, okF := s.wallets[in.FromWalletID]
	to, okT := s.wallets[in.ToWalletID]
	if !okF || !okT {
		apiError(w, http.StatusNotFound, "not_found", "from/to wallet not found")
		return
	}
	if in.Currency == "" {
		in.Currency = from.Currency
	}
	if in.AmountMinor <= 0 {
		apiError(w, http.StatusUnprocessableEntity, "invalid_amount", "amount_minor must be > 0")
		return
	}
	if from.BalanceMinor < in.AmountMinor {
		// Insufficient funds — do NOT mutate any balance.
		apiError(w, http.StatusUnprocessableEntity, "insufficient_funds", "from wallet has insufficient balance")
		return
	}

	// Simulated atomic debit/credit.
	from.BalanceMinor -= in.AmountMinor
	to.BalanceMinor += in.AmountMinor

	tr := &l1Transfer{
		ID:           token("txfr-"),
		FromWalletID: in.FromWalletID,
		ToWalletID:   in.ToWalletID,
		AmountMinor:  in.AmountMinor,
		Currency:     in.Currency,
		Status:       "COMPLETED",
		TraceID:      token("tr-"),
		CreatedAt:    nowISO(),
	}
	s.transfers[tr.ID] = tr
	if in.IdempotencyKey != "" {
		s.idem[in.IdempotencyKey] = tr.ID
	}

	corr := token("corr-")
	for _, et := range []string{"transfer.initiated", "ledger.debited", "ledger.credited", "transfer.completed"} {
		s.record(l1Event{
			EventType: et, TraceID: tr.TraceID, CorrelationID: corr,
			Timestamp: nowISO(), TransferID: tr.ID, AmountMinor: tr.AmountMinor,
		})
	}
	writeStatusJSON(w, http.StatusCreated, tr)
}

func (s *l1Store) handleGetTransfer(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	s.mu.Lock()
	tr, ok := s.transfers[id]
	s.mu.Unlock()
	if !ok {
		apiError(w, http.StatusNotFound, "not_found", "transfer not found")
		return
	}
	writeStatusJSON(w, http.StatusOK, tr)
}

func (s *l1Store) handleGetTrace(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	s.mu.Lock()
	timeline, ok := s.traces[id]
	s.mu.Unlock()
	if !ok || len(timeline) == 0 {
		apiError(w, http.StatusNotFound, "not_found", "trace not found")
		return
	}
	writeStatusJSON(w, http.StatusOK, map[string]any{"trace_id": id, "timeline": timeline})
}

func (s *l1Store) handleEvents(w http.ResponseWriter, _ *http.Request) {
	s.mu.Lock()
	out := make([]l1Event, len(s.events))
	copy(out, s.events)
	s.mu.Unlock()
	writeStatusJSON(w, http.StatusOK, map[string]any{"events": out})
}

// registerL1 mounts the conformance-shaped L1 routes onto mux.
func registerL1(mux *http.ServeMux, s *l1Store) {
	mux.HandleFunc("POST /wallets", s.handleCreateWallet)
	mux.HandleFunc("GET /wallets/{id}", s.handleGetWallet)
	mux.HandleFunc("POST /wallets/{id}/seed", s.handleSeedWallet)
	mux.HandleFunc("POST /transfers", s.handleCreateTransfer)
	mux.HandleFunc("GET /transfers/{id}", s.handleGetTransfer)
	mux.HandleFunc("GET /traces/{id}", s.handleGetTrace)
	mux.HandleFunc("GET /events/history", s.handleEvents)
	mux.HandleFunc("GET /events", s.handleEvents)
}
