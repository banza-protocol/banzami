package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// publicLinkGet serves GET /public/pay/{slug} from h and decodes the body.
func publicLinkGet(t *testing.T, h *PaymentLinkHandler) (int, map[string]any, string) {
	t.Helper()
	r := chi.NewRouter()
	r.Get("/public/pay/{slug}", h.GetPublic)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/public/pay/abc123", nil))
	var body map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	return rec.Code, body, rec.Body.String()
}

// The payer is shown the Business's public identity — the name it presents and
// its @banza — never the account name a Project gave it ("Sandbox · Doa-Sandbox").
func TestPublicPaymentLink_ShowsTheBusinessPublicIdentity(t *testing.T) {
	h, _ := linkHandler(nil)
	h.identities = func(_ context.Context, merchantID string) (service.BusinessIdentity, error) {
		if merchantID != "doa-merchant" {
			t.Fatalf("identity looked up for %q, want the link's payee", merchantID)
		}
		return service.BusinessIdentity{DisplayName: "Doa", Handle: "doa"}, nil
	}

	code, body, raw := publicLinkGet(t, h)
	if code != http.StatusOK {
		t.Fatalf("status %d: %s", code, raw)
	}
	if body["merchant_name"] != "Doa" {
		t.Errorf("merchant_name = %v, want Doa", body["merchant_name"])
	}
	if body["merchant_handle"] != "doa" {
		t.Errorf("merchant_handle = %v, want doa", body["merchant_handle"])
	}
	// Payer-safe: none of the link's internal identifiers.
	for _, leak := range []string{"merchant_id", "wallet_id", "wallet_account_id", "refund_source", `"id"`} {
		if strings.Contains(raw, leak) {
			t.Errorf("public view leaks %s: %s", leak, raw)
		}
	}
	for _, id := range []string{"doa-merchant", "11111111-1111-4111-8111-111111111111", `"w1"`} {
		if strings.Contains(raw, id) {
			t.Errorf("public view carries internal id %s: %s", id, raw)
		}
	}
}

// A Business with no @banza is shown by name, with a null handle.
func TestPublicPaymentLink_NoHandleIsNull(t *testing.T) {
	h, _ := linkHandler(nil)
	h.identities = func(context.Context, string) (service.BusinessIdentity, error) {
		return service.BusinessIdentity{DisplayName: "Cantina Kilamba"}, nil
	}
	_, body, raw := publicLinkGet(t, h)
	if body["merchant_name"] != "Cantina Kilamba" {
		t.Errorf("merchant_name = %v", body["merchant_name"])
	}
	if v, present := body["merchant_handle"]; !present || v != nil {
		t.Errorf("merchant_handle must be present and null: %s", raw)
	}
}

// sessionLinks is a link service whose link is in `status` and belongs to a
// Payment Session in `session` (or fails to say, with err).
type sessionLinks struct {
	fakeLinks
	status  string
	session string
	err     error
}

func (s *sessionLinks) GetBySlug(context.Context, string) (*service.PaymentLink, error) {
	l := s.fakeLinks.link()
	l.Status = s.status
	return l, nil
}

func (s *sessionLinks) SessionStatus(_ context.Context, linkID string) (string, error) {
	if linkID != "11111111-1111-4111-8111-111111111111" {
		return "", errors.New("asked about another link")
	}
	return s.session, s.err
}

// A link retired because its Payment Session was paid by QR is reported as paid
// — on the page view and on the status poll — not as a cancelled link.
func TestPublicPaymentLink_SessionPaidByQrIsPaid(t *testing.T) {
	for _, tc := range []struct {
		name    string
		status  string
		session string
		err     error
		paid    bool
	}{
		{"used", "USED", "", nil, true},
		{"cancelled, session paid", "CANCELLED", "PAID", nil, true},
		{"cancelled, session cancelled", "CANCELLED", "CANCELLED", nil, false},
		{"cancelled, no session", "CANCELLED", "", nil, false},
		{"cancelled, session unreadable", "CANCELLED", "", errors.New("core down"), false},
		{"active", "ACTIVE", "PAID", nil, false},
		{"expired", "EXPIRED", "PAID", nil, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			links := &sessionLinks{fakeLinks: fakeLinks{merchant: "doa-merchant"}, status: tc.status, session: tc.session, err: tc.err}
			h := NewPaymentLinkHandler(links, service.NewStubMerchantService(), service.NewStubWebhookService())
			h.identities = func(context.Context, string) (service.BusinessIdentity, error) {
				return service.BusinessIdentity{DisplayName: "Doa", Handle: "doa"}, nil
			}

			code, body, raw := publicLinkGet(t, h)
			if code != http.StatusOK {
				t.Fatalf("status %d: %s", code, raw)
			}
			if body["paid"] != tc.paid {
				t.Errorf("view paid = %v, want %v (%s)", body["paid"], tc.paid, raw)
			}
			if body["status"] != tc.status {
				t.Errorf("view status = %v, want the link's own %s", body["status"], tc.status)
			}

			r := chi.NewRouter()
			r.Get("/public/pay/{slug}/status", h.Status)
			rec := httptest.NewRecorder()
			r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/public/pay/abc123/status", nil))
			var poll map[string]bool
			_ = json.Unmarshal(rec.Body.Bytes(), &poll)
			if poll["paid"] != tc.paid {
				t.Errorf("status poll paid = %v, want %v", poll["paid"], tc.paid)
			}
		})
	}
}

// A failed identity lookup names nobody — it never falls back to the account name.
func TestPublicPaymentLink_IdentityFailureNeverShowsTheAccountName(t *testing.T) {
	merchants := service.NewStubMerchantService()
	m, err := merchants.Create(context.Background(), service.CreateMerchantRequest{Name: "Sandbox · Doa-Sandbox", Email: "doa@example.test"})
	if err != nil {
		t.Fatal(err)
	}
	h := NewPaymentLinkHandler(&fakeLinks{merchant: m.ID}, merchants, service.NewStubWebhookService())
	h.identities = func(context.Context, string) (service.BusinessIdentity, error) {
		return service.BusinessIdentity{}, errors.New("database unavailable")
	}
	code, body, raw := publicLinkGet(t, h)
	if code != http.StatusOK {
		t.Fatalf("status %d: %s", code, raw)
	}
	if strings.Contains(raw, "Sandbox · Doa-Sandbox") {
		t.Fatalf("account name reached the payer: %s", raw)
	}
	if body["merchant_name"] != "" {
		t.Errorf("merchant_name = %v, want empty", body["merchant_name"])
	}
}
