package handler_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/handler"
	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// A6-11 — internal error text is never written into a response body.
//
// These handlers answered a failure with err.Error(): the transport error names
// core's internal address ("core-api transport: Post \"http://…\": dial tcp …"),
// and a core 5xx carries core's own database error. One of them — InitiatePay —
// is anonymous (POST /v1/public/pay/{slug}/pay). Every surface is driven here
// by a REAL core client pointed at an address nothing listens on, so the error
// is the genuine article, and by a core that answers 500 with database text.

// deadCore is a core client whose every call fails at the transport.
func deadCore() *service.CoreApiClient {
	return service.NewCoreApiClient("http://127.0.0.1:1", "test-internal-key")
}

// dbErrorText is what core's 5xx envelope carried on the database path.
const dbErrorText = `duplicate key value violates unique constraint "acquiring_payments_pkey"`

// failingCore answers every request 500 with core's database text in the body.
func failingCore(t *testing.T) *service.CoreApiClient {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(`{"error":{"code":"INTERNAL","message":"` + strings.ReplaceAll(dbErrorText, `"`, `\"`) + `"}}`))
	}))
	t.Cleanup(srv.Close)
	return service.NewCoreApiClient(srv.URL, "test-internal-key")
}

// assertNoInternalText fails when any fragment of the upstream error reached
// the caller, and when the answer is not a stable code.
func assertNoInternalText(t *testing.T, w *httptest.ResponseRecorder, wantStatus int, wantCode string) {
	t.Helper()
	body := w.Body.String()
	for _, leak := range []string{"dial tcp", "127.0.0.1", "connection refused", "core-api", "transport", "duplicate key", "acquiring_payments_pkey"} {
		if strings.Contains(body, leak) {
			t.Fatalf("response body carries internal error text %q: %s", leak, body)
		}
	}
	if w.Code != wantStatus {
		t.Fatalf("status = %d, want %d (body %s)", w.Code, wantStatus, body)
	}
	if code := decodeError(t, w.Body).Code; code != wantCode {
		t.Fatalf("code = %q, want %q", code, wantCode)
	}
}

// activeLink resolves every slug to an ACTIVE fixed-amount link.
type activeLink struct{}

func (activeLink) link() *service.PaymentLink {
	amount := int64(250000)
	return &service.PaymentLink{ID: linkID, Slug: "abc123", MerchantID: ownerID, WalletID: "w1", Currency: "AOA", Status: "ACTIVE", AmountMinor: &amount}
}
func (a activeLink) Create(context.Context, service.CreatePaymentLinkRequest) (*service.PaymentLink, error) {
	return a.link(), nil
}
func (a activeLink) Get(context.Context, string) (*service.PaymentLink, error) { return a.link(), nil }
func (a activeLink) GetBySlug(context.Context, string) (*service.PaymentLink, error) {
	return a.link(), nil
}
func (a activeLink) List(context.Context, service.ListPaymentLinksRequest) (*service.PaymentLinkListPage, error) {
	return &service.PaymentLinkListPage{}, nil
}
func (a activeLink) Cancel(context.Context, string) (*service.PaymentLink, error) {
	return a.link(), nil
}
func (a activeLink) MarkUsed(context.Context, string) (*service.PaymentLink, error) {
	return a.link(), nil
}

func payAnonymously(h *handler.AcquiringHandler) *httptest.ResponseRecorder {
	r := chi.NewRouter()
	r.Post("/v1/public/pay/{slug}/pay", h.InitiatePay)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/v1/public/pay/abc123/pay", strings.NewReader(`{}`)))
	return w
}

func TestInitiatePay_CoreTransportErrorTextNeverReachesTheAnonymousCaller(t *testing.T) {
	h := handler.NewAcquiringHandler(service.NewCoreApiAcquiringService(deadCore()), activeLink{}, nil, service.NewStubWebhookService())
	assertNoInternalText(t, payAnonymously(h), http.StatusBadGateway, "UPSTREAM_ERROR")
}

func TestInitiatePay_CoreDatabaseErrorTextNeverReachesTheAnonymousCaller(t *testing.T) {
	h := handler.NewAcquiringHandler(service.NewCoreApiAcquiringService(failingCore(t)), activeLink{}, nil, service.NewStubWebhookService())
	assertNoInternalText(t, payAnonymously(h), http.StatusBadGateway, "UPSTREAM_ERROR")
}

// evidenceToDeadCore owns the dispute but submits evidence to a core that is down.
type evidenceToDeadCore struct {
	*disputeSpy
	core *service.CoreApiDisputeService
}

func (e evidenceToDeadCore) SubmitEvidence(ctx context.Context, req service.SubmitEvidenceRequest) (*service.DisputeEvidence, error) {
	return e.core.SubmitEvidence(ctx, req)
}

func TestDisputeEvidence_CoreTransportErrorTextNeverInBody(t *testing.T) {
	h := handler.NewDisputeHandler(evidenceToDeadCore{disputeSpy: ownedDispute(), core: service.NewCoreApiDisputeService(deadCore())})
	w := httptest.NewRecorder()
	h.SubmitEvidence(w, withRouteID(withMerchant(httptest.NewRequest(http.MethodPost, "/",
		strings.NewReader(`{"submitted_by":"x","party":"MERCHANT","description":"d"}`)), ownerID), linkID))
	assertNoInternalText(t, w, http.StatusBadGateway, "UPSTREAM_ERROR")
}

func sandboxPost(body string) *http.Request {
	r := httptest.NewRequest(http.MethodPost, "/v1/sandbox/x", strings.NewReader(body))
	return r.WithContext(middleware.ContextWithPrincipal(r.Context(), &middleware.Principal{MerchantID: ownerID, Environment: "SANDBOX"}))
}

func TestSandboxSimulate_CoreTransportErrorTextNeverInBody(t *testing.T) {
	h := handler.NewSandboxHandler(service.NewCoreApiTransactionService(deadCore()), nil)
	w := httptest.NewRecorder()
	h.SimulatePayment(w, sandboxPost(`{"amount_minor":1000}`))
	assertNoInternalText(t, w, http.StatusBadGateway, "UPSTREAM_ERROR")
}

// fundToDeadCore finds the wallet but funds it through a core that is down.
type fundToDeadCore struct {
	service.WalletService
	core *service.CoreApiWalletService
}

func (f fundToDeadCore) GetForMerchant(context.Context, string, string) (*service.WalletRecord, error) {
	return &service.WalletRecord{ID: "w1"}, nil
}
func (f fundToDeadCore) SandboxFund(ctx context.Context, walletID string, amount int64, currency, key string) (*service.WalletBalance, error) {
	return f.core.SandboxFund(ctx, walletID, amount, currency, key)
}

func TestSandboxFund_CoreTransportErrorTextNeverInBody(t *testing.T) {
	h := handler.NewSandboxHandler(nil, fundToDeadCore{core: service.NewCoreApiWalletService(deadCore())})
	w := httptest.NewRecorder()
	h.FundWallet(w, sandboxPost(`{"amount_minor":1000}`))
	assertNoInternalText(t, w, http.StatusBadGateway, "UPSTREAM_ERROR")
}

// teamDBDown fails an invite the way the Postgres service does when the
// database is unreachable.
type teamDBDown struct{ service.TeamService }

func (teamDBDown) InviteMember(context.Context, string, string, string) (*service.TeamMember, error) {
	return nil, &dbDialError{}
}

// dbDialError carries the text of a pgx dial failure.
type dbDialError struct{}

func (*dbDialError) Error() string {
	return "invite team member: failed to connect to `host=127.0.0.1 user=banzami database=banzami`: dial tcp 127.0.0.1:5432: connect: connection refused"
}

func TestTeamInvite_DatabaseErrorTextNeverInBody(t *testing.T) {
	h := handler.NewTeamHandler(teamDBDown{})
	w := httptest.NewRecorder()
	h.Invite(w, withMerchant(httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"email":"a@b.co","role":"VIEWER"}`)), ownerID))
	assertNoInternalText(t, w, http.StatusInternalServerError, "INTERNAL_ERROR")
}

// The one caller mistake the default branch used to cover is still named.
type teamBadEmail struct{ service.TeamService }

func (teamBadEmail) InviteMember(context.Context, string, string, string) (*service.TeamMember, error) {
	return nil, service.ErrInvalidMemberEmail
}

func TestTeamInvite_InvalidEmailIsStillTheCallersMistake(t *testing.T) {
	h := handler.NewTeamHandler(teamBadEmail{})
	w := httptest.NewRecorder()
	h.Invite(w, withMerchant(httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"email":"nope"}`)), ownerID))
	if w.Code != http.StatusBadRequest || decodeError(t, w.Body).Code != "INVALID_EMAIL" {
		t.Fatalf("invalid email: %d %s", w.Code, w.Body.String())
	}
}

// paymentRequestsDown answers every call through a core that is down.
func TestPaymentRequests_CoreTransportErrorTextNeverInBody(t *testing.T) {
	h := handler.NewPaymentRequestHandler(service.NewCoreApiPaymentRequestService(deadCore()))
	for name, call := range map[string]func(w http.ResponseWriter){
		"create": func(w http.ResponseWriter) {
			h.Create(w, httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"requester_id":"a","payer_id":"b","amount_minor":100,"idempotency_key":"k"}`)))
		},
		"pay": func(w http.ResponseWriter) {
			h.Pay(w, withRouteID(httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"payer_id":"b","idempotency_key":"k"}`)), linkID))
		},
		"decline": func(w http.ResponseWriter) {
			h.Decline(w, withRouteID(httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"payer_id":"b"}`)), linkID))
		},
		"cancel": func(w http.ResponseWriter) {
			h.Cancel(w, withRouteID(httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"requester_id":"a"}`)), linkID))
		},
	} {
		t.Run(name, func(t *testing.T) {
			w := httptest.NewRecorder()
			call(w)
			assertNoInternalText(t, w, http.StatusBadGateway, "UPSTREAM_ERROR")
		})
	}
}
