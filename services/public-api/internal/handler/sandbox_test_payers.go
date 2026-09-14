package handler

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"math/big"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/common/env"
	"github.com/banzami/banzami/services/public-api/internal/apierror"
	"github.com/banzami/banzami/services/public-api/internal/middleware"
	"github.com/banzami/banzami/services/public-api/internal/service"
)

// Sandbox test payers — the internal half (ADR-060 §4).
//
// Reached only from the gateway, with the internal key, and only in the Sandbox.
// The gateway authenticates the Project key and passes the Project id; this
// service never accepts a Project id from a developer.
//
// A payment by a test payer runs the SAME handler a person's wallet uses
// (PaymentLinkHandler.Pay, QrPayHandler.Pay), invoked with the payer as the
// authenticated consumer. There is no second payment implementation.

type TestPayerHandler struct {
	core        *service.CorePublicClient
	creds       *service.CredentialStore
	store       *service.TestPayerStore
	environment string
	payLink     http.HandlerFunc
	payQr       http.HandlerFunc
}

func NewTestPayerHandler(core *service.CorePublicClient, creds *service.CredentialStore, store *service.TestPayerStore,
	environment string, payLink, payQr http.HandlerFunc) *TestPayerHandler {
	return &TestPayerHandler{core: core, creds: creds, store: store, environment: environment, payLink: payLink, payQr: payQr}
}

var uuidShape = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

type testPayerView struct {
	ID           string     `json:"id"`
	Handle       string     `json:"handle"`
	Label        *string    `json:"label"`
	Status       string     `json:"status"`
	BalanceMinor *int64     `json:"balance_minor"`
	Currency     string     `json:"currency"`
	Environment  string     `json:"environment"`
	CreatedAt    time.Time  `json:"created_at"`
	RetiredAt    *time.Time `json:"retired_at"`
}

func (h *TestPayerHandler) sandboxOnly(w http.ResponseWriter, r *http.Request) (string, bool) {
	if !env.Parse(h.environment).IsSandbox() {
		apierror.Respond(w, r, http.StatusForbidden, "SANDBOX_ONLY", "test payers exist only in the Sandbox")
		return "", false
	}
	project := r.URL.Query().Get("project_id")
	if project == "" {
		project = r.Header.Get("X-Banzami-Project-Id")
	}
	if !uuidShape.MatchString(project) {
		apierror.Respond(w, r, http.StatusBadRequest, "PROJECT_REQUIRED", "project_id is required")
		return "", false
	}
	return project, true
}

func (h *TestPayerHandler) view(ctx context.Context, p *service.TestPayer) testPayerView {
	v := testPayerView{ID: p.ConsumerID, Handle: p.Handle, Label: p.Label, Status: "ACTIVE", Currency: "AOA",
		Environment: "SANDBOX", CreatedAt: p.CreatedAt, RetiredAt: p.RetiredAt}
	if p.RetiredAt != nil {
		v.Status = "RETIRED"
	} else if p.Status != "ACTIVE" {
		v.Status = p.Status
	}
	if wallet, err := h.core.GetWalletForConsumer(ctx, p.ConsumerID, "AOA"); err == nil && wallet != nil {
		if bal, err := h.core.GetWalletBalance(ctx, wallet.ID); err == nil && bal != nil {
			b := bal.AvailableMinor
			v.BalanceMinor = &b
		}
	}
	return v
}

func randomString(alphabet string, n int) string {
	out := make([]byte, n)
	for i := range out {
		idx, _ := rand.Int(rand.Reader, big.NewInt(int64(len(alphabet))))
		out[i] = alphabet[idx.Int64()]
	}
	return string(out)
}

// POST /internal/v1/sandbox/test-payers?project_id=…   {label?, initial_balance_minor?}
func (h *TestPayerHandler) Create(w http.ResponseWriter, r *http.Request) {
	project, ok := h.sandboxOnly(w, r)
	if !ok {
		return
	}
	var body struct {
		Label               *string `json:"label"`
		InitialBalanceMinor *int64  `json:"initial_balance_minor"`
	}
	if r.ContentLength != 0 {
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&body); err != nil {
			apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "request body must be valid JSON")
			return
		}
	}
	if body.Label != nil {
		l := strings.TrimSpace(*body.Label)
		if len([]rune(l)) > 60 {
			apierror.Respond(w, r, http.StatusBadRequest, "INVALID_PARAM", "label is at most 60 characters")
			return
		}
		body.Label = &l
	}
	grant := int64(service.TestPayerGrantMinor)
	if body.InitialBalanceMinor != nil {
		if *body.InitialBalanceMinor < 0 || *body.InitialBalanceMinor > service.TestPayerGrantMinor {
			apierror.Respond(w, r, http.StatusBadRequest, "INVALID_PARAM", "initial_balance_minor must be between 0 and 1000000")
			return
		}
		grant = *body.InitialBalanceMinor
	}
	n, err := h.store.CountActive(r.Context(), project)
	if err != nil {
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not read test payers")
		return
	}
	if n >= service.TestPayerMaxActivePerProject {
		apierror.Respond(w, r, http.StatusTooManyRequests, "SANDBOX_QUOTA_EXCEEDED",
			"a Project has at most 10 active test payers — retire one to create another")
		return
	}

	display := "Sandbox test payer"
	var consumer *service.ConsumerRecord
	var handle string
	for attempt := 0; attempt < 3; attempt++ {
		handle = "tp" + randomString("abcdefghijklmnopqrstuvwxyz0123456789", 10)
		consumer, err = h.core.CreateConsumer(r.Context(), handle, &display)
		if !errors.Is(err, service.ErrHandleTaken) {
			break
		}
	}
	if err != nil || consumer == nil {
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not create the test payer")
		return
	}
	// The credential row gives the payer a handle like any consumer's. Its secret
	// is random and never returned: a test payer does not sign in (ADR-060 §4).
	if err := h.creds.Save(r.Context(), consumer.ID, handle, randomString("abcdefghijklmnopqrstuvwxyz0123456789", 32)); err != nil {
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not save the test payer's credentials")
		return
	}
	if _, err := h.core.GetOrCreateWallet(r.Context(), consumer.ID, "AOA"); err != nil {
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not open the test payer's wallet")
		return
	}
	// Ownership before the grant: Core recognises a test payer by this row.
	if err := h.store.Record(r.Context(), consumer.ID, project, body.Label); err != nil {
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not record the test payer")
		return
	}
	if grant > 0 {
		key := "grant-" + consumer.ID
		if _, rerr := h.store.ReserveTopUp(r.Context(), project, consumer.ID, grant, "GRANT", key); rerr == nil {
			if _, cerr := h.core.SandboxCreditConsumer(r.Context(), consumer.ID, grant, "AOA", "tp-"+key); cerr != nil {
				h.store.ReleaseTopUp(r.Context(), project, key)
				apierror.Respond(w, r, http.StatusUnprocessableEntity, "SANDBOX_FUNDING_REFUSED",
					"the test payer was created but its initial balance was refused: "+refusalCode(cerr))
				return
			}
		}
	}
	p, err := h.store.Get(r.Context(), project, consumer.ID)
	if err != nil {
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not read the test payer")
		return
	}
	respond(w, http.StatusCreated, h.view(r.Context(), p))
}

func refusalCode(err error) string {
	if code, ok := sandboxCreditRefusal(err); ok {
		return code
	}
	return "UNAVAILABLE"
}

// GET /internal/v1/sandbox/test-payers?project_id=…&include_retired=true
func (h *TestPayerHandler) List(w http.ResponseWriter, r *http.Request) {
	project, ok := h.sandboxOnly(w, r)
	if !ok {
		return
	}
	payers, err := h.store.List(r.Context(), project, r.URL.Query().Get("include_retired") == "true")
	if err != nil {
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not read test payers")
		return
	}
	out := make([]testPayerView, 0, len(payers))
	for i := range payers {
		out = append(out, h.view(r.Context(), &payers[i]))
	}
	respond(w, http.StatusOK, map[string]any{"data": out})
}

func (h *TestPayerHandler) owned(w http.ResponseWriter, r *http.Request) (string, *service.TestPayer, bool) {
	project, ok := h.sandboxOnly(w, r)
	if !ok {
		return "", nil, false
	}
	id := chi.URLParam(r, "id")
	if !uuidShape.MatchString(id) {
		apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "test payer not found")
		return "", nil, false
	}
	p, err := h.store.Get(r.Context(), project, id)
	if errors.Is(err, service.ErrTestPayerNotFound) {
		apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "test payer not found")
		return "", nil, false
	}
	if err != nil {
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not read the test payer")
		return "", nil, false
	}
	return project, p, true
}

// GET /internal/v1/sandbox/test-payers/{id}?project_id=…
func (h *TestPayerHandler) Get(w http.ResponseWriter, r *http.Request) {
	_, p, ok := h.owned(w, r)
	if !ok {
		return
	}
	respond(w, http.StatusOK, h.view(r.Context(), p))
}

// POST /internal/v1/sandbox/test-payers/{id}/fund?project_id=…   {amount_minor, idempotency_key}
func (h *TestPayerHandler) Fund(w http.ResponseWriter, r *http.Request) {
	project, p, ok := h.owned(w, r)
	if !ok {
		return
	}
	if p.RetiredAt != nil {
		apierror.Respond(w, r, http.StatusUnprocessableEntity, "TEST_PAYER_RETIRED", "this test payer is retired")
		return
	}
	var body struct {
		AmountMinor    int64  `json:"amount_minor"`
		IdempotencyKey string `json:"idempotency_key"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "request body must be valid JSON")
		return
	}
	if body.AmountMinor <= 0 || body.AmountMinor > service.TestPayerMaxTopUpMinor {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_PARAM", "amount_minor must be between 1 and 2500000")
		return
	}
	key := strings.TrimSpace(body.IdempotencyKey)
	if key == "" || len(key) > 120 {
		apierror.Respond(w, r, http.StatusBadRequest, "IDEMPOTENCY_KEY_REQUIRED", "an idempotency key is required for a top-up")
		return
	}
	replay, err := h.store.ReserveTopUp(r.Context(), project, p.ConsumerID, body.AmountMinor, "TOP_UP", key)
	switch {
	case errors.Is(err, service.ErrTestPayerQuota):
		apierror.Respond(w, r, http.StatusTooManyRequests, "SANDBOX_QUOTA_EXCEEDED",
			"a Project may add at most 20 top-ups and 100 000 Kz of fictitious value per 24 hours")
		return
	case errors.Is(err, service.ErrFundingKeyReused):
		apierror.Respond(w, r, http.StatusConflict, "IDEMPOTENCY_KEY_REUSED", "this idempotency key was used for a different top-up")
		return
	case err != nil:
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not record the top-up")
		return
	}
	if _, cerr := h.core.SandboxCreditConsumer(r.Context(), p.ConsumerID, body.AmountMinor, "AOA", "tp-topup-"+p.ConsumerID+"-"+key); cerr != nil {
		if !replay {
			h.store.ReleaseTopUp(r.Context(), project, key)
		}
		apierror.Respond(w, r, http.StatusUnprocessableEntity, "SANDBOX_FUNDING_REFUSED", "the top-up was refused: "+refusalCode(cerr))
		return
	}
	respond(w, http.StatusOK, h.view(r.Context(), p))
}

// POST /internal/v1/sandbox/test-payers/{id}/payments?project_id=…
// {payment_link_slug | qr_payload, amount_minor?, idempotency_key?}
func (h *TestPayerHandler) Pay(w http.ResponseWriter, r *http.Request) {
	_, p, ok := h.owned(w, r)
	if !ok {
		return
	}
	if p.RetiredAt != nil {
		apierror.Respond(w, r, http.StatusUnprocessableEntity, "TEST_PAYER_RETIRED", "this test payer is retired")
		return
	}
	var body struct {
		PaymentLinkSlug string `json:"payment_link_slug"`
		QrPayload       string `json:"qr_payload"`
		AmountMinor     *int64 `json:"amount_minor"`
		IdempotencyKey  string `json:"idempotency_key"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "request body must be valid JSON")
		return
	}
	if (body.PaymentLinkSlug == "") == (body.QrPayload == "") {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_PARAM", "name exactly one of payment_link_slug or qr_payload")
		return
	}
	ctx := middleware.InjectConsumer(r.Context(), &middleware.Consumer{ID: p.ConsumerID, Scopes: []string{"consumer"}})
	var inner *http.Request
	if body.PaymentLinkSlug != "" {
		b, _ := json.Marshal(map[string]any{"amount_minor": body.AmountMinor})
		inner = httptest.NewRequest(http.MethodPost, "/v1/payment-links/"+body.PaymentLinkSlug+"/pay", bytes.NewReader(b))
		rctx := chi.NewRouteContext()
		rctx.URLParams.Add("slug", body.PaymentLinkSlug)
		ctx = context.WithValue(ctx, chi.RouteCtxKey, rctx)
	} else {
		in := map[string]any{"payload": body.QrPayload, "amount_minor": body.AmountMinor}
		if body.IdempotencyKey != "" {
			in["idempotency_key"] = body.IdempotencyKey
		}
		b, _ := json.Marshal(in)
		inner = httptest.NewRequest(http.MethodPost, "/v1/qr/pay", bytes.NewReader(b))
	}
	inner = inner.WithContext(ctx)
	inner.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	if body.PaymentLinkSlug != "" {
		h.payLink(rec, inner)
	} else {
		h.payQr(rec, inner)
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(rec.Code)
	_, _ = w.Write(rec.Body.Bytes())
}

// DELETE /internal/v1/sandbox/test-payers/{id}?project_id=…
func (h *TestPayerHandler) Retire(w http.ResponseWriter, r *http.Request) {
	project, p, ok := h.owned(w, r)
	if !ok {
		return
	}
	if p.RetiredAt == nil {
		if err := h.core.RetireSandboxFunds(r.Context(), "CONSUMER", p.ConsumerID,
			"Sandbox test payer retired by its Project", "sandbox-test-payers", "tp-retire-"+p.ConsumerID); err != nil {
			apierror.Respond(w, r, http.StatusBadGateway, "RETIREMENT_FAILED", "the test payer's balance could not be retired; retry")
			return
		}
		if err := h.core.SuspendConsumer(r.Context(), p.ConsumerID, "Sandbox test payer retired by its Project"); err != nil &&
			!strings.Contains(err.Error(), "422") {
			apierror.Respond(w, r, http.StatusBadGateway, "RETIREMENT_FAILED", "the test payer could not be suspended; retry")
			return
		}
		if err := h.store.MarkRetired(r.Context(), project, p.ConsumerID); err != nil {
			apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not record retirement")
			return
		}
		p, _ = h.store.Get(r.Context(), project, p.ConsumerID)
	}
	respond(w, http.StatusOK, h.view(r.Context(), p))
}
