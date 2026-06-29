package service

import (
	"context"
	"encoding/json"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Operator Notification Center (ADR-022 slice 3). Notifications are GENERATED
// idempotently from existing source events (merchant_kyb_events, kyc_events,
// merchant_applications, app_settlements, admin_audit_log) — never invented. Each
// row carries a unique source_key so generation is a safe no-op once run. UX
// state only: no financial truth, no storage keys, no signed URLs.
type NotificationService struct {
	pool *pgxpool.Pool
	env  string // LIVE | SANDBOX — tags generated rows and scopes reads
}

func NewNotificationService(pool *pgxpool.Pool, env string) *NotificationService {
	return &NotificationService{pool: pool, env: env}
}

type AdminNotification struct {
	ID          string         `json:"id"`
	Environment string         `json:"environment"`
	Type        string         `json:"type"`
	Severity    string         `json:"severity"`
	EntityType  string         `json:"entity_type,omitempty"`
	EntityID    string         `json:"entity_id,omitempty"`
	Title       string         `json:"title"`
	Message     string         `json:"message,omitempty"`
	Href        string         `json:"href,omitempty"`
	Status      string         `json:"status"`
	CreatedAt   time.Time      `json:"created_at"`
	ReadAt      *time.Time     `json:"read_at,omitempty"`
	DismissedAt *time.Time     `json:"dismissed_at,omitempty"`
	Metadata    map[string]any `json:"metadata,omitempty"`
}

// generationQueries materialize notifications from source events. Each statement
// takes $1 = environment label and is bounded to recent events to stay cheap.
// Sources that don't exist in a given database simply yield zero rows. Titles and
// messages carry only display data already visible elsewhere in BANZADMIN.
var generationQueries = []string{
	// KYB document submitted / approved / rejected (merchant_kyb_events).
	`INSERT INTO admin_notifications (id, environment, type, severity, entity_type, entity_id, title, message, href, source_key, created_at)
	 SELECT gen_random_uuid(), $1, 'KYB_DOC_SUBMITTED', 'info', 'merchant', e.merchant_id::text,
	        'Novo documento KYB', COALESCE(m.name,'Um comerciante')||' enviou um documento para revisão', '/compliance/inbox?focus='||e.merchant_id::text,
	        'kyb:'||e.id::text, e.created_at
	   FROM merchant_kyb_events e LEFT JOIN merchants m ON m.id = e.merchant_id
	  WHERE e.event_type = 'merchant.kyb.document.uploaded' AND e.created_at > now() - interval '120 days'
	 ON CONFLICT (source_key) DO NOTHING`,
	`INSERT INTO admin_notifications (id, environment, type, severity, entity_type, entity_id, title, message, href, source_key, created_at)
	 SELECT gen_random_uuid(), $1, 'KYB_DOC_APPROVED', 'success', 'merchant', e.merchant_id::text,
	        'Documento KYB aprovado', COALESCE(m.name,'Um comerciante')||' — documento aprovado', '/compliance/inbox?focus='||e.merchant_id::text,
	        'kyb:'||e.id::text, e.created_at
	   FROM merchant_kyb_events e LEFT JOIN merchants m ON m.id = e.merchant_id
	  WHERE e.event_type = 'merchant.kyb.document.approved' AND e.created_at > now() - interval '120 days'
	 ON CONFLICT (source_key) DO NOTHING`,
	`INSERT INTO admin_notifications (id, environment, type, severity, entity_type, entity_id, title, message, href, source_key, created_at)
	 SELECT gen_random_uuid(), $1, 'KYB_DOC_REJECTED', 'warning', 'merchant', e.merchant_id::text,
	        'Documento KYB rejeitado', COALESCE(m.name,'Um comerciante')||' — documento rejeitado', '/compliance/inbox?focus='||e.merchant_id::text,
	        'kyb:'||e.id::text, e.created_at
	   FROM merchant_kyb_events e LEFT JOIN merchants m ON m.id = e.merchant_id
	  WHERE e.event_type = 'merchant.kyb.document.rejected' AND e.created_at > now() - interval '120 days'
	 ON CONFLICT (source_key) DO NOTHING`,
	// KYC submitted (case created) / approved / rejected (kyc_events).
	`INSERT INTO admin_notifications (id, environment, type, severity, entity_type, entity_id, title, message, href, source_key, created_at)
	 SELECT gen_random_uuid(), $1, 'KYC_SUBMITTED', 'info', 'consumer', k.subject_id::text,
	        'Novo caso KYC', 'Um consumidor iniciou verificação de identidade', '/compliance/inbox?focus='||k.subject_id::text,
	        'kyc:'||e.id::text, e.created_at
	   FROM kyc_events e JOIN kyc_cases k ON k.id = e.case_id
	  WHERE e.event_type = 'kyc.case.created' AND e.created_at > now() - interval '120 days'
	 ON CONFLICT (source_key) DO NOTHING`,
	`INSERT INTO admin_notifications (id, environment, type, severity, entity_type, entity_id, title, message, href, source_key, created_at)
	 SELECT gen_random_uuid(), $1, 'KYC_APPROVED', 'success', 'consumer', k.subject_id::text,
	        'KYC aprovado', 'Um caso KYC foi aprovado', '/compliance/inbox?focus='||k.subject_id::text,
	        'kyc:'||e.id::text, e.created_at
	   FROM kyc_events e JOIN kyc_cases k ON k.id = e.case_id
	  WHERE e.event_type = 'kyc.approved' AND e.created_at > now() - interval '120 days'
	 ON CONFLICT (source_key) DO NOTHING`,
	`INSERT INTO admin_notifications (id, environment, type, severity, entity_type, entity_id, title, message, href, source_key, created_at)
	 SELECT gen_random_uuid(), $1, 'KYC_REJECTED', 'warning', 'consumer', k.subject_id::text,
	        'KYC rejeitado', 'Um caso KYC foi rejeitado', '/compliance/inbox?focus='||k.subject_id::text,
	        'kyc:'||e.id::text, e.created_at
	   FROM kyc_events e JOIN kyc_cases k ON k.id = e.case_id
	  WHERE e.event_type = 'kyc.rejected' AND e.created_at > now() - interval '120 days'
	 ON CONFLICT (source_key) DO NOTHING`,
	// Business application submitted (merchant_applications).
	`INSERT INTO admin_notifications (id, environment, type, severity, entity_type, entity_id, title, message, href, source_key, created_at)
	 SELECT gen_random_uuid(), $1, 'APPLICATION_SUBMITTED', 'info', 'merchant_application', a.id::text,
	        'Nova candidatura Business', COALESCE(a.business_name,'Uma empresa')||' candidatou-se', '/compliance/inbox?focus='||a.id::text,
	        'app:'||a.id::text, a.created_at
	   FROM merchant_applications a
	  WHERE a.status IN ('SUBMITTED','UNDER_REVIEW','PENDING','PENDING_REVIEW') AND a.created_at > now() - interval '120 days'
	 ON CONFLICT (source_key) DO NOTHING`,
	// Application settlement failed (app_settlements).
	`INSERT INTO admin_notifications (id, environment, type, severity, entity_type, entity_id, title, message, href, source_key, created_at)
	 SELECT gen_random_uuid(), $1, 'SETTLEMENT_FAILED', 'error', 'app_settlement', s.id::text,
	        'Liquidação falhada', 'Uma liquidação de aplicação falhou e precisa de atenção', '/compliance/inbox?focus='||s.id::text,
	        'settle:'||s.id::text, s.created_at
	   FROM app_settlements s
	  WHERE s.status = 'FAILED' AND s.created_at > now() - interval '120 days'
	 ON CONFLICT (source_key) DO NOTHING`,
	// Pricing rule changed (admin_audit_log — operator action). May be absent in
	// the sandbox database; that simply yields zero rows.
	`INSERT INTO admin_notifications (id, environment, type, severity, entity_type, entity_id, title, message, href, source_key, created_at)
	 SELECT gen_random_uuid(), $1, 'PRICING_CHANGED', 'info', 'pricing_rule', l.entity_id,
	        'Regra de preço alterada', COALESCE(l.full_name,l.admin_email,'Um operador')||' alterou uma regra de preço', '/pricing-rules',
	        'audit:'||l.id::text, l.created_at
	   FROM admin_audit_log l
	  WHERE l.entity_type = 'pricing_rule' AND l.status_code < 400 AND l.created_at > now() - interval '120 days'
	 ON CONFLICT (source_key) DO NOTHING`,
}

// Generate materializes notifications from the source events. Idempotent.
func (s *NotificationService) Generate(ctx context.Context) error {
	for _, q := range generationQueries {
		if _, err := s.pool.Exec(ctx, q, s.env); err != nil {
			return err
		}
	}
	return nil
}

// List returns notifications for this environment, newest-first. status="" returns
// everything except DISMISSED; status="UNREAD" returns only unread.
func (s *NotificationService) List(ctx context.Context, status string, limit int) ([]AdminNotification, error) {
	if limit <= 0 || limit > 100 {
		limit = 30
	}
	rows, err := s.pool.Query(ctx, `
		SELECT id, environment, type, severity, COALESCE(entity_type,''), COALESCE(entity_id,''),
		       title, COALESCE(message,''), COALESCE(href,''), status, created_at, read_at, dismissed_at,
		       COALESCE(metadata_json,'{}'::jsonb)
		  FROM admin_notifications
		 WHERE environment = $1
		   AND ($2 = '' OR status = $2)
		   AND status <> 'DISMISSED'
		 ORDER BY created_at DESC
		 LIMIT $3`, s.env, status, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AdminNotification{}
	for rows.Next() {
		var n AdminNotification
		var raw []byte
		if err := rows.Scan(&n.ID, &n.Environment, &n.Type, &n.Severity, &n.EntityType, &n.EntityID,
			&n.Title, &n.Message, &n.Href, &n.Status, &n.CreatedAt, &n.ReadAt, &n.DismissedAt, &raw); err != nil {
			return nil, err
		}
		if len(raw) > 0 {
			_ = json.Unmarshal(raw, &n.Metadata)
		}
		out = append(out, n)
	}
	return out, rows.Err()
}

// UnreadCount drives the bell counter.
func (s *NotificationService) UnreadCount(ctx context.Context) (int, error) {
	var n int
	err := s.pool.QueryRow(ctx,
		`SELECT count(*) FROM admin_notifications WHERE environment = $1 AND status = 'UNREAD'`, s.env).Scan(&n)
	return n, err
}

// MarkRead moves an UNREAD notification to READ. Idempotent; scoped to env.
func (s *NotificationService) MarkRead(ctx context.Context, id string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE admin_notifications SET status='READ', read_at=now()
		  WHERE id=$1 AND environment=$2 AND status='UNREAD'`, id, s.env)
	return err
}

// Dismiss hides a notification from the feed. Idempotent; scoped to env.
func (s *NotificationService) Dismiss(ctx context.Context, id string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE admin_notifications SET status='DISMISSED', dismissed_at=now()
		  WHERE id=$1 AND environment=$2 AND status<>'DISMISSED'`, id, s.env)
	return err
}
