package documents

// Receipt semantics — the one representation of a completed operation that
// every surface shows: the PDF, the phone's comprovativo, the public verifier
// and BANZADMIN.
//
// It is filled by the operator from the ledger's own records (api-gateway
// service/receipt_semantics.go) and stored as the proof's display snapshot; no
// surface reconstructs a party or a label on its own. Four things are kept
// apart because they are different questions:
//
//	operation   what it was        PAYMENT (to a Business) | P2P_TRANSFER (to a person)
//	channel     how it started     PAYMENT_LINK | QR | HANDLE (an @banza address)
//	funding     where money came   BANZAMI_BALANCE
//	network     where it moved     BANZA — the protocol; Banzami is the operator
//
// "@banza" is how people are addressed, not a payment method, and "liquidação"
// is the settlement operation — neither appears in a payment's wording.

import (
	"strings"
	"time"
)

const (
	OperationPayment     = "PAYMENT"
	OperationP2PTransfer = "P2P_TRANSFER"

	ChannelPaymentLink = "PAYMENT_LINK"
	ChannelQR          = "QR"
	ChannelHandle      = "HANDLE"

	FundingBanzamiBalance = "BANZAMI_BALANCE"

	PartyPerson   = "PERSON"
	PartyBusiness = "BUSINESS"
)

// Party is a participant's PUBLIC identity at the time of the operation. Never
// an internal id. DisplayName of a person is private: it is filled only in the
// payer's or payee's own view, never in the public one.
type Party struct {
	Kind        string `json:"kind"`
	DisplayName string `json:"display_name,omitempty"`
	Handle      string `json:"handle,omitempty"`
}

// Receipt is the canonical view of one operation. JSON is the wire shape the
// operator hands to public-api, admin-api and the apps.
type Receipt struct {
	ProofReference    string     `json:"proof_reference,omitempty"`
	VerificationURL   string     `json:"verification_url,omitempty"`
	OperationKind     string     `json:"operation_kind"`
	Channel           string     `json:"channel,omitempty"`
	FundingSource     string     `json:"funding_source,omitempty"`
	Status            string     `json:"status"`
	AmountMinor       int64      `json:"amount_minor"`
	Currency          string     `json:"currency"`
	Payer             Party      `json:"payer"`
	Payee             Party      `json:"payee"`
	MerchantReference string     `json:"merchant_reference,omitempty"`
	DisplayContext    string     `json:"display_context,omitempty"`
	Description       string     `json:"description,omitempty"`
	ConfirmedAt       *time.Time `json:"confirmed_at,omitempty"`
	Environment       string     `json:"environment"`
	Network           string     `json:"network"`
	Operator          string     `json:"operator"`
	// TransactionID is the operation's own id — an "ID da operação", never a
	// receipt reference. Present only in a party's private view.
	TransactionID string `json:"transaction_id,omitempty"`
}

// OperationLabel is the product word for an operation kind.
func OperationLabel(kind string) string {
	switch kind {
	case OperationPayment:
		return "Pagamento"
	case OperationP2PTransfer:
		return "Transferência"
	}
	return ""
}

// ChannelLabel is how the operation was started, in the product's words.
func ChannelLabel(ch string) string {
	switch ch {
	case ChannelPaymentLink:
		return "Link de pagamento"
	case ChannelQR:
		return "Código QR Banzami"
	case ChannelHandle:
		return "Endereço @banza"
	}
	return ""
}

// FundingLabel is where the money came from.
func FundingLabel(f string) string {
	switch f {
	case FundingBanzamiBalance:
		return "Saldo Banzami"
	}
	return ""
}

// ReceiptDataFromReceipt maps the canonical receipt to the PDF input. The
// perspective only chooses the copy for the Business's own copy ("pagamento
// recebido"); every party, label and instant comes from r.
func ReceiptDataFromReceipt(r Receipt, perspective Perspective) ReceiptData {
	when := time.Time{}
	if r.ConfirmedAt != nil {
		when = *r.ConfirmedAt
	}
	verify := ""
	if strings.TrimSpace(r.ProofReference) != "" {
		verify = "banzami.com/r/" + r.ProofReference
	}
	return ReceiptData{
		ReceiptID:             r.TransactionID,
		TransactionID:         r.TransactionID,
		Reference:             r.ProofReference,
		Perspective:           perspective,
		AmountMinor:           r.AmountMinor,
		Currency:              r.Currency,
		Status:                r.Status,
		CreatedAt:             when,
		CompletedAt:           when,
		IssuedAt:              when,
		PayerName:             r.Payer.DisplayName,
		PayerHandle:           r.Payer.Handle,
		RecipientName:         r.Payee.DisplayName,
		RecipientHandle:       r.Payee.Handle,
		OperationKind:         r.OperationKind,
		Channel:               r.Channel,
		FundingSource:         r.FundingSource,
		MerchantReference:     r.MerchantReference,
		DisplayContext:        r.DisplayContext,
		Description:           r.Description,
		Environment:           r.Environment,
		VerificationReference: verify,
	}
}
