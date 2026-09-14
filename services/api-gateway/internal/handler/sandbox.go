package handler

import (
	"bytes"
	"context"
	_ "embed"
	"encoding/json"
	"io"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/redis/go-redis/v9"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
	"github.com/banzami/banzami/services/common/documents"
	"github.com/banzami/banzami/services/common/env"
)

// The public Sandbox test-data surface (ADR-060 §4–§5), on the developer key.
//
//	GET    /v1/sandbox/scenarios                        sandbox:read
//	POST   /v1/sandbox/test-payers                      sandbox:write
//	GET    /v1/sandbox/test-payers                      sandbox:read
//	GET    /v1/sandbox/test-payers/{id}                 sandbox:read
//	POST   /v1/sandbox/test-payers/{id}/fund            sandbox:write
//	POST   /v1/sandbox/test-payers/{id}/payments        sandbox:write
//	DELETE /v1/sandbox/test-payers/{id}                 sandbox:write
//
// The Project is the key's, never a request field. A test payer pays only the
// Project's OWN Payment Sessions and Payment Links: a test in Project A cannot
// move fictitious money into Project B.
//
// External-rail outcomes are explicit (simulate), marked simulated: true, and
// never silently triggered by a value. DECLINED and PROVIDER_UNAVAILABLE change
// nothing. TIMEOUT makes the payment and then answers 503 SANDBOX_SIMULATED_TIMEOUT
// (not 504: Cloudflare replaces a 504 body, so the code would never arrive —
// common/edgestatus), so a client practises
// the ambiguous-outcome rule: repeat with the same Idempotency-Key and read the
// real result.

//go:embed sandbox_scenarios.json
var sandboxScenarios []byte

// SandboxScenarioCatalogue exposes the embedded catalogue to the docs drift gate.
func SandboxScenarioCatalogue() []byte { return sandboxScenarios }

type devSessionReader interface {
	Get(ctx context.Context, id string) (*service.PaymentSession, error)
}

type devLinkReader interface {
	Get(ctx context.Context, id string) (*service.PaymentLink, error)
}

// devReceipts issues the canonical receipt of a transfer (the same semantics
// the consumer app's receipt uses), for a QR payment whose consumer path
// returns no receipt of its own.
type devReceipts interface {
	TransferReceipt(ctx context.Context, transferID, environment string, issue bool) (documents.Receipt, error)
}

// devQRReader reads a session's dynamic QR: a session read carries the QR's id,
// not its signed payload, which only the create response returns.
type devQRReader interface {
	Get(ctx context.Context, id string) (*service.QrResponse, error)
}

type SandboxDevHandler struct {
	publicAPI   string // public-api internal base URL
	internalKey string
	http        *http.Client
	sessions    devSessionReader
	links       devLinkReader
	qrs         devQRReader
	receipts    devReceipts

	// The real outcome of a simulated timeout, by project|Idempotency-Key, for
	// 24 hours: in Redis when the gateway has it (it survives a restart), in
	// memory otherwise.
	rdb      *redis.Client
	mu       sync.Mutex
	timeouts map[string]timedOutcome

	// delay is how long a simulate DELAYED payment waits before it completes.
	delay time.Duration
}

// SandboxDelayedCompletion is how long a simulate DELAYED payment is PENDING
// before it completes on its own (ADR-060 §5): long enough for a client to show
// a pending state and learn the outcome from the webhook, the realtime stream or
// a later read, short enough to test in one sitting.
const SandboxDelayedCompletion = 10 * time.Second

// sandboxDelayedQueue holds DELAYED payments due for completion (Redis sorted
// set, score = due Unix milliseconds), so a gateway restart does not lose them.
const sandboxDelayedQueue = "sbx:delayed"

type delayedPayment struct {
	CacheKey  string          `json:"k"`
	ProjectID string          `json:"p"`
	PayerID   string          `json:"t"`
	Body      json.RawMessage `json:"b"`
	Via       string          `json:"v"`
	SessionID string          `json:"s,omitempty"`
	LinkID    string          `json:"l,omitempty"`
	Attempts  int             `json:"a"`
}

const simulatedTimeoutTTL = 24 * time.Hour

type timedOutcome struct {
	status int
	body   []byte
	at     time.Time
}

func NewSandboxDevHandler(publicAPIURL, internalKey string, sessions devSessionReader, links devLinkReader) *SandboxDevHandler {
	return &SandboxDevHandler{
		publicAPI: strings.TrimRight(publicAPIURL, "/"), internalKey: internalKey,
		http: &http.Client{Timeout: 20 * time.Second}, sessions: sessions, links: links,
		timeouts: map[string]timedOutcome{}, delay: SandboxDelayedCompletion,
	}
}

// WithReceipts lets a test payment name its receipt whichever path paid it.
func (h *SandboxDevHandler) WithReceipts(r devReceipts) *SandboxDevHandler {
	h.receipts = r
	return h
}

// WithQRReader lets via: QR pay a session read back from its QR id.
func (h *SandboxDevHandler) WithQRReader(q devQRReader) *SandboxDevHandler {
	h.qrs = q
	return h
}

// WithOutcomeStore keeps simulated-timeout outcomes in Redis.
func (h *SandboxDevHandler) WithOutcomeStore(rdb *redis.Client) *SandboxDevHandler {
	h.rdb = rdb
	return h
}

func (h *SandboxDevHandler) storedOutcome(ctx context.Context, key string) (timedOutcome, bool) {
	if h.rdb != nil {
		raw, err := h.rdb.Get(ctx, "sbx:timeout:"+key).Bytes()
		if err != nil || len(raw) < 4 {
			return timedOutcome{}, false
		}
		var o struct {
			Status int    `json:"s"`
			Body   []byte `json:"b"`
		}
		if json.Unmarshal(raw, &o) != nil {
			return timedOutcome{}, false
		}
		return timedOutcome{status: o.Status, body: o.Body}, true
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	o, found := h.timeouts[key]
	if !found || time.Since(o.at) >= simulatedTimeoutTTL {
		return timedOutcome{}, false
	}
	return o, true
}

func (h *SandboxDevHandler) storeOutcome(ctx context.Context, key string, status int, body []byte) {
	if h.rdb != nil {
		raw, _ := json.Marshal(struct {
			Status int    `json:"s"`
			Body   []byte `json:"b"`
		}{status, body})
		_ = h.rdb.Set(ctx, "sbx:timeout:"+key, raw, simulatedTimeoutTTL).Err()
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	h.timeouts[key] = timedOutcome{status: status, body: body, at: time.Now()}
	for k, o := range h.timeouts { // keep the map bounded
		if time.Since(o.at) > simulatedTimeoutTTL {
			delete(h.timeouts, k)
		}
	}
}

func (h *SandboxDevHandler) principal(w http.ResponseWriter, r *http.Request, scope string) (*middleware.DeveloperPrincipal, bool) {
	p, ok := middleware.GetDeveloperPrincipal(r.Context())
	if !ok {
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "a Project key is required")
		return nil, false
	}
	if !env.Parse(p.Environment).IsSandbox() {
		apierror.Respond(w, r, http.StatusForbidden, "SANDBOX_ONLY", "Sandbox test data exists only in the Sandbox")
		return nil, false
	}
	if !p.HasScope(scope) {
		apierror.Respond(w, r, http.StatusForbidden, "INSUFFICIENT_SCOPE", "missing required scope: "+scope)
		return nil, false
	}
	return p, true
}

// Scenarios handles GET /v1/sandbox/scenarios.
func (h *SandboxDevHandler) Scenarios(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.principal(w, r, "sandbox:read"); !ok {
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(sandboxScenarios)
}

// forward calls public-api's internal test-payer route for the key's Project
// and copies the answer.
func (h *SandboxDevHandler) forward(w http.ResponseWriter, r *http.Request, method, path string, body []byte, projectID string) (int, []byte, bool) {
	if h.publicAPI == "" || h.internalKey == "" {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "UNAVAILABLE", "Sandbox test payers are not available on this deployment")
		return 0, nil, false
	}
	status, raw, err := h.callPublicAPI(r.Context(), method, path, body, projectID, r.URL.Query().Get("include_retired") == "true")
	if err != nil {
		apierror.Respond(w, r, http.StatusBadGateway, "UPSTREAM_ERROR", "the Sandbox test payer service did not answer")
		return 0, nil, false
	}
	return status, raw, true
}

// callPublicAPI makes one call to public-api's internal test-payer routes.
func (h *SandboxDevHandler) callPublicAPI(ctx context.Context, method, path string, body []byte, projectID string, includeRetired bool) (int, []byte, error) {
	u := h.publicAPI + "/internal/v1/sandbox/test-payers" + path
	q := url.Values{"project_id": {projectID}}
	if includeRetired {
		q.Set("include_retired", "true")
	}
	req, err := http.NewRequestWithContext(ctx, method, u+"?"+q.Encode(), bytes.NewReader(body))
	if err != nil {
		return 0, nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Key", h.internalKey)
	resp, err := h.http.Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	return resp.StatusCode, raw, nil
}

func writeSandboxRaw(w http.ResponseWriter, status int, raw []byte) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write(raw)
}

func readBody(w http.ResponseWriter, r *http.Request) ([]byte, bool) {
	b, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 16<<10))
	if err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "request body too large or unreadable")
		return nil, false
	}
	return b, true
}

// CreateTestPayer handles POST /v1/sandbox/test-payers.
func (h *SandboxDevHandler) CreateTestPayer(w http.ResponseWriter, r *http.Request) {
	p, ok := h.principal(w, r, "sandbox:write")
	if !ok {
		return
	}
	// Decoded here, so only the documented fields ever reach public-api.
	var in struct {
		Label               *string `json:"label"`
		InitialBalanceMinor *int64  `json:"initial_balance_minor"`
	}
	raw, ok := readBody(w, r)
	if !ok {
		return
	}
	if len(bytes.TrimSpace(raw)) > 0 {
		dec := json.NewDecoder(bytes.NewReader(raw))
		dec.DisallowUnknownFields()
		if err := dec.Decode(&in); err != nil {
			apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "body may carry only label and initial_balance_minor")
			return
		}
	}
	body, _ := json.Marshal(map[string]any{"label": in.Label, "initial_balance_minor": in.InitialBalanceMinor})
	if status, raw, ok := h.forward(w, r, http.MethodPost, "", body, p.ProjectID); ok {
		writeSandboxRaw(w, status, raw)
	}
}

// ListTestPayers handles GET /v1/sandbox/test-payers.
func (h *SandboxDevHandler) ListTestPayers(w http.ResponseWriter, r *http.Request) {
	p, ok := h.principal(w, r, "sandbox:read")
	if !ok {
		return
	}
	if status, raw, ok := h.forward(w, r, http.MethodGet, "", nil, p.ProjectID); ok {
		writeSandboxRaw(w, status, raw)
	}
}

// GetTestPayer handles GET /v1/sandbox/test-payers/{id}.
func (h *SandboxDevHandler) GetTestPayer(w http.ResponseWriter, r *http.Request) {
	p, ok := h.principal(w, r, "sandbox:read")
	if !ok {
		return
	}
	if status, raw, ok := h.forward(w, r, http.MethodGet, "/"+url.PathEscape(chi.URLParam(r, "id")), nil, p.ProjectID); ok {
		writeSandboxRaw(w, status, raw)
	}
}

// RetireTestPayer handles DELETE /v1/sandbox/test-payers/{id}.
func (h *SandboxDevHandler) RetireTestPayer(w http.ResponseWriter, r *http.Request) {
	p, ok := h.principal(w, r, "sandbox:write")
	if !ok {
		return
	}
	if status, raw, ok := h.forward(w, r, http.MethodDelete, "/"+url.PathEscape(chi.URLParam(r, "id")), nil, p.ProjectID); ok {
		writeSandboxRaw(w, status, raw)
	}
}

// FundTestPayer handles POST /v1/sandbox/test-payers/{id}/fund. The
// Idempotency-Key header is the top-up's key.
func (h *SandboxDevHandler) FundTestPayer(w http.ResponseWriter, r *http.Request) {
	p, ok := h.principal(w, r, "sandbox:write")
	if !ok {
		return
	}
	var in struct {
		AmountMinor int64 `json:"amount_minor"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&in); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "body must be {\"amount_minor\": …}")
		return
	}
	key := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	if key == "" {
		apierror.Respond(w, r, http.StatusBadRequest, "IDEMPOTENCY_KEY_REQUIRED", "send an Idempotency-Key header with a top-up")
		return
	}
	b, _ := json.Marshal(map[string]any{"amount_minor": in.AmountMinor, "idempotency_key": key})
	if status, raw, ok := h.forward(w, r, http.MethodPost, "/"+url.PathEscape(chi.URLParam(r, "id"))+"/fund", b, p.ProjectID); ok {
		writeSandboxRaw(w, status, raw)
	}
}

// Simulated rail outcomes a test-payer payment may request.
const (
	SimulateDeclined            = "DECLINED"
	SimulateProviderUnavailable = "PROVIDER_UNAVAILABLE"
	SimulateTimeout             = "TIMEOUT"
	// SimulateDelayed answers 202 PENDING at once and completes the payment
	// SandboxDelayedCompletion later, on its own: the outcome reaches the client
	// by the webhook, the realtime stream, a read of the session, or a repeat
	// of the request with the same Idempotency-Key.
	SimulateDelayed = "DELAYED"
)

// PayAsTestPayer handles POST /v1/sandbox/test-payers/{id}/payments.
//
//	{ "payment_session_id": "…", "via": "LINK" | "QR" }   or
//	{ "payment_link_id": "…" }
//	  + "amount_minor" for an open amount, + "simulate" for a rail outcome
func (h *SandboxDevHandler) PayAsTestPayer(w http.ResponseWriter, r *http.Request) {
	p, ok := h.principal(w, r, "sandbox:write")
	if !ok {
		return
	}
	var in struct {
		PaymentSessionID string `json:"payment_session_id"`
		PaymentLinkID    string `json:"payment_link_id"`
		Via              string `json:"via"`
		AmountMinor      *int64 `json:"amount_minor"`
		Simulate         string `json:"simulate"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&in); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "request body must be valid JSON")
		return
	}
	if (in.PaymentSessionID == "") == (in.PaymentLinkID == "") {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_PARAM", "name exactly one of payment_session_id or payment_link_id")
		return
	}
	if !p.Bound || p.MerchantID == "" {
		apierror.Respond(w, r, http.StatusForbidden, "PAYMENTS_UNAVAILABLE", "this project has no Financial Setup")
		return
	}
	key := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	cacheKey := p.ProjectID + "|" + key

	// A repeat after a simulated timeout, with the same key — with or without
	// simulate, so a client's automatic retry of the 503 also lands here —
	// reads the real result instead of paying again.
	if key != "" {
		if o, found := h.storedOutcome(r.Context(), cacheKey); found {
			w.Header().Set("Idempotent-Replayed", "true")
			if o.status == http.StatusAccepted {
				w.Header().Set(middleware.IdempotencyOutcomeHeader, middleware.IdempotencyOutcomePending)
			}
			writeSandboxRaw(w, o.status, o.body)
			return
		}
	}

	switch in.Simulate {
	case "":
	case SimulateDeclined:
		writeJSON(w, http.StatusPaymentRequired, map[string]any{
			"code": "PAYMENT_DECLINED", "message": "Sandbox simulation: the external rail declined this payment. Nothing moved.",
			"simulated": true, "request_id": w.Header().Get("X-Request-ID"),
		})
		return
	case SimulateProviderUnavailable:
		w.Header().Set("Retry-After", "30")
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{
			"code": "PROVIDER_UNAVAILABLE", "message": "Sandbox simulation: the external provider is unavailable. Nothing moved; retry later.",
			"simulated": true, "request_id": w.Header().Get("X-Request-ID"),
		})
		return
	case SimulateTimeout, SimulateDelayed:
		if key == "" {
			apierror.Respond(w, r, http.StatusBadRequest, "IDEMPOTENCY_KEY_REQUIRED",
				"simulate "+in.Simulate+" needs an Idempotency-Key, so a repeat can read the real result")
			return
		}
	default:
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_PARAM", "simulate must be DECLINED, PROVIDER_UNAVAILABLE, TIMEOUT or DELAYED")
		return
	}

	// Resolve what is being paid, and that it is this Project's own.
	target := map[string]any{"amount_minor": in.AmountMinor}
	if in.PaymentSessionID != "" {
		s, err := h.sessions.Get(r.Context(), in.PaymentSessionID)
		if err != nil || s == nil || s.MerchantID != p.MerchantID {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "payment session not found")
			return
		}
		switch strings.ToUpper(in.Via) {
		case "", "LINK":
			if s.PaymentLinkSlug == nil || *s.PaymentLinkSlug == "" {
				apierror.Respond(w, r, http.StatusUnprocessableEntity, "INTERFACE_UNAVAILABLE", "this session has no payment link")
				return
			}
			target["payment_link_slug"] = *s.PaymentLinkSlug
		case "QR":
			payload := ""
			if s.QrPayload != nil {
				payload = *s.QrPayload
			}
			if payload == "" && s.QrCodeID != nil && *s.QrCodeID != "" && h.qrs != nil {
				if q, qerr := h.qrs.Get(r.Context(), *s.QrCodeID); qerr == nil && q != nil {
					payload = q.Payload
				}
			}
			if payload == "" {
				apierror.Respond(w, r, http.StatusUnprocessableEntity, "INTERFACE_UNAVAILABLE", "this session has no dynamic QR (open-amount sessions are paid by link)")
				return
			}
			target["qr_payload"] = payload
			target["idempotency_key"] = "sbx-qr-" + p.ProjectID + "-" + in.PaymentSessionID
		default:
			apierror.Respond(w, r, http.StatusBadRequest, "INVALID_PARAM", "via must be LINK or QR")
			return
		}
	} else {
		l, err := h.links.Get(r.Context(), in.PaymentLinkID)
		if err != nil || l == nil || l.MerchantID != p.MerchantID {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "payment link not found")
			return
		}
		target["payment_link_slug"] = l.Slug
	}
	b, _ := json.Marshal(target)
	payerID := chi.URLParam(r, "id")
	if in.Simulate == SimulateDelayed {
		via := "LINK"
		if _, isQR := target["qr_payload"]; isQR {
			via = "QR"
		}
		h.acceptDelayed(w, r, delayedPayment{
			CacheKey: cacheKey, ProjectID: p.ProjectID, PayerID: payerID, Body: b, Via: via,
			SessionID: in.PaymentSessionID, LinkID: in.PaymentLinkID,
		})
		return
	}
	status, raw, ok := h.forward(w, r, http.MethodPost, "/"+url.PathEscape(payerID)+"/payments", b, p.ProjectID)
	if !ok {
		return
	}
	if status >= 200 && status < 300 {
		via := "LINK"
		if _, isQR := target["qr_payload"]; isQR {
			via = "QR"
		}
		raw = testPaymentResult(raw, payerID, via, in.PaymentSessionID, in.PaymentLinkID)
		raw = h.withReceipt(r.Context(), raw)
	}
	if in.Simulate == SimulateTimeout {
		h.storeOutcome(r.Context(), cacheKey, status, raw)
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{
			"code": "SANDBOX_SIMULATED_TIMEOUT",
			"message": "Sandbox simulation: no answer arrived in time. The outcome is unknown to the client — " +
				"repeat the same request with the same Idempotency-Key to read it.",
			"simulated": true, "request_id": w.Header().Get("X-Request-ID"),
		})
		return
	}
	writeSandboxRaw(w, status, raw)
}

// testPaymentResult gives a test-payer payment ONE response shape whichever
// consumer path paid it (the link view or the QR payment), with nothing about
// the payee the developer does not already own.
func testPaymentResult(raw []byte, payerID, via, sessionID, linkID string) []byte {
	var in struct {
		TransferID    string  `json:"transfer_id"`
		TransactionID string  `json:"transaction_id"`
		AmountMinor   *int64  `json:"amount_minor"`
		Currency      string  `json:"currency"`
		PaidAt        *string `json:"paid_at"`
		Receipt       *struct {
			ProofReference string `json:"proof_reference"`
		} `json:"receipt"`
	}
	_ = json.Unmarshal(raw, &in)
	out := map[string]any{
		"test_payer_id": payerID,
		"via":           via,
		"status":        "PAID",
		"transfer_id":   firstNonEmpty(in.TransferID, in.TransactionID),
		"amount_minor":  in.AmountMinor,
		"currency":      in.Currency,
		"paid_at":       in.PaidAt,
		"simulated":     false,
	}
	if sessionID != "" {
		out["payment_session_id"] = sessionID
	}
	if linkID != "" {
		out["payment_link_id"] = linkID
	}
	if in.Receipt != nil && in.Receipt.ProofReference != "" {
		out["proof_reference"] = in.Receipt.ProofReference
	} else {
		out["proof_reference"] = nil
	}
	b, _ := json.Marshal(out)
	return b
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if v != "" {
			return v
		}
	}
	return ""
}

// withReceipt fills proof_reference from the transfer's canonical receipt when
// the paying path did not return one (the QR path returns none). Best-effort:
// a receipt that cannot be established now leaves proof_reference null, as the
// consumer app's own path does.
func (h *SandboxDevHandler) withReceipt(ctx context.Context, raw []byte) []byte {
	if h.receipts == nil {
		return raw
	}
	var out map[string]any
	if json.Unmarshal(raw, &out) != nil || out["proof_reference"] != nil {
		return raw
	}
	tid, _ := out["transfer_id"].(string)
	if tid == "" {
		return raw
	}
	rctx, cancel := context.WithTimeout(ctx, 4*time.Second)
	defer cancel()
	rec, err := h.receipts.TransferReceipt(rctx, tid, "SANDBOX", true)
	if err != nil || rec.ProofReference == "" {
		return raw
	}
	out["proof_reference"] = rec.ProofReference
	b, _ := json.Marshal(out)
	return b
}

// acceptDelayed answers 202 PENDING, remembers that answer under the
// Idempotency-Key (a repeat reads it until the payment completes, then reads
// the real result) and queues the completion.
func (h *SandboxDevHandler) acceptDelayed(w http.ResponseWriter, r *http.Request, job delayedPayment) {
	pending := map[string]any{
		"test_payer_id": job.PayerID, "via": job.Via, "status": "PENDING", "simulated": true,
		"completes_after_seconds": int(math.Ceil(h.delay.Seconds())),
		"message": "Sandbox simulation: accepted and not yet complete. It completes on its own — watch the webhook, the realtime stream " +
			"or the session, or repeat this request with the same Idempotency-Key.",
		"request_id": w.Header().Get("X-Request-ID"),
	}
	if job.SessionID != "" {
		pending["payment_session_id"] = job.SessionID
	} else {
		pending["payment_link_id"] = job.LinkID
	}
	body, _ := json.Marshal(pending)
	h.storeOutcome(r.Context(), job.CacheKey, http.StatusAccepted, body)
	due := time.Now().Add(h.delay)
	if h.rdb != nil {
		member, _ := json.Marshal(job)
		if err := h.rdb.ZAdd(r.Context(), sandboxDelayedQueue, redis.Z{Score: float64(due.UnixMilli()), Member: member}).Err(); err != nil {
			apierror.Respond(w, r, http.StatusServiceUnavailable, "UNAVAILABLE", "the delayed simulation could not be queued; nothing moved")
			return
		}
	} else {
		time.AfterFunc(h.delay, func() { h.completeDelayed(context.Background(), job) })
	}
	w.Header().Set(middleware.IdempotencyOutcomeHeader, middleware.IdempotencyOutcomePending)
	writeSandboxRaw(w, http.StatusAccepted, body)
}

// completeDelayed makes the queued payment through the same consumer path as an
// immediate one and stores the real result under the Idempotency-Key. A
// refusal (insufficient funds, a session paid meanwhile) is the result too.
// It reports false when public-api did not answer, so the caller may retry.
func (h *SandboxDevHandler) completeDelayed(ctx context.Context, job delayedPayment) bool {
	cctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	status, raw, err := h.callPublicAPI(cctx, http.MethodPost, "/"+url.PathEscape(job.PayerID)+"/payments", job.Body, job.ProjectID, false)
	if err != nil {
		return false
	}
	if status < 200 || status >= 300 {
		h.storeOutcome(cctx, job.CacheKey, status, raw)
		return true
	}
	// The money has moved: a repeat must stop reading PENDING now, not after the
	// receipt lookup. Store the result at once, then again with its receipt.
	raw = testPaymentResult(raw, job.PayerID, job.Via, job.SessionID, job.LinkID)
	h.storeOutcome(cctx, job.CacheKey, status, raw)
	h.storeOutcome(cctx, job.CacheKey, status, h.withReceipt(cctx, raw))
	return true
}

// RunDelayedPayments completes queued DELAYED payments as they fall due, until
// ctx ends. Several gateways may run it: ZREM decides which one owns a job.
func (h *SandboxDevHandler) RunDelayedPayments(ctx context.Context) {
	if h.rdb == nil {
		return
	}
	tick := time.NewTicker(time.Second)
	defer tick.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
		}
		due, err := h.rdb.ZRangeByScore(ctx, sandboxDelayedQueue, &redis.ZRangeBy{
			Min: "-inf", Max: strconv.FormatInt(time.Now().UnixMilli(), 10), Count: 20,
		}).Result()
		if err != nil {
			continue
		}
		for _, member := range due {
			if n, err := h.rdb.ZRem(ctx, sandboxDelayedQueue, member).Result(); err != nil || n != 1 {
				continue // another gateway took it
			}
			var job delayedPayment
			if json.Unmarshal([]byte(member), &job) != nil {
				continue
			}
			if !h.completeDelayed(ctx, job) && job.Attempts < 3 {
				job.Attempts++
				again, _ := json.Marshal(job)
				_ = h.rdb.ZAdd(ctx, sandboxDelayedQueue, redis.Z{Score: float64(time.Now().Add(5 * time.Second).UnixMilli()), Member: again}).Err()
			}
		}
	}
}
