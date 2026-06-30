package service

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Transaction Proof service (BANZA ADR-040). Materializes an immutable, publicly
// verifiable proof for a transaction. The receipt is not the proof — this is. The
// proof_reference is random/non-enumerable; generation is idempotent (one per
// transaction). Reversals move status to REVERSED, never delete.
type ProofService struct {
	pool       *pgxpool.Pool
	signingKey []byte
	keyID      string
	operatorID string
	network    string
	publicBase string // e.g. https://banzami.com/r/
}

var ErrProofNotFound = errors.New("transaction proof not found")

func NewProofService(pool *pgxpool.Pool, signingKey, keyID, operatorID, network, publicBase string) *ProofService {
	if keyID == "" {
		keyID = "op-hmac-v1"
	}
	if operatorID == "" {
		operatorID = "banzami"
	}
	if network == "" {
		network = "banza"
	}
	if publicBase == "" {
		publicBase = "https://banzami.com/r/"
	}
	return &ProofService{
		pool: pool, signingKey: []byte(signingKey), keyID: keyID,
		operatorID: operatorID, network: network, publicBase: publicBase,
	}
}

// ProofInput is the operator-side data used to materialize a proof. It comes from
// a real, confirmed transaction (wallet payment / transfer).
type ProofInput struct {
	TransactionID    string
	TransferID       string
	PaymentIntentID  string
	Environment      string
	PayerSubjectType string
	PayerSubjectID   string
	PayerDisplayName string
	PayerHandle      string
	PayeeSubjectType string
	PayeeSubjectID   string
	PayeeDisplayName string
	PayeeHandle      string
	AmountMinor      int64
	Currency         string
	Status           string
	Description      string
	Method           string
	LedgerReference  string
	ConfirmedAt      *time.Time
}

type Proof struct {
	ID                string
	ProofReference    string
	TransactionID     string
	Environment       string
	PayerDisplayName  string
	PayerHandle       string
	PayeeDisplayName  string
	PayeeHandle       string
	AmountMinor       int64
	Currency          string
	Status            string
	Description       string
	Method            string
	ProofHash         string
	SignatureKeyID    string
	SignatureAlg      string
	VerificationCount int
	IssuedAt          time.Time
	ConfirmedAt       *time.Time
	ReversedAt        *time.Time
}

// secureReference returns a random, non-enumerable public reference BZM-XXXX-XXXX
// (Crockford-ish base32, no ambiguous chars).
func secureReference() (string, error) {
	const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	out := make([]byte, 8)
	for i, c := range b {
		out[i] = alphabet[int(c)%len(alphabet)]
	}
	return fmt.Sprintf("BZM-%s-%s", out[0:4], out[4:8]), nil
}

// canonicalPayload is the deterministic, ordered byte string that is hashed and
// signed. Field order is fixed by ADR-040.
func canonicalPayload(ref string, in ProofInput) []byte {
	confirmed := ""
	if in.ConfirmedAt != nil {
		confirmed = in.ConfirmedAt.UTC().Format(time.RFC3339)
	}
	// Ordered map via a slice of pairs serialized as a JSON array of [k,v] — stable.
	pairs := [][2]string{
		{"proof_reference", ref},
		{"transaction_reference", in.TransactionID},
		{"amount_minor", fmt.Sprintf("%d", in.AmountMinor)},
		{"currency", in.Currency},
		{"payer_handle", in.PayerHandle},
		{"payee_handle", in.PayeeHandle},
		{"status", in.Status},
		{"confirmed_at", confirmed},
		{"ledger_reference", in.LedgerReference},
	}
	raw, _ := json.Marshal(pairs)
	return raw
}

func (s *ProofService) hashAndSign(ref string, in ProofInput) (proofHash, sig, alg string) {
	payload := canonicalPayload(ref, in)
	sum := sha256.Sum256(payload)
	proofHash = hex.EncodeToString(sum[:])
	alg = "HMAC-SHA256"
	mac := hmac.New(sha256.New, s.signingKey)
	mac.Write(payload)
	sig = hex.EncodeToString(mac.Sum(nil))
	return
}

// normalizeProofStatus maps any caller transaction status onto the canonical
// proof status set enforced by the transaction_proofs CHECK constraint. Unknown
// or empty values resolve to CONFIRMED — a proof only exists for a real, posted
// transaction, so the safe default is "confirmed", never a failure state.
func normalizeProofStatus(s string) string {
	switch strings.ToUpper(strings.TrimSpace(s)) {
	case "PENDING", "AUTHORIZED", "PROCESSING":
		return "PENDING"
	case "FAILED", "DECLINED", "ERROR":
		return "FAILED"
	case "REVERSED", "REFUNDED", "CHARGEBACK":
		return "REVERSED"
	case "CANCELLED", "CANCELED", "VOIDED":
		return "CANCELLED"
	case "EXPIRED":
		return "EXPIRED"
	default: // COMPLETED, CONFIRMED, CAPTURED, SUCCEEDED, SETTLED, "" …
		return "CONFIRMED"
	}
}

// statusIsTerminalNegative reports whether a normalized proof status means the
// transaction did not stand, so the public verification page must not show the
// green "verified" state. Ensure only ever moves a proof INTO this set, never out,
// so a reversal can never be silently downgraded back to CONFIRMED.
func statusIsTerminalNegative(s string) bool {
	switch s {
	case "REVERSED", "CANCELLED", "FAILED", "EXPIRED":
		return true
	}
	return false
}

// updateStatus changes a materialized proof's status, stamping reversed_at the
// first time it becomes REVERSED. The proof row is never deleted.
func (s *ProofService) updateStatus(ctx context.Context, id, status string) (*Proof, error) {
	if _, err := s.pool.Exec(ctx, `
		UPDATE transaction_proofs
		   SET status = $2,
		       reversed_at = CASE WHEN $2 = 'REVERSED' AND reversed_at IS NULL THEN now() ELSE reversed_at END,
		       updated_at = now()
		 WHERE id = $1`, id, status); err != nil {
		return nil, err
	}
	return scanProof(s.pool.QueryRow(ctx, `SELECT `+proofCols+` FROM transaction_proofs WHERE id=$1`, id))
}

// MarkReversed moves a transaction's proof to REVERSED (idempotent; never deletes;
// preserves verification_count). Call it from the reversal / refund-completed /
// dispute-resolved flow. It is a no-op when no proof exists yet — Ensure will then
// materialize the proof as REVERSED the next time a receipt is requested with the
// reversed transaction status.
func (s *ProofService) MarkReversed(ctx context.Context, transactionID, environment string) error {
	if environment == "" {
		environment = "LIVE"
	}
	_, err := s.pool.Exec(ctx, `
		UPDATE transaction_proofs
		   SET status = 'REVERSED',
		       reversed_at = COALESCE(reversed_at, now()),
		       updated_at = now()
		 WHERE transaction_id = $1 AND environment = $2 AND status <> 'REVERSED'`,
		transactionID, environment)
	return err
}

// Ensure idempotently returns the proof for a transaction, creating it on first
// call. Concurrent callers converge on a single proof (unique on transaction_id).
// A subsequent call with a terminal-negative status (e.g. REVERSED) updates the
// stored proof forward — see the status re-sync in the body.
func (s *ProofService) Ensure(ctx context.Context, in ProofInput) (*Proof, error) {
	if in.Environment == "" {
		in.Environment = "LIVE"
	}
	// Normalize to the proof status vocabulary (the transaction_proofs CHECK):
	// callers pass their own transaction status (e.g. a transfer's "COMPLETED"),
	// which must map onto {PENDING,CONFIRMED,FAILED,REVERSED,CANCELLED,EXPIRED}.
	in.Status = normalizeProofStatus(in.Status)
	if existing, err := s.getByTxn(ctx, in.TransactionID, in.Environment); err == nil {
		// A proof is minted lazily from the then-current transaction status, but the
		// transaction may later be reversed/cancelled. Move a materialized proof
		// FORWARD into a terminal-negative status (never back to CONFIRMED) so the
		// public page stops showing "verified"; reversed_at is stamped on REVERSED.
		if in.Status != existing.Status && statusIsTerminalNegative(in.Status) {
			return s.updateStatus(ctx, existing.ID, in.Status)
		}
		return existing, nil
	} else if !errors.Is(err, ErrProofNotFound) {
		return nil, err
	}

	ref, err := secureReference()
	if err != nil {
		return nil, err
	}
	proofHash, sig, alg := s.hashAndSign(ref, in)

	_, err = s.pool.Exec(ctx, `
		INSERT INTO transaction_proofs
		  (proof_reference, transaction_id, transfer_id, payment_intent_id, environment,
		   payer_subject_type, payer_subject_id, payer_display_name, payer_handle,
		   payee_subject_type, payee_subject_id, payee_display_name, payee_handle,
		   amount_minor, currency, status, description, method, ledger_reference,
		   proof_hash, signature_key_id, signature_algorithm, signature_value, confirmed_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
		ON CONFLICT (transaction_id, environment) DO NOTHING`,
		ref, in.TransactionID, nz(in.TransferID), nz(in.PaymentIntentID), in.Environment,
		nz(in.PayerSubjectType), nz(in.PayerSubjectID), nz(in.PayerDisplayName), nz(in.PayerHandle),
		nz(in.PayeeSubjectType), nz(in.PayeeSubjectID), nz(in.PayeeDisplayName), nz(in.PayeeHandle),
		in.AmountMinor, in.Currency, in.Status, nz(in.Description), nz(in.Method), nz(in.LedgerReference),
		proofHash, s.keyID, alg, sig, in.ConfirmedAt)
	if err != nil {
		return nil, err
	}
	// Whether we inserted or lost the race, the row now exists — read it back.
	return s.getByTxn(ctx, in.TransactionID, in.Environment)
}

const proofCols = `id, proof_reference, transaction_id, environment,
	COALESCE(payer_display_name,''), COALESCE(payer_handle,''),
	COALESCE(payee_display_name,''), COALESCE(payee_handle,''),
	amount_minor, currency, status, COALESCE(description,''), COALESCE(method,''),
	COALESCE(proof_hash,''), COALESCE(signature_key_id,''), COALESCE(signature_algorithm,''),
	verification_count, issued_at, confirmed_at, reversed_at`

func scanProof(row pgx.Row) (*Proof, error) {
	var p Proof
	err := row.Scan(&p.ID, &p.ProofReference, &p.TransactionID, &p.Environment,
		&p.PayerDisplayName, &p.PayerHandle, &p.PayeeDisplayName, &p.PayeeHandle,
		&p.AmountMinor, &p.Currency, &p.Status, &p.Description, &p.Method,
		&p.ProofHash, &p.SignatureKeyID, &p.SignatureAlg,
		&p.VerificationCount, &p.IssuedAt, &p.ConfirmedAt, &p.ReversedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrProofNotFound
		}
		return nil, err
	}
	return &p, nil
}

func (s *ProofService) getByTxn(ctx context.Context, txnID, env string) (*Proof, error) {
	return scanProof(s.pool.QueryRow(ctx,
		`SELECT `+proofCols+` FROM transaction_proofs WHERE transaction_id=$1 AND environment=$2`, txnID, env))
}

// GetByReference looks up a proof by its public reference (case-insensitive).
func (s *ProofService) GetByReference(ctx context.Context, ref string) (*Proof, error) {
	return scanProof(s.pool.QueryRow(ctx,
		`SELECT `+proofCols+` FROM transaction_proofs WHERE upper(proof_reference)=upper($1)`, ref))
}

// RecordVerification logs a public verification (hashed ip/ua only) and bumps the
// counter. Best-effort: a logging failure must not break verification.
func (s *ProofService) RecordVerification(ctx context.Context, proofID, ipHash, uaHash, country string) {
	_, _ = s.pool.Exec(ctx,
		`INSERT INTO transaction_proof_verifications (proof_id, ip_hash, user_agent_hash, country, result)
		 VALUES ($1,$2,$3,$4,'VERIFIED')`, proofID, nz(ipHash), nz(uaHash), nz(country))
	_, _ = s.pool.Exec(ctx,
		`UPDATE transaction_proofs SET verification_count=verification_count+1, updated_at=now() WHERE id=$1`, proofID)
}

// Public returns the safe, ADR-040-shaped public payload (no sensitive fields).
func (s *ProofService) Public(p *Proof) map[string]any {
	short := p.ProofHash
	if len(short) > 12 {
		short = short[:12]
	}
	out := map[string]any{
		"exists":             true,
		"status":             p.Status,
		"amount":             p.AmountMinor,
		"currency":           p.Currency,
		"payer_display":      p.PayerDisplayName,
		"payer_handle":       p.PayerHandle,
		"payee_display":      p.PayeeDisplayName,
		"payee_handle":       p.PayeeHandle,
		"method":             p.Method,
		"description":        p.Description,
		"issued_at":          p.IssuedAt.UTC().Format(time.RFC3339),
		"verification_url":   s.publicBase + p.ProofReference,
		"verification_count": p.VerificationCount,
		"proof_hash_short":   short,
		"network":            s.network,
		"operator":           s.operatorID,
	}
	if p.ConfirmedAt != nil {
		out["confirmed_at"] = p.ConfirmedAt.UTC().Format(time.RFC3339)
	} else {
		out["confirmed_at"] = nil
	}
	return out
}

// Reference exposes the public reference for a transaction without leaking how it
// is generated — used by the receipt engine.
func nz(s string) any {
	if s == "" {
		return nil
	}
	return s
}
