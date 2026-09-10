package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAfterMutation_OnlySuccessfulMutations(t *testing.T) {
	for _, tc := range []struct {
		method string
		status int
		want   bool
	}{
		{http.MethodGet, http.StatusOK, false},
		{http.MethodHead, http.StatusOK, false},
		{http.MethodPost, http.StatusOK, true},
		{http.MethodPost, http.StatusNoContent, true},
		{http.MethodPatch, http.StatusCreated, true},
		{http.MethodDelete, http.StatusOK, true},
		{http.MethodPost, http.StatusBadRequest, false},
		{http.MethodPost, http.StatusForbidden, false},
		{http.MethodPost, http.StatusBadGateway, false},
	} {
		called := false
		h := AfterMutation(func() { called = true })(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(tc.status)
		}))
		h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(tc.method, "/x", nil))
		if called != tc.want {
			t.Errorf("%s → %d: invalidated=%v, want %v", tc.method, tc.status, called, tc.want)
		}
	}
}
