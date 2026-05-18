package banzami

import "fmt"

// APIError is returned when the Banzami API responds with a 4xx or 5xx status.
type APIError struct {
	Status    int
	Code      string
	Message   string
	RequestID string
}

func (e *APIError) Error() string {
	if e.RequestID != "" {
		return fmt.Sprintf("banzami: HTTP %d %s: %s (request_id=%s)", e.Status, e.Code, e.Message, e.RequestID)
	}
	return fmt.Sprintf("banzami: HTTP %d %s: %s", e.Status, e.Code, e.Message)
}

func (e *APIError) IsNotFound()          bool { return e.Status == 404 }
func (e *APIError) IsUnauthorized()      bool { return e.Status == 401 }
func (e *APIError) IsForbidden()         bool { return e.Status == 403 }
func (e *APIError) IsConflict()          bool { return e.Status == 409 }
func (e *APIError) IsRateLimited()       bool { return e.Status == 429 }
func (e *APIError) IsInsufficientFunds() bool { return e.Code == "INSUFFICIENT_FUNDS" }

// WebhookSignatureError is returned when HMAC-SHA256 verification fails.
type WebhookSignatureError struct {
	Reason string
}

func (e *WebhookSignatureError) Error() string {
	return "banzami/webhook: " + e.Reason
}
