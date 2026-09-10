package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func serveWith(p *DeveloperPrincipal, ct, body string, status int) *httptest.ResponseRecorder {
	h := RedactOwnerIdentifiers(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", ct)
		w.WriteHeader(status)
		_, _ = w.Write([]byte(body))
	}))
	req := httptest.NewRequest(http.MethodGet, "/v1/payment-sessions/x", nil)
	if p != nil {
		req = req.WithContext(ContextWithDeveloperPrincipal(context.Background(), p))
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

const session = `{"session_id":"ps_1","merchant_id":"m-owner-uuid","amount_minor":100000,` +
	`"description":"Ação <b>x</b> & y","data":[{"merchant_id":"m-owner-uuid","id":"e1"}]}`

func TestRedact_AProjectKeyNeverSeesTheOwner(t *testing.T) {
	rec := serveWith(&DeveloperPrincipal{ProjectID: "p"}, "application/json; charset=utf-8", session, http.StatusCreated)
	body := rec.Body.String()
	if strings.Contains(body, "merchant_id") || strings.Contains(body, "m-owner-uuid") {
		t.Fatalf("owner identifier reached a Project key: %s", body)
	}
	if rec.Code != http.StatusCreated {
		t.Fatalf("status changed: %d", rec.Code)
	}
	// Everything else is untouched, byte-for-byte in value: integers stay
	// integers and a payer's text is not HTML-escaped on the way out.
	for _, want := range []string{`"amount_minor":100000`, `"description":"Ação <b>x</b> & y"`, `"id":"e1"`, `"session_id":"ps_1"`} {
		if !strings.Contains(body, want) {
			t.Errorf("lost %s in %s", want, body)
		}
	}
}

func TestRedact_AMerchantSessionKeepsItsOwnId(t *testing.T) {
	rec := serveWith(nil, "application/json", session, http.StatusOK)
	if rec.Body.String() != session {
		t.Fatalf("a merchant session's response was altered: %s", rec.Body.String())
	}
}

func TestRedact_NonJSONPassesThroughUntouched(t *testing.T) {
	png := "\x89PNG\r\n merchant_id"
	rec := serveWith(&DeveloperPrincipal{}, "image/png", png, http.StatusOK)
	if rec.Body.String() != png {
		t.Fatal("a binary body was rewritten")
	}
}

func TestRedact_ErrorsKeepTheirStatusAndBody(t *testing.T) {
	e := `{"code":"NOT_FOUND","message":"x","request_id":"r"}`
	rec := serveWith(&DeveloperPrincipal{}, "application/json", e, http.StatusNotFound)
	if rec.Code != http.StatusNotFound || rec.Body.String() != e {
		t.Fatalf("got %d %s", rec.Code, rec.Body.String())
	}
}
