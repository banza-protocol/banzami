// Package apierror provides the standard JSON error response format for all API endpoints.
//
// Every error response has the same shape so clients can handle them uniformly:
//
//	{ "code": "RATE_LIMITED", "message": "too many requests", "request_id": "uuid" }
package apierror

import (
	"encoding/json"
	"net/http"
)

// Response is the canonical error body returned by every failing endpoint.
type Response struct {
	Code      string `json:"code"`
	Message   string `json:"message"`
	RequestID string `json:"request_id,omitempty"`
}

// Respond writes a JSON error response.
// It reads X-Request-ID from the response header (set upstream by the RequestID middleware).
func Respond(w http.ResponseWriter, r *http.Request, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(Response{
		Code:      code,
		Message:   message,
		RequestID: w.Header().Get("X-Request-ID"),
	})
}
