package service

import (
	"context"
	"time"

	documents "github.com/banzami/banzami/services/common/documents"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ProofAdminService is the READ-ONLY operator view over transaction_proofs
// (BANZA ADR-023). Proofs are never edited or deleted from here — they are
// immutable public records. Per environment (live / sandbox).
type ProofAdminService struct {
	pool *pgxpool.Pool
}

func NewProofAdminService(pool *pgxpool.Pool) *ProofAdminService {
	return &ProofAdminService{pool: pool}
}

type AdminProof struct {
	ProofReference    string     `json:"proof_reference"`
	TransactionID     string     `json:"transaction_id"`
	Environment       string     `json:"environment"`
	Status            string     `json:"status"`
	AmountMinor       int64      `json:"amount_minor"`
	Currency          string     `json:"currency"`
	PayerDisplayName  string     `json:"payer_display_name,omitempty"`
	PayerHandle       string     `json:"payer_handle,omitempty"`
	PayeeDisplayName  string     `json:"payee_display_name,omitempty"`
	PayeeHandle       string     `json:"payee_handle,omitempty"`
	Method            string     `json:"method,omitempty"`
	Description       string     `json:"description,omitempty"`
	ProofHash         string     `json:"proof_hash,omitempty"`
	SignatureKeyID    string     `json:"signature_key_id,omitempty"`
	SignatureAlg      string     `json:"signature_algorithm,omitempty"`
	VerificationCount int        `json:"verification_count"`
	PublicURL         string     `json:"public_url"`
	IssuedAt          time.Time  `json:"issued_at"`
	ConfirmedAt       *time.Time `json:"confirmed_at,omitempty"`
	ReversedAt        *time.Time `json:"reversed_at,omitempty"`
}

type AdminProofVerification struct {
	VerifiedAt time.Time `json:"verified_at"`
	Country    string    `json:"country,omitempty"`
	Result     string    `json:"result"`
}

const adminProofCols = `proof_reference, transaction_id, environment, status, amount_minor, currency,
	COALESCE(payer_display_name,''), COALESCE(payer_handle,''), COALESCE(payee_display_name,''), COALESCE(payee_handle,''),
	COALESCE(method,''), COALESCE(description,''), COALESCE(proof_hash,''), COALESCE(signature_key_id,''),
	COALESCE(signature_algorithm,''), verification_count, issued_at, confirmed_at, reversed_at`

func scanAdminProof(s interface{ Scan(...any) error }) (*AdminProof, error) {
	var p AdminProof
	if err := s.Scan(&p.ProofReference, &p.TransactionID, &p.Environment, &p.Status, &p.AmountMinor, &p.Currency,
		&p.PayerDisplayName, &p.PayerHandle, &p.PayeeDisplayName, &p.PayeeHandle,
		&p.Method, &p.Description, &p.ProofHash, &p.SignatureKeyID, &p.SignatureAlg,
		&p.VerificationCount, &p.IssuedAt, &p.ConfirmedAt, &p.ReversedAt); err != nil {
		return nil, err
	}
	p.PublicURL = "https://banzami.com/r/" + p.ProofReference
	return &p, nil
}

// List searches by proof_reference or transaction_id (substring), newest-first.
func (s *ProofAdminService) List(ctx context.Context, q string, limit int) ([]AdminProof, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	rows, err := s.pool.Query(ctx, `
		SELECT `+adminProofCols+` FROM transaction_proofs
		 WHERE ($1 = '' OR proof_reference ILIKE '%'||$1||'%' OR transaction_id ILIKE '%'||$1||'%')
		 ORDER BY issued_at DESC LIMIT $2`, q, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AdminProof{}
	for rows.Next() {
		p, err := scanAdminProof(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *p)
	}
	return out, rows.Err()
}

// Get returns one proof + its verification history.
func (s *ProofAdminService) Get(ctx context.Context, ref string) (*AdminProof, []AdminProofVerification, error) {
	// Exact equality. A proof reference has one canonical spelling — upper-case,
	// exact prefix, grouping and alphabet — and that rule is not weaker for an
	// operator than for the public. Case-folding here would let bzm-5eed-0a11 and
	// BZM-5EED-0A11 be the same proof on this surface and different ones on the
	// public surface, which is how two operators reading the same screen end up
	// disagreeing about which reference they are looking at.
	//
	// List() below still searches with ILIKE. That is substring SEARCH, not
	// identity resolution, and it establishes nothing about which proof a
	// reference denotes.
	//
	// The shared grammar decides first, on the reference exactly as received: a
	// non-canonical spelling is not a reference and is answered "not found"
	// without a query.
	if documents.ClassifyProofReference(ref) == documents.ProofRefInvalid {
		return nil, nil, pgx.ErrNoRows
	}
	p, err := scanAdminProof(s.pool.QueryRow(ctx,
		`SELECT `+adminProofCols+` FROM transaction_proofs WHERE proof_reference=$1`, ref))
	if err != nil {
		return nil, nil, err
	}
	rows, err := s.pool.Query(ctx,
		`SELECT v.verified_at, COALESCE(v.country,''), v.result
		   FROM transaction_proof_verifications v
		   JOIN transaction_proofs tp ON tp.id = v.proof_id
		  WHERE tp.proof_reference=$1
		  ORDER BY v.verified_at DESC LIMIT 100`, ref)
	if err != nil {
		return p, nil, err
	}
	defer rows.Close()
	events := []AdminProofVerification{}
	for rows.Next() {
		var e AdminProofVerification
		if err := rows.Scan(&e.VerifiedAt, &e.Country, &e.Result); err != nil {
			return p, nil, err
		}
		events = append(events, e)
	}
	return p, events, rows.Err()
}
