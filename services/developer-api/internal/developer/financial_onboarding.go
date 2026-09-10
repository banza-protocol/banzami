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
// Project's binding (nil when unbound) and its readiness when bound.
func (s *Service) onboardingView(ctx context.Context, projectID, role string, b *SandboxBinding, r *ProjectReadiness) *FinancialOnboarding {
	v := &FinancialOnboarding{State: OnboardingNotConfigured, CanAct: canConfigureFinancialSandbox(role), Blockers: []string{}}
	if b != nil && b.MerchantID != "" {
		v.CanAct = false
		bus := &OnboardingBusiness{}
		if s.namer != nil {
			if n, err := s.namer.MerchantName(ctx, b.MerchantID); err == nil {
				bus.Name = n
			}
		}
		if r != nil {
			if r.FinancialIdentity.Handle != nil {
				bus.Handle = *r.FinancialIdentity.Handle
			}
			if r.Kyb.Status != nil {
				bus.KybStatus = *r.Kyb.Status
			}
			bus.Verified = bus.KybStatus == "APPROVED"
			v.Blockers = append(v.Blockers, r.Settlement.Blockers...)
		}
		v.Business = bus
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
	if app, err := s.onboarding.LatestForProject(ctx, p.ID); err == nil && app != nil {
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
	return &OnboardingBusiness{Name: t.BusinessName, Handle: "@" + t.Handle, KybStatus: t.KybStatus, Verified: t.KybStatus == "APPROVED"}, nil
}
