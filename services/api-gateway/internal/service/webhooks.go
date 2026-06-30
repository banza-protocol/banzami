package service

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/banzami/banzami/services/api-gateway/internal/webhook"
)

var (
	ErrEndpointNotFound = errors.New("webhook endpoint not found")
)

// WebhookEndpoint is a merchant-registered delivery target.
// Secret is only populated in the RegisterEndpoint response — never in Get or List.
type WebhookEndpoint struct {
	ID         string    `json:"id"`
	MerchantID string    `json:"merchant_id"`
	URL        string    `json:"url"`
	Events     []string  `json:"events"`
	Active     bool      `json:"active"`
	Secret     string    `json:"secret,omitempty"`
	CreatedAt  time.Time `json:"created_at"`
}

// WebhookEvent is an immutable record of a dispatched domain event.
type WebhookEvent struct {
	ID         string          `json:"id"`
	MerchantID string          `json:"merchant_id"`
	EventType  string          `json:"event_type"`
	Payload    json.RawMessage `json:"payload"`
	CreatedAt  time.Time       `json:"created_at"`
}

// WebhookDelivery tracks a single delivery attempt for an event to an endpoint.
type WebhookDelivery struct {
	ID            string     `json:"id"`
	EventID       string     `json:"event_id"`
	EndpointID    string     `json:"endpoint_id"`
	AttemptNumber int        `json:"attempt_number"`
	Status        string     `json:"status"` // "pending" | "success" | "failed"
	StatusCode    int        `json:"status_code,omitempty"`
	ResponseBody  string     `json:"response_body,omitempty"`
	DeliveredAt   *time.Time `json:"delivered_at,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
}

// RegisterEndpointRequest carries validated inputs for endpoint registration.
type RegisterEndpointRequest struct {
	MerchantID string
	URL        string
	Events     []string
}

// DispatchRequest carries a domain event to be delivered to matching endpoints.
type DispatchRequest struct {
	MerchantID string
	EventType  string
	Payload    json.RawMessage // raw domain object (e.g. a Transaction)
}

// EndpointHealth summarises delivery reliability for a single endpoint.
type EndpointHealth struct {
	EndpointID      string     `json:"endpoint_id"`
	TotalLast24h    int        `json:"total_last_24h"`
	SuccessLast24h  int        `json:"success_last_24h"`
	FailedLast24h   int        `json:"failed_last_24h"`
	SuccessRatePct  float64    `json:"success_rate_pct"`
	LastDeliveredAt *time.Time `json:"last_delivered_at,omitempty"`
	LastFailedAt    *time.Time `json:"last_failed_at,omitempty"`
}

// WebhookService manages endpoint registration and reliable event delivery.
// The production implementation persists state in PostgreSQL and runs a
// persistent worker with exponential-backoff retries.
type WebhookService interface {
	RegisterEndpoint(ctx context.Context, req RegisterEndpointRequest) (*WebhookEndpoint, error)
	GetEndpoint(ctx context.Context, merchantID, endpointID string) (*WebhookEndpoint, error)
	ListEndpoints(ctx context.Context, merchantID string) ([]*WebhookEndpoint, error)
	DeactivateEndpoint(ctx context.Context, merchantID, endpointID string) error

	// Dispatch enqueues an event for all matching active endpoints.
	// It is called internally by other service operations (e.g. after a
	// transaction status changes).
	Dispatch(ctx context.Context, req DispatchRequest) (*WebhookEvent, error)

	ListEvents(ctx context.Context, merchantID string, limit int) ([]*WebhookEvent, error)
	ListDeliveries(ctx context.Context, eventID string) ([]*WebhookDelivery, error)

	// ReplayDelivery re-queues a permanently-failed delivery as a new PENDING row,
	// resetting the attempt counter. Safe to call multiple times — idempotent via
	// a new UUID per replay, so each replay is a distinct delivery attempt.
	ReplayDelivery(ctx context.Context, merchantID, deliveryID string) (*WebhookDelivery, error)

	// EndpointHealth returns delivery success/failure stats for an endpoint.
	EndpointHealth(ctx context.Context, merchantID, endpointID string) (*EndpointHealth, error)
}

// ---------------------------------------------------------------------------
// Stub — local development only
// ---------------------------------------------------------------------------

// StubWebhookService stores state in memory and performs real HTTP deliveries
// in background goroutines. It has no retry logic — the production PostgreSQL
// implementation handles retries with exponential backoff.
type StubWebhookService struct {
	mu         sync.RWMutex
	endpoints  []*WebhookEndpoint // Secret field always populated internally
	events     []*WebhookEvent
	deliveries []*WebhookDelivery
	client     *http.Client
}

func NewStubWebhookService() *StubWebhookService {
	return &StubWebhookService{
		client: &http.Client{Timeout: 30 * time.Second},
	}
}

func (s *StubWebhookService) RegisterEndpoint(_ context.Context, req RegisterEndpointRequest) (*WebhookEndpoint, error) {
	ep := &WebhookEndpoint{
		ID:         uuid.NewString(),
		MerchantID: req.MerchantID,
		URL:        req.URL,
		Events:     req.Events,
		Active:     true,
		Secret:     generateWebhookSecret(),
		CreatedAt:  time.Now().UTC(),
	}
	s.mu.Lock()
	s.endpoints = append(s.endpoints, ep)
	s.mu.Unlock()

	// Return a copy with the secret visible (only time it's exposed).
	cp := *ep
	return &cp, nil
}

func (s *StubWebhookService) GetEndpoint(_ context.Context, merchantID, id string) (*WebhookEndpoint, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, ep := range s.endpoints {
		if ep.ID == id && ep.MerchantID == merchantID {
			cp := *ep
			cp.Secret = ""
			return &cp, nil
		}
	}
	return nil, ErrEndpointNotFound
}

func (s *StubWebhookService) ListEndpoints(_ context.Context, merchantID string) ([]*WebhookEndpoint, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var out []*WebhookEndpoint
	for _, ep := range s.endpoints {
		if ep.MerchantID == merchantID {
			cp := *ep
			cp.Secret = ""
			out = append(out, &cp)
		}
	}
	return out, nil
}

func (s *StubWebhookService) DeactivateEndpoint(_ context.Context, merchantID, id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, ep := range s.endpoints {
		if ep.ID == id && ep.MerchantID == merchantID {
			ep.Active = false
			return nil
		}
	}
	return ErrEndpointNotFound
}

func (s *StubWebhookService) Dispatch(_ context.Context, req DispatchRequest) (*WebhookEvent, error) {
	eventID := uuid.NewString()
	now := time.Now().UTC()

	// Wrap the caller's domain payload in a standard event envelope.
	envelope, err := json.Marshal(map[string]any{
		"id":         eventID,
		"type":       req.EventType,
		"created_at": now,
		"data":       req.Payload,
	})
	if err != nil {
		return nil, err
	}

	event := &WebhookEvent{
		ID:         eventID,
		MerchantID: req.MerchantID,
		EventType:  req.EventType,
		Payload:    json.RawMessage(envelope),
		CreatedAt:  now,
	}

	s.mu.Lock()
	s.events = append(s.events, event)
	// Snapshot matching endpoints while holding the lock.
	var targets []*WebhookEndpoint
	for _, ep := range s.endpoints {
		if !ep.Active || ep.MerchantID != req.MerchantID {
			continue
		}
		for _, e := range ep.Events {
			if e == req.EventType || e == "*" {
				cp := *ep // copy preserves the secret for signing
				targets = append(targets, &cp)
				break
			}
		}
	}
	s.mu.Unlock()

	for _, ep := range targets {
		go s.deliver(event, ep)
	}
	return event, nil
}

func (s *StubWebhookService) ListEvents(_ context.Context, merchantID string, limit int) ([]*WebhookEvent, error) {
	if limit <= 0 {
		limit = 20
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	var out []*WebhookEvent
	// Walk backwards: most recent first.
	for i := len(s.events) - 1; i >= 0 && len(out) < limit; i-- {
		if s.events[i].MerchantID == merchantID {
			cp := *s.events[i]
			out = append(out, &cp)
		}
	}
	return out, nil
}

func (s *StubWebhookService) ListDeliveries(_ context.Context, eventID string) ([]*WebhookDelivery, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var out []*WebhookDelivery
	for _, d := range s.deliveries {
		if d.EventID == eventID {
			cp := *d
			out = append(out, &cp)
		}
	}
	return out, nil
}

// ---------------------------------------------------------------------------
// Internal delivery helpers
// ---------------------------------------------------------------------------

func (s *StubWebhookService) deliver(event *WebhookEvent, ep *WebhookEndpoint) {
	now := time.Now().UTC()
	delivery := &WebhookDelivery{
		ID:            uuid.NewString(),
		EventID:       event.ID,
		EndpointID:    ep.ID,
		AttemptNumber: 1,
		Status:        "pending",
		CreatedAt:     now,
	}

	s.mu.Lock()
	s.deliveries = append(s.deliveries, delivery)
	s.mu.Unlock()

	sigHeader := webhook.Sign(ep.Secret, now, event.Payload)

	req, err := http.NewRequestWithContext(
		context.Background(),
		http.MethodPost,
		ep.URL,
		bytes.NewReader(event.Payload),
	)
	if err != nil {
		s.finalizeDelivery(delivery.ID, "failed", 0, err.Error())
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(webhook.SignatureHeader, sigHeader)
	req.Header.Set("User-Agent", "Banzami-Webhook/1.0")

	resp, err := s.client.Do(req)
	if err != nil {
		s.finalizeDelivery(delivery.ID, "failed", 0, err.Error())
		return
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
	status := "success"
	if resp.StatusCode >= 400 {
		status = "failed"
	}
	s.finalizeDelivery(delivery.ID, status, resp.StatusCode, string(respBody))
}

func (s *StubWebhookService) finalizeDelivery(id, status string, code int, body string) {
	t := time.Now().UTC()
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, d := range s.deliveries {
		if d.ID == id {
			d.Status = status
			d.StatusCode = code
			d.ResponseBody = body
			d.DeliveredAt = &t
			return
		}
	}
}

func (s *StubWebhookService) ReplayDelivery(_ context.Context, _, deliveryID string) (*WebhookDelivery, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, d := range s.deliveries {
		if d.ID == deliveryID {
			cp := *d
			cp.Status = "pending"
			return &cp, nil
		}
	}
	return nil, errors.New("delivery not found")
}

func (s *StubWebhookService) EndpointHealth(_ context.Context, _, endpointID string) (*EndpointHealth, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	health := &EndpointHealth{EndpointID: endpointID}
	cutoff := time.Now().UTC().Add(-24 * time.Hour)
	for _, d := range s.deliveries {
		if d.EndpointID != endpointID || d.CreatedAt.Before(cutoff) {
			continue
		}
		health.TotalLast24h++
		if d.Status == "success" {
			health.SuccessLast24h++
			health.LastDeliveredAt = d.DeliveredAt
		} else if d.Status == "failed" {
			health.FailedLast24h++
		}
	}
	if health.TotalLast24h > 0 {
		health.SuccessRatePct = float64(health.SuccessLast24h) / float64(health.TotalLast24h) * 100
	}
	return health, nil
}

func generateWebhookSecret() string {
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	return "whsec_" + base64.URLEncoding.EncodeToString(b)
}
