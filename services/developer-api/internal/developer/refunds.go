package developer

import (
	"context"
	"errors"
	"log/slog"
	"strings"
)

// The Console's own refund.
//
// Everything else the Console does with money is a read. This is the first write,
// and it is the one place where pressing a button in a browser takes value back
// out of an account — so the authority for it is spelled out here rather than
// inferred from whoever happens to be signed in.

// canRefund reports whether a workspace role may refund a payment.
//
// OWNER and ADMIN only. The line is drawn at who is accountable for the
// workspace, not at who understands payments: DEVELOPER can create projects and
// issue keys — everything needed to BUILD a refund — and still may not press the
// button that gives a payer their money back from the operator's own console.
// Building the capability and exercising it against real balances are different
// authorities, and a developer key's refund scope is granted deliberately, per
// key, by someone who may refund.
//
// FINANCE is denied, and the name is exactly why the rule is written down. It
// reads like the role that ought to refund, and role names are not permissions:
// nothing in this system has ever granted FINANCE a financial write, and reading
// authority out of a word would grant it here for the first time by accident.
// If FINANCE should refund, that is a decision to make and to record — not one
// to arrive at because the label sounded right.
//
// VIEWER is denied for the obvious reason.
func canRefund(role string) bool { return role == RoleOwner || role == RoleAdmin }

// RefundCapability reports whether the actor may refund under this project, and
// whether the operator has the refund path configured at all. The Console asks
// so it can avoid rendering a control that would refuse — but the answer is
// advice to the UI and nothing else: every refund is authorised again, server
// side, at the moment it is attempted.
type RefundCapability struct {
	// Allowed is true when this actor's role may refund.
	Allowed bool `json:"allowed"`
	// Configured is false when the operator has not wired the refund credential.
	// Distinct from Allowed: "you may not" and "nobody can here" are different
	// facts, and a Console that showed one for the other would send someone to
	// ask for a permission that would not help.
	Configured bool `json:"configured"`
	// Bound is false when the project has no financial owner yet — no ACTIVE
	// binding, so no merchant, so no payments and nothing that could be refunded.
	//
	// This is a third distinct fact and it was missing. A fresh project reported
	// allowed=true, configured=true to its OWNER while balances, transactions and
	// webhooks all answered 404 for want of a payee. The role answer was correct
	// in isolation and the whole was not true: there is nothing here to refund,
	// and saying "you may" is the wrong first thing to tell someone whose project
	// has not been onboarded.
	Bound bool `json:"bound"`
	// Role is the actor's own role, so the Console can say why rather than only
	// that. Never another member's.
	Role string `json:"role"`
}

// RefundRequest is what the Console asks for. The payment is named by id; the
// merchant it belongs to is never accepted from the caller and is always derived.
type RefundRequest struct {
	PaymentID      string
	AmountMinor    int64
	Reason         string
	IdempotencyKey string
}

// RefundResult is what happened.
type RefundResult struct {
	ID          string `json:"id"`
	Status      string `json:"status"`
	AmountMinor int64  `json:"amount_minor"`
	Currency    string `json:"currency"`
}

// Refunder is the Core boundary this needs. An interface so the service can be
// tested without Core, and so an unconfigured operator is a nil value rather
// than a half-built client.
type Refunder interface {
	PaymentSession(ctx context.Context, id string) (*PaymentSource, error)
	CreateRefund(ctx context.Context, merchantID, sourceType, sourceID string,
		amountMinor int64, currency, reason, idempotencyKey string) (*Refund, error)
}

// PaymentSource mirrors what Core reports about a payment's refundable source.
type PaymentSource struct {
	MerchantID  string
	SourceType  string
	SourceID    string
	AmountMinor *int64
	Currency    string
	Status      string
}

// Refund mirrors what Core created.
type Refund struct {
	ID          string
	Status      string
	AmountMinor int64
	Currency    string
	SourceType  string
	SourceID    string
}

// ErrNoRefundSource: the payment exists but nothing has been paid against it.
var ErrNoRefundSource = errors.New("payment has no refundable source")

// ErrNotConfigured: the operator has not wired the refund credential.
var ErrNotConfigured = errors.New("refunds are not configured on this deployment")

// RefundRejection carries Core's own refusal so the reason survives the trip.
type RefundRejection struct {
	Code    string
	Message string
}

func (e *RefundRejection) Error() string { return e.Code + ": " + e.Message }

// SetRefunder wires the Core refund boundary. Until set, ProjectRefund fails
// closed and RefundCapability reports Configured:false.
func (s *Service) SetRefunder(r Refunder) { s.refunder = r }

// ProjectRefundCapability answers what the Console may show.
func (s *Service) ProjectRefundCapability(ctx context.Context, actor, projectID string) (RefundCapability, error) {
	p, role, err := s.projectAuthz(ctx, actor, projectID)
	if err != nil {
		return RefundCapability{}, err
	}
	// The binding is read here rather than inferred from the role, because they
	// answer different questions and only both together mean "you can refund".
	bound := false
	if b, err := s.store.ActiveBindingForProject(ctx, p.ID); err == nil && b != nil && b.MerchantID != "" {
		bound = true
	}
	return RefundCapability{
		Allowed:    canRefund(role),
		Configured: s.refunder != nil,
		Bound:      bound,
		Role:       role,
	}, nil
}

// ProjectRefund refunds a payment made under this project.
//
// The chain is the same one every project-scoped operation here uses, with one
// gate added: session → workspace membership → a role that may refund → the
// project's ACTIVE binding → the merchant it names. The caller supplies a payment
// id, an amount and a reason, and nothing else; the merchant is derived, and the
// payment is then checked to belong to it. Knowing a payment id is not authority
// over the payment — that is the whole reason the check exists rather than
// trusting the id to have come from a page the caller was allowed to see.
func (s *Service) ProjectRefund(ctx context.Context, actor, projectID string, in RefundRequest) (*RefundResult, error) {
	_, role, err := s.projectAuthz(ctx, actor, projectID)
	if err != nil {
		return nil, err
	}
	if !canRefund(role) {
		// Forbidden, not not-found: this caller is a member and already knows the
		// project exists, so there is nothing to conceal and a 404 here would just
		// be a lie about why.
		return nil, ErrForbidden
	}
	if s.refunder == nil {
		return nil, ErrNotConfigured
	}
	if in.AmountMinor <= 0 {
		return nil, ErrValidation
	}
	if strings.TrimSpace(in.IdempotencyKey) == "" {
		// Never minted here. A financial write that invents its own retry key
		// turns one double-submitted form into two refunds.
		return nil, ErrValidation
	}
	merchant, err := s.projectMerchant(ctx, actor, projectID)
	if err != nil {
		return nil, err
	}

	src, err := s.refunder.PaymentSession(ctx, in.PaymentID)
	switch {
	case errors.Is(err, ErrNoRefundSource):
		return nil, ErrNoRefundSource
	case err != nil:
		// Includes "no such payment". A payment this project cannot see and one
		// that does not exist get the same answer, for the same reason projects do.
		return nil, ErrNotFound
	}
	if src.MerchantID == "" || src.MerchantID != merchant {
		// The payment belongs to someone else. Identical answer to a payment that
		// does not exist: otherwise the difference between the two is an oracle
		// for which payment ids are real.
		slog.WarnContext(ctx, "developer.refund.cross_merchant_attempt",
			"project", projectID, "actor", actor)
		return nil, ErrNotFound
	}

	currency := src.Currency
	out, err := s.refunder.CreateRefund(ctx, merchant, src.SourceType, src.SourceID,
		in.AmountMinor, currency, in.Reason, in.IdempotencyKey)
	if err != nil {
		var rej *RefundRejection
		if errors.As(err, &rej) {
			// Core's refusal is the caller's answer: it names a ceiling, a
			// balance or an idempotency conflict, and replacing that with a
			// generic failure would leave someone re-pressing a button that can
			// never work.
			return nil, rej
		}
		slog.ErrorContext(ctx, "developer.refund.failed", "project", projectID, "err", err.Error())
		return nil, ErrUnavailable
	}
	return &RefundResult{
		ID: out.ID, Status: out.Status, AmountMinor: out.AmountMinor, Currency: out.Currency,
	}, nil
}
