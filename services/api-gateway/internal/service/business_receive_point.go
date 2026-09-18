package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Business Receive Point (ADR-065). A stable, public, opaque receive identity for
// one eligible Business. Scanning its QR pays nothing: it resolves this public
// identity and the payer then mints a FRESH Payment Session per payment. The QR
// is persistent; the session is not. This object is not financial state and its
// lifecycle has zero ledger effect — only the minted session reaches Core.
//
// Security: the slug is PUBLIC, not a secret (RECEIVE_POINT_SLUG_AS_SECRET=0).
// Authority is server-side: resolution and session-mint re-derive the Business
// from the slug and re-check current eligibility; the client never chooses the
// destination (CLIENT_SELECTED_BUSINESS_DESTINATION_AUTHORITY=0).

var (
	ErrReceivePointNotFound   = errors.New("receive point not found")
	ErrReceivePointDisabled   = errors.New("receive point disabled")
	ErrReceivePointIneligible = errors.New("business cannot receive")
)

// receivePointSlugAlphabet is base62; 22 chars ≈ 131 bits of entropy — opaque and
// unguessable, never derived from any business/wallet id (RECEIVE_POINT_PREDICTABLE_IDS=0).
const receivePointSlugAlphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
const receivePointSlugLen = 22

// ReceivePoint is the operator-internal view (carries the merchant id).
type ReceivePoint struct {
	MerchantID  string
	PublicSlug  string
	Status      string
	Environment string
}

// ReceivePointPublic is the payer-safe resolution: only what a review needs. It
// never carries a wallet/owner/binding/project id or pricing (§13/§16).
type ReceivePointPublic struct {
	Slug        string `json:"slug"`
	DisplayName string `json:"display_name"`
	Handle      string `json:"handle"`
	Currency    string `json:"currency"`
	Environment string `json:"environment"`
	Status      string `json:"status"`
}

type BusinessReceivePointService struct{ pool *pgxpool.Pool }

func NewBusinessReceivePointService(pool *pgxpool.Pool) *BusinessReceivePointService {
	return &BusinessReceivePointService{pool: pool}
}

// newSlug returns a cryptographically random opaque public slug.
func newSlug() (string, error) {
	b := make([]byte, receivePointSlugLen)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	for i := range b {
		b[i] = receivePointSlugAlphabet[int(b[i])%len(receivePointSlugAlphabet)]
	}
	return string(b), nil
}

// EnsureActive returns the Business's one ACTIVE receive point for the environment,
// creating it if absent. Idempotent and race-safe: the partial unique index
// (uq_business_receive_points_one_active) guarantees at most one ACTIVE row, so a
// concurrent creator's INSERT is a no-op and both callers read the same row.
// It does NOT depend on a Developer Project and is never DOA-special.
func (s *BusinessReceivePointService) EnsureActive(ctx context.Context, merchantID, environment string) (*ReceivePoint, error) {
	if rp, err := s.activeByMerchant(ctx, merchantID, environment); err == nil {
		return rp, nil
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}
	slug, err := newSlug()
	if err != nil {
		return nil, err
	}
	// ON CONFLICT on the active partial index: a race loser inserts nothing.
	_, err = s.pool.Exec(ctx,
		`INSERT INTO business_receive_points (merchant_id, public_slug, status, environment)
		 VALUES ($1, $2, 'ACTIVE', $3)
		 ON CONFLICT (merchant_id, environment) WHERE status = 'ACTIVE' DO NOTHING`,
		merchantID, slug, environment)
	if err != nil {
		return nil, err
	}
	return s.activeByMerchant(ctx, merchantID, environment)
}

func (s *BusinessReceivePointService) activeByMerchant(ctx context.Context, merchantID, environment string) (*ReceivePoint, error) {
	rp := &ReceivePoint{MerchantID: merchantID, Environment: environment, Status: "ACTIVE"}
	err := s.pool.QueryRow(ctx,
		`SELECT public_slug FROM business_receive_points
		  WHERE merchant_id = $1 AND environment = $2 AND status = 'ACTIVE'`,
		merchantID, environment).Scan(&rp.PublicSlug)
	if err != nil {
		return nil, err
	}
	return rp, nil
}

// ResolveForPayment resolves a public slug to a payer-safe identity, re-checking
// CURRENT eligibility so a stale printed QR fails closed after a later
// disable/suspension. It is READ-ONLY: no session, no ledger, no reservation
// (RECEIVE_POINT_RESOLVE_FINANCIAL_EFFECTS=0). Returns the resolved merchant id
// (server authority) alongside the public view.
func (s *BusinessReceivePointService) ResolveForPayment(ctx context.Context, slug string) (*ReceivePointPublic, string, error) {
	var (
		pub        ReceivePointPublic
		merchantID string
		pointStat  string
		merchStat  string
	)
	err := s.pool.QueryRow(ctx,
		`SELECT rp.public_slug, rp.status, rp.environment, m.id::text, m.status,
		        m.name,
		        COALESCE((SELECT handle FROM handle_registry
		                    WHERE owner_type='MERCHANT' AND owner_id=m.id
		                    ORDER BY created_at LIMIT 1), ''),
		        COALESCE((SELECT currency FROM wallets
		                    WHERE merchant_id=m.id
		                    ORDER BY (status='ACTIVE') DESC, created_at LIMIT 1), 'AOA')
		   FROM business_receive_points rp
		   JOIN merchants m ON m.id = rp.merchant_id
		  WHERE rp.public_slug = $1`,
		slug).Scan(&pub.Slug, &pointStat, &pub.Environment, &merchantID, &merchStat, &pub.DisplayName, &pub.Handle, &pub.Currency)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, "", ErrReceivePointNotFound
	}
	if err != nil {
		return nil, "", err
	}
	if pointStat != "ACTIVE" {
		return nil, "", ErrReceivePointDisabled
	}
	// Current Business eligibility — the one authoritative status. A stale printed
	// QR must not bypass a later suspension (STALE_PRINTED_QR_BYPASSES_BUSINESS_STATE=0).
	if merchStat != "ACTIVE" {
		return nil, "", ErrReceivePointIneligible
	}
	pub.Status = "ACTIVE"
	return &pub, merchantID, nil
}

// sessionPayee is the server-resolved destination for a mint: the Business and its
// canonical PRIMARY wallet account (ADR-042). The client never supplies any of it.
type sessionPayee struct {
	MerchantID      string
	WalletAccountID string
	Currency        string
}

// resolveForSession re-derives the payee from the slug at session-creation time,
// using the same canonical path as business_link_codes (merchant ACTIVE → AOA
// ACTIVE wallet → PRIMARY account). It fails closed if the point is disabled, the
// business is ineligible, or the receive rails are not ready.
func (s *BusinessReceivePointService) resolveForSession(ctx context.Context, slug string) (*sessionPayee, error) {
	var (
		p         sessionPayee
		pointStat string
		merchStat string
		handle    string
		walletID  string
	)
	err := s.pool.QueryRow(ctx,
		`SELECT rp.status, m.id::text, m.status,
		        COALESCE((SELECT hr.handle FROM handle_registry hr
		                   WHERE hr.owner_type='MERCHANT' AND hr.owner_id=m.id
		                   ORDER BY hr.created_at, hr.handle LIMIT 1), ''),
		        COALESCE(w.id::text, ''), COALESCE(wa.id::text, ''), COALESCE(w.currency, 'AOA')
		   FROM business_receive_points rp
		   JOIN merchants m ON m.id = rp.merchant_id
		   LEFT JOIN wallets w ON w.merchant_id = m.id AND w.currency = 'AOA' AND w.status = 'ACTIVE'
		   LEFT JOIN wallet_accounts wa ON wa.wallet_id = w.id AND wa.purpose = 'PRIMARY'
		  WHERE rp.public_slug = $1`,
		slug).Scan(&pointStat, &p.MerchantID, &merchStat, &handle, &walletID, &p.WalletAccountID, &p.Currency)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrReceivePointNotFound
	}
	if err != nil {
		return nil, err
	}
	if pointStat != "ACTIVE" {
		return nil, ErrReceivePointDisabled
	}
	// Current business eligibility + receive rails ready (handle, wallet, PRIMARY
	// account) — a stale printed QR never bypasses a later suspension.
	if merchStat != "ACTIVE" || handle == "" || walletID == "" || p.WalletAccountID == "" {
		return nil, ErrReceivePointIneligible
	}
	return &p, nil
}

var (
	// ErrMintKeyRequired is returned when a mint carries no idempotency key.
	ErrMintKeyRequired = errors.New("idempotency key required")
	// ErrMintKeyTooLong bounds the key.
	ErrMintKeyTooLong = errors.New("idempotency key too long")
	// ErrIdempotencyConflict is returned when a key is reused for a DIFFERENT
	// request (e.g. a different amount) — never a silent wrong-amount replay.
	ErrIdempotencyConflict = errors.New("idempotency key reused for a different request")
	// ErrMintPending is a bounded, retryable outcome when a concurrent operation is
	// still in flight and could not be resolved within the wait budget.
	ErrMintPending = errors.New("mint in progress, retry")
)

const maxMintKeyLen = 200
const mintLease = 30 * time.Second

// newCoreReference is a random, opaque, ≥128-bit reference passed to core. It
// derives from NO user/client material and is generated once per operation, then
// persisted and reused by every retry (MINT_CORE_REFERENCE_RANDOM_OPAQUE).
func newCoreReference() (string, error) {
	slug, err := newSlug() // 22 base62 ≈ 131 bits, same generator as the point slug
	if err != nil {
		return "", err
	}
	return "brp_" + slug, nil
}

func requestFingerprint(slug, currency string, amountMinor int64) string {
	sum := sha256.Sum256([]byte(slug + "\x00" + currency + "\x00" + strconv.FormatInt(amountMinor, 10)))
	return hex.EncodeToString(sum[:])
}

// MintSession turns (payer + public slug + amount + idempotency key) into a FRESH
// canonical Payment Session via the EXISTING engine. The payee is resolved
// server-side from the slug (the caller supplies only slug + amount).
//
// Correctness does NOT depend on sleeping: it rests on the payer-scoped
// reservation, the request fingerprint, an ATOMIC lease (owner_token + lease_until),
// a persisted RANDOM core_reference, and core's (merchant, purpose, reference)
// idempotency. A retry — before or after a crash — re-runs create with the SAME
// persisted core_reference and converges on the SAME session, with no duplicate.
func (s *BusinessReceivePointService) MintSession(ctx context.Context, sessions PaymentSessionService, payerID, slug, idempotencyKey string, amountMinor int64) (*PaymentSession, error) {
	if idempotencyKey == "" {
		return nil, ErrMintKeyRequired
	}
	if len(idempotencyKey) > maxMintKeyLen {
		return nil, ErrMintKeyTooLong
	}
	// Resolve first (read-only): current eligibility + payee + currency. An
	// ineligible business fails closed before any reservation.
	payee, err := s.resolveForSession(ctx, slug)
	if err != nil {
		return nil, err
	}
	fp := requestFingerprint(slug, payee.Currency, amountMinor)

	coreRef, err := newCoreReference()
	if err != nil {
		return nil, err
	}
	owner := uuid.NewString()

	// Reserve the (payer, key). We become the owner if we insert.
	var mintID, useRef, useOwner string
	err = s.pool.QueryRow(ctx,
		`INSERT INTO business_receive_point_mints (payer_id, idempotency_key, receive_point_slug, request_fingerprint, core_reference, owner_token, lease_until)
		 VALUES ($1,$2,$3,$4,$5,$6, now() + $7::interval)
		 ON CONFLICT (payer_id, idempotency_key) DO NOTHING
		 RETURNING id, core_reference, owner_token`,
		payerID, idempotencyKey, slug, fp, coreRef, owner, mintLease.String()).Scan(&mintID, &useRef, &useOwner)
	if errors.Is(err, pgx.ErrNoRows) {
		// A prior operation for this (payer, key) exists: replay it, wait for a live
		// winner, or atomically reclaim a stale/crashed attempt.
		got, done, claimedID, claimedRef, claimedOwner, cerr := s.claimExisting(ctx, sessions, payerID, idempotencyKey, fp, owner)
		if cerr != nil {
			return nil, cerr
		}
		if done {
			return got, nil
		}
		mintID, useRef, useOwner = claimedID, claimedRef, claimedOwner
	} else if err != nil {
		return nil, err
	}

	amt := amountMinor
	sess, err := sessions.Create(ctx, CreatePaymentSessionInput{
		MerchantID:      payee.MerchantID,      // server-resolved
		WalletAccountID: payee.WalletAccountID, // server-resolved PRIMARY account
		AmountMinor:     &amt,
		Currency:        payee.Currency,
		Purpose:         "GENERIC",
		ReferenceType:   "BUSINESS_RECEIVE_POINT",
		ReferenceID:     useRef, // persisted random reference → core dedupes on retry
	})
	if err != nil {
		_, _ = s.pool.Exec(ctx,
			`UPDATE business_receive_point_mints SET state='FAILED', updated_at=now() WHERE id=$1 AND owner_token=$2 AND state='PENDING'`, mintID, useOwner)
		return nil, err
	}
	// Record success ONLY if we still own the lease (CAS). If a reclaimer took over
	// while we were creating, our write no-ops and we defer to the current owner —
	// which re-runs create with the SAME core_reference and gets the SAME session.
	tag, err := s.pool.Exec(ctx,
		`UPDATE business_receive_point_mints SET state='SUCCEEDED', session_id=$2, updated_at=now() WHERE id=$1 AND owner_token=$3`,
		mintID, sess.SessionID, useOwner)
	if err != nil {
		return nil, err
	}
	if tag.RowsAffected() == 0 {
		// Lost ownership: return whatever the current owner converges on.
		return s.awaitSucceeded(ctx, sessions, mintID, sess)
	}
	return sess, nil
}

// claimExisting resolves a duplicate (payer, key): reject a fingerprint mismatch,
// replay a SUCCEEDED result, wait (bounded) for a live winner, or ATOMICALLY
// reclaim a stale/failed attempt. Returns (session, done) and, when it reclaims,
// the mint id + persisted core_reference + new owner token to (re)create with.
func (s *BusinessReceivePointService) claimExisting(ctx context.Context, sessions PaymentSessionService, payerID, key, fp, newOwner string) (*PaymentSession, bool, string, string, string, error) {
	for i := 0; i < 60; i++ {
		var id, existingFP, state, coreRef string
		var sid *string
		var expired bool
		if err := s.pool.QueryRow(ctx,
			`SELECT id, request_fingerprint, state, session_id, core_reference, lease_until < now()
			   FROM business_receive_point_mints WHERE payer_id=$1 AND idempotency_key=$2`, payerID, key).
			Scan(&id, &existingFP, &state, &sid, &coreRef, &expired); err != nil {
			return nil, false, "", "", "", err
		}
		if existingFP != fp {
			return nil, false, "", "", "", ErrIdempotencyConflict
		}
		if state == "SUCCEEDED" && sid != nil && *sid != "" {
			return s.session(ctx, sessions, *sid), true, "", "", "", nil
		}
		if (state == "PENDING" && expired) || state == "FAILED" {
			// Atomically take ownership: exactly one worker wins the reclaim.
			var reclaimedRef string
			err := s.pool.QueryRow(ctx,
				`UPDATE business_receive_point_mints
				    SET state='PENDING', owner_token=$2, lease_until=now() + $3::interval, updated_at=now()
				  WHERE id=$1 AND (lease_until < now() OR state='FAILED')
				 RETURNING core_reference`, id, newOwner, mintLease.String()).Scan(&reclaimedRef)
			if err == nil {
				return nil, false, id, reclaimedRef, newOwner, nil // we own it; caller (re)creates
			}
			if !errors.Is(err, pgx.ErrNoRows) {
				return nil, false, "", "", "", err
			}
			// Someone else reclaimed first — loop and observe their result.
		}
		select {
		case <-ctx.Done():
			return nil, false, "", "", "", ctx.Err()
		case <-time.After(50 * time.Millisecond):
		}
	}
	return nil, false, "", "", "", ErrMintPending
}

// awaitSucceeded waits (bounded) for the current lease owner to record success,
// returning that session; falls back to the create result if it cannot read it.
func (s *BusinessReceivePointService) awaitSucceeded(ctx context.Context, sessions PaymentSessionService, mintID string, fallback *PaymentSession) (*PaymentSession, error) {
	for i := 0; i < 40; i++ {
		var state string
		var sid *string
		if err := s.pool.QueryRow(ctx, `SELECT state, session_id FROM business_receive_point_mints WHERE id=$1`, mintID).Scan(&state, &sid); err != nil {
			return nil, err
		}
		if state == "SUCCEEDED" && sid != nil && *sid != "" {
			return s.session(ctx, sessions, *sid), nil
		}
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(50 * time.Millisecond):
		}
	}
	return fallback, nil
}

func (s *BusinessReceivePointService) session(ctx context.Context, sessions PaymentSessionService, id string) *PaymentSession {
	if got, err := sessions.Get(ctx, id); err == nil && got != nil {
		return got
	}
	return &PaymentSession{SessionID: id}
}

// Disable retires the Business's active receive point (operator/system lifecycle).
// After this, the printed QR fails closed on resolve. Zero ledger effect.
func (s *BusinessReceivePointService) Disable(ctx context.Context, merchantID, environment string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE business_receive_points SET status='DISABLED', disabled_at=now(), updated_at=now()
		  WHERE merchant_id=$1 AND environment=$2 AND status='ACTIVE'`,
		merchantID, environment)
	return err
}
