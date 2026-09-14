package email

import (
	"errors"
	"fmt"
	"strings"
)

// ProviderError is a refusal by the email provider's API: its HTTP status and
// the provider's own message. Its Error text keeps the historical
// "resend status N: message" shape that log searches already match on.
type ProviderError struct {
	Status  int
	Message string
}

func (e *ProviderError) Error() string {
	if e.Message != "" {
		return fmt.Sprintf("resend status %d: %s", e.Status, e.Message)
	}
	return fmt.Sprintf("resend status %d", e.Status)
}

// Delivery failure reasons — stable, operator-facing, never shown to the public.
const (
	ReasonNotConfigured          = "not_configured"
	ReasonProviderQuotaExhausted = "provider_quota_exhausted"
	ReasonProviderRateLimited    = "provider_rate_limited"
	ReasonProviderRejected       = "provider_rejected"
	ReasonProviderUnavailable    = "provider_unavailable"
	ReasonTransport              = "transport_error"
)

// DeliveryReason classifies a delivery error so an operator can tell a spent
// sending quota (nobody receives mail until it resets) from a momentary rate
// limit, a refused message, or a provider outage.
func DeliveryReason(err error) string {
	if err == nil {
		return ""
	}
	if errors.Is(err, ErrNotConfigured) {
		return ReasonNotConfigured
	}
	var pe *ProviderError
	if errors.As(err, &pe) {
		switch {
		case pe.Status == 429 && strings.Contains(strings.ToLower(pe.Message), "quota"):
			return ReasonProviderQuotaExhausted
		case pe.Status == 429:
			return ReasonProviderRateLimited
		case pe.Status >= 500:
			return ReasonProviderUnavailable
		default:
			return ReasonProviderRejected
		}
	}
	return ReasonTransport
}
