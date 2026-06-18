package service

import (
	"context"
	"encoding/json"
	"errors"
	"time"
)

var ErrQrNotFound = errors.New("QR code not found")
var ErrQrExpired = errors.New("QR code has expired")
var ErrQrAlreadyUsed = errors.New("QR code has already been used")
var ErrQrCannotMarkStaticUsed = errors.New("static QR codes cannot be marked as used")
var ErrQrInvalidPayload = errors.New("invalid QR payload")

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

type QrCodeRecord struct {
	ID          string     `json:"id"`
	OwnerID     string     `json:"owner_id"`
	OwnerType   string     `json:"owner_type"`
	QrType      string     `json:"qr_type"`
	Currency    string     `json:"currency"`
	AmountMinor *int64     `json:"amount_minor"`
	Status      string     `json:"status"`
	ExpiresAt   *time.Time `json:"expires_at"`
	UsedAt      *time.Time `json:"used_at"`
	Reference   *string    `json:"reference"`
	CreatedAt   time.Time  `json:"created_at"`
}

type QrResponse struct {
	QrCode  *QrCodeRecord `json:"qr_code"`
	Payload string        `json:"payload"`
}

type ParsedQr struct {
	QrType    string  `json:"qr_type"`
	OwnerID   *string `json:"owner_id"`
	OwnerType *string `json:"owner_type"`
	Currency  *string `json:"currency"`
	QrCodeID  *string `json:"qr_code_id"`
}

type CreateStaticQrRequest struct {
	OwnerID     string
	OwnerType   string
	Currency    string
	AmountMinor *int64
}

type CreateDynamicQrRequest struct {
	OwnerID     string
	OwnerType   string
	Currency    string
	AmountMinor int64
	ExpiresAt   time.Time
	Reference   string
}

// PayQrRequest is a scan-to-pay request. AmountMinor is required for static QR
// (the payer enters it) and ignored for dynamic QR (the amount is fixed).
type PayQrRequest struct {
	IdempotencyKey string
	Payer          string
	Payload        string
	AmountMinor    *int64
	Note           string
	DeviceID       string
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

type QrService interface {
	CreateStatic(ctx context.Context, req CreateStaticQrRequest) (*QrResponse, error)
	CreateDynamic(ctx context.Context, req CreateDynamicQrRequest) (*QrResponse, error)
	Get(ctx context.Context, id string) (*QrResponse, error)
	Decode(ctx context.Context, payload string) (*ParsedQr, error)
	MarkUsed(ctx context.Context, id string) (*QrCodeRecord, error)
	// Pay settles a scan-to-pay request. It returns the core's HTTP status and
	// raw JSON body verbatim so structured outcomes (KYC_REQUIRED,
	// INSUFFICIENT_FUNDS, QR_ALREADY_USED, …) are forwarded faithfully.
	Pay(ctx context.Context, req PayQrRequest) (int, json.RawMessage, error)
}
