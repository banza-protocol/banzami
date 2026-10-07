package service

// Public web account-deletion request intake (banzami.com/supressao-de-conta).
//
// This is the path for someone who cannot use the in-app "Suprimir conta" flow
// (for example they already uninstalled the app). It is deliberately NOT a
// deletion: it files a REQUEST that an authorized operator must act on.
//
//   1. Create  — a visitor gives a @handle and a contact email. We store a row
//      in PENDING_VERIFICATION and email a 6-digit code to the address.
//   2. Verify  — the visitor returns the code. A correct code moves the row to
//      EMAIL_VERIFIED, which proves control of that email and nothing more.
//
// A verified email + @handle does NOT prove ownership of the Banzami account, so
// the row can never go straight to EXECUTED: an operator records an ownership
// check (EMAIL_VERIFIED → OPERATOR_REVIEW → EXECUTED), enforced both here and by a
// DB CHECK constraint (migration 0168). No PIN, no document, no money column ever
// touches this table.

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	// ErrDeletionRequestUnavailable: the intake is not configured (no OTP pepper)
	// or its store could not answer. Fail-closed — never treated as a refusal.
	ErrDeletionRequestUnavailable = errors.New("account-deletion request intake unavailable")
	// ErrDeletionRequestInvalid: a verify call whose request id, state, code or
	// expiry does not line up. Non-enumerating — the caller answers all of these
	// with one generic message.
	ErrDeletionRequestInvalid = errors.New("invalid or expired verification")
	// ErrDeletionRequestLocked: too many wrong codes for this request.
	ErrDeletionRequestLocked = errors.New("too many attempts; request a new code")
)

const (
	deletionOTPTTL      = 15 * time.Minute
	deletionMaxAttempts = 5
)

// AccountDeletionRequestService stores and verifies public deletion requests.
type AccountDeletionRequestService struct {
	pool   *pgxpool.Pool
	pepper string
	now    func() time.Time
}

// NewAccountDeletionRequestService returns the intake service, or nil when no
// pepper is configured (the route is then not mounted — fail-closed).
func NewAccountDeletionRequestService(pool *pgxpool.Pool, pepper string) *AccountDeletionRequestService {
	if pool == nil || strings.TrimSpace(pepper) == "" {
		return nil
	}
	return &AccountDeletionRequestService{pool: pool, pepper: pepper, now: time.Now}
}

// DeletionRequestCreated is what Create hands back: the opaque request id the
// client carries to the verify step, and the raw code the handler emails (the
// code is never persisted — only its HMAC is).
type DeletionRequestCreated struct {
	RequestID string
	Code      string
}

func (s *AccountDeletionRequestService) hashCode(code string) string {
	mac := hmac.New(sha256.New, []byte(s.pepper))
	mac.Write([]byte(code))
	return hex.EncodeToString(mac.Sum(nil))
}

func newDeletionOTP() (string, error) {
	var b strings.Builder
	b.Grow(6)
	for i := 0; i < 6; i++ {
		n, err := rand.Int(rand.Reader, big.NewInt(10))
		if err != nil {
			return "", err
		}
		b.WriteByte(byte('0' + n.Int64()))
	}
	return b.String(), nil
}

// Create files a new request in PENDING_VERIFICATION and returns the request id
// plus the raw code to email. subjectType is CONSUMER or BUSINESS; handle is
// already normalised and email already validated by the handler.
func (s *AccountDeletionRequestService) Create(ctx context.Context, subjectType, handle, email string) (DeletionRequestCreated, error) {
	code, err := newDeletionOTP()
	if err != nil {
		return DeletionRequestCreated{}, fmt.Errorf("%w: generate code: %w", ErrDeletionRequestUnavailable, err)
	}
	id := uuid.NewString()
	expires := s.now().Add(deletionOTPTTL)
	if _, err := s.pool.Exec(ctx,
		`INSERT INTO account_deletion_requests
		   (id, subject_type, handle, contact_email, status, email_otp_hash, otp_expires_at)
		 VALUES ($1, $2, $3, $4, 'PENDING_VERIFICATION', $5, $6)`,
		id, subjectType, handle, email, s.hashCode(code), expires); err != nil {
		return DeletionRequestCreated{}, fmt.Errorf("%w: store request: %w", ErrDeletionRequestUnavailable, err)
	}
	return DeletionRequestCreated{RequestID: id, Code: code}, nil
}

// Verify checks the code for a request and, on success, moves it to
// EMAIL_VERIFIED. It claims the attempt before comparing (so a storm of guesses
// cannot each read "0 attempts"), refuses once the attempt ceiling or the expiry
// is reached, and compares in constant time. It never reveals which of id / code
// / state / expiry was wrong.
func (s *AccountDeletionRequestService) Verify(ctx context.Context, requestID, code string) error {
	requestID = strings.TrimSpace(requestID)
	if requestID == "" || len(code) != 6 {
		return ErrDeletionRequestInvalid
	}
	if _, err := uuid.Parse(requestID); err != nil {
		return ErrDeletionRequestInvalid
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("%w: begin: %w", ErrDeletionRequestUnavailable, err)
	}
	defer tx.Rollback(ctx)

	var (
		status   string
		otpHash  *string
		expires  *time.Time
		attempts int
	)
	err = tx.QueryRow(ctx,
		`SELECT status, email_otp_hash, otp_expires_at, otp_attempts
		   FROM account_deletion_requests WHERE id = $1 FOR UPDATE`, requestID).
		Scan(&status, &otpHash, &expires, &attempts)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrDeletionRequestInvalid
	}
	if err != nil {
		return fmt.Errorf("%w: read request: %w", ErrDeletionRequestUnavailable, err)
	}

	// Only a request still awaiting its code can be verified. An already-verified
	// request (or one an operator has moved on) is inert here.
	if status != "PENDING_VERIFICATION" {
		return ErrDeletionRequestInvalid
	}
	if attempts >= deletionMaxAttempts {
		return ErrDeletionRequestLocked
	}
	if otpHash == nil || expires == nil || !s.now().Before(*expires) {
		return ErrDeletionRequestInvalid
	}

	// Claim the attempt first, whatever the comparison yields.
	if _, err := tx.Exec(ctx,
		`UPDATE account_deletion_requests SET otp_attempts = otp_attempts + 1, updated_at = now() WHERE id = $1`,
		requestID); err != nil {
		return fmt.Errorf("%w: claim attempt: %w", ErrDeletionRequestUnavailable, err)
	}

	if subtle.ConstantTimeCompare([]byte(s.hashCode(code)), []byte(*otpHash)) != 1 {
		// Commit the claimed attempt, then refuse.
		if err := tx.Commit(ctx); err != nil {
			return fmt.Errorf("%w: commit attempt: %w", ErrDeletionRequestUnavailable, err)
		}
		return ErrDeletionRequestInvalid
	}

	// Correct code: email control is proven. Clear the code so it cannot be
	// replayed, and advance the state. This does NOT authorise deletion.
	if _, err := tx.Exec(ctx,
		`UPDATE account_deletion_requests
		    SET status = 'EMAIL_VERIFIED', email_otp_hash = NULL, otp_expires_at = NULL, updated_at = now()
		  WHERE id = $1`, requestID); err != nil {
		return fmt.Errorf("%w: mark verified: %w", ErrDeletionRequestUnavailable, err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("%w: commit verified: %w", ErrDeletionRequestUnavailable, err)
	}
	return nil
}

// ── Operator processing (called only via the gateway's internal routes, which
// admin-api reaches with X-Internal-Key) ────────────────────────────────────

var (
	// ErrDeletionRequestNotFound: no request with that id.
	ErrDeletionRequestNotFound = errors.New("account-deletion request not found")
	// ErrDeletionRequestState: the request is not in a state this action allows
	// (e.g. recording ownership on an unverified request, or executing one that an
	// operator has not verified). Fail-closed; the operator sees the real state.
	ErrDeletionRequestState = errors.New("account-deletion request is not in the required state")
	// ErrDeletionSubjectNotFound: the handle does not resolve to an account of the
	// claimed kind (never happened, or already removed by a prior run).
	ErrDeletionSubjectNotFound = errors.New("the handle does not resolve to an account")
)

// DeletionRequestRow is the operator-facing view of a request. It never carries
// the OTP hash or any secret — only the lifecycle and the ownership record.
type DeletionRequestRow struct {
	ID                  string     `json:"id"`
	SubjectType         string     `json:"subject_type"`
	Handle              string     `json:"handle"`
	ContactEmail        string     `json:"contact_email"`
	Status              string     `json:"status"`
	OwnershipVerifiedBy *string    `json:"ownership_verified_by,omitempty"`
	OwnershipVerifiedAt *time.Time `json:"ownership_verified_at,omitempty"`
	OwnershipResult     string     `json:"ownership_verification_result"`
	SubjectAccountID    *string    `json:"subject_account_id,omitempty"`
	RequestID           *string    `json:"request_id,omitempty"`
	ExecutedAt          *time.Time `json:"executed_at,omitempty"`
	RejectedAt          *time.Time `json:"rejected_at,omitempty"`
	Outcome             *string    `json:"outcome,omitempty"`
	CreatedAt           time.Time  `json:"created_at"`
	UpdatedAt           time.Time  `json:"updated_at"`
}

const deletionRowCols = `id, subject_type, handle, contact_email, status,
	ownership_verified_by, ownership_verified_at, ownership_verification_result,
	subject_account_id::text, request_id, executed_at, rejected_at, outcome, created_at, updated_at`

func scanDeletionRow(row pgx.Row) (DeletionRequestRow, error) {
	var r DeletionRequestRow
	err := row.Scan(&r.ID, &r.SubjectType, &r.Handle, &r.ContactEmail, &r.Status,
		&r.OwnershipVerifiedBy, &r.OwnershipVerifiedAt, &r.OwnershipResult,
		&r.SubjectAccountID, &r.RequestID, &r.ExecutedAt, &r.RejectedAt, &r.Outcome,
		&r.CreatedAt, &r.UpdatedAt)
	return r, err
}

// List returns requests, optionally filtered to a status, newest first. An empty
// status returns the open queue (EMAIL_VERIFIED + OPERATOR_REVIEW).
func (s *AccountDeletionRequestService) List(ctx context.Context, status string) ([]DeletionRequestRow, error) {
	status = strings.ToUpper(strings.TrimSpace(status))
	var (
		rows pgx.Rows
		err  error
	)
	if status == "" {
		rows, err = s.pool.Query(ctx,
			`SELECT `+deletionRowCols+` FROM account_deletion_requests
			  WHERE status IN ('EMAIL_VERIFIED','OPERATOR_REVIEW') ORDER BY created_at DESC LIMIT 200`)
	} else {
		rows, err = s.pool.Query(ctx,
			`SELECT `+deletionRowCols+` FROM account_deletion_requests
			  WHERE status = $1 ORDER BY created_at DESC LIMIT 200`, status)
	}
	if err != nil {
		return nil, fmt.Errorf("%w: list: %w", ErrDeletionRequestUnavailable, err)
	}
	defer rows.Close()
	var out []DeletionRequestRow
	for rows.Next() {
		r, err := scanDeletionRow(rows)
		if err != nil {
			return nil, fmt.Errorf("%w: scan: %w", ErrDeletionRequestUnavailable, err)
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// Get returns one request.
func (s *AccountDeletionRequestService) Get(ctx context.Context, id string) (DeletionRequestRow, error) {
	r, err := scanDeletionRow(s.pool.QueryRow(ctx, `SELECT `+deletionRowCols+` FROM account_deletion_requests WHERE id = $1`, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return DeletionRequestRow{}, ErrDeletionRequestNotFound
	}
	if err != nil {
		return DeletionRequestRow{}, fmt.Errorf("%w: get: %w", ErrDeletionRequestUnavailable, err)
	}
	return r, nil
}

// RecordOwnership records the operator's ownership check. result is VERIFIED or
// FAILED. A VERIFIED check moves EMAIL_VERIFIED → OPERATOR_REVIEW (the only state
// from which execution is allowed). A FAILED check rejects the request outright.
// It can only act on an EMAIL_VERIFIED request — never on one still awaiting its
// email code, and never to re-open an executed/rejected one.
func (s *AccountDeletionRequestService) RecordOwnership(ctx context.Context, id, operator, result, notes string) (DeletionRequestRow, error) {
	result = strings.ToUpper(strings.TrimSpace(result))
	if result != "VERIFIED" && result != "FAILED" {
		return DeletionRequestRow{}, fmt.Errorf("%w: result must be VERIFIED or FAILED", ErrDeletionRequestState)
	}
	if strings.TrimSpace(operator) == "" {
		return DeletionRequestRow{}, fmt.Errorf("%w: operator is required", ErrDeletionRequestState)
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return DeletionRequestRow{}, fmt.Errorf("%w: begin: %w", ErrDeletionRequestUnavailable, err)
	}
	defer tx.Rollback(ctx)

	var status string
	err = tx.QueryRow(ctx, `SELECT status FROM account_deletion_requests WHERE id = $1 FOR UPDATE`, id).Scan(&status)
	if errors.Is(err, pgx.ErrNoRows) {
		return DeletionRequestRow{}, ErrDeletionRequestNotFound
	}
	if err != nil {
		return DeletionRequestRow{}, fmt.Errorf("%w: read: %w", ErrDeletionRequestUnavailable, err)
	}
	if status != "EMAIL_VERIFIED" {
		return DeletionRequestRow{}, fmt.Errorf("%w: ownership can only be recorded on an EMAIL_VERIFIED request (is %s)", ErrDeletionRequestState, status)
	}

	newStatus := "OPERATOR_REVIEW"
	outcome := strings.TrimSpace(notes)
	if result == "FAILED" {
		newStatus = "REJECTED"
		if outcome == "" {
			outcome = "ownership verification failed"
		}
	}
	now := s.now()
	var rejectedAt *time.Time
	if newStatus == "REJECTED" {
		rejectedAt = &now
	}
	if _, err := tx.Exec(ctx,
		`UPDATE account_deletion_requests
		    SET status = $2, ownership_verified_by = $3, ownership_verified_at = $4,
		        ownership_verification_result = $5, rejected_at = $6,
		        outcome = NULLIF($7,''), updated_at = now()
		  WHERE id = $1`,
		id, newStatus, operator, now, result, rejectedAt, outcome); err != nil {
		return DeletionRequestRow{}, fmt.Errorf("%w: record ownership: %w", ErrDeletionRequestUnavailable, err)
	}
	r, err := scanDeletionRow(tx.QueryRow(ctx, `SELECT `+deletionRowCols+` FROM account_deletion_requests WHERE id = $1`, id))
	if err != nil {
		return DeletionRequestRow{}, fmt.Errorf("%w: reread: %w", ErrDeletionRequestUnavailable, err)
	}
	if err := tx.Commit(ctx); err != nil {
		return DeletionRequestRow{}, fmt.Errorf("%w: commit: %w", ErrDeletionRequestUnavailable, err)
	}
	return r, nil
}

// Reject closes a request without executing it, from any non-terminal state.
func (s *AccountDeletionRequestService) Reject(ctx context.Context, id, operator, reason string) (DeletionRequestRow, error) {
	if strings.TrimSpace(operator) == "" {
		return DeletionRequestRow{}, fmt.Errorf("%w: operator is required", ErrDeletionRequestState)
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return DeletionRequestRow{}, fmt.Errorf("%w: begin: %w", ErrDeletionRequestUnavailable, err)
	}
	defer tx.Rollback(ctx)
	var status string
	err = tx.QueryRow(ctx, `SELECT status FROM account_deletion_requests WHERE id = $1 FOR UPDATE`, id).Scan(&status)
	if errors.Is(err, pgx.ErrNoRows) {
		return DeletionRequestRow{}, ErrDeletionRequestNotFound
	}
	if err != nil {
		return DeletionRequestRow{}, fmt.Errorf("%w: read: %w", ErrDeletionRequestUnavailable, err)
	}
	if status == "EXECUTED" || status == "REJECTED" || status == "EXPIRED" {
		return DeletionRequestRow{}, fmt.Errorf("%w: a %s request cannot be rejected", ErrDeletionRequestState, status)
	}
	if _, err := tx.Exec(ctx,
		`UPDATE account_deletion_requests
		    SET status = 'REJECTED', rejected_at = now(), outcome = NULLIF($2,''),
		        ownership_verified_by = COALESCE(ownership_verified_by, $3), updated_at = now()
		  WHERE id = $1`, id, strings.TrimSpace(reason), operator); err != nil {
		return DeletionRequestRow{}, fmt.Errorf("%w: reject: %w", ErrDeletionRequestUnavailable, err)
	}
	r, err := scanDeletionRow(tx.QueryRow(ctx, `SELECT `+deletionRowCols+` FROM account_deletion_requests WHERE id = $1`, id))
	if err != nil {
		return DeletionRequestRow{}, fmt.Errorf("%w: reread: %w", ErrDeletionRequestUnavailable, err)
	}
	if err := tx.Commit(ctx); err != nil {
		return DeletionRequestRow{}, fmt.Errorf("%w: commit: %w", ErrDeletionRequestUnavailable, err)
	}
	return r, nil
}

// deletionDeleter is the Core deletion the executor drives. The gateway's
// CoreApiClient satisfies it (DeleteConsumer / DeleteBusiness).
type deletionDeleter interface {
	DeleteConsumer(ctx context.Context, consumerID string) error
	DeleteBusiness(ctx context.Context, merchantID string) error
}

// Execute runs the destructive deletion for a request that an operator has
// verified. It is the irreversible step, and it is fail-closed and retry-safe:
//
//   - It refuses anything not in OPERATOR_REVIEW with a VERIFIED ownership check
//     (the DB CHECK is the backstop; this is the primary gate).
//   - It resolves the handle to a concrete account id and persists it BEFORE the
//     Core call, so a retry after a mid-flight failure reuses the same id rather
//     than re-resolving a handle the Core deletion has since retired.
//   - The Core deletion is idempotent, so a retry repeats no financial effect.
//   - Only after Core reports success does the row become EXECUTED.
//
// A failure between the Core call and the EXECUTED write leaves the row in
// OPERATOR_REVIEW with subject_account_id set: a re-run resolves nothing new,
// repeats the idempotent Core delete, and completes. The account is already
// unusable at that point (Core closed it), so the window is a bookkeeping gap,
// never a usable account.
func (s *AccountDeletionRequestService) Execute(ctx context.Context, id, operator, requestID string, core deletionDeleter) (DeletionRequestRow, error) {
	if strings.TrimSpace(operator) == "" {
		return DeletionRequestRow{}, fmt.Errorf("%w: operator is required", ErrDeletionRequestState)
	}

	// Phase 1: assert the state, resolve + persist the account id, under a row lock.
	subjectType, accountID, err := s.beginExecute(ctx, id)
	if err != nil {
		return DeletionRequestRow{}, err
	}

	// Phase 2: the irreversible, idempotent Core deletion.
	switch subjectType {
	case "CONSUMER":
		err = core.DeleteConsumer(ctx, accountID)
	case "BUSINESS":
		err = core.DeleteBusiness(ctx, accountID)
	default:
		return DeletionRequestRow{}, fmt.Errorf("%w: unknown subject_type %q", ErrDeletionRequestState, subjectType)
	}
	if err != nil {
		// Leave the row in OPERATOR_REVIEW (account id persisted) for a safe retry.
		return DeletionRequestRow{}, err
	}

	// Phase 3: mark EXECUTED now that Core has closed the account.
	return s.markExecuted(ctx, id, operator, requestID)
}

func (s *AccountDeletionRequestService) beginExecute(ctx context.Context, id string) (subjectType, accountID string, err error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return "", "", fmt.Errorf("%w: begin: %w", ErrDeletionRequestUnavailable, err)
	}
	defer tx.Rollback(ctx)

	var (
		status, handle, st string
		result             string
		existing           *string
	)
	err = tx.QueryRow(ctx,
		`SELECT status, subject_type, handle, ownership_verification_result, subject_account_id::text
		   FROM account_deletion_requests WHERE id = $1 FOR UPDATE`, id).
		Scan(&status, &st, &handle, &result, &existing)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", "", ErrDeletionRequestNotFound
	}
	if err != nil {
		return "", "", fmt.Errorf("%w: read: %w", ErrDeletionRequestUnavailable, err)
	}
	if status != "OPERATOR_REVIEW" || result != "VERIFIED" {
		return "", "", fmt.Errorf("%w: execution needs OPERATOR_REVIEW + VERIFIED ownership (is %s/%s)", ErrDeletionRequestState, status, result)
	}

	// Reuse a previously-resolved id (a retry), else resolve now from the registry.
	if existing != nil && *existing != "" {
		return st, *existing, nil
	}
	owner := "CONSUMER"
	if st == "BUSINESS" {
		owner = "MERCHANT"
	}
	var resolved string
	err = tx.QueryRow(ctx,
		`SELECT owner_id::text FROM handle_registry
		  WHERE handle = $1 AND owner_type = $2 AND owner_id IS NOT NULL`, handle, owner).Scan(&resolved)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", "", ErrDeletionSubjectNotFound
	}
	if err != nil {
		return "", "", fmt.Errorf("%w: resolve handle: %w", ErrDeletionRequestUnavailable, err)
	}
	if _, err := tx.Exec(ctx,
		`UPDATE account_deletion_requests SET subject_account_id = $2::uuid, updated_at = now() WHERE id = $1`,
		id, resolved); err != nil {
		return "", "", fmt.Errorf("%w: persist subject id: %w", ErrDeletionRequestUnavailable, err)
	}
	if err := tx.Commit(ctx); err != nil {
		return "", "", fmt.Errorf("%w: commit resolve: %w", ErrDeletionRequestUnavailable, err)
	}
	return st, resolved, nil
}

func (s *AccountDeletionRequestService) markExecuted(ctx context.Context, id, operator, requestID string) (DeletionRequestRow, error) {
	if _, err := s.pool.Exec(ctx,
		`UPDATE account_deletion_requests
		    SET status = 'EXECUTED', executed_at = now(), request_id = NULLIF($2,''),
		        outcome = 'account deleted', updated_at = now()
		  WHERE id = $1 AND status = 'OPERATOR_REVIEW'`, id, strings.TrimSpace(requestID)); err != nil {
		return DeletionRequestRow{}, fmt.Errorf("%w: mark executed: %w", ErrDeletionRequestUnavailable, err)
	}
	return s.Get(ctx, id)
}
