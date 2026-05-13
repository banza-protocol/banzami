package service

import (
	"context"
	"errors"
	"time"
)

var ErrConsumerNotFound        = errors.New("consumer not found")
var ErrHandleNotFound          = errors.New("handle not found")
var ErrHandleTaken             = errors.New("handle already taken")
var ErrInvalidHandle           = errors.New("invalid handle")
var ErrConsumerStatusTransition = errors.New("invalid status transition")

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

type ConsumerRecord struct {
	ID          string     `json:"id"`
	Handle      string     `json:"handle"`
	DisplayName *string    `json:"display_name"`
	Status      string     `json:"status"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

type ConsumerService interface {
	Create(ctx context.Context, handle string, displayName *string) (*ConsumerRecord, error)
	Get(ctx context.Context, id string) (*ConsumerRecord, error)
	GetByHandle(ctx context.Context, handle string) (*ConsumerRecord, error)
	Suspend(ctx context.Context, id string) (*ConsumerRecord, error)
	Close(ctx context.Context, id string) (*ConsumerRecord, error)
}
