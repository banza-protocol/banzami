// Package httpx holds small HTTP helpers shared by the developer-api handlers.
package httpx

import (
	"encoding/json"
	"net/http"
)

// JSON writes v as a JSON response with the given status code.
func JSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if v != nil {
		_ = json.NewEncoder(w).Encode(v)
	}
}

// ErrorBody is the standard error envelope: {"error":{"code","message"}}.
type ErrorBody struct {
	Error struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

// Error writes a structured error response. `code` is a stable machine token
// (e.g. "UNAUTHENTICATED"); `message` is human-readable and never leaks secrets.
func Error(w http.ResponseWriter, status int, code, message string) {
	var b ErrorBody
	b.Error.Code = code
	b.Error.Message = message
	JSON(w, status, b)
}

// ErrorWithDetails is Error plus machine-readable specifics under
// `error.details` — the counts and names a refusal turns on, so a caller can say
// WHAT is in the way instead of restating the message.
//
// Details are facts about the caller's own resources, never anything they could
// not already read: it is the same authority boundary as the rest of the reply.
func ErrorWithDetails(w http.ResponseWriter, status int, code, message string, details map[string]any) {
	body := map[string]any{"error": map[string]any{
		"code":    code,
		"message": message,
		"details": details,
	}}
	JSON(w, status, body)
}
