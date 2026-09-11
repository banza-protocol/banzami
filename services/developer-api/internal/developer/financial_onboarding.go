package developer

import (
	"context"
	"errors"
	"log/slog"
	"strings"

	"github.com/banzami/banzami/services/developer-api/internal/gatewayclient"
)

// Financial onboarding — how a Project becomes able to receive money.
//
// One Business identity, several onboarding surfaces, one KYB authority. A
// Project does not get a Business of its own making: it either
//
//   - applies for a NEW Business through the same Business application the
//     public form submits — same fields, documents and operator review in
//     BANZADMIN — and approval provisions the Business and binds the Project to
//     it (the Gateway records that as a provisioning step); or
//   - connects a Business that ALREADY EXISTS, with that Business's consent: the
//     Business App issues a single-use code, and redeeming it here binds the
//     Project to it (ADR-055 binding). Nothing is re-verified or re-created, and
//     no handle, wallet or ledger history moves.
//
// This replaces the one-click Sandbox setup that created a synthetic Business
// and marked its KYB approved with nobody reviewing anything. A Project can
// still exist, take keys and integrate without any of this; it only needs a
// Business to receive.

// Onboarding states a Project is shown. About the Project, not the tables.
const (
	OnboardingNotConfigured        = "NOT_CONFIGURED"
	OnboardingInReview             = "IN_REVIEW"
	OnboardingInformationRequired  = "INFORMATION_REQUIRED"
	OnboardingApprovedProvisioning = "APPROVED_PROVISIONING"
	OnboardingRejected             = "REJECTED"
	OnboardingReady                = "READY"
	OnboardingBlocked              = "BLOCKED"
	// OnboardingReadinessUnknown: the Project is bound to a Business, but
	// whether it can settle could not be read just now. Never shown as READY:
	// a failed read is not an answer (A2-26).
	OnboardingReadinessUnknown = "READINESS_UNKNOWN"
)

var (
	// ErrOnboardingUnavailable: this deployment cannot reach the onboarding
	// domain.
	ErrOnboardingUnavailable = errors.New("financial onboarding is not available on this deployment")
	// ErrProjectAlreadyReceiving: the Project already has a Business; a second
	// one is a rebind, which is an operator decision (and refused once sealed).
	ErrProjectAlreadyReceiving = errors.New("this Project already receives into a Business")
	// ErrOneClickSetupRetired: the synthetic self-approved Sandbox Business is
	// gone; a Project applies or connects a Business.
	ErrOneClickSetupRetired = errors.New("a Project's Business is applied for and reviewed, or connected with the Business's consent")
)

// BusinessOnboarding is the Gateway's Business application domain.
type BusinessOnboarding interface {
	LatestForProject(ctx context.Context, projectID string) (*gatewayclient.ProjectApplication, error)
	SubmitForProject(ctx context.Context, in gatewayclient.ApplicationInput) (string, error)
	RedeemLinkCode(ctx context.Context, code, projectID string) (*gatewayclient.LinkTarget, error)
}

// BusinessNamer reads a Business's display name.
type BusinessNamer interface {
	MerchantName(ctx context.Context, merchantID string) (string, error)
}

// BusinessIdentities reads a Business's PUBLIC identity — the name it presents
// and the @banza it owns (the Gateway's business_public_identities). The
// Gateway onboarding client implements it.
type BusinessIdentities interface {
	BusinessPublicIdentity(ctx context.Context, merchantID string) (*gatewayclient.BusinessIdentity, error)
}

// businessPublicIdentity is the Business a Project receives into, as the Console
// names it. The Business's public identity, not merchants.name: for a Business
// made by the retired Console setup the account name is "Sandbox · <Project>",
// and the card under "Este projeto recebe pagamentos no negócio abaixo" showed
// exactly that. Only when no identity source is wired does the account name
// stand in; a failed lookup names nobody.
func (s *Service) businessPublicIdentity(ctx context.Context, merchantID string) (gatewayclient.BusinessIdentity, bool) {
	if ids, ok := s.onboarding.(BusinessIdentities); ok && ids != nil {
		b, err := ids.BusinessPublicIdentity(ctx, merchantID)
		if err != nil || b == nil {
			slog.WarnContext(ctx, "developer.financial_onboarding.business_identity_unavailable", "err", errString(err))
			return gatewayclient.BusinessIdentity{}, false
		}
		return *b, true
	}
	if s.namer != nil {
		if n, err := s.namer.MerchantName(ctx, merchantID); err == nil {
			return gatewayclient.BusinessIdentity{DisplayName: n}, true
		}
	}
	return gatewayclient.BusinessIdentity{}, false
}

func errString(err error) string {
	if err == nil {
		return "no identity"
	}
	return err.Error()
}

// SetBusinessOnboarding wires the Gateway's onboarding domain.
func (s *Service) SetBusinessOnboarding(o BusinessOnboarding) { s.onboarding = o }

// SetBusinessNamer wires the Business name lookup for a bound Project.
func (s *Service) SetBusinessNamer(n BusinessNamer) { s.namer = n }

// OnboardingBusiness is the Business a Project receives into, as the Console
// shows it: its public identity and whether it is verified. No internal id.
type OnboardingBusiness struct {
	Name      string `json:"name"`
	Handle    string `json:"handle"`
	KybStatus string `json:"kyb_status"`
	Verified  bool   `json:"verified"`
}

// FinancialOnboarding is the Project's onboarding, one level above the tables.
type FinancialOnboarding struct {
	State string `json:"state"`
	// CanAct: this member may start an application or connect a Business.
	CanAct      bool                              `json:"can_act"`
	Business    *OnboardingBusiness               `json:"business,omitempty"`
	Application *gatewayclient.ProjectApplication `json:"application,omitempty"`
	// Blockers are the reasons a READY-looking Project cannot settle yet —
	// settlement readiness's own codes, for the Console to explain.
	Blockers []string `json:"blockers"`
}

// onboardingView derives the Project's onboarding state. Called with the
// Project's binding (nil when unbound), its readiness when bound, and whether
// the readiness read failed.
func (s *Service) onboardingView(ctx context.Context, projectID, role string, b *SandboxBinding, r *ProjectReadiness, readinessUnavailable bool) *FinancialOnboarding {
	v := &FinancialOnboarding{State: OnboardingNotConfigured, CanAct: canConfigureFinancialSandbox(role), Blockers: []string{}}
	if b != nil && b.MerchantID != "" {
		v.CanAct = false
		bus := &OnboardingBusiness{}
		identity, known := s.businessPublicIdentity(ctx, b.MerchantID)
		if known {
			bus.Name = identity.DisplayName
			if h := strings.TrimPrefix(identity.Handle, "@"); h != "" {
				bus.Handle = "@" + h
			}
		}
		if r != nil {
			if bus.Handle == "" && r.FinancialIdentity.Handle != nil {
				bus.Handle = *r.FinancialIdentity.Handle
			}
			if r.Kyb.Status != nil {
				bus.KybStatus = *r.Kyb.Status
			}
			bus.Verified = bus.KybStatus == "APPROVED"
			v.Blockers = append(v.Blockers, r.Settlement.Blockers...)
		}
		v.Business = bus
		if readinessUnavailable {
			// No readiness, no blockers — which read as READY. Whether this
			// Project can settle is simply not known right now (A2-26).
			v.State = OnboardingReadinessUnknown
			return v
		}
		v.State = OnboardingReady
		if len(v.Blockers) > 0 {
			v.State = OnboardingBlocked
		}
		return v
	}
	if s.onboarding == nil {
		return v
	}
	app, err := s.onboarding.LatestForProject(ctx, projectID)
	if err != nil {
		slog.WarnContext(ctx, "developer.financial_onboarding.application_unavailable", "project", projectID, "err", err.Error())
		return v
	}
	if app == nil {
		return v
	}
	v.Application = app
	switch app.Status {
	case "SUBMITTED", "UNDER_REVIEW", "DRAFT":
		v.State, v.CanAct = OnboardingInReview, false
	case "INFORMATION_REQUIRED":
		v.State = OnboardingInformationRequired
	case "APPROVED", "PROVISIONING_FAILED":
		// Approved, and the Project is not bound yet: the binding is the last
		// provisioning step, retried by the operator.
		v.State, v.CanAct = OnboardingApprovedProvisioning, false
	case "REJECTED", "CANCELLED":
		v.State = OnboardingRejected
	}
	return v
}

// SubmitFinancialApplication starts a Project's application for a new
// Business. The Project and the submitting member come from the session; the
// browser supplies only the Business's details.
func (s *Service) SubmitFinancialApplication(ctx context.Context, actor, projectID string, in gatewayclient.ApplicationInput, ip, reqID string) (string, error) {
	p, role, err := s.projectAuthz(ctx, actor, projectID)
	if err != nil {
		return "", err
	}
	if !canConfigureFinancialSandbox(role) {
		return "", ErrForbidden
	}
	if s.onboarding == nil {
		return "", ErrOnboardingUnavailable
	}
	if b, err := s.store.ActiveBindingForProject(ctx, p.ID); err != nil {
		return "", ErrUnavailable
	} else if b != nil {
		return "", ErrProjectAlreadyReceiving
	}
	in.ProjectID, in.SubmittedByUserID = p.ID, actor
	id, err := s.onboarding.SubmitForProject(ctx, in)
	if err != nil {
		return "", err
	}
	s.audit(ctx, &actor, &p.WorkspaceID, &projectID, "project.financial_application_submitted",
		"APPLICATION:"+id, ip, reqID, map[string]any{"requested_handle": strings.TrimSpace(in.DesiredHandle)})
	return id, nil
}

// LinkExistingBusiness connects a Business that already exists to the
// Project, with the Business's consent code. The Business is not re-verified
// or re-created; the Project is bound to it (ADR-055) and receives into it.
func (s *Service) LinkExistingBusiness(ctx context.Context, actor, projectID, code, ip, reqID string) (*OnboardingBusiness, error) {
	p, role, err := s.projectAuthz(ctx, actor, projectID)
	if err != nil {
		return nil, err
	}
	if !canConfigureFinancialSandbox(role) {
		return nil, ErrForbidden
	}
	if s.onboarding == nil {
		return nil, ErrOnboardingUnavailable
	}
	if b, err := s.store.ActiveBindingForProject(ctx, p.ID); err != nil {
		return nil, ErrUnavailable
	} else if b != nil {
		return nil, ErrProjectAlreadyReceiving
	}
	// The guard below is the only thing that stops a Project from being bound
	// here while its own application would provision a second Business. It was
	// skipped whenever the Gateway could not answer; a guard that cannot be
	// checked now refuses (A2-25).
	app, err := s.onboarding.LatestForProject(ctx, p.ID)
	if err != nil {
		slog.WarnContext(ctx, "developer.financial_onboarding.application_unavailable", "project", projectID, "err", err.Error())
		return nil, ErrOnboardingUnavailable
	}
	if app != nil {
		switch app.Status {
		case "SUBMITTED", "UNDER_REVIEW", "INFORMATION_REQUIRED", "PROVISIONING_FAILED", "APPROVED":
			// An application in progress would provision a second Business for
			// the same Project. One or the other.
			return nil, &gatewayclient.Refusal{Status: 409, Code: "APPLICATION_IN_PROGRESS",
				Message: "this Project has an application in progress"}
		}
	}
	t, err := s.onboarding.RedeemLinkCode(ctx, code, p.ID)
	if err != nil {
		return nil, err
	}
	if _, err := s.BindProjectSandbox(ctx, p.ID, t.MerchantID, t.WalletID, t.WalletAccountID, actor, ip, reqID); err != nil {
		return nil, err
	}
	s.audit(ctx, &actor, &p.WorkspaceID, &projectID, "project.business_linked",
		"PROJECT:"+projectID, ip, reqID, map[string]any{"merchant_id": t.MerchantID, "handle": t.Handle})
	// Named by its public identity, as the Project's card will name it on every
	// later read; the redeem answer carries the account name.
	name := t.BusinessName
	if _, ok := s.onboarding.(BusinessIdentities); ok {
		identity, known := s.businessPublicIdentity(ctx, t.MerchantID)
		name = identity.DisplayName
		if !known {
			name = ""
		}
	}
	return &OnboardingBusiness{Name: name, Handle: "@" + strings.TrimPrefix(t.Handle, "@"), KybStatus: t.KybStatus, Verified: t.KybStatus == "APPROVED"}, nil
}
