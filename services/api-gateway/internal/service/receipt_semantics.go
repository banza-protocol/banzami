package service

// Receipt semantics — what a completed operation WAS, derived once, from the
// ledger's own records, for every surface that shows it: the proof and its
// public page, the PDF, the phone's comprovativo and BANZADMIN.
//
// A payment-link payment to @doa once produced three answers — the proof said
// "Para: —", the PDF printed "Payment link: d7c27a5585a4", the phone said
// "para Sandbox · Doa-Sandbox" — while the ledger had credited @doa. Each
// surface was reconstructing the parties its own way, and the receipt path
// assumed every transfer was person-to-person. This file is the only place a
// party, an operation kind or a channel is decided:
//
//   - the recipient is whoever the transfer's recipient id IS: a consumer (a
//     P2P transfer), or a Business wallet (a payment to that Business, whose
//     public identity is business_public_identities — the @handle it owns and
//     the name it presents). Never a Project: a Project that created a link is
//     integration metadata, and nothing here reads one.
//   - the channel is a PAYMENT_LINK when the transfer is that link's payment
//     (its idempotency key names the link), otherwise the @banza address.
//   - a Business's own words — its reference and public context — come from the
//     link and its Payment Session, validated; they are context, never identity.
//
// Anything that cannot be classified is an error, not a guess.

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	documents "github.com/banzami/banzami/services/common/documents"
)

var (
	ErrReceiptSourceNotFound = errors.New("no such operation in this environment")
	// ErrReceiptUndeterminable: the recipient is neither a person nor a Business
	// wallet. Refused rather than rendered with an empty or guessed payee.
	ErrReceiptUndeterminable = errors.New("the operation's recipient cannot be determined")
)

// Metadata keys a Business may set on a Payment Session to describe a payment
// on its receipts. Operator-local and documented (docs/api/receipt-semantics.md);
// every other metadata key stays opaque and is never rendered.
const (
	MetadataMerchantReference = "merchant_reference"
	MetadataDisplayContext    = "display_context"

	maxMerchantReference = 64
	maxDisplayContext    = 120
)

var ErrInvalidMerchantContext = errors.New("invalid merchant_reference or display_context")

// ValidMerchantReference: a Business's own identifier for a payment (an order
// or donation number). Letters, digits, spaces and - _ . / # : only.
func ValidMerchantReference(v string) bool {
	v = strings.TrimSpace(v)
	if v == "" || utf8.RuneCountInString(v) > maxMerchantReference {
		return false
	}
	for _, r := range v {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || r == ' ' || strings.ContainsRune("-_./#:", r) {
			continue
		}
		return false
	}
	return true
}

// ValidDisplayContext: what a payment is for, in the Business's public words.
// Printable text with no markup, no link and no @handle — it describes the
// payment; it cannot name who was paid.
func ValidDisplayContext(v string) bool {
	v = strings.TrimSpace(v)
	if v == "" || utf8.RuneCountInString(v) > maxDisplayContext {
		return false
	}
	if strings.ContainsAny(v, "<>@") || strings.Contains(strings.ToLower(v), "://") {
		return false
	}
	for _, r := range v {
		if !unicode.IsPrint(r) {
			return false
		}
	}
	return true
}

// MerchantContextFromMetadata reads and validates the two display keys of a
// Payment Session's metadata. Absent keys are fine; a present, invalid one is
// refused so the Business learns at creation, not on a receipt.
func MerchantContextFromMetadata(md map[string]any) (reference, context string, err error) {
	if md == nil {
		return "", "", nil
	}
	read := func(key string, valid func(string) bool) (string, error) {
		raw, ok := md[key]
		if !ok || raw == nil {
			return "", nil
		}
		s, isString := raw.(string)
		if !isString || !valid(s) {
			return "", fmt.Errorf("%w: %s", ErrInvalidMerchantContext, key)
		}
		return strings.TrimSpace(s), nil
	}
	if reference, err = read(MetadataMerchantReference, ValidMerchantReference); err != nil {
		return "", "", err
	}
	if context, err = read(MetadataDisplayContext, ValidDisplayContext); err != nil {
		return "", "", err
	}
	return reference, context, nil
}

// ReceiptSemantics derives canonical receipts and issues them as proofs.
type ReceiptSemantics struct {
	pool   *pgxpool.Pool
	proofs *ProofService
}

func NewReceiptSemantics(pool *pgxpool.Pool, proofs *ProofService) *ReceiptSemantics {
	return &ReceiptSemantics{pool: pool, proofs: proofs}
}

const transferSemanticsSQL = `
SELECT t.id::text, t.sender_id::text, t.recipient_id::text, t.amount_minor, t.currency, t.status,
       COALESCE(t.description, ''), t.environment, t.updated_at,
       cs.id IS NOT NULL, COALESCE(cs.handle, ''), COALESCE(cs.display_name, ''),
       cr.id IS NOT NULL, COALESCE(cr.handle, ''), COALESCE(cr.display_name, ''),
       w.id IS NOT NULL, COALESCE(w.merchant_id::text, ''),
       COALESCE(bpi.handle, ''), COALESCE(bpi.display_name, ''),
       pl.id IS NOT NULL, COALESCE(pl.description, ''),
       COALESCE(t.initiated_via, ''),
       COALESCE(ps.metadata ->> 'merchant_reference', ''), COALESCE(ps.metadata ->> 'display_context', '')
  FROM transfers t
  LEFT JOIN consumers cs ON cs.id = t.sender_id
  LEFT JOIN consumers cr ON cr.id = t.recipient_id
  LEFT JOIN wallets w ON w.id = t.recipient_id
  LEFT JOIN business_public_identities bpi ON bpi.merchant_id = w.merchant_id
  LEFT JOIN payment_links pl ON t.idempotency_key = 'pl-pay-' || pl.id::text AND pl.wallet_id = t.recipient_id
  LEFT JOIN payment_sessions ps ON ps.payment_link_id = pl.id
 WHERE t.id::text = $1`

// ForTransfer derives the canonical proof input for a transfer: a person-to-
// person transfer, or a payment to a Business (by link or @handle).
func (s *ReceiptSemantics) ForTransfer(ctx context.Context, transferID, environment string) (ProofInput, error) {
	env, err := proofEnvironment(environment)
	if err != nil {
		return ProofInput{}, err
	}
	var (
		id, senderID, recipientID, currency, status, description, rowEnv string
		amount                                                           int64
		updatedAt                                                        time.Time
		senderIsConsumer                                                 bool
		senderHandle, senderName                                         string
		recipientIsConsumer                                              bool
		recipientHandle, recipientName                                   string
		recipientIsWallet                                                bool
		merchantID, businessHandle, businessName                         string
		fromLink                                                         bool
		linkDescription, initiatedVia, sessionRef, sessionContext        string
	)
	err = s.pool.QueryRow(ctx, transferSemanticsSQL, transferID).Scan(
		&id, &senderID, &recipientID, &amount, &currency, &status, &description, &rowEnv, &updatedAt,
		&senderIsConsumer, &senderHandle, &senderName,
		&recipientIsConsumer, &recipientHandle, &recipientName,
		&recipientIsWallet, &merchantID, &businessHandle, &businessName,
		&fromLink, &linkDescription, &initiatedVia, &sessionRef, &sessionContext)
	if errors.Is(err, pgx.ErrNoRows) {
		return ProofInput{}, ErrReceiptSourceNotFound
	}
	if err != nil {
		return ProofInput{}, err
	}
	// One environment's receipt never describes another's operation.
	if !strings.EqualFold(rowEnv, env) {
		return ProofInput{}, ErrReceiptSourceNotFound
	}
	if !senderIsConsumer {
		return ProofInput{}, ErrReceiptUndeterminable
	}

	confirmed := updatedAt
	in := ProofInput{
		TransactionID: id, TransferID: id, Environment: env,
		PayerSubjectType: "consumer", PayerSubjectID: senderID,
		PayerDisplayName: personName(senderName, senderHandle), PayerHandle: senderHandle,
		AmountMinor: amount, Currency: currency, Status: status,
		LedgerReference: id, ConfirmedAt: &confirmed,
		FundingSource: documents.FundingBanzamiBalance,
		Method:        documents.FundingLabel(documents.FundingBanzamiBalance),
	}

	// A recorded channel beats a derived one. The derivation below reads the
	// row's shape — joined to a payment link, or not — which was complete while
	// a handle and a link were the only ways to move money. A QR payment joins no
	// link and otherwise looks exactly like a handle transfer, so it would be
	// signed as "paid by @banza": a proof asserting something the payer did not
	// do. Transfers that predate the column say nothing and keep the derivation
	// that was correct for them.
	recordedChannel := func(fallback string) string {
		if initiatedVia == "QR" {
			return documents.ChannelQR
		}
		return fallback
	}

	switch {
	case recipientIsConsumer:
		in.OperationKind = documents.OperationP2PTransfer
		in.Channel = recordedChannel(documents.ChannelHandle)
		in.PayeeSubjectType, in.PayeeSubjectID = "consumer", recipientID
		in.PayeeDisplayName, in.PayeeHandle = personName(recipientName, recipientHandle), recipientHandle
		in.Description = description // the sender's own note
	case recipientIsWallet && merchantID != "":
		in.OperationKind = documents.OperationPayment
		in.PayeeSubjectType, in.PayeeSubjectID = "merchant", merchantID
		in.PayeeDisplayName, in.PayeeHandle = businessName, businessHandle
		if fromLink {
			in.Channel = documents.ChannelPaymentLink
			// The transfer's own description on a link payment was generated by the
			// pay path ("Payment link: <slug>"); what the payer should read is what
			// the Business wrote on the link — and only that.
			in.MerchantReference = validOrEmpty(sessionRef, ValidMerchantReference)
			in.DisplayContext = validOrEmpty(sessionContext, ValidDisplayContext)
			in.Description = distinctText(linkDescription, in.MerchantReference, in.DisplayContext)
		} else {
			in.Channel = recordedChannel(documents.ChannelHandle)
			in.Description = description
		}
	default:
		return ProofInput{}, ErrReceiptUndeterminable
	}
	return in, nil
}

const walletPaymentSemanticsSQL = `
SELECT wp.id::text, wp.consumer_id::text, wp.merchant_id::text, wp.amount_minor, wp.currency, wp.status,
       wp.environment, wp.created_at, wp.payment_link_id IS NOT NULL,
       COALESCE(c.handle, ''), COALESCE(c.display_name, ''),
       COALESCE(bpi.handle, ''), COALESCE(bpi.display_name, '')
  FROM wallet_payments wp
  LEFT JOIN consumers c ON c.id = wp.consumer_id
  LEFT JOIN business_public_identities bpi ON bpi.merchant_id = wp.merchant_id
 WHERE wp.id::text = $1`

// ForWalletPayment derives the canonical proof input for a wallet payment (a
// Business acquiring payment, by QR or link).
func (s *ReceiptSemantics) ForWalletPayment(ctx context.Context, id string) (ProofInput, error) {
	var (
		wpID, consumerID, merchantID, currency, status, env string
		amount                                              int64
		createdAt                                           time.Time
		viaLink                                             bool
		payerHandle, payerName, businessHandle, business    string
	)
	err := s.pool.QueryRow(ctx, walletPaymentSemanticsSQL, id).Scan(
		&wpID, &consumerID, &merchantID, &amount, &currency, &status, &env, &createdAt, &viaLink,
		&payerHandle, &payerName, &businessHandle, &business)
	if errors.Is(err, pgx.ErrNoRows) {
		return ProofInput{}, ErrReceiptSourceNotFound
	}
	if err != nil {
		return ProofInput{}, err
	}
	channel := documents.ChannelQR
	if viaLink {
		channel = documents.ChannelPaymentLink
	}
	return ProofInput{
		TransactionID: wpID, Environment: env,
		PayerSubjectType: "consumer", PayerSubjectID: consumerID,
		PayerDisplayName: personName(payerName, payerHandle), PayerHandle: payerHandle,
		PayeeSubjectType: "merchant", PayeeSubjectID: merchantID,
		PayeeDisplayName: business, PayeeHandle: businessHandle,
		AmountMinor: amount, Currency: currency, Status: status,
		LedgerReference: wpID, ConfirmedAt: &createdAt,
		OperationKind: documents.OperationPayment, Channel: channel,
		FundingSource: documents.FundingBanzamiBalance,
		Method:        documents.FundingLabel(documents.FundingBanzamiBalance),
	}, nil
}

// TransferReceipt returns the canonical receipt of a transfer. issue=true
// establishes its proof (idempotent) and completes a legacy proof's snapshot;
// issue=false only reads — an operator looking at a receipt is not the event
// that creates public proof capability — and returns the derived receipt with
// the existing proof's reference when there is one.
func (s *ReceiptSemantics) TransferReceipt(ctx context.Context, transferID, environment string, issue bool) (documents.Receipt, error) {
	in, err := s.ForTransfer(ctx, transferID, environment)
	if err != nil {
		return documents.Receipt{}, err
	}
	return s.receipt(ctx, in, issue)
}

// WalletPaymentReceipt is the receipt of the operation a wallet payment
// records. A wallet payment is the Business's side of a transfer (its
// transfer_id is never null), and one operation has ONE proof: the Business's
// PDF used to mint a second proof keyed on the wallet payment, so the payer and
// the Business held different references for the same 2 000 Kz. The receipt is
// now the transfer's — the same reference on every surface.
func (s *ReceiptSemantics) WalletPaymentReceipt(ctx context.Context, id string, issue bool) (documents.Receipt, error) {
	var transferID, env string
	err := s.pool.QueryRow(ctx,
		`SELECT transfer_id::text, environment FROM wallet_payments WHERE id::text = $1`, id).Scan(&transferID, &env)
	if errors.Is(err, pgx.ErrNoRows) {
		return documents.Receipt{}, ErrReceiptSourceNotFound
	}
	if err != nil {
		return documents.Receipt{}, err
	}
	return s.TransferReceipt(ctx, transferID, env, issue)
}

func (s *ReceiptSemantics) receipt(ctx context.Context, in ProofInput, issue bool) (documents.Receipt, error) {
	if issue {
		p, err := s.proofs.Ensure(ctx, in)
		if err != nil {
			return documents.Receipt{}, err
		}
		// A proof issued before its semantics existed is completed from the same
		// derivation, with every change recorded (CorrectSemantics).
		if p.OperationKind == "" {
			if p, err = s.proofs.CorrectSemantics(ctx, p, in, SemanticsCorrectionBatch); err != nil {
				return documents.Receipt{}, err
			}
		}
		return s.proofs.Receipt(p, true), nil
	}
	env, err := proofEnvironment(in.Environment)
	if err != nil {
		return documents.Receipt{}, err
	}
	if p, err := s.proofs.getByTxn(ctx, in.TransactionID, env); err == nil && p.OperationKind != "" {
		return s.proofs.Receipt(p, true), nil
	}
	// No (complete) proof: the derived receipt, without a reference to verify.
	r := s.proofs.Receipt(&Proof{
		TransactionID: in.TransactionID, Environment: env, Status: normalizeProofStatus(in.Status),
		PayerSubjectType: in.PayerSubjectType, PayerDisplayName: in.PayerDisplayName, PayerHandle: in.PayerHandle,
		PayeeSubjectType: in.PayeeSubjectType, PayeeDisplayName: in.PayeeDisplayName, PayeeHandle: in.PayeeHandle,
		AmountMinor: in.AmountMinor, Currency: in.Currency, Description: in.Description,
		OperationKind: in.OperationKind, Channel: in.Channel, FundingSource: in.FundingSource,
		MerchantReference: in.MerchantReference, DisplayContext: in.DisplayContext, ConfirmedAt: in.ConfirmedAt,
	}, true)
	if p, err := s.proofs.getByTxn(ctx, in.TransactionID, env); err == nil {
		r.ProofReference, r.VerificationURL = p.ProofReference, s.proofs.publicBase+p.ProofReference
	} else {
		r.ProofReference, r.VerificationURL = "", ""
	}
	return r, nil
}

// personName is a person's display name, or their @handle when they have none.
func personName(name, handle string) string {
	if strings.TrimSpace(name) != "" {
		return strings.TrimSpace(name)
	}
	if handle != "" {
		return "@" + handle
	}
	return ""
}

func validOrEmpty(v string, valid func(string) bool) string {
	if valid(v) {
		return strings.TrimSpace(v)
	}
	return ""
}

// distinctText returns v unless it is empty or says what another shown field
// already says.
func distinctText(v string, others ...string) string {
	t := strings.TrimSpace(v)
	if t == "" {
		return ""
	}
	for _, o := range others {
		if o != "" && strings.EqualFold(t, strings.TrimSpace(o)) {
			return ""
		}
	}
	return v
}
