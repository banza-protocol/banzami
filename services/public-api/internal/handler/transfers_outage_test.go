package handler

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/banzami/banzami/services/public-api/internal/service"
)

// A8-09 — the sender's handle lookup answered 401 on ANY error, and the
// consumer app answers a 401 by signing out and wiping the device. Only a
// consumer missing from the credential store is unauthenticated; a store that
// cannot answer is an outage (503), and no transfer is attempted.
func TestTransfer_SenderLookupOutageIs503NotUnauthorized(t *testing.T) {
	dbDown := errors.New("credential handle lookup: failed to connect: dial tcp 10.0.0.5:5432: connect: connection refused")
	for name, c := range map[string]struct {
		err        error
		wantStatus int
		wantCode   string
	}{
		"no credential":         {service.ErrInvalidCredentials, http.StatusUnauthorized, "UNAUTHORIZED"},
		"credential store down": {dbDown, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE"},
	} {
		t.Run(name, func(t *testing.T) {
			sent := false
			sender := &fakeP2pSender{sendFn: func(context.Context, service.SendP2pTransferRequest) (*service.P2pTransferResponse, error) {
				sent = true
				return okResponse("COMPLETED", nil), nil
			}}
			h := buildHandler(t, sender, &fakeHandleResolver{err: c.err}, defaultLimiter())
			body := jsonBody(t, map[string]any{"recipient": "@ana", "amount_minor": 1000, "currency": "AOA", "idempotency_key": "key-outage"})
			r := requestWithAuth(httptest.NewRequest(http.MethodPost, "/v1/transfers", body), "consumer-uuid-joao")
			w := httptest.NewRecorder()
			h.Send(w, r)
			if w.Code != c.wantStatus || !strings.Contains(w.Body.String(), `"`+c.wantCode+`"`) {
				t.Fatalf("status = %d body = %s, want %d %s", w.Code, w.Body.String(), c.wantStatus, c.wantCode)
			}
			if strings.Contains(w.Body.String(), "dial tcp") {
				t.Fatalf("error text reached the caller: %s", w.Body.String())
			}
			if sent {
				t.Fatal("a transfer was attempted without a resolved sender")
			}
		})
	}
}
