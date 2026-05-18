package service

import (
	"context"
	"errors"
	"fmt"
	"time"
)

var ErrDisputeNotFound = errors.New("dispute not found")

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

type Dispute struct {
	ID               string     `json:"id"`
	TransactionID    string     `json:"transaction_id"`
	MerchantID       string     `json:"merchant_id"`
	ConsumerID       string     `json:"consumer_id"`
	AmountMinor      int64      `json:"amount_minor"`
	Currency         string     `json:"currency"`
	Reason           string     `json:"reason"`
	Status           string     `json:"status"`
	EvidenceDeadline *time.Time `json:"evidence_deadline"`
	ResolutionNotes  *string    `json:"resolution_notes"`
	CreatedAt        time.Time  `json:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
	ResolvedAt       *time.Time `json:"resolved_at"`
}

type DisputePage struct {
	Data []*Dispute `json:"data"`
}

type DisputeEvidence struct {
	ID          string    `json:"id"`
	DisputeID   string    `json:"dispute_id"`
	SubmittedBy string    `json:"submitted_by"`
	Party       string    `json:"party"`
	Description string    `json:"description"`
	FileURL     *string   `json:"file_url"`
	CreatedAt   time.Time `json:"created_at"`
}

type DisputeEvidencePage struct {
	Data []*DisputeEvidence `json:"data"`
}

type OpenDisputeRequest struct {
	TransactionID string
	ConsumerID    string
	Reason        string
}

type SubmitEvidenceRequest struct {
	DisputeID   string
	SubmittedBy string
	Party       string
	Description string
	FileURL     string
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

type DisputeService interface {
	Open(ctx context.Context, req OpenDisputeRequest) (*Dispute, error)
	Get(ctx context.Context, id string) (*Dispute, error)
	List(ctx context.Context, merchantID, consumerID, status string, limit int) (*DisputePage, error)
	SubmitEvidence(ctx context.Context, req SubmitEvidenceRequest) (*DisputeEvidence, error)
	ListEvidence(ctx context.Context, disputeID string) (*DisputeEvidencePage, error)
}

// ---------------------------------------------------------------------------
// CoreApiDisputeService — proxies to Rust core-api
// ---------------------------------------------------------------------------

type CoreApiDisputeService struct {
	client *CoreApiClient
}

func NewCoreApiDisputeService(client *CoreApiClient) *CoreApiDisputeService {
	return &CoreApiDisputeService{client: client}
}

func (s *CoreApiDisputeService) Open(ctx context.Context, req OpenDisputeRequest) (*Dispute, error) {
	body := map[string]any{
		"transaction_id": req.TransactionID,
		"consumer_id":    req.ConsumerID,
		"reason":         req.Reason,
	}
	var resp Dispute
	if err := s.client.post(ctx, "/internal/v1/disputes", body, &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

func (s *CoreApiDisputeService) Get(ctx context.Context, id string) (*Dispute, error) {
	var resp Dispute
	if err := s.client.get(ctx, "/internal/v1/disputes/"+id, &resp); err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrDisputeNotFound
		}
		return nil, err
	}
	return &resp, nil
}

func (s *CoreApiDisputeService) List(ctx context.Context, merchantID, consumerID, status string, limit int) (*DisputePage, error) {
	if limit <= 0 {
		limit = 20
	}
	path := fmt.Sprintf("/internal/v1/disputes?limit=%d", limit)
	if merchantID != "" {
		path += "&merchant_id=" + merchantID
	}
	if consumerID != "" {
		path += "&consumer_id=" + consumerID
	}
	if status != "" {
		path += "&status=" + status
	}
	var resp DisputePage
	if err := s.client.get(ctx, path, &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

func (s *CoreApiDisputeService) SubmitEvidence(ctx context.Context, req SubmitEvidenceRequest) (*DisputeEvidence, error) {
	body := map[string]any{
		"submitted_by": req.SubmittedBy,
		"party":        req.Party,
		"description":  req.Description,
		"file_url":     req.FileURL,
	}
	var resp DisputeEvidence
	if err := s.client.post(ctx, "/internal/v1/disputes/"+req.DisputeID+"/evidence", body, &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

func (s *CoreApiDisputeService) ListEvidence(ctx context.Context, disputeID string) (*DisputeEvidencePage, error) {
	var resp DisputeEvidencePage
	if err := s.client.get(ctx, "/internal/v1/disputes/"+disputeID+"/evidence", &resp); err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrDisputeNotFound
		}
		return nil, err
	}
	return &resp, nil
}
