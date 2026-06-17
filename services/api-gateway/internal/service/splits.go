package service

import (
	"context"
	"encoding/json"
)

// SplitService proxies split-payment (P2P-002) requests to the Rust core, which
// owns the session state machine, compliance gate, row locking and settlement.
// Create and Pay return the core's HTTP status + raw body verbatim so structured
// outcome codes (AMOUNT_EXCEEDS_REMAINING, SPLIT_NOT_OPEN, INSUFFICIENT_FUNDS,
// KYC_REQUIRED, …) reach the caller unchanged.
type SplitService interface {
	Create(ctx context.Context, body json.RawMessage) (int, json.RawMessage, error)
	Get(ctx context.Context, id string) (json.RawMessage, error)
	Pay(ctx context.Context, id string, body json.RawMessage) (int, json.RawMessage, error)
}
