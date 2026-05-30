package handler

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"time"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"

	"github.com/banza-protocol/banzami/services/public-api/internal/apierror"
	"github.com/banza-protocol/banzami/services/public-api/internal/middleware"
	"github.com/banza-protocol/banzami/services/public-api/internal/notify"
	"github.com/banza-protocol/banzami/services/public-api/internal/service"
)

const (
	transferNoteMaxRunes   = 140
	transferRateLimit      = 20 // per window
)

// p2pTransferSender is satisfied by *service.CorePublicClient and by test fakes.
type p2pTransferSender interface {
	SendP2pTransfer(ctx context.Context, req service.SendP2pTransferRequest) (*service.P2pTransferResponse, error)
	GetTransfer(ctx context.Context, id string) (*service.Transfer, error)
	ListTransfers(ctx context.Context, consumerID string, limit int, cursor string) (*service.TransferPage, error)
}

// senderHandleResolver resolves a consumer ID → @banza handle.
// Satisfied by *service.CredentialStore and by test fakes.
type senderHandleResolver interface {
	GetHandle(ctx context.Context, consumerID string) (string, error)
}

// TransferHandler handles peer-to-peer money transfers between consumers.
type TransferHandler struct {
	core    p2pTransferSender
	handles senderHandleResolver
	limiter *TransferRateLimiter
	fcm     *notify.FCMService
}

// NewTransferHandler wires the handler with its dependencies.
// The rate limiter is created once at server startup and shared across all requests.
func NewTransferHandler(
	core *service.CorePublicClient,
	handles *service.CredentialStore,
	limiter *TransferRateLimiter,
	fcm *notify.FCMService,
) *TransferHandler {
	return &TransferHandler{
		core:    core,
		handles: handles,
		limiter: limiter,
		fcm:     fcm,
	}
}

// newTransferHandlerWithFakes is used in tests to inject mock implementations.
func newTransferHandlerWithFakes(
	core p2pTransferSender,
	handles senderHandleResolver,
	limiter *TransferRateLimiter,
) *TransferHandler {
	return &TransferHandler{core: core, handles: handles, limiter: limiter}
}

// ---------------------------------------------------------------------------
// POST /v1/transfers
// ---------------------------------------------------------------------------

// Send initiates a @banza → @banza transfer from the authenticated consumer.
//
// The sender's identity is taken from the verified JWT — the client never
// provides the sender explicitly, preventing spoofing.
//
// Request body:
//
//	{
//	  "recipient":       "@ana",
//	  "amount_minor":    200000,
//	  "currency":        "AOA",
//	  "note":            "almoço",       (optional, max 140 chars)
//	  "idempotency_key": "client-uuid"   (required)
//	}
//
// The Idempotency-Key header is also accepted and takes precedence over the
// body field when both are present.
func (h *TransferHandler) Send(w http.ResponseWriter, r *http.Request) {
	consumer, ok := middleware.GetConsumer(r.Context())
	if !ok {
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "authentication required")
		return
	}

	// Rate limiting — enforced before body parsing to save DB round trips on abuse.
	if !h.limiter.Allow(consumer.ID) {
		apierror.Respond(w, r, http.StatusTooManyRequests, "RATE_LIMITED",
			"too many transfers — please wait before sending again")
		return
	}

	var body struct {
		Recipient      string `json:"recipient"`
		AmountMinor    int64  `json:"amount_minor"`
		Currency       string `json:"currency"`
		Note           string `json:"note"`
		IdempotencyKey string `json:"idempotency_key"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "request body must be valid JSON")
		return
	}

	// Idempotency-Key header overrides body field when both are present.
	if hdr := r.Header.Get("Idempotency-Key"); hdr != "" {
		body.IdempotencyKey = hdr
	}

	// Input validation.
	switch {
	case body.Recipient == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "recipient is required")
		return
	case body.AmountMinor <= 0:
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_AMOUNT", "amount_minor must be a positive integer")
		return
	case body.Currency == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "currency is required")
		return
	case body.Currency != "AOA":
		apierror.Respond(w, r, http.StatusBadRequest, "UNSUPPORTED_CURRENCY", "only AOA is supported at this time")
		return
	case body.IdempotencyKey == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "idempotency_key is required")
		return
	case utf8.RuneCountInString(body.Note) > transferNoteMaxRunes:
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_FIELD",
			"note must be 140 characters or fewer")
		return
	}

	// Resolve sender's @banza handle from the credential store.
	// The JWT carries only consumer_id — the handle lives in public_api_credentials.
	senderHandle, err := h.handles.GetHandle(r.Context(), consumer.ID)
	if err != nil {
		// Consumer exists in JWT but not in credential store — should never happen
		// under normal operation. Treat as unauthenticated.
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED",
			"could not resolve sender identity")
		return
	}

	// Delegate to the P2P-001 core engine.
	// The core handles: handle normalization, routing, balance check, ledger posting.
	transfer, err := h.core.SendP2pTransfer(r.Context(), service.SendP2pTransferRequest{
		Sender:         senderHandle,
		Recipient:      body.Recipient,
		AmountMinor:    body.AmountMinor,
		Currency:       body.Currency,
		Note:           body.Note,
		IdempotencyKey: body.IdempotencyKey,
	})
	if err != nil {
		switch {
		case errors.Is(err, service.ErrTransferSelfTransfer):
			apierror.Respond(w, r, http.StatusBadRequest, "SELF_TRANSFER_NOT_ALLOWED",
				"you cannot transfer money to yourself")
		case errors.Is(err, service.ErrTransferInvalidAmount):
			apierror.Respond(w, r, http.StatusBadRequest, "INVALID_AMOUNT",
				"amount_minor must be a positive integer")
		case errors.Is(err, service.ErrTransferInsufficientFunds):
			apierror.Respond(w, r, http.StatusUnprocessableEntity, "INSUFFICIENT_FUNDS",
				"your available balance is too low for this transfer")
		case errors.Is(err, service.ErrTransferWalletLocked):
			apierror.Respond(w, r, http.StatusForbidden, "WALLET_LOCKED",
				"your wallet is locked — contact support to unlock it")
		case errors.Is(err, service.ErrTransferRecipientNotFound):
			apierror.Respond(w, r, http.StatusNotFound, "RECIPIENT_NOT_FOUND",
				"recipient handle does not exist")
		case errors.Is(err, service.ErrTransferRecipientUnavailable):
			apierror.Respond(w, r, http.StatusUnprocessableEntity, "RECIPIENT_UNAVAILABLE",
				"recipient cannot receive funds at this time")
		case errors.Is(err, service.ErrInvalidHandle):
			apierror.Respond(w, r, http.StatusBadRequest, "INVALID_RECIPIENT",
				"recipient handle format is invalid")
		default:
			apierror.Respond(w, r, http.StatusInternalServerError, "TRANSFER_FAILED",
				"transfer could not be processed — please try again")
		}
		return
	}

	// Notify recipient via FCM — best-effort, never delays the HTTP response.
	go h.notifyRecipient(transfer)

	// Build canonical public response — no internal identifiers exposed.
	traceID := chimiddleware.GetReqID(r.Context())

	resp := map[string]any{
		"transfer_id":  transfer.ID,
		"status":       transfer.Status,
		"sender":       transfer.Sender,
		"recipient":    transfer.Recipient,
		"amount_minor": transfer.AmountMinor,
		"currency":     transfer.Currency,
		"note":         transfer.Note,
		"created_at":   transfer.CreatedAt,
		"completed_at": transfer.CreatedAt, // transfers are atomically COMPLETED on creation
		"trace_id":     traceID,
	}

	respond(w, http.StatusCreated, resp)
}

// notifyRecipient resolves the recipient's consumer_id by handle and sends FCM.
// Runs in a goroutine — never blocks the HTTP response.
func (h *TransferHandler) notifyRecipient(t *service.P2pTransferResponse) {
	if h.fcm == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// The P2P transfer response contains handles, not UUIDs.
	// We need the recipient's consumer_id for the FCM topic.
	type handleResolver interface {
		GetConsumerByHandle(ctx context.Context, handle string) (*service.ConsumerRecord, error)
	}
	core, ok := h.core.(handleResolver)
	if !ok {
		slog.Warn("[FCM] notifyRecipient: core does not implement handleResolver")
		return
	}

	recipient := t.Recipient
	// Strip leading @ if present.
	if len(recipient) > 0 && recipient[0] == '@' {
		recipient = recipient[1:]
	}

	consumer, err := core.GetConsumerByHandle(ctx, recipient)
	if err != nil {
		slog.Warn("[FCM] notifyRecipient: could not resolve recipient handle",
			"handle", t.Recipient, "error", err)
		return
	}

	slog.Info("[FCM] event created",
		"event",        "payment_received",
		"recipient_id", consumer.ID,
		"sender",       t.Sender,
		"amount_minor", t.AmountMinor,
	)

	h.fcm.SendPaymentReceived(ctx, consumer.ID, t.Sender, t.AmountMinor, t.Currency, t.ID)
}

// ---------------------------------------------------------------------------
// GET /v1/transfers/{id}
// ---------------------------------------------------------------------------

func (h *TransferHandler) Get(w http.ResponseWriter, r *http.Request) {
	consumer, ok := middleware.GetConsumer(r.Context())
	if !ok {
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "authentication required")
		return
	}
	_ = consumer // ownership check deferred to core when ACL layer matures

	id := chi.URLParam(r, "id")
	transfer, err := h.core.GetTransfer(r.Context(), id)
	if err != nil {
		if errors.Is(err, service.ErrTransferNotFound) {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "transfer not found")
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not fetch transfer")
		return
	}

	respond(w, http.StatusOK, transfer)
}

// ---------------------------------------------------------------------------
// GET /v1/transfers
// ---------------------------------------------------------------------------

func (h *TransferHandler) List(w http.ResponseWriter, r *http.Request) {
	consumer, ok := middleware.GetConsumer(r.Context())
	if !ok {
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "authentication required")
		return
	}

	limit := 20
	if raw := r.URL.Query().Get("limit"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 || parsed > 100 {
			apierror.Respond(w, r, http.StatusBadRequest, "INVALID_PARAM", "limit must be between 1 and 100")
			return
		}
		limit = parsed
	}

	page, err := h.core.ListTransfers(r.Context(), consumer.ID, limit, r.URL.Query().Get("cursor"))
	if err != nil {
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not list transfers")
		return
	}

	respond(w, http.StatusOK, page)
}
