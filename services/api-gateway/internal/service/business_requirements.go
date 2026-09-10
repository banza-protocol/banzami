package service

import (
	"context"
	"strings"

	"github.com/jackc/pgx/v5"
)

// querier is what requirementsFor needs: a pool or a transaction.
type querier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

// Business application requirements — the one place that decides what a
// Business application must contain before an operator may approve it.
//
// The public form, the Developers Console's Financial Setup and BANZADMIN all
// read the same answer; none of them decides a requirement on its own. A form
// can mark a field as required for the applicant's convenience, but the
// Gateway refuses an approval whose requirements are not met, whatever any
// screen said.
//
// Requirements derive from what Banzami must know about a legal entity that
// receives payments in Angola — not from which surface the application came
// through. There is one policy today (entity: any Angolan business;
// capability: receive payments); a second capability that needs more (payouts
// to a bank, application fees) adds items here, labelled with the capability
// that needs them.

// RequirementPolicyVersion identifies the policy an application was checked
// against. Bump it when an item is added or removed.
const RequirementPolicyVersion = "ao-business-2026-09"

// RequirementKind distinguishes information the applicant types from
// documents they attach.
type RequirementKind string

const (
	RequirementField    RequirementKind = "field"
	RequirementDocument RequirementKind = "document"
)

// RequirementItem is one thing the policy asks for.
type RequirementItem struct {
	Code       string          `json:"code"`
	Kind       RequirementKind `json:"kind"`
	Label      string          `json:"label"`
	Capability string          `json:"capability"`
}

// RequirementIssue is a requirement that is not satisfied, and why.
type RequirementIssue struct {
	Code   string          `json:"code"`
	Kind   RequirementKind `json:"kind"`
	Label  string          `json:"label"`
	Reason string          `json:"reason"`
}

// Requirements is an application's standing against the policy.
//
//	currently_due         missing: the applicant must provide it.
//	pending_verification  provided, awaiting the reviewer.
//	errors                provided and refused (a rejected document, a request
//	                      for information); the applicant must correct it.
//	accepted              verified by the reviewer.
type Requirements struct {
	PolicyVersion       string             `json:"policy_version"`
	CurrentlyDue        []RequirementIssue `json:"currently_due"`
	PendingVerification []RequirementIssue `json:"pending_verification"`
	Errors              []RequirementIssue `json:"errors"`
	Accepted            []RequirementIssue `json:"accepted"`
}

// Complete reports whether nothing is missing and nothing refused: the
// application can be decided on.
func (r Requirements) Complete() bool { return len(r.CurrentlyDue) == 0 && len(r.Errors) == 0 }

const capabilityReceive = "receive_payments"

// BusinessApplicationPolicy is the policy, in the order a person fills it in.
var BusinessApplicationPolicy = []RequirementItem{
	{"business_name", RequirementField, "Nome do negócio", capabilityReceive},
	{"desired_handle", RequirementField, "@negócio", capabilityReceive},
	{"category", RequirementField, "Categoria do negócio", capabilityReceive},
	{"email", RequirementField, "Email", capabilityReceive},
	{"phone", RequirementField, "Telefone", capabilityReceive},
	{"nif", RequirementField, "NIF da empresa", capabilityReceive},
	{"province", RequirementField, "Província", capabilityReceive},
	{"municipality", RequirementField, "Município", capabilityReceive},
	{"address", RequirementField, "Endereço do negócio", capabilityReceive},
	{"legal_representative", RequirementField, "Responsável legal", capabilityReceive},
	{"representative_role", RequirementField, "Cargo do responsável", capabilityReceive},
	{"business_activity", RequirementField, "Atividade do negócio", capabilityReceive},
	{"terms_accepted", RequirementField, "Termos e condições", capabilityReceive},
	{"BUSINESS_REGISTRATION", RequirementDocument, "Registo Comercial", capabilityReceive},
	{"REPRESENTATIVE_ID", RequirementDocument, "Documento de identidade do representante", capabilityReceive},
}

// applicationDocState is one document's latest state, by type.
type applicationDocState struct {
	Status          string // UPLOADED | ACCEPTED | REJECTED
	RejectionReason string
}

// EvaluateRequirements checks an application's fields and documents against
// the policy. Pure: the caller loads what it needs.
func EvaluateRequirements(a MerchantApplication, termsAccepted bool, docs map[string]applicationDocState) Requirements {
	r := Requirements{
		PolicyVersion:       RequirementPolicyVersion,
		CurrentlyDue:        []RequirementIssue{},
		PendingVerification: []RequirementIssue{},
		Errors:              []RequirementIssue{},
		Accepted:            []RequirementIssue{},
	}
	field := map[string]string{
		"business_name":        a.BusinessName,
		"desired_handle":       a.DesiredHandle,
		"category":             a.Category,
		"email":                a.Email,
		"phone":                a.Phone,
		"nif":                  a.Nif,
		"province":             a.Province,
		"municipality":         a.Municipality,
		"address":              a.Address,
		"legal_representative": a.LegalRepresentative,
		"representative_role":  a.RepresentativeRole,
		"business_activity":    a.BusinessActivity,
	}
	for _, it := range BusinessApplicationPolicy {
		issue := RequirementIssue{Code: it.Code, Kind: it.Kind, Label: it.Label}
		switch it.Kind {
		case RequirementField:
			provided := strings.TrimSpace(field[it.Code]) != ""
			if it.Code == "terms_accepted" {
				provided = termsAccepted
			}
			if !provided {
				issue.Reason = "MISSING"
				r.CurrentlyDue = append(r.CurrentlyDue, issue)
			}
		case RequirementDocument:
			d, ok := docs[it.Code]
			switch {
			case !ok:
				issue.Reason = "MISSING"
				r.CurrentlyDue = append(r.CurrentlyDue, issue)
			case d.Status == "REJECTED":
				issue.Reason = "REJECTED"
				if d.RejectionReason != "" {
					issue.Reason = "REJECTED: " + d.RejectionReason
				}
				r.Errors = append(r.Errors, issue)
			case d.Status == "ACCEPTED":
				issue.Reason = "ACCEPTED"
				r.Accepted = append(r.Accepted, issue)
			default:
				issue.Reason = "UPLOADED"
				r.PendingVerification = append(r.PendingVerification, issue)
			}
		}
	}
	if a.Status == "INFORMATION_REQUIRED" && strings.TrimSpace(a.InformationRequest) != "" {
		r.Errors = append(r.Errors, RequirementIssue{
			Code: "information_request", Kind: RequirementField, Label: "Pedido de informação", Reason: a.InformationRequest,
		})
	}
	return r
}

// requirementsFor loads an application's terms acceptance and latest documents
// and evaluates them.
func requirementsFor(ctx context.Context, q querier, a MerchantApplication) (Requirements, error) {
	var terms bool
	if err := q.QueryRow(ctx,
		`SELECT terms_accepted_at IS NOT NULL FROM merchant_applications WHERE id = $1`, a.ID).Scan(&terms); err != nil {
		return Requirements{}, err
	}
	rows, err := q.Query(ctx,
		`SELECT DISTINCT ON (document_type) document_type, status, COALESCE(rejection_reason, '')
		   FROM merchant_application_documents
		  WHERE application_id = $1 AND deleted_at IS NULL AND status IN ('UPLOADED', 'ACCEPTED', 'REJECTED')
		  ORDER BY document_type, created_at DESC`, a.ID)
	if err != nil {
		return Requirements{}, err
	}
	defer rows.Close()
	docs := map[string]applicationDocState{}
	for rows.Next() {
		var t string
		var d applicationDocState
		if err := rows.Scan(&t, &d.Status, &d.RejectionReason); err != nil {
			return Requirements{}, err
		}
		docs[t] = d
	}
	if err := rows.Err(); err != nil {
		return Requirements{}, err
	}
	return EvaluateRequirements(a, terms, docs), nil
}
