package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
)

// The live stack a Sandbox-only deployment does not have: the call never gets
// an HTTP status (code 0), as a refused connection does.
type unreachableGateway struct{ stubGateway }

func (unreachableGateway) GetApplicationRaw(context.Context, string) (json.RawMessage, int, error) {
	return nil, 0, errors.New("dial tcp: lookup api-gateway: no such host")
}

type answeringGateway struct{ stubGateway }

func (answeringGateway) GetApplicationRaw(context.Context, string) (json.RawMessage, int, error) {
	return json.RawMessage(`{"id":"app-1","status":"SUBMITTED"}`), http.StatusOK, nil
}

func getApplication(h *MerchantApplicationHandler) *httptest.ResponseRecorder {
	r := chi.NewRouter()
	r.Get("/admin/v1/merchant-applications/{id}", h.Get)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/admin/v1/merchant-applications/app-1", nil))
	return rec
}

// Opening an application on a Sandbox deployment: the live stack is not there,
// so the Sandbox stack answers. Before, the connection failure was relayed as
// status 0, WriteHeader panicked, and the operator saw "Não foi possível
// carregar a candidatura" for every application.
func TestGetApplication_UnreachableLiveFallsToSandbox(t *testing.T) {
	h := NewMerchantApplicationHandler(&unreachableGateway{}, &answeringGateway{}, nil, "", nil)
	rec := getApplication(h)
	if rec.Code != http.StatusOK || !json.Valid(rec.Body.Bytes()) || rec.Body.String() == "{}" {
		t.Fatalf("status %d body %s; want the Sandbox stack's application", rec.Code, rec.Body.String())
	}
}

// With nowhere else to ask, a status is still an HTTP status.
func TestGetApplication_UnreachableWithNoFallbackIs502(t *testing.T) {
	h := NewMerchantApplicationHandler(&unreachableGateway{}, nil, nil, "", nil)
	if rec := getApplication(h); rec.Code != http.StatusBadGateway {
		t.Fatalf("status %d; want 502", rec.Code)
	}
}
