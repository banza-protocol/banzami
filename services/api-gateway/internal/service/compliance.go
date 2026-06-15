package service

import (
	"context"
	"encoding/json"
)

// ComplianceService proxies KYC/KYB identity-verification requests to the core.
// Requests and responses are passed through as raw JSON so the gateway stays
// thin — the core owns the verification provider and the compliance state machine.
type ComplianceService interface {
	// VerifyCustomer runs a consumer KYC verification. body is the raw request
	// (full_name, document_type, document_number, date_of_birth, requested_level).
	VerifyCustomer(ctx context.Context, customerID string, body json.RawMessage) (json.RawMessage, error)
	// VerifyMerchant runs a merchant KYB verification. body is the raw request
	// (legal_name, tax_id, representative_name).
	VerifyMerchant(ctx context.Context, merchantID string, body json.RawMessage) (json.RawMessage, error)
	// GetCustomerStatus returns the consumer's Progressive-KYC status (level,
	// status, limits, can_transact) as raw JSON.
	GetCustomerStatus(ctx context.Context, customerID string) (json.RawMessage, error)
	// AuthorizeOperation returns the Progressive-KYC decision for a specific
	// operation (SEND, CASH_OUT, …) and amount.
	AuthorizeOperation(ctx context.Context, customerID, operation string, amountMinor, dailyVolumeMinor int64) (*Authorization, error)
}

// Authorization is the decoded Progressive-KYC decision.
type Authorization struct {
	CanTransact   bool    `json:"can_transact"`
	Reason        string  `json:"reason"`
	CurrentLevel  string  `json:"current_level"`
	RequiredLevel *string `json:"required_level"`
	Message       string  `json:"message"`
}
