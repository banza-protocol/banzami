package service

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"time"

	"github.com/banzami/banzami/services/api-gateway/internal/crypto"
	"github.com/banzami/banzami/services/common/env"
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
	cipher *crypto.SecretCipher // encrypts webhook signing secrets at rest (SEC-002)
	// environment tags every endpoint this service creates. It comes from the
	// process configuration, not from the merchant: a Sandbox endpoint that
	// claimed to be LIVE would be selected by the LIVE dispatch query and would
	// receive real payment events.
	environment env.Environment
}

// EncryptStoredSecrets rewrites any endpoint signing secret still stored in
// plaintext under the configured key, and returns how many it moved. The value
// does not change — the integrator keeps verifying with the secret it holds —
// only its storage: a secret written before the deployment had a key stayed
// in the clear in every database dump (A6-10). Each row is replaced only while
// it still holds the plaintext just read, so a concurrent rotation wins.
func (s *PostgresWebhookService) EncryptStoredSecrets(ctx context.Context) (int, error) {
	if s.cipher == nil {
		return 0, nil
	}
	rows, err := s.pool.Query(ctx, `SELECT id::text, secret FROM webhook_endpoints WHERE secret NOT LIKE 'enc:v1:%'`)
	if err != nil {
		return 0, err
	}
	type plain struct{ id, secret string }
	var todo []plain
	for rows.Next() {
		var p plain
		if err := rows.Scan(&p.id, &p.secret); err != nil {
			rows.Close()
			return 0, err
		}
		todo = append(todo, p)
	}
	rows.Close()
	moved := 0
	for _, p := range todo {
		enc, err := s.cipher.Encrypt(p.secret)
		if err != nil {
			return moved, err
		}
		tag, err := s.pool.Exec(ctx,
			`UPDATE webhook_endpoints SET secret = $2 WHERE id = $1 AND secret = $3`, p.id, enc, p.secret)
		if err != nil {
			return moved, err
		}
		moved += int(tag.RowsAffected())
	}
	return moved, nil
}

func NewPostgresWebhookService(pool *pgxpool.Pool, cipher *crypto.SecretCipher, environment env.Environment) *PostgresWebhookService {
	return &PostgresWebhookService{
		pool:        pool,
		client:      newSafeWebhookClient(30 * time.Second),
		cipher:      cipher,
		environment: environment,
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
				// Fan out core-emitted outbox events first, then deliver.
				s.processOutbox(ctx)
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
	if err := ValidateWebhookURL(req.URL); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidWebhookURL, err)
	}

	// Fail closed on an undeclared environment. The column default is 'LIVE', so
	// the alternative to refusing here is registering a real-money endpoint for a
	// process that could not say which universe it serves. Registering a webhook
	// is not urgent enough to guess.
	if !s.environment.IsKnown() {
		return nil, fmt.Errorf("%w: ENVIRONMENT is not set to LIVE or SANDBOX", ErrEnvironmentUndeclared)
	}

	secret := generateWebhookSecret()
	id := uuid.NewString()
	now := time.Now().UTC()

	// Store the signing secret encrypted at rest (SEC-002). The plaintext is
	// returned to the merchant once, here, and never persisted in the clear.
	storedSecret, err := s.cipher.Encrypt(secret)
	if err != nil {
		return nil, fmt.Errorf("encrypt webhook secret: %w", err)
	}

	_, err = s.pool.Exec(ctx,
		`INSERT INTO webhook_endpoints (id, merchant_id, url, events, active, secret, environment, created_at)
		 VALUES ($1, $2, $3, $4, true, $5, $6, $7)`,
		id, req.MerchantID, req.URL, req.Events, storedSecret, s.environment.String(), now,
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

func (s *PostgresWebhookService) RotateEndpointSecret(
	ctx context.Context,
	merchantID, endpointID string,
) (*WebhookEndpoint, error) {
	secret := generateWebhookSecret()
	stored, err := s.cipher.Encrypt(secret)
	if err != nil {
		return nil, fmt.Errorf("encrypt webhook secret: %w", err)
	}

	// Scoped by merchant_id in the UPDATE itself, not checked beforehand: a
	// separate read-then-write would authorize against a row that could change
	// underneath it, and would answer differently for an endpoint that exists
	// but belongs to someone else.
	row := s.pool.QueryRow(ctx,
		`UPDATE webhook_endpoints SET secret = $1
		  WHERE id = $2 AND merchant_id = $3
		  RETURNING id, merchant_id, url, events, active, created_at`,
		stored, endpointID, merchantID,
	)

	var ep WebhookEndpoint
	if err := row.Scan(
		&ep.ID, &ep.MerchantID, &ep.URL, &ep.Events, &ep.Active, &ep.CreatedAt,
	); err != nil {
		return nil, ErrEndpointNotFound
	}
	// Returned once, exactly as at registration, and never persisted in clear.
	ep.Secret = secret
	return &ep, nil
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

	// Persist the event. This inline path creates its deliveries in the same
	// transaction, so the event is already dispatched — the outbox worker skips it.
	_, err = tx.Exec(ctx,
		`INSERT INTO webhook_events (id, merchant_id, event_type, payload, created_at, dispatched_at)
		 VALUES ($1, $2, $3, $4, $5, $5)`,
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
	merchantID, eventID string,
) ([]*WebhookDelivery, error) {
	// RA-060: join to the owning event and filter on merchant_id. Without this
	// any authenticated merchant could read any event's delivery history by id,
	// including the receiver's response body and the endpoint it was sent to.
	//
	// RA-061: status_code and response_body are NULL until an attempt completes,
	// and scanning NULL into int/string fails — so this endpoint returned 500 for
	// its own owner on every pending delivery. COALESCE keeps the wire contract
	// (0 / "") while making the scan total.
	// Ownership is resolved first so a foreign or unknown event is reported as
	// not-found, matching GET /webhooks/endpoints/{id}. Filtering alone would
	// return an empty list, which reads as "no deliveries yet" and quietly tells
	// the caller the id exists.
	var owned bool
	if err := s.pool.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM webhook_events WHERE id = $1 AND merchant_id = $2)`,
		eventID, merchantID,
	).Scan(&owned); err != nil {
		return nil, fmt.Errorf("resolve webhook event owner: %w", err)
	}
	if !owned {
		return nil, ErrNotFound
	}

	rows, err := s.pool.Query(ctx,
		`SELECT d.id, d.event_id, d.endpoint_id, d.attempt_count, d.status,
		        COALESCE(d.status_code, 0), COALESCE(d.response_body, ''),
		        d.delivered_at, d.created_at
		 FROM webhook_deliveries d
		 JOIN webhook_events e ON e.id = d.event_id
		 WHERE d.event_id = $1 AND e.merchant_id = $2
		 ORDER BY d.created_at`,
		eventID, merchantID,
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
		d.Attempts = []WebhookDeliveryAttempt{}
		out = append(out, &d)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	rows.Close()
	if len(out) == 0 {
		return out, nil
	}
	byID := make(map[string]*WebhookDelivery, len(out))
	ids := make([]string, 0, len(out))
	for _, d := range out {
		byID[d.ID] = d
		ids = append(ids, d.ID)
	}
	arows, err := s.pool.Query(ctx,
		`SELECT delivery_id, attempt_number, outcome, status_code, error_class, duration_ms, attempted_at
		   FROM webhook_delivery_attempts
		  WHERE delivery_id = ANY($1::uuid[])
		  ORDER BY delivery_id, attempt_number`, ids)
	if err != nil {
		return nil, fmt.Errorf("list webhook delivery attempts: %w", err)
	}
	defer arows.Close()
	for arows.Next() {
		var deliveryID string
		var a WebhookDeliveryAttempt
		if err := arows.Scan(&deliveryID, &a.AttemptNumber, &a.Outcome, &a.StatusCode, &a.ErrorClass,
			&a.DurationMs, &a.AttemptedAt); err != nil {
			return nil, fmt.Errorf("scan webhook delivery attempt: %w", err)
		}
		if d := byID[deliveryID]; d != nil {
			d.Attempts = append(d.Attempts, a)
		}
	}
	return out, arows.Err()
}

// ---------------------------------------------------------------------------
// Replay — re-queue a permanently-failed delivery
// ---------------------------------------------------------------------------

func (s *PostgresWebhookService) ReplayDelivery(ctx context.Context, merchantID, deliveryID string) (*WebhookDelivery, error) {
	// Verify the delivery exists and belongs to the merchant's endpoint.
	var eventID, endpointID string
	err := s.pool.QueryRow(ctx,
		`SELECT d.event_id, d.endpoint_id
		 FROM webhook_deliveries d
		 JOIN webhook_endpoints ep ON ep.id = d.endpoint_id
		 JOIN webhook_events    e  ON e.id  = d.event_id
		 WHERE d.id = $1 AND ep.merchant_id = $2`,
		deliveryID, merchantID,
	).Scan(&eventID, &endpointID)
	if err != nil {
		return nil, ErrEndpointNotFound
	}

	// Re-queue the EXISTING delivery rather than inserting a second one.
	//
	// This used to INSERT a fresh row, which `webhook_deliveries` forbids: it is
	// UNIQUE on (event_id, endpoint_id), so every replay of a real delivery hit
	// the constraint and answered 500. The endpoint could not succeed at all.
	//
	// The constraint is the design, not an obstacle — one delivery row per event
	// per endpoint, with retries counted on that row (attempt_count), which is
	// exactly what makes an event impossible to deliver as two separate
	// deliveries. So a replay resets the row and lets the dispatcher pick it up,
	// keeping the same delivery identity.
	now := time.Now().UTC()
	var attempts int
	err = s.pool.QueryRow(ctx,
		`UPDATE webhook_deliveries
		    SET status = 'PENDING', scheduled_at = now(), last_error = NULL
		  WHERE id = $1
		RETURNING attempt_count`,
		deliveryID,
	).Scan(&attempts)
	if err != nil {
		return nil, fmt.Errorf("replay delivery: %w", err)
	}

	slog.Info("webhook delivery re-queued", "delivery_id", deliveryID, "attempts_so_far", attempts)

	return &WebhookDelivery{
		ID:            deliveryID,
		EventID:       eventID,
		EndpointID:    endpointID,
		Status:        "PENDING",
		AttemptNumber: attempts,
		CreatedAt:     now,
	}, nil
}

// ---------------------------------------------------------------------------
// EndpointHealth — delivery success/failure stats for the last 24 hours
// ---------------------------------------------------------------------------

func (s *PostgresWebhookService) EndpointHealth(ctx context.Context, merchantID, endpointID string) (*EndpointHealth, error) {
	// Verify the endpoint belongs to the merchant.
	var count int
	err := s.pool.QueryRow(ctx,
		`SELECT COUNT(1) FROM webhook_endpoints WHERE id = $1 AND merchant_id = $2`,
		endpointID, merchantID,
	).Scan(&count)
	if err != nil || count == 0 {
		return nil, ErrEndpointNotFound
	}

	type statsRow struct {
		Total         int
		Success       int
		Failed        int
		LastDelivered *time.Time
		LastFailed    *time.Time
	}

	var stats statsRow
	err = s.pool.QueryRow(ctx,
		`SELECT
		     COUNT(*)                                                        AS total,
		     COUNT(*) FILTER (WHERE status = 'SUCCESS')                     AS success,
		     COUNT(*) FILTER (WHERE status = 'FAILED')                      AS failed,
		     MAX(delivered_at) FILTER (WHERE status = 'SUCCESS')            AS last_delivered,
		     MAX(created_at)   FILTER (WHERE status = 'FAILED')             AS last_failed
		 FROM webhook_deliveries
		 WHERE endpoint_id = $1
		   AND created_at >= NOW() - INTERVAL '24 hours'`,
		endpointID,
	).Scan(&stats.Total, &stats.Success, &stats.Failed, &stats.LastDelivered, &stats.LastFailed)
	if err != nil {
		return nil, fmt.Errorf("endpoint health query: %w", err)
	}

	successRate := 0.0
	if stats.Total > 0 {
		successRate = float64(stats.Success) / float64(stats.Total) * 100
	}

	return &EndpointHealth{
		EndpointID:      endpointID,
		TotalLast24h:    stats.Total,
		SuccessLast24h:  stats.Success,
		FailedLast24h:   stats.Failed,
		SuccessRatePct:  successRate,
		LastDeliveredAt: stats.LastDelivered,
		LastFailedAt:    stats.LastFailed,
	}, nil
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

// processOutbox fans core-emitted events (the transactional outbox written by
// the Rust core for refund.completed / dispute.opened / dispute.resolved) out
// into per-endpoint deliveries. Rows with dispatched_at IS NULL are awaiting
// fan-out; the inline Dispatch path sets dispatched_at itself and is skipped.
func (s *PostgresWebhookService) processOutbox(ctx context.Context) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, merchant_id, event_type FROM webhook_events
		 WHERE dispatched_at IS NULL
		 ORDER BY created_at
		 LIMIT 100`,
	)
	if err != nil {
		slog.Error("webhook outbox: query failed", "error", err)
		return
	}
	type outboxEvent struct {
		id, merchantID, eventType string
	}
	var events []outboxEvent
	for rows.Next() {
		var e outboxEvent
		if err := rows.Scan(&e.id, &e.merchantID, &e.eventType); err != nil {
			slog.Error("webhook outbox: scan failed", "error", err)
			continue
		}
		events = append(events, e)
	}
	rows.Close()

	for _, e := range events {
		// Create one PENDING delivery per matching active endpoint.
		_, err := s.pool.Exec(ctx,
			`INSERT INTO webhook_deliveries (id, event_id, endpoint_id, status, scheduled_at, created_at)
			 SELECT gen_random_uuid(), $1, ep.id, 'PENDING', now(), now()
			 FROM webhook_endpoints ep
			 WHERE ep.merchant_id = $2 AND ep.active = true
			   AND ($3 = ANY(ep.events) OR '*' = ANY(ep.events))
			 ON CONFLICT (event_id, endpoint_id) DO NOTHING`,
			e.id, e.merchantID, e.eventType,
		)
		if err != nil {
			slog.Error("webhook outbox: fan-out failed", "event_id", e.id, "error", err)
			continue
		}
		// Mark dispatched even when there are no endpoints — the event is handled.
		if _, err := s.pool.Exec(ctx,
			`UPDATE webhook_events SET dispatched_at = now() WHERE id = $1`, e.id,
		); err != nil {
			slog.Error("webhook outbox: mark dispatched failed", "event_id", e.id, "error", err)
		}
	}
}

func (s *PostgresWebhookService) processPendingDeliveries(ctx context.Context) {
	deliveries := s.claimDueDeliveries(ctx)
	for _, d := range deliveries {
		go s.attemptDelivery(ctx, d)
	}
}

// claimDueDeliveries leases up to 50 due deliveries to this worker (see the
// query) and returns them.
func (s *PostgresWebhookService) claimDueDeliveries(ctx context.Context) []pendingDelivery {

	// Claim, don't just select. FOR UPDATE SKIP LOCKED in an autocommit query
	// releases its locks the moment the query returns, so a delivery whose
	// attempt was still in flight (HTTP timeout 30 s) was selected again on the
	// next 5 s tick: a slow endpoint received the same signed event up to six
	// times. The claim is a lease — scheduled_at pushed past the attempt's
	// lifetime in the same statement — so no tick re-selects it, and a worker
	// that dies mid-attempt leaves a delivery that simply becomes due again.
	rows, err := s.pool.Query(ctx,
		`WITH due AS (
		   SELECT id FROM webhook_deliveries
		    WHERE status = 'PENDING' AND scheduled_at <= NOW()
		    ORDER BY scheduled_at
		    LIMIT 50
		    FOR UPDATE SKIP LOCKED)
		 UPDATE webhook_deliveries d
		    SET scheduled_at = NOW() + interval '2 minutes'
		   FROM due, webhook_events e, webhook_endpoints ep
		  WHERE d.id = due.id AND e.id = d.event_id AND ep.id = d.endpoint_id
		 RETURNING d.id, d.event_id, d.endpoint_id, d.attempt_count, d.max_attempts,
		           e.payload, ep.url, ep.secret`,
	)
	if err != nil {
		slog.Error("webhook worker: query failed", "error", err)
		return nil
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

	return deliveries
}

var errSigningSecretUnavailable = errors.New("signing secret unavailable")

func (s *PostgresWebhookService) attemptDelivery(ctx context.Context, d pendingDelivery) {
	now := time.Now().UTC()
	attempt := d.attemptCount + 1

	// Decrypt the at-rest signing secret to sign this delivery (SEC-002).
	// Legacy plaintext secrets pass through unchanged.
	secret, err := s.cipher.Decrypt(d.secret)
	var (
		statusCode  int
		respBody    string
		deliveryErr error
	)
	if err != nil {
		// Not sent. This used to fall back to signing with the stored
		// ciphertext — a key derived from database-visible data, sent to the
		// receiver as if it were the endpoint's secret. The attempt is recorded
		// as failed and retried on the normal schedule once the key is back.
		slog.Error("[webhook] could not decrypt signing secret — not sent", "delivery_id", d.id, "error", err)
		deliveryErr = errSigningSecretUnavailable
	} else {
		statusCode, respBody, deliveryErr = s.httpPost(d.url, secret, now, d.payload)
	}
	durationMs := int(time.Since(now).Milliseconds())

	outcome := classifyAttempt(statusCode, deliveryErr)

	// The attempt is appended in the same transaction that advances the
	// delivery, so the history cannot claim an attempt the delivery does not
	// count. The reverse is allowed on purpose: if the attempt row cannot be
	// written (the table not there yet mid-rollout), the delivery still
	// advances. Holding it back would leave it PENDING and due, and the next
	// tick would send the same webhook again — a storm at the receiver to save
	// a history row.
	var update string
	var args []any
	var logf func()
	switch {
	case outcome.succeeded:
		update = `UPDATE webhook_deliveries
		             SET status = 'SUCCESS', attempt_count = $2, status_code = $3,
		                 response_body = $4, delivered_at = $5
		           WHERE id = $1`
		args = []any{d.id, attempt, statusCode, respBody, now}
		logf = func() { slog.Info("webhook delivered", "delivery_id", d.id, "url", d.url, "attempt", attempt) }
	case attempt >= d.maxAttempts:
		update = `UPDATE webhook_deliveries
		             SET status = 'FAILED', attempt_count = $2, status_code = $3,
		                 response_body = $4, last_error = $5
		           WHERE id = $1`
		args = []any{d.id, attempt, statusCode, respBody, errText(deliveryErr)}
		logf = func() {
			slog.Warn("webhook permanently failed", "delivery_id", d.id, "url", d.url, "attempts", attempt)
		}
	default:
		// Schedule next retry with exponential backoff.
		backoffIdx := attempt - 1
		if backoffIdx >= len(backoffSchedule) {
			backoffIdx = len(backoffSchedule) - 1
		}
		nextAt := now.Add(backoffSchedule[backoffIdx])
		update = `UPDATE webhook_deliveries
		             SET attempt_count = $2, status_code = $3, response_body = $4,
		                 last_error = $5, scheduled_at = $6
		           WHERE id = $1`
		args = []any{d.id, attempt, statusCode, respBody, errText(deliveryErr), nextAt}
		logf = func() {
			slog.Warn("webhook delivery failed, will retry",
				"delivery_id", d.id, "url", d.url, "attempt", attempt, "next_at", nextAt)
		}
	}
	if err := s.recordAttempt(ctx, d.id, attempt, outcome, statusCode, durationMs, now, update, args); err != nil {
		slog.Error("webhook worker: recording the attempt failed", "delivery_id", d.id, "attempt", attempt, "error", err)
		return
	}
	logf()
}

// attemptOutcome is what one attempt amounted to, in the closed vocabulary of
// webhook_delivery_attempts (migration 0119).
type attemptOutcome struct {
	succeeded  bool
	errorClass string // "" on success
}

// classifyAttempt names why an attempt failed without keeping the raw error
// text, which can quote resolved addresses.
func classifyAttempt(statusCode int, err error) attemptOutcome {
	if err == nil && statusCode > 0 && statusCode < 400 {
		return attemptOutcome{succeeded: true}
	}
	if err == nil {
		return attemptOutcome{errorClass: "http_status"}
	}
	var netErr net.Error
	var dnsErr *net.DNSError
	var tlsErr *tls.CertificateVerificationError
	var recordErr tls.RecordHeaderError
	switch {
	case errors.As(err, &dnsErr):
		return attemptOutcome{errorClass: "dns"}
	case errors.As(err, &tlsErr), errors.As(err, &recordErr):
		return attemptOutcome{errorClass: "tls"}
	case errors.As(err, &netErr) && netErr.Timeout():
		return attemptOutcome{errorClass: "timeout"}
	case errors.As(err, new(*net.OpError)):
		return attemptOutcome{errorClass: "connection"}
	default:
		return attemptOutcome{errorClass: "other"}
	}
}

func errText(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

// recordAttempt applies the delivery's new state and appends the attempt, in
// one transaction.
func (s *PostgresWebhookService) recordAttempt(
	ctx context.Context, deliveryID string, attempt int, o attemptOutcome,
	statusCode, durationMs int, attemptedAt time.Time, update string, args []any,
) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, update, args...); err != nil {
		return fmt.Errorf("update delivery: %w", err)
	}
	outcome, class := "SUCCESS", any(nil)
	if !o.succeeded {
		outcome, class = "FAILED", o.errorClass
	}
	code := any(nil)
	if statusCode > 0 {
		code = statusCode
	}
	sp, err := tx.Begin(ctx) // savepoint: the history row may fail alone
	if err != nil {
		return err
	}
	if _, err := sp.Exec(ctx,
		`INSERT INTO webhook_delivery_attempts
		        (delivery_id, attempt_number, outcome, status_code, error_class, duration_ms, attempted_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		deliveryID, attempt, outcome, code, class, durationMs, attemptedAt); err != nil {
		_ = sp.Rollback(ctx)
		slog.Error("webhook worker: attempt history not written; the delivery still advances",
			"delivery_id", deliveryID, "attempt", attempt, "error", err)
	} else if err := sp.Commit(ctx); err != nil {
		return err
	}
	return tx.Commit(ctx)
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
