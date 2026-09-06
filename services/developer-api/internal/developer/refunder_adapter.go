package developer

import (
	"context"
	"errors"

	"github.com/banzami/banzami/services/developer-api/internal/coreclient"
)

// coreRefunder adapts the Core client to the Refunder the service asks for.
//
// The translation exists so the domain does not import a transport package to
// state its own rules: the service's Refunder speaks in payments and refusals,
// the client speaks in HTTP. The adapter is where "Core answered 409 with
// REFUND_CEILING_EXCEEDED" becomes "a refusal with that code", which is the
// only part the caller needs and the only part worth showing them.
type coreRefunder struct{ c *coreclient.RefundClient }

// NewCoreRefunder returns nil when the client is nil, so an unconfigured
// deployment stays a nil Refunder all the way to the capability answer rather
// than becoming a client that fails at the point of use.
func NewCoreRefunder(c *coreclient.RefundClient) Refunder {
	if c == nil {
		return nil
	}
	return &coreRefunder{c: c}
}

func (r *coreRefunder) PaymentSession(ctx context.Context, id string) (*PaymentSource, error) {
	p, err := r.c.PaymentSession(ctx, id)
	if errors.Is(err, coreclient.ErrNoRefundSource) {
		return nil, ErrNoRefundSource
	}
	if err != nil {
		return nil, err
	}
	return &PaymentSource{
		MerchantID:  p.MerchantID,
		SourceType:  p.SourceType,
		SourceID:    p.SourceID,
		AmountMinor: p.AmountMinor,
		Currency:    p.Currency,
		Status:      p.Status,
	}, nil
}

func (r *coreRefunder) CreateRefund(ctx context.Context, merchantID, sourceType, sourceID string,
	amountMinor int64, currency, reason, idempotencyKey string) (*Refund, error) {
	out, err := r.c.CreateRefund(ctx, merchantID, sourceType, sourceID, amountMinor, currency, reason, idempotencyKey)
	if err != nil {
		var rej *coreclient.RefundRejected
		if errors.As(err, &rej) {
			return nil, &RefundRejection{Code: rej.Code, Message: rej.Message}
		}
		return nil, err
	}
	return &Refund{
		ID: out.ID, Status: out.Status, AmountMinor: out.AmountMinor,
		Currency: out.Currency, SourceType: out.SourceType, SourceID: out.SourceID,
	}, nil
}
