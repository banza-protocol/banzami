package service

// Completing the display snapshot of a proof issued before its semantics
// existed — or issued with a snapshot wrong by construction (the payee of a
// payment-link payment written as an empty consumer).
//
// A proof is a historical document. This fills what is MISSING and fixes what
// was WRONG BY CONSTRUCTION; it never replaces a legitimate snapshot with
// today's value (a person who later changed handle keeps the handle the proof
// was issued with). The reference, amount, currency, instants and the payer's
// ledger identity are never touched — the database refuses it
// (transaction_proofs_financial_facts_immutable). Every changed field is
// recorded in transaction_proof_corrections with its previous value and the
// hash and signature the proof carried before. When the signed payload changes
// (the payee's @handle is part of it) the proof is re-signed under the operator
// key, by the same implementation that minted it.

import (
	"context"
	"fmt"
	"regexp"
	"strings"
)

// SemanticsCorrectionBatch names this correction in the audit record.
const SemanticsCorrectionBatch = "payment-semantics-v1"

// technicalLinkDescription is the text the pay path used to generate for a
// link payment. It carried an internal id and no meaning for the payer.
var technicalLinkDescription = regexp.MustCompile(`^Payment link: [A-Za-z0-9_-]+$`)

// legacyMethods are the method lines that mixed the channel, the @banza
// namespace and the network into one string.
var legacyMethods = map[string]bool{
	"":                               true,
	"Transferência Banzami · @banza": true,
	"Pagamento por QR · @banza":      true,
	"QR":                             true,
}

type proofCorrection struct{ field, previous, corrected string }

// CorrectSemantics completes p from derived — the canonical input for the same
// operation (ReceiptSemantics) — and returns the proof as stored afterwards.
// Idempotent: a field already corrected in this batch is not corrected again.
func (s *ProofService) CorrectSemantics(ctx context.Context, p *Proof, derived ProofInput, batch string) (*Proof, error) {
	if derived.TransactionID != p.TransactionID {
		return nil, fmt.Errorf("correction for %s derived from a different operation", p.ID)
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var cur struct {
		payeeType, payeeID, payeeName, payeeHandle string
		description, method                        string
		operation, channel, funding, ref, context  string
		payerHandle, status, ledgerRef             string
		hash, signature                            string
	}
	if err := tx.QueryRow(ctx, `
		SELECT COALESCE(payee_subject_type,''), COALESCE(payee_subject_id,''), COALESCE(payee_display_name,''), COALESCE(payee_handle,''),
		       COALESCE(description,''), COALESCE(method,''),
		       COALESCE(operation_kind,''), COALESCE(channel,''), COALESCE(funding_source,''),
		       COALESCE(merchant_reference,''), COALESCE(display_context,''),
		       COALESCE(payer_handle,''), status, COALESCE(ledger_reference,''),
		       COALESCE(proof_hash,''), COALESCE(signature_value,'')
		  FROM transaction_proofs WHERE id = $1 FOR UPDATE`, p.ID).Scan(
		&cur.payeeType, &cur.payeeID, &cur.payeeName, &cur.payeeHandle,
		&cur.description, &cur.method,
		&cur.operation, &cur.channel, &cur.funding, &cur.ref, &cur.context,
		&cur.payerHandle, &cur.status, &cur.ledgerRef,
		&cur.hash, &cur.signature); err != nil {
		return nil, err
	}

	next := cur
	var changes []proofCorrection
	set := func(field string, dst *string, value string) {
		if *dst == value {
			return
		}
		changes = append(changes, proofCorrection{field, *dst, value})
		*dst = value
	}

	// Semantics that did not exist when the proof was issued.
	if cur.operation == "" {
		set("operation_kind", &next.operation, derived.OperationKind)
	}
	if cur.channel == "" {
		set("channel", &next.channel, derived.Channel)
	}
	if cur.funding == "" {
		set("funding_source", &next.funding, derived.FundingSource)
	}
	if cur.ref == "" && derived.MerchantReference != "" {
		set("merchant_reference", &next.ref, derived.MerchantReference)
	}
	if cur.context == "" && derived.DisplayContext != "" {
		set("display_context", &next.context, derived.DisplayContext)
	}
	// The payee, when the snapshot has no identity for it (no @handle — the
	// empty payee of a link payment, or a Business snapshotted by account name
	// only) or names the wrong kind of party (a Business wallet written as a
	// consumer). A complete, right-kind snapshot is history and stays.
	wrongKind := !strings.EqualFold(cur.payeeType, derived.PayeeSubjectType)
	if (cur.payeeHandle == "" || wrongKind) && (derived.PayeeHandle != "" || derived.PayeeDisplayName != "") {
		set("payee_subject_type", &next.payeeType, derived.PayeeSubjectType)
		set("payee_subject_id", &next.payeeID, derived.PayeeSubjectID)
		set("payee_display_name", &next.payeeName, derived.PayeeDisplayName)
		set("payee_handle", &next.payeeHandle, derived.PayeeHandle)
	}
	// A generated technical description on a link payment is replaced by what
	// the Business wrote on the link (or nothing).
	if technicalLinkDescription.MatchString(cur.description) && derived.Channel == "PAYMENT_LINK" {
		set("description", &next.description, derived.Description)
	}
	if legacyMethods[cur.method] {
		set("method", &next.method, derived.Method)
	}

	if len(changes) == 0 {
		return p, tx.Commit(ctx)
	}

	// Re-sign only when the signed payload changed.
	nextHash, nextSig := cur.hash, cur.signature
	if next.payeeHandle != cur.payeeHandle {
		nextHash, nextSig, _ = s.hashAndSign(p.ProofReference, ProofInput{
			TransactionID: p.TransactionID, AmountMinor: p.AmountMinor, Currency: p.Currency,
			PayerHandle: cur.payerHandle, PayeeHandle: next.payeeHandle, Status: cur.status,
			ConfirmedAt: p.ConfirmedAt, LedgerReference: cur.ledgerRef,
		})
		changes = append(changes, proofCorrection{"proof_hash", cur.hash, nextHash})
	}

	if _, err := tx.Exec(ctx, `
		UPDATE transaction_proofs
		   SET payee_subject_type = $2, payee_subject_id = $3, payee_display_name = $4, payee_handle = $5,
		       description = $6, method = $7,
		       operation_kind = $8, channel = $9, funding_source = $10,
		       merchant_reference = $11, display_context = $12,
		       proof_hash = $13, signature_value = $14, updated_at = now()
		 WHERE id = $1`,
		p.ID, nz(next.payeeType), nz(next.payeeID), nz(next.payeeName), nz(next.payeeHandle),
		nz(next.description), nz(next.method),
		nz(next.operation), nz(next.channel), nz(next.funding),
		nz(next.ref), nz(next.context), nz(nextHash), nz(nextSig)); err != nil {
		return nil, err
	}
	for _, c := range changes {
		if _, err := tx.Exec(ctx, `
			INSERT INTO transaction_proof_corrections
			  (proof_id, correction_batch, field, previous_value, corrected_value, previous_proof_hash, previous_signature_value, reason)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			ON CONFLICT (proof_id, correction_batch, field) DO NOTHING`,
			p.ID, batch, c.field, nz(c.previous), nz(c.corrected), nz(cur.hash), nz(cur.signature),
			"receipt semantics derived from the ledger recipient, the payment link and its Payment Session"); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return s.getByTxn(ctx, p.TransactionID, p.Environment)
}
