package service

// Operator attention — what in BANZADMIN is waiting for an operator.
//
// A count here means "items that need an operator to act", never "rows in a
// table": an application waiting for the applicant, a payout the bank already
// confirmed, a reconciliation that matched, are not counted. Each category is
// defined once, here, from the domain's own states, and the BANZADMIN page it
// badges filters by the same definition (AttentionApplicationsSQL is used by
// the applications list; the other categories hand the page their states), so
// the sidebar and the page cannot disagree. docs/admin/OPERATOR_ATTENTION.md is
// the operator-facing description; keep the two in step.
//
// Counts only: no ids, names, handles or amounts leave this function.

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// AttentionApplicationsSQL: a Business application an operator has to act on.
// SUBMITTED / UNDER_REVIEW wait for a review; PROVISIONING_FAILED waits for
// the operator to approve again (it resumes); an APPROVED Project application
// whose Project binding did not complete waits for the same. INFORMATION_REQUIRED
// is the applicant's move, and APPROVED / REJECTED / CANCELLED are history.
const AttentionApplicationsSQL = `(status IN ('SUBMITTED','UNDER_REVIEW','PROVISIONING_FAILED')
	OR (status = 'APPROVED' AND origin = 'DEVELOPER_PROJECT' AND project_id IS NOT NULL AND NOT provisioning_project_bound))`

// AttentionFilter is the list filter value that selects exactly the attention
// set (GET /internal/v1/merchant-applications?status=ATTENTION).
const AttentionFilter = "ATTENTION"

// AttentionCount is one category: how many need an operator, and — where the
// definition is a set of states — which states, so the page can filter by the
// server's definition instead of keeping its own.
type AttentionCount struct {
	Count  int      `json:"count"`
	States []string `json:"states,omitempty"`
}

type AttentionSummary struct {
	Environment string                    `json:"environment"`
	GeneratedAt time.Time                 `json:"generated_at"`
	Categories  map[string]AttentionCount `json:"categories"`
}

type attentionCategory struct {
	key    string
	table  string   // skipped (counted 0) where this environment has no such table
	states []string // the page filter, where the rule is a set of states
	expr   string   // one scalar subquery; $1 is the environment
}

var attentionCategories = []attentionCategory{
	{key: "business_applications", table: "merchant_applications",
		expr: `(SELECT count(*) FROM merchant_applications WHERE environment = $1 AND ` + AttentionApplicationsSQL + `)`},
	// A Business's own KYB documents (Business App) waiting for a decision,
	// counted per Business — the Documentos KYB page lists Businesses.
	{key: "kyb_documents", table: "merchant_kyb_documents", states: []string{"PENDING_REVIEW"},
		expr: `(SELECT count(DISTINCT merchant_id) FROM merchant_kyb_documents WHERE environment = $1 AND status = 'PENDING_REVIEW')`},
	// A consumer's KYC case the consumer has submitted. WAITING_DOCUMENTS,
	// DOCUMENTS_RECEIVED and NEEDS_MORE_INFO are the consumer's move.
	{key: "kyc_documents", table: "kyc_cases", states: []string{"UNDER_REVIEW"},
		expr: `(SELECT count(*) FROM kyc_cases WHERE environment = $1 AND status = 'UNDER_REVIEW')`},
	// Acquirer settlements the operator submits (PENDING) or confirms (SUBMITTED).
	{key: "settlements", table: "settlements", states: []string{"PENDING", "SUBMITTED"},
		expr: `(SELECT count(*) FROM settlements WHERE status IN ('PENDING','SUBMITTED'))`},
	// Payouts the operator confirms or returns: everything not yet terminal.
	{key: "payouts", table: "payouts", states: []string{"PENDING", "PROCESSING", "SENT"},
		expr: `(SELECT count(*) FROM payouts WHERE environment = $1 AND status IN ('PENDING','PROCESSING','SENT'))`},
	// Reconciliation: the latest run failed (1), or found N items that do not
	// match. Items are a run's findings, not a queue: running it again after the
	// cause is fixed is the resolution, and a clean run clears the badge.
	{key: "reconciliation", table: "acquiring_reconciliation_runs",
		expr: `(SELECT COALESCE((SELECT CASE WHEN r.status = 'FAILED' THEN 1
		                          ELSE (SELECT count(*) FROM acquiring_reconciliation_items i
		                                 WHERE i.run_id = r.id AND i.status <> 'MATCHED') END
		                   FROM acquiring_reconciliation_runs r
		                  WHERE r.status <> 'RUNNING' ORDER BY r.started_at DESC LIMIT 1), 0))`},
	// Disputes waiting for the operator. EVIDENCE_REQUIRED waits for a party.
	{key: "disputes", table: "disputes", states: []string{"OPEN", "UNDER_REVIEW"},
		expr: `(SELECT count(*) FROM disputes WHERE status IN ('OPEN','UNDER_REVIEW'))`},
	{key: "risk_flags", table: "risk_flags",
		expr: `(SELECT count(*) FROM risk_flags WHERE resolved = false)`},
	// Application settlements still in flight. They complete in the request that
	// creates them, so one that stays CREATED / PENDING is stuck and waits for
	// the operator to fail or cancel it.
	{key: "application_settlements", table: "app_settlements", states: []string{"CREATED", "PENDING"},
		expr: `(SELECT count(*) FROM app_settlements WHERE environment = $1 AND status IN ('CREATED','PENDING'))`},
}

// AttentionService counts, in one round trip after a cheap table probe, every
// category for the environment this gateway serves — never one a caller names.
type AttentionService struct {
	pool        *pgxpool.Pool
	environment string // canonical: SANDBOX | LIVE
}

func NewAttentionService(pool *pgxpool.Pool, environment string) *AttentionService {
	return &AttentionService{pool: pool, environment: environment}
}

func (s *AttentionService) Summary(ctx context.Context) (AttentionSummary, error) {
	out := AttentionSummary{Environment: s.environment, GeneratedAt: time.Now().UTC(), Categories: map[string]AttentionCount{}}

	// A category whose table this environment does not provision counts 0 —
	// Postgres parses every relation in a query, so it is left out of the SQL.
	probe := make([]string, len(attentionCategories))
	for i, c := range attentionCategories {
		probe[i] = fmt.Sprintf("to_regclass('public.%s') IS NOT NULL", c.table)
	}
	exists := make([]bool, len(attentionCategories))
	dst := make([]any, len(exists))
	for i := range exists {
		dst[i] = &exists[i]
	}
	if err := s.pool.QueryRow(ctx, "SELECT "+strings.Join(probe, ", ")).Scan(dst...); err != nil {
		return out, err
	}

	exprs := make([]string, len(attentionCategories))
	for i, c := range attentionCategories {
		exprs[i] = "0"
		if exists[i] {
			exprs[i] = c.expr
		}
	}
	counts := make([]int, len(attentionCategories))
	for i := range counts {
		dst[i] = &counts[i]
	}
	// $1 is referenced by some categories and not others; cast it so the
	// statement types it even when only environment-less categories exist.
	sql := "SELECT " + strings.Join(exprs, ", ")
	if strings.Contains(sql, "$1") {
		sql = strings.ReplaceAll(sql, "$1", "$1::text")
	} else {
		sql += " WHERE $1::text IS NOT NULL"
	}
	if err := s.pool.QueryRow(ctx, sql, s.environment).Scan(dst...); err != nil {
		return out, err
	}
	for i, c := range attentionCategories {
		out.Categories[c.key] = AttentionCount{Count: counts[i], States: c.states}
	}
	return out, nil
}
