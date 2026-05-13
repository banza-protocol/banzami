package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/banzami/banzami/services/api-gateway/internal/webhook"
)

// backoffSchedule defines how long to wait before each retry attempt.
// Index 0 = after 1st failure, index 4 = after 5th (final) failure.
var backoffSchedule = []time.Duration{
	1 * time.Minute,
	5 * time.Minute,
	30 * time.Minute,
	2 * time.Hour,
	8 * time.Hour,
}

// PostgresWebhookService is the production implementation of WebhookService.
// Endpoints, events, and deliveries are persisted in PostgreSQL.
// A background worker polls for pending deliveries and dispatches them with
// exponential-backoff retries (max 5 attempts).
type PostgresWebhookService struct {
	pool   *pgxpool.Pool
	client *http.Client
}

func NewPostgresWebhookService(pool *pgxpool.Pool) *PostgresWebhookService {
	return &PostgresWebhookService{
		pool:   pool,
		client: &http.Client{Timeout: 30 * time.Second},
	}
}

// StartWorker launches the background delivery worker. The worker stops when
// ctx is cancelled (i.e. on graceful shutdown).
func (s *PostgresWebhookService) StartWorker(ctx context.Context) {
	go func() {
		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				s.processPendingDeliveries(ctx)
			}
		}
	}()
}

// ---------------------------------------------------------------------------
// WebhookService interface
// ---------------------------------------------------------------------------

func (s *PostgresWebhookService) RegisterEndpoint(
	ctx context.Context,
	req RegisterEndpointRequest,
) (*WebhookEndpoint, error) {
	secret := generateWebhookSecret()
	id := uuid.NewString()
	now := time.Now().UTC()

	_, err := s.pool.Exec(ctx,
		`INSERT INTO webhook_endpoints (id, merchant_id, url, events, active, secret, created_at)
		 VALUES ($1, $2, $3, $4, true, $5, $6)`,
		id, req.MerchantID, req.URL, req.Events, secret, now,
	)
	if err != nil {
		return nil, fmt.Errorf("register webhook endpoint: %w", err)
	}

	return &WebhookEndpoint{
		ID:         id,
		MerchantID: req.MerchantID,
		URL:        req.URL,
		Events:     req.Events,
		Active:     true,
		Secret:     secret,
		CreatedAt:  now,
	}, nil
}

func (s *PostgresWebhookService) GetEndpoint(
	ctx context.Context,
	merchantID, endpointID string,
) (*WebhookEndpoint, error) {
	row := s.pool.QueryRow(ctx,
		`SELECT id, merchant_id, url, events, active, created_at
		 FROM webhook_endpoints
		 WHERE id = $1 AND merchant_id = $2`,
		endpointID, merchantID,
	)

	var ep WebhookEndpoint
	if err := row.Scan(
		&ep.ID, &ep.MerchantID, &ep.URL, &ep.Events, &ep.Active, &ep.CreatedAt,
	); err != nil {
		return nil, ErrEndpointNotFound
	}
	return &ep, nil
}

func (s *PostgresWebhookService) ListEndpoints(
	ctx context.Context,
	merchantID string,
) ([]*WebhookEndpoint, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, merchant_id, url, events, active, created_at
		 FROM webhook_endpoints
		 WHERE merchant_id = $1
		 ORDER BY created_at DESC`,
		merchantID,
	)
	if err != nil {
		return nil, fmt.Errorf("list webhook endpoints: %w", err)
	}
	defer rows.Close()

	var out []*WebhookEndpoint
	for rows.Next() {
		var ep WebhookEndpoint
		if err := rows.Scan(
			&ep.ID, &ep.MerchantID, &ep.URL, &ep.Events, &ep.Active, &ep.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan webhook endpoint: %w", err)
		}
		out = append(out, &ep)
	}
	return out, rows.Err()
}

func (s *PostgresWebhookService) DeactivateEndpoint(
	ctx context.Context,
	merchantID, endpointID string,
) error {
	tag, err := s.pool.Exec(ctx,
		`UPDATE webhook_endpoints SET active = false
		 WHERE id = $1 AND merchant_id = $2`,
		endpointID, merchantID,
	)
	if err != nil {
		return fmt.Errorf("deactivate webhook endpoint: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrEndpointNotFound
	}
	return nil
}

func (s *PostgresWebhookService) Dispatch(
	ctx context.Context,
	req DispatchRequest,
) (*WebhookEvent, error) {
	eventID := uuid.NewString()
	now := time.Now().UTC()

	envelope, err := json.Marshal(map[string]any{
		"id":         eventID,
		"type":       req.EventType,
		"created_at": now,
		"data":       req.Payload,
	})
	if err != nil {
		return nil, fmt.Errorf("marshal webhook envelope: %w", err)
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("webhook dispatch tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	// Persist the event.
	_, err = tx.Exec(ctx,
		`INSERT INTO webhook_events (id, merchant_id, event_type, payload, created_at)
		 VALUES ($1, $2, $3, $4, $5)`,
		eventID, req.MerchantID, req.EventType, envelope, now,
	)
	if err != nil {
		return nil, fmt.Errorf("insert webhook event: %w", err)
	}

	// Find matching active endpoints.
	endpointRows, err := tx.Query(ctx,
		`SELECT id FROM webhook_endpoints
		 WHERE merchant_id = $1 AND active = true
		   AND ($2 = ANY(events) OR '*' = ANY(events))`,
		req.MerchantID, req.EventType,
	)
	if err != nil {
		return nil, fmt.Errorf("query webhook endpoints: %w", err)
	}

	var endpointIDs []string
	for endpointRows.Next() {
		var id string
		if err := endpointRows.Scan(&id); err != nil {
			endpointRows.Close()
			return nil, fmt.Errorf("scan endpoint id: %w", err)
		}
		endpointIDs = append(endpointIDs, id)
	}
	endpointRows.Close()
	if err := endpointRows.Err(); err != nil {
		return nil, fmt.Errorf("iterate endpoints: %w", err)
	}

	// Create one pending delivery per matching endpoint.
	for _, epID := range endpointIDs {
		_, err = tx.Exec(ctx,
			`INSERT INTO webhook_deliveries
			     (id, event_id, endpoint_id, status, scheduled_at, created_at)
			 VALUES ($1, $2, $3, 'PENDING', now(), now())
			 ON CONFLICT (event_id, endpoint_id) DO NOTHING`,
			uuid.NewString(), eventID, epID,
		)
		if err != nil {
			return nil, fmt.Errorf("insert webhook delivery: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit webhook dispatch: %w", err)
	}

	return &WebhookEvent{
		ID:         eventID,
		MerchantID: req.MerchantID,
		EventType:  req.EventType,
		Payload:    json.RawMessage(envelope),
		CreatedAt:  now,
	}, nil
}

func (s *PostgresWebhookService) ListEvents(
	ctx context.Context,
	merchantID string,
	limit int,
) ([]*WebhookEvent, error) {
	if limit <= 0 {
		limit = 20
	}
	rows, err := s.pool.Query(ctx,
		`SELECT id, merchant_id, event_type, payload, created_at
		 FROM webhook_events
		 WHERE merchant_id = $1
		 ORDER BY created_at DESC
		 LIMIT $2`,
		merchantID, limit,
	)
	if err != nil {
		return nil, fmt.Errorf("list webhook events: %w", err)
	}
	defer rows.Close()

	var out []*WebhookEvent
	for rows.Next() {
		var ev WebhookEvent
		if err := rows.Scan(
			&ev.ID, &ev.MerchantID, &ev.EventType, &ev.Payload, &ev.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan webhook event: %w", err)
		}
		out = append(out, &ev)
	}
	return out, rows.Err()
}

func (s *PostgresWebhookService) ListDeliveries(
	ctx context.Context,
	eventID string,
) ([]*WebhookDelivery, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, event_id, endpoint_id, attempt_count, status,
		        status_code, response_body, delivered_at, created_at
		 FROM webhook_deliveries
		 WHERE event_id = $1
		 ORDER BY created_at`,
		eventID,
	)
	if err != nil {
		return nil, fmt.Errorf("list webhook deliveries: %w", err)
	}
	defer rows.Close()

	var out []*WebhookDelivery
	for rows.Next() {
		var d WebhookDelivery
		if err := rows.Scan(
			&d.ID, &d.EventID, &d.EndpointID, &d.AttemptNumber, &d.Status,
			&d.StatusCode, &d.ResponseBody, &d.DeliveredAt, &d.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan webhook delivery: %w", err)
		}
		out = append(out, &d)
	}
	return out, rows.Err()
}

// ---------------------------------------------------------------------------
// Background delivery worker
// ---------------------------------------------------------------------------

type pendingDelivery struct {
	id           string
	eventID      string
	endpointID   string
	attemptCount int
	maxAttempts  int
	payload      []byte
	url          string
	secret       string
}

func (s *PostgresWebhookService) processPendingDeliveries(ctx context.Context) {
	rows, err := s.pool.Query(ctx,
		`SELECT d.id, d.event_id, d.endpoint_id, d.attempt_count, d.max_attempts,
		        e.payload, ep.url, ep.secret
		 FROM webhook_deliveries d
		 JOIN webhook_events   e  ON e.id  = d.event_id
		 JOIN webhook_endpoints ep ON ep.id = d.endpoint_id
		 WHERE d.status = 'PENDING' AND d.scheduled_at <= NOW()
		 ORDER BY d.scheduled_at
		 LIMIT 50
		 FOR UPDATE OF d SKIP LOCKED`,
	)
	if err != nil {
		slog.Error("webhook worker: query failed", "error", err)
		return
	}
	defer rows.Close()

	var deliveries []pendingDelivery
	for rows.Next() {
		var d pendingDelivery
		if err := rows.Scan(
			&d.id, &d.eventID, &d.endpointID, &d.attemptCount, &d.maxAttempts,
			&d.payload, &d.url, &d.secret,
		); err != nil {
			slog.Error("webhook worker: scan failed", "error", err)
			continue
		}
		deliveries = append(deliveries, d)
	}
	rows.Close()

	for _, d := range deliveries {
		go s.attemptDelivery(ctx, d)
	}
}

func (s *PostgresWebhookService) attemptDelivery(ctx context.Context, d pendingDelivery) {
	now := time.Now().UTC()
	attempt := d.attemptCount + 1

	statusCode, respBody, deliveryErr := s.httpPost(d.url, d.secret, now, d.payload)

	if deliveryErr == nil && statusCode < 400 {
		// Success — mark terminal.
		_, err := s.pool.Exec(ctx,
			`UPDATE webhook_deliveries
			 SET status       = 'SUCCESS',
			     attempt_count = $2,
			     status_code  = $3,
			     response_body = $4,
			     delivered_at = $5
			 WHERE id = $1`,
			d.id, attempt, statusCode, respBody, now,
		)
		if err != nil {
			slog.Error("webhook worker: success update failed", "delivery_id", d.id, "error", err)
		}
		slog.Info("webhook delivered", "delivery_id", d.id, "url", d.url, "attempt", attempt)
		return
	}

	// Failure — schedule retry or mark permanently failed.
	errMsg := ""
	if deliveryErr != nil {
		errMsg = deliveryErr.Error()
	}

	if attempt >= d.maxAttempts {
		_, err := s.pool.Exec(ctx,
			`UPDATE webhook_deliveries
			 SET status        = 'FAILED',
			     attempt_count = $2,
			     status_code   = $3,
			     response_body = $4,
			     last_error    = $5
			 WHERE id = $1`,
			d.id, attempt, statusCode, respBody, errMsg,
		)
		if err != nil {
			slog.Error("webhook worker: fail update failed", "delivery_id", d.id, "error", err)
		}
		slog.Warn("webhook permanently failed", "delivery_id", d.id, "url", d.url, "attempts", attempt)
		return
	}

	// Schedule next retry with exponential backoff.
	backoffIdx := attempt - 1
	if backoffIdx >= len(backoffSchedule) {
		backoffIdx = len(backoffSchedule) - 1
	}
	nextAt := now.Add(backoffSchedule[backoffIdx])

	_, err := s.pool.Exec(ctx,
		`UPDATE webhook_deliveries
		 SET attempt_count = $2,
		     status_code   = $3,
		     response_body = $4,
		     last_error    = $5,
		     scheduled_at  = $6
		 WHERE id = $1`,
		d.id, attempt, statusCode, respBody, errMsg, nextAt,
	)
	if err != nil {
		slog.Error("webhook worker: retry schedule failed", "delivery_id", d.id, "error", err)
	}
	slog.Warn("webhook delivery failed, will retry",
		"delivery_id", d.id, "url", d.url,
		"attempt", attempt, "next_at", nextAt,
	)
}

func (s *PostgresWebhookService) httpPost(
	url, secret string,
	t time.Time,
	payload []byte,
) (statusCode int, body string, err error) {
	req, err := http.NewRequestWithContext(
		context.Background(), http.MethodPost, url, bytes.NewReader(payload),
	)
	if err != nil {
		return 0, "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(webhook.SignatureHeader, webhook.Sign(secret, t, payload))
	req.Header.Set("User-Agent", "Banzami-Webhook/1.0")

	resp, err := s.client.Do(req)
	if err != nil {
		return 0, "", err
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
	return resp.StatusCode, string(raw), nil
}
