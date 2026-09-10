package service

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Compliance Operations Console (ADR-023). A unified case index synced
// idempotently from the existing source tables (merchant_applications, KYB
// documents, KYC cases, failed settlements). The operator works on CASES, not
// modules. This holds operational state only — no financial truth, no storage
// keys, no signed URLs.
type ComplianceService struct {
	pool *pgxpool.Pool
	env  string // LIVE | SANDBOX — tags synced rows and scopes every read/write
}

func NewComplianceService(pool *pgxpool.Pool, env string) *ComplianceService {
	return &ComplianceService{pool: pool, env: env}
}

var ErrComplianceCaseNotFound = errors.New("compliance case not found")

type ComplianceCase struct {
	ID           string         `json:"id"`
	Environment  string         `json:"environment"`
	CaseType     string         `json:"case_type"`
	EntityType   string         `json:"entity_type"`
	EntityID     string         `json:"entity_id"`
	EntityName   string         `json:"entity_name,omitempty"`
	EntityHandle string         `json:"entity_handle,omitempty"`
	Status       string         `json:"status"`
	Priority     string         `json:"priority"`
	RiskLevel    string         `json:"risk_level"`
	AssignedID   string         `json:"assigned_operator_id,omitempty"`
	AssignedName string         `json:"assigned_operator_name,omitempty"`
	CreatedAt    time.Time      `json:"created_at"`
	UpdatedAt    time.Time      `json:"updated_at"`
	LastActivity time.Time      `json:"last_activity"`
	ResolvedAt   *time.Time     `json:"resolved_at,omitempty"`
	AgeSeconds   int64          `json:"age_seconds"` // since last_activity, for SLA bucketing
	Metadata     map[string]any `json:"metadata,omitempty"`
}

type ComplianceNote struct {
	ID         string     `json:"id"`
	CaseID     string     `json:"case_id"`
	AuthorID   string     `json:"author_id,omitempty"`
	AuthorName string     `json:"author_name,omitempty"`
	Body       string     `json:"body"`
	CreatedAt  time.Time  `json:"created_at"`
	UpdatedAt  *time.Time `json:"updated_at,omitempty"`
}

// CaseFilters are the inbox query parameters.
type CaseFilters struct {
	CaseType string
	Status   string
	Priority string
	Risk     string
	Operator string // assigned_operator_id
	Search   string
	Page     int
	PageSize int
}

// ── Sync ────────────────────────────────────────────────────────────────────

// upsertQueries materialize/refresh active cases from each source. Each takes
// $1 = environment and only touches that environment's source rows. ON CONFLICT
// refreshes the denormalized identity + last_activity but NEVER overrides the
// operator-owned status/assignment/priority/risk.
var caseUpsertQueries = []string{
	// Merchant applications under review.
	`INSERT INTO compliance_cases (id, environment, case_type, entity_type, entity_id, entity_name, entity_handle, priority, risk_level, source_key, created_at, last_activity, metadata)
	 SELECT gen_random_uuid(), $1, 'MERCHANT_APPLICATION', 'merchant_application', a.id::text,
	        COALESCE(a.business_name,'Candidatura'), a.desired_handle, 'NORMAL', 'LOW',
	        'app:'||a.id::text, a.created_at, a.updated_at,
	        jsonb_strip_nulls(jsonb_build_object('email', a.email, 'nif', a.nif, 'country', a.country, 'phone', a.phone))
	   FROM merchant_applications a
	  WHERE a.environment = $1 AND a.status IN ('SUBMITTED','UNDER_REVIEW')
	 ON CONFLICT (source_key) DO UPDATE
	    SET entity_name = EXCLUDED.entity_name, entity_handle = EXCLUDED.entity_handle,
	        metadata = EXCLUDED.metadata,
	        last_activity = GREATEST(compliance_cases.last_activity, EXCLUDED.last_activity), updated_at = now()`,
	// Merchants with at least one pending KYB document.
	`INSERT INTO compliance_cases (id, environment, case_type, entity_type, entity_id, entity_name, entity_handle, priority, risk_level, source_key, created_at, last_activity, metadata)
	 SELECT gen_random_uuid(), $1, 'KYB_MERCHANT', 'merchant', d.merchant_id::text,
	        COALESCE(m.name,'Comerciante'), p.handle, 'NORMAL', 'LOW',
	        'kyb:'||d.merchant_id::text, min(d.submitted_at), max(d.submitted_at),
	        jsonb_strip_nulls(jsonb_build_object('pending_documents', count(*)))
	   FROM merchant_kyb_documents d
	   LEFT JOIN merchants m ON m.id = d.merchant_id
	   LEFT JOIN merchant_profiles p ON p.merchant_id = d.merchant_id
	  WHERE d.environment = $1 AND d.status = 'PENDING_REVIEW'
	  GROUP BY d.merchant_id, m.name, p.handle
	 ON CONFLICT (source_key) DO UPDATE
	    SET entity_name = EXCLUDED.entity_name, entity_handle = EXCLUDED.entity_handle,
	        metadata = EXCLUDED.metadata,
	        last_activity = GREATEST(compliance_cases.last_activity, EXCLUDED.last_activity), updated_at = now()`,
	// Consumers with a non-terminal KYC case.
	`INSERT INTO compliance_cases (id, environment, case_type, entity_type, entity_id, entity_name, entity_handle, priority, risk_level, source_key, created_at, last_activity, metadata)
	 SELECT gen_random_uuid(), $1, 'KYC_CONSUMER', 'consumer', c.subject_id::text,
	        COALESCE(cons.display_name,'Consumidor'), cons.handle, 'NORMAL', 'LOW',
	        'kyc:'||c.subject_id::text, min(c.created_at), max(c.updated_at),
	        jsonb_strip_nulls(jsonb_build_object('phone', cons.phone_number))
	   FROM kyc_cases c
	   LEFT JOIN consumers cons ON cons.id = c.subject_id
	  WHERE c.environment = $1 AND c.status NOT IN ('APPROVED','REJECTED','EXPIRED','CANCELLED')
	  GROUP BY c.subject_id, cons.display_name, cons.handle, cons.phone_number
	 ON CONFLICT (source_key) DO UPDATE
	    SET entity_name = EXCLUDED.entity_name, entity_handle = EXCLUDED.entity_handle,
	        metadata = EXCLUDED.metadata,
	        last_activity = GREATEST(compliance_cases.last_activity, EXCLUDED.last_activity), updated_at = now()`,
	// Failed application settlements (financial → HIGH priority, MEDIUM risk).
	`INSERT INTO compliance_cases (id, environment, case_type, entity_type, entity_id, entity_name, entity_handle, priority, risk_level, source_key, created_at, last_activity, metadata)
	 SELECT gen_random_uuid(), $1, 'SETTLEMENT_FAILURE', 'app_settlement', s.id::text,
	        'Liquidação '||COALESCE(s.owner_ref,'app'), NULL, 'HIGH', 'MEDIUM',
	        'settle:'||s.id::text, s.created_at, s.created_at,
	        jsonb_strip_nulls(jsonb_build_object('currency', s.currency, 'gross_amount_minor', s.gross_amount_minor))
	   FROM app_settlements s
	  WHERE s.environment = $1 AND s.status = 'FAILED'
	 ON CONFLICT (source_key) DO UPDATE SET updated_at = now()`,
}

// resolveQueries auto-resolve cases whose underlying source is no longer active,
// so the inbox stays clean. Never reopens a manually-resolved case.
var caseResolveQueries = []string{
	`UPDATE compliance_cases c SET status='RESOLVED', resolved_at=now(), updated_at=now()
	  WHERE c.environment=$1 AND c.case_type='KYB_MERCHANT' AND c.status<>'RESOLVED'
	    AND NOT EXISTS (SELECT 1 FROM merchant_kyb_documents d WHERE d.merchant_id::text=c.entity_id AND d.environment=$1 AND d.status='PENDING_REVIEW')`,
	`UPDATE compliance_cases c SET status='RESOLVED', resolved_at=now(), updated_at=now()
	  WHERE c.environment=$1 AND c.case_type='KYC_CONSUMER' AND c.status<>'RESOLVED'
	    AND NOT EXISTS (SELECT 1 FROM kyc_cases k WHERE k.subject_id::text=c.entity_id AND k.environment=$1 AND k.status NOT IN ('APPROVED','REJECTED','EXPIRED','CANCELLED'))`,
	`UPDATE compliance_cases c SET status='RESOLVED', resolved_at=now(), updated_at=now()
	  WHERE c.environment=$1 AND c.case_type='MERCHANT_APPLICATION' AND c.status<>'RESOLVED'
	    AND NOT EXISTS (SELECT 1 FROM merchant_applications a WHERE a.id::text=c.entity_id AND a.environment=$1 AND a.status IN ('SUBMITTED','UNDER_REVIEW'))`,
	`UPDATE compliance_cases c SET status='RESOLVED', resolved_at=now(), updated_at=now()
	  WHERE c.environment=$1 AND c.case_type='SETTLEMENT_FAILURE' AND c.status<>'RESOLVED'
	    AND NOT EXISTS (SELECT 1 FROM app_settlements s WHERE s.id::text=c.entity_id AND s.environment=$1 AND s.status='FAILED')`,
}

// Sync materializes active cases and auto-resolves stale ones. Idempotent.
func (s *ComplianceService) Sync(ctx context.Context) error {
	for _, q := range caseUpsertQueries {
		if _, err := s.pool.Exec(ctx, q, s.env); err != nil {
			return err
		}
	}
	for _, q := range caseResolveQueries {
		if _, err := s.pool.Exec(ctx, q, s.env); err != nil {
			return err
		}
	}
	return nil
}

// ── Reads ───────────────────────────────────────────────────────────────────

// CaseStatusOpen is the list filter (Status) for every case not yet resolved —
// the Inbox's "Requer atenção" view, and exactly what OpenCount counts.
const CaseStatusOpen = "OPEN"

// OpenCount counts this environment's unresolved cases (Sync first for a fresh
// view) — the set List returns for Status = CaseStatusOpen.
func (s *ComplianceService) OpenCount(ctx context.Context) (int, error) {
	var n int
	err := s.pool.QueryRow(ctx,
		`SELECT count(*) FROM compliance_cases WHERE environment = $1 AND status <> 'RESOLVED'`, s.env).Scan(&n)
	return n, err
}

func (s *ComplianceService) List(ctx context.Context, f CaseFilters) ([]ComplianceCase, int, error) {
	if f.PageSize <= 0 || f.PageSize > 100 {
		f.PageSize = 25
	}
	if f.Page < 1 {
		f.Page = 1
	}
	offset := (f.Page - 1) * f.PageSize
	rows, err := s.pool.Query(ctx, `
		SELECT id, environment, case_type, entity_type, entity_id, COALESCE(entity_name,''), COALESCE(entity_handle,''),
		       status, priority, risk_level, COALESCE(assigned_operator_id::text,''), COALESCE(assigned_operator_name,''),
		       created_at, updated_at, last_activity, resolved_at,
		       EXTRACT(EPOCH FROM (now() - last_activity))::bigint,
		       COALESCE(metadata,'{}'::jsonb), count(*) OVER() AS total
		  FROM compliance_cases
		 WHERE environment = $1
		   AND ($2 = '' OR case_type = $2)
		   AND ($3 = '' OR status = $3 OR ($3 = 'OPEN' AND status <> 'RESOLVED'))
		   AND ($4 = '' OR priority = $4)
		   AND ($5 = '' OR risk_level = $5)
		   AND ($6 = '' OR assigned_operator_id::text = $6)
		   AND ($7 = '' OR entity_name ILIKE '%'||$7||'%' OR entity_handle ILIKE '%'||$7||'%'
		        OR entity_id ILIKE '%'||$7||'%' OR metadata::text ILIKE '%'||$7||'%')
		 ORDER BY (status = 'RESOLVED'),
		          CASE priority WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'NORMAL' THEN 2 ELSE 3 END,
		          last_activity DESC
		 LIMIT $8 OFFSET $9`,
		s.env, f.CaseType, f.Status, f.Priority, f.Risk, f.Operator, f.Search, f.PageSize, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := []ComplianceCase{}
	total := 0
	for rows.Next() {
		var c ComplianceCase
		var raw []byte
		if err := rows.Scan(&c.ID, &c.Environment, &c.CaseType, &c.EntityType, &c.EntityID, &c.EntityName, &c.EntityHandle,
			&c.Status, &c.Priority, &c.RiskLevel, &c.AssignedID, &c.AssignedName,
			&c.CreatedAt, &c.UpdatedAt, &c.LastActivity, &c.ResolvedAt, &c.AgeSeconds, &raw, &total); err != nil {
			return nil, 0, err
		}
		if len(raw) > 0 {
			_ = json.Unmarshal(raw, &c.Metadata)
		}
		out = append(out, c)
	}
	return out, total, rows.Err()
}

func (s *ComplianceService) Get(ctx context.Context, id string) (*ComplianceCase, error) {
	if _, err := uuid.Parse(id); err != nil {
		return nil, ErrComplianceCaseNotFound
	}
	var c ComplianceCase
	var raw []byte
	err := s.pool.QueryRow(ctx, `
		SELECT id, environment, case_type, entity_type, entity_id, COALESCE(entity_name,''), COALESCE(entity_handle,''),
		       status, priority, risk_level, COALESCE(assigned_operator_id::text,''), COALESCE(assigned_operator_name,''),
		       created_at, updated_at, last_activity, resolved_at,
		       EXTRACT(EPOCH FROM (now() - last_activity))::bigint, COALESCE(metadata,'{}'::jsonb)
		  FROM compliance_cases WHERE id = $1 AND environment = $2`, id, s.env).
		Scan(&c.ID, &c.Environment, &c.CaseType, &c.EntityType, &c.EntityID, &c.EntityName, &c.EntityHandle,
			&c.Status, &c.Priority, &c.RiskLevel, &c.AssignedID, &c.AssignedName,
			&c.CreatedAt, &c.UpdatedAt, &c.LastActivity, &c.ResolvedAt, &c.AgeSeconds, &raw)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrComplianceCaseNotFound
		}
		return nil, err
	}
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &c.Metadata)
	}
	return &c, nil
}

// ── Assignment / status (Part H/I) ──────────────────────────────────────────

func (s *ComplianceService) touch(ctx context.Context, id, setClause string, args ...any) error {
	full := append([]any{id, s.env}, args...)
	tag, err := s.pool.Exec(ctx,
		`UPDATE compliance_cases SET `+setClause+`, last_activity=now(), updated_at=now()
		  WHERE id=$1 AND environment=$2`, full...)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrComplianceCaseNotFound
	}
	return nil
}

// Assign takes ownership (or transfers to another operator). An empty operatorID
// stores NULL (assigned by name only) — the column is an admin_users FK.
func (s *ComplianceService) Assign(ctx context.Context, id, operatorID, operatorName string) error {
	return s.touch(ctx, id, "status='ASSIGNED', assigned_operator_id=$3, assigned_operator_name=$4", nullStr(operatorID), nullStr(operatorName))
}

// Release returns the case to the unassigned pool.
func (s *ComplianceService) Release(ctx context.Context, id string) error {
	return s.touch(ctx, id, "status='UNASSIGNED', assigned_operator_id=NULL, assigned_operator_name=NULL")
}

// Escalate raises the case for senior review.
func (s *ComplianceService) Escalate(ctx context.Context, id string) error {
	return s.touch(ctx, id, "status='ESCALATED', priority=CASE WHEN priority IN ('CRITICAL') THEN priority ELSE 'HIGH' END")
}

// Resolve closes the case manually.
func (s *ComplianceService) Resolve(ctx context.Context, id string) error {
	return s.touch(ctx, id, "status='RESOLVED', resolved_at=now()")
}

// SetPriority / SetRisk are operator overrides (Part K/L) — never automatic.
func (s *ComplianceService) SetPriority(ctx context.Context, id, priority string) error {
	return s.touch(ctx, id, "priority=$3", priority)
}
func (s *ComplianceService) SetRisk(ctx context.Context, id, risk string) error {
	return s.touch(ctx, id, "risk_level=$3", risk)
}

// ── Notes (Part E) ──────────────────────────────────────────────────────────

func (s *ComplianceService) AddNote(ctx context.Context, caseID, authorID, authorName, body string) (*ComplianceNote, error) {
	// Ensure the case exists in this environment before attaching a note.
	if _, err := s.Get(ctx, caseID); err != nil {
		return nil, err
	}
	id := uuid.New().String()
	var n ComplianceNote
	err := s.pool.QueryRow(ctx,
		`INSERT INTO compliance_case_notes (id, case_id, author_id, author_name, body)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, case_id, COALESCE(author_id::text,''), COALESCE(author_name,''), body, created_at, updated_at`,
		id, caseID, nullStr(authorID), nullStr(authorName), body).
		Scan(&n.ID, &n.CaseID, &n.AuthorID, &n.AuthorName, &n.Body, &n.CreatedAt, &n.UpdatedAt)
	if err != nil {
		return nil, err
	}
	// Surface the note as case activity.
	_, _ = s.pool.Exec(ctx, `UPDATE compliance_cases SET last_activity=now(), updated_at=now() WHERE id=$1`, caseID)
	return &n, nil
}

func (s *ComplianceService) ListNotes(ctx context.Context, caseID string) ([]ComplianceNote, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, case_id, COALESCE(author_id::text,''), COALESCE(author_name,''), body, created_at, updated_at
		   FROM compliance_case_notes WHERE case_id=$1 ORDER BY created_at`, caseID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ComplianceNote{}
	for rows.Next() {
		var n ComplianceNote
		if err := rows.Scan(&n.ID, &n.CaseID, &n.AuthorID, &n.AuthorName, &n.Body, &n.CreatedAt, &n.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, n)
	}
	return out, rows.Err()
}
