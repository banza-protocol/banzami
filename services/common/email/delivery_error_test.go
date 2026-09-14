package email

import (
	"errors"
	"fmt"
	"testing"
)

func TestDeliveryReason_NamesTheCondition(t *testing.T) {
	cases := []struct {
		err  error
		want string
	}{
		{&ProviderError{Status: 429, Message: "You have reached your daily email sending quota."}, ReasonProviderQuotaExhausted},
		{&ProviderError{Status: 429, Message: "Too many requests"}, ReasonProviderRateLimited},
		{&ProviderError{Status: 503}, ReasonProviderUnavailable},
		{&ProviderError{Status: 422, Message: "invalid to"}, ReasonProviderRejected},
		{fmt.Errorf("wrap: %w", ErrNotConfigured), ReasonNotConfigured},
		{errors.New("dial tcp: i/o timeout"), ReasonTransport},
		{nil, ""},
	}
	for _, c := range cases {
		if got := DeliveryReason(c.err); got != c.want {
			t.Errorf("DeliveryReason(%v) = %q, want %q", c.err, got, c.want)
		}
	}
	if got := (&ProviderError{Status: 429, Message: "quota"}).Error(); got != "resend status 429: quota" {
		t.Errorf("Error() = %q: log searches match this shape", got)
	}
}
