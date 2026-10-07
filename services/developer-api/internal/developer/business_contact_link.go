package developer

// Path B (ADR-060) in the developer service: creating a Sandbox Business only
// after its contact email is verified, enrolling a verified contact on an
// existing managed Business, and linking an existing Business to a Project by
// proving control via that verified contact.
//
// developer-api is the authoriser. Every flow here runs projectAuthz (OWNER/ADMIN
// of the project's workspace). Acting on an EXISTING Business additionally
// requires that the workspace already manages it (ManagedMerchantByHandle fuses
// @banza resolution with that check, so a public handle reveals nothing and
// cannot drive an OTP to someone else's Business). The Gateway binds every
// OTP/grant to subject/merchant/project/environment; the console only ever sees a
// masked contact.

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"

	"github.com/banzami/banzami/services/developer-api/internal/coreclient"
	"github.com/banzami/banzami/services/developer-api/internal/gatewayclient"
)

var (
	// ErrContactVerificationRequired: the chosen flow needs an email-verification
	// code the caller has not completed.
	ErrContactVerificationRequired = errors.New("contact verification is required")
	// ErrNoVerifiedContact: an existing managed Business has no verified contact,
	// so Path B cannot send a link OTP — the caller must enrol a contact first.
	ErrNoVerifiedContact = errors.New("this business has no verified contact")
	// ErrLinkAuthorizationInvalid: the link OTP/grant did not line up (neutral).
	ErrLinkAuthorizationInvalid = errors.New("invalid or expired link authorisation")
	// ErrVerificationCode: a contact/link code was wrong or expired (neutral).
	ErrVerificationCode = errors.New("invalid or expired verification code")
	// ErrVerificationThrottled: too many codes or attempts; wait.
	ErrVerificationThrottled = errors.New("too many attempts; wait before trying again")
	// ErrBusinessNotManaged: the @banza does not resolve to a Business this
	// workspace manages. Neutral: identical to "no such handle" (anti-enumeration).
	ErrBusinessNotManaged = errors.New("business not found")
)

// mapGatewayVerificationErr turns a Gateway refusal into a typed service error.
func mapGatewayVerificationErr(err error) error {
	var refusal *gatewayclient.Refusal
	if errors.As(err, &refusal) {
		switch refusal.Code {
		case "INVALID_CODE":
			return ErrVerificationCode
		case "COOLDOWN", "TOO_MANY_ATTEMPTS":
			return ErrVerificationThrottled
		case "NO_VERIFIED_CONTACT":
			return ErrNoVerifiedContact
		case "LINK_GRANT_EXPIRED":
			return ErrLinkAuthorizationInvalid
		case "BUSINESS_NOT_READY":
			return ErrConflict
		}
		return ErrConflict
	}
	return ErrUnavailable
}

// requireSandboxActor runs the shared authorisation + environment gate for a
// self-service financial flow, returning the project.
func (s *Service) requireSandboxActor(ctx context.Context, actor, projectID string) (*Project, error) {
	p, role, err := s.projectAuthz(ctx, actor, projectID)
	if err != nil {
		return nil, err
	}
	if !canConfigureFinancialSandbox(role) {
		return nil, ErrForbidden
	}
	if !s.sandboxEnv {
		return nil, ErrWrongEnvironment
	}
	if s.onboarding == nil {
		return nil, ErrSetupUnavailable
	}
	return p, nil
}

// StartSandboxBusinessContact (Path A, step 1) sends a verification code to the
// email the developer chose for a NEW Sandbox Business. The subject is the
// project: no Business, no @banza and no wallet exist yet, so nothing is created
// and nothing is captured if the developer abandons the wizard.
func (s *Service) StartSandboxBusinessContact(ctx context.Context, actor, projectID, email, ip, reqID string) (masked string, err error) {
	p, err := s.requireSandboxActor(ctx, actor, projectID)
	if err != nil {
		return "", err
	}
	if b, err := s.store.ActiveBindingForProject(ctx, p.ID); err == nil && b != nil && b.MerchantID != "" {
		return "", ErrConflict // already configured
	}
	masked, gerr := s.onboarding.StartContactVerify(ctx, p.ID, strings.TrimSpace(email))
	if gerr != nil {
		return "", mapGatewayVerificationErr(gerr)
	}
	s.audit(ctx, &actor, &p.WorkspaceID, &projectID, "project.business_contact_verification_started",
		"PROJECT:"+projectID, ip, reqID, map[string]any{"flow": "sandbox_create"})
	return masked, nil
}

// CreateSandboxBusinessVerified (Path A, step 2) finalises a NEW Sandbox Business
// only after the contact code verifies. Order (ADR-060 §17, option B — verify
// before any allocation): confirm the code → provision the Business (the @banza
// is allocated here, atomically) → persist the verified contact → bind the
// Project. A wrong code creates nothing.
func (s *Service) CreateSandboxBusinessVerified(ctx context.Context, actor, projectID, useCase, desiredHandle, code, ip, reqID string) (FinancialSetup, error) {
	p, err := s.requireSandboxActor(ctx, actor, projectID)
	if err != nil {
		return FinancialSetup{}, err
	}
	if b, err := s.store.ActiveBindingForProject(ctx, p.ID); err == nil && b != nil && b.MerchantID != "" {
		return s.ProjectFinancialSetup(ctx, actor, projectID)
	}
	if s.sandboxBusinesses == nil {
		return FinancialSetup{}, ErrSetupUnavailable
	}
	if useCase == "" {
		useCase = UseCaseStandard
	}
	if !validUseCase(useCase) {
		return FinancialSetup{}, ErrInvalidUseCase
	}
	// An application in review finishes that path first.
	if app, aerr := s.onboarding.LatestForProject(ctx, p.ID); aerr == nil && app != nil {
		switch app.Status {
		case "SUBMITTED", "UNDER_REVIEW", "INFORMATION_REQUIRED", "APPROVED", "PROVISIONING_FAILED":
			return FinancialSetup{}, ErrApplicationInProgress
		}
	}

	// 1. The contact code must verify FIRST — the grant is proof the email works.
	grant, _, gerr := s.onboarding.ConfirmContactVerify(ctx, p.ID, strings.TrimSpace(code))
	if gerr != nil {
		return FinancialSetup{}, mapGatewayVerificationErr(gerr)
	}

	// 2. Provision the Business (allocates the chosen @banza atomically).
	biz, perr := s.sandboxBusinesses.ProvisionSandboxBusiness(ctx, p.ID, p.Name, useCase, strings.TrimSpace(desiredHandle))
	if perr != nil || biz == nil || biz.WalletAccountID == "" {
		s.audit(ctx, &actor, &p.WorkspaceID, &projectID, "project.financial_setup_failed",
			"PROJECT:"+projectID, ip, reqID, map[string]any{"stage": "sandbox_business", "use_case": useCase})
		slog.ErrorContext(ctx, "developer.financial_setup.sandbox_business_failed", "project", projectID, "err", fmt.Sprint(perr))
		return FinancialSetup{}, mapProvisionErr(perr)
	}
	if err := s.assertOwnerUnclaimed(ctx, biz.MerchantID, projectID); err != nil {
		return FinancialSetup{}, ErrUnavailable
	}

	// 3. Persist the verified contact against the Business just created.
	if _, cerr := s.onboarding.PersistVerifiedContact(ctx, grant, biz.MerchantID); cerr != nil {
		slog.ErrorContext(ctx, "developer.financial_setup.persist_contact_failed", "project", projectID, "err", fmt.Sprint(cerr))
		return FinancialSetup{}, mapGatewayVerificationErr(cerr)
	}

	// 4. Bind the Project.
	if _, berr := s.BindProjectSandbox(ctx, projectID, biz.MerchantID, biz.WalletID, biz.WalletAccountID, actor, ip, reqID); berr != nil {
		return FinancialSetup{}, berr
	}
	if err := s.store.SetBindingUseCase(ctx, projectID, biz.UseCase); err != nil {
		slog.WarnContext(ctx, "developer.financial_setup.use_case_not_recorded", "project", projectID, "err", err.Error())
	}
	s.audit(ctx, &actor, &p.WorkspaceID, &projectID, "project.business_contact_verified",
		"PROJECT:"+projectID, ip, reqID, map[string]any{"merchant": biz.MerchantID})
	s.audit(ctx, &actor, &p.WorkspaceID, &projectID, "project.financial_setup_configured",
		"PROJECT:"+projectID, ip, reqID, map[string]any{
			"use_case": biz.UseCase, "business_account_type": biz.BusinessAccountType,
			"pricing_profile": biz.PricingProfile, "kyb_status": biz.KybStatus, "contact_verified": true,
		})
	return s.ProjectFinancialSetup(ctx, actor, projectID)
}

// mapProvisionErr maps Core's reasoned provisioning refusal to a typed error,
// mirroring ConfigureProjectFinancialSandbox: the chosen-handle outcomes surface,
// everything else stays a generic conflict (never an availability oracle).
func mapProvisionErr(perr error) error {
	var refusal *coreclient.Refusal
	if errors.As(perr, &refusal) {
		switch refusal.Code {
		case "HANDLE_UNAVAILABLE":
			return ErrHandleUnavailable
		case "INVALID_HANDLE":
			return ErrInvalidHandle
		}
		return ErrConflict
	}
	if errors.Is(perr, coreclient.ErrSandboxBusinessRefused) {
		return ErrConflict
	}
	return ErrUnavailable
}

// ── Path B: link an existing managed Business via its verified contact ───────

// LinkByHandleStart is what StartBusinessLinkByHandle reports to the console: the
// masked destination the link code was sent to, or NeedsContact when the managed
// Business has no verified contact yet (an authorised enrolment is then offered).
type LinkByHandleStart struct {
	MaskedEmail  string `json:"masked_email,omitempty"`
	NeedsContact bool   `json:"needs_contact"`
}

// resolveManagedMerchant resolves a @banza to a merchant this workspace manages,
// or ErrBusinessNotManaged (neutral) when it does not. Handles the leading @.
func (s *Service) resolveManagedMerchant(ctx context.Context, workspaceID, handle string) (string, error) {
	h := strings.ToLower(strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(handle), "@")))
	if h == "" {
		return "", ErrBusinessNotManaged
	}
	merchantID, ok, err := s.store.ManagedMerchantByHandle(ctx, workspaceID, h)
	if err != nil {
		return "", ErrUnavailable
	}
	if !ok {
		return "", ErrBusinessNotManaged
	}
	return merchantID, nil
}

// StartBusinessLinkByHandle (Path B, step 1) resolves the @banza to a Business the
// workspace manages and, if it has a verified contact, sends a link code to that
// contact. If it has none, returns NeedsContact so the authorised UI can offer
// enrolment. Never sends to, or discloses, a request-supplied address.
func (s *Service) StartBusinessLinkByHandle(ctx context.Context, actor, projectID, handle, ip, reqID string) (LinkByHandleStart, error) {
	p, err := s.requireSandboxActor(ctx, actor, projectID)
	if err != nil {
		return LinkByHandleStart{}, err
	}
	if b, err := s.store.ActiveBindingForProject(ctx, p.ID); err == nil && b != nil && b.MerchantID != "" {
		return LinkByHandleStart{}, ErrConflict
	}
	merchantID, err := s.resolveManagedMerchant(ctx, p.WorkspaceID, handle)
	if err != nil {
		return LinkByHandleStart{}, err
	}
	has, _, verr := s.onboarding.VerifiedContact(ctx, merchantID)
	if verr != nil {
		return LinkByHandleStart{}, ErrUnavailable
	}
	if !has {
		return LinkByHandleStart{NeedsContact: true}, nil
	}
	masked, gerr := s.onboarding.StartProjectLink(ctx, merchantID, p.ID)
	if gerr != nil {
		return LinkByHandleStart{}, mapGatewayVerificationErr(gerr)
	}
	s.audit(ctx, &actor, &p.WorkspaceID, &projectID, "project.business_project_link_verification_started",
		"PROJECT:"+projectID, ip, reqID, map[string]any{"merchant": merchantID})
	return LinkByHandleStart{MaskedEmail: masked}, nil
}

// ConfirmBusinessLinkByHandle (Path B, step 2) verifies the link code sent to the
// Business's verified contact, spends the grant, and binds the Project to that
// existing Business — the same wallet and @banza, no duplicate.
func (s *Service) ConfirmBusinessLinkByHandle(ctx context.Context, actor, projectID, handle, code, ip, reqID string) (FinancialSetup, error) {
	p, err := s.requireSandboxActor(ctx, actor, projectID)
	if err != nil {
		return FinancialSetup{}, err
	}
	if b, err := s.store.ActiveBindingForProject(ctx, p.ID); err == nil && b != nil && b.MerchantID != "" {
		return s.ProjectFinancialSetup(ctx, actor, projectID)
	}
	merchantID, err := s.resolveManagedMerchant(ctx, p.WorkspaceID, handle)
	if err != nil {
		return FinancialSetup{}, err
	}
	grant, gerr := s.onboarding.ConfirmProjectLink(ctx, merchantID, p.ID, strings.TrimSpace(code))
	if gerr != nil {
		return FinancialSetup{}, mapGatewayVerificationErr(gerr)
	}
	target, rerr := s.onboarding.RedeemProjectLink(ctx, grant, p.ID)
	if rerr != nil || target == nil {
		return FinancialSetup{}, mapGatewayVerificationErr(rerr)
	}
	if _, berr := s.BindProjectSandbox(ctx, projectID, target.MerchantID, target.WalletID, target.WalletAccountID, actor, ip, reqID); berr != nil {
		return FinancialSetup{}, berr
	}
	s.audit(ctx, &actor, &p.WorkspaceID, &projectID, "project.business_project_linked",
		"PROJECT:"+projectID, ip, reqID, map[string]any{"merchant": target.MerchantID, "via": "verified_contact"})
	return s.ProjectFinancialSetup(ctx, actor, projectID)
}

// StartBusinessContactEnrolment enrols a verified contact on an existing Business
// the workspace manages (resolved by @banza): the code is sent to the email the
// authorised developer supplies for THIS Business. Used when Path B reports
// NeedsContact. The subject is the merchant.
func (s *Service) StartBusinessContactEnrolment(ctx context.Context, actor, projectID, handle, email, ip, reqID string) (masked string, err error) {
	p, err := s.requireSandboxActor(ctx, actor, projectID)
	if err != nil {
		return "", err
	}
	merchantID, err := s.resolveManagedMerchant(ctx, p.WorkspaceID, handle)
	if err != nil {
		return "", err
	}
	masked, gerr := s.onboarding.StartContactVerify(ctx, merchantID, strings.TrimSpace(email))
	if gerr != nil {
		return "", mapGatewayVerificationErr(gerr)
	}
	s.audit(ctx, &actor, &p.WorkspaceID, &projectID, "project.business_contact_verification_started",
		"PROJECT:"+projectID, ip, reqID, map[string]any{"flow": "enrolment", "merchant": merchantID})
	return masked, nil
}

// ConfirmBusinessContactEnrolment verifies the enrolment code and persists the
// verified contact on the managed Business.
func (s *Service) ConfirmBusinessContactEnrolment(ctx context.Context, actor, projectID, handle, code, ip, reqID string) (masked string, err error) {
	p, err := s.requireSandboxActor(ctx, actor, projectID)
	if err != nil {
		return "", err
	}
	merchantID, err := s.resolveManagedMerchant(ctx, p.WorkspaceID, handle)
	if err != nil {
		return "", err
	}
	grant, _, gerr := s.onboarding.ConfirmContactVerify(ctx, merchantID, strings.TrimSpace(code))
	if gerr != nil {
		return "", mapGatewayVerificationErr(gerr)
	}
	masked, cerr := s.onboarding.PersistVerifiedContact(ctx, grant, merchantID)
	if cerr != nil {
		return "", mapGatewayVerificationErr(cerr)
	}
	s.audit(ctx, &actor, &p.WorkspaceID, &projectID, "project.business_contact_verified",
		"PROJECT:"+projectID, ip, reqID, map[string]any{"flow": "enrolment", "merchant": merchantID})
	return masked, nil
}
