package developer

import (
	"context"
	"errors"
	"log/slog"
)

// Sandbox financial setup — making a project able to take a test payment.
//
// A project created in the Console has no financial owner. Until this existed,
// the only way it got one was an operator calling an internal route: the
// developer could not perform it, could not request it, and could not see it
// pending. Balances, transactions and webhooks simply answered not-found until
// somebody, somewhere, did something. That is not an onboarding step, it is an
// absence, and an external developer had no way through it.
//
// This is the developer's own action. It provisions the project a Sandbox
// financial owner and records the binding that names it — one call, from the
// Console, by someone who already has authority over the project.
//
// It is SANDBOX ONLY, and the check is not a formality. Financial LIVE is
// fail-closed for reasons that have nothing to do with this feature, and a
// self-service path into a real-money owner is exactly the thing that must not
// exist.
//
// A project carries no environment of its own — there is no such column, because
// the Console has only ever issued Sandbox projects. So the gate is the
// deployment's environment, set once at startup from configuration and never
// from a request, in the same fail-closed shape the operator fixture path uses
// (RA-055): sandbox enables it, and anything else, including an unrecognised
// value, leaves it off.

// The states a developer is shown. Deliberately about their project rather than
// about the operator's tables: "your Sandbox is ready" is the fact; which
// merchant row carries it is not theirs to know.
const (
	// FinancialUnconfigured — no owner yet. The starting state of every project.
	FinancialUnconfigured = "UNCONFIGURED"
	// FinancialReady — an owner exists and the project is bound to it. Payments,
	// wallet accounts, balances, transactions and refunds all work from here.
	FinancialReady = "READY"
	// FinancialSealed — READY, and the destination can no longer change because a
	// payer-facing artifact has been issued against it (ADR-055).
	FinancialSealed = "SEALED"
	// FinancialUnavailable — this deployment cannot provision. Distinct from
	// UNCONFIGURED: nobody can fix it from the Console.
	FinancialUnavailable = "UNAVAILABLE"
)

// FinancialSetup is what the Console reads and renders.
type FinancialSetup struct {
	State string `json:"state"`
	// Environment is the project's own, echoed so the Console can say "Sandbox"
	// without inferring it.
	Environment string `json:"environment"`
	// CanConfigure is whether THIS member may perform the setup. Advice to the
	// UI; the server authorises again on the attempt.
	CanConfigure bool `json:"can_configure"`
	// Role is the actor's own, so the Console can say why rather than only that.
	Role string `json:"role"`
	// Sealed mirrors the binding's artifact state, so the Console can show that
	// the destination is locked without explaining what a binding is.
	Sealed bool `json:"sealed"`
	// Readiness is whether the project can SETTLE, and what blocks it — the same
	// contract a Project key reads at GET /v1/financial-setup, from the same
	// engine. Nil while the project is unconfigured, or when it could not be
	// read (ReadinessUnavailable), which is never reported as a blocker.
	Readiness            *ProjectReadiness `json:"readiness"`
	ReadinessUnavailable bool              `json:"readiness_unavailable"`
	// Onboarding is how this Project gets (or got) a Business to receive into:
	// its application, the Business it is connected to, and what blocks it.
	Onboarding *FinancialOnboarding `json:"onboarding"`
}

// ReadinessReader asks core whether a financial owner can settle. Core evaluates
// every prerequisite with the function settlement itself calls; this service
// only renders the answer.
type ReadinessReader interface {
	SettlementReadiness(ctx context.Context, merchantID string) (*ProjectReadiness, error)
}

// SetReadinessReader wires core's settlement readiness engine.
func (s *Service) SetReadinessReader(r ReadinessReader) { s.readiness = r }

// ProjectReadiness is the public readiness projection, field for field the one
// the gateway serves a Project key. No internal identifier appears in it.
type ProjectReadiness struct {
	FinancialIdentity struct {
		Handle *string `json:"handle"`
	} `json:"financial_identity"`
	Kyb struct {
		Status *string `json:"status"`
	} `json:"kyb"`
	Wallet struct {
		Status   *string `json:"status"`
		Ready    bool    `json:"ready"`
		Currency string  `json:"currency"`
	} `json:"wallet"`
	Pricing struct {
		Profile       *string `json:"profile"`
		SettlementBps *uint32 `json:"settlement_bps"`
		PayoutBps     *uint32 `json:"payout_bps"`
	} `json:"pricing"`
	FeeDestination struct {
		Handle                  *string `json:"handle"`
		Required                bool    `json:"required"`
		Resolved                bool    `json:"resolved"`
		OwnedByProject          bool    `json:"owned_by_project"`
		KybApproved             bool    `json:"kyb_approved"`
		WalletActive            bool    `json:"wallet_active"`
		TypeAllowed             bool    `json:"type_allowed"`
		ApplicationAccountReady bool    `json:"application_account_ready"`
		Eligible                bool    `json:"eligible"`
		Blocker                 *string `json:"blocker"`
	} `json:"fee_destination"`
	Settlement struct {
		Ready    bool     `json:"ready"`
		Blockers []string `json:"blockers"`
		Warnings []string `json:"warnings"`
	} `json:"settlement"`
}

// canConfigureFinancialSandbox reports whether a role may give a project its
// financial owner.
//
// OWNER and ADMIN. Deliberately NOT canBuild, which also admits DEVELOPER:
// creating projects and issuing keys is building, and choosing that a project
// starts holding money — even fictional money — is an account decision. It is
// the same line refunds are drawn on, and drawn separately rather than by
// reusing that predicate, because the two could reasonably diverge later and a
// shared function would hide it.
//
// FINANCE and VIEWER are denied. FINANCE is denied for the reason it always is
// here: the name is not the permission.
func canConfigureFinancialSandbox(role string) bool {
	return role == RoleOwner || role == RoleAdmin
}

// SandboxProvisioner creates a Sandbox financial owner and gives it a pricing
// policy. An interface so the service is testable without Core, and so an
// unconfigured deployment is a nil value rather than a half-built client.
type SandboxProvisioner interface {
	ProvisionSandboxOwner(ctx context.Context, name, email string) (*SandboxOwner, error)
	// ProvisionSandboxReadiness completes the Business so it can SETTLE, not
	// merely receive: the @banza handle settlement names its parties by, and the
	// Sandbox KYB state ADR-028 requires of a fee destination. Core refuses it in
	// LIVE on its own reading of the environment.
	ProvisionSandboxReadiness(ctx context.Context, merchantID, projectID string) (handle, kybStatus string, err error)
	// AssignPricingProfile records which operator-governed policy prices this
	// owner. Provisioning assigns the explicit Sandbox default, so a new project
	// is priced by a rule that says zero — never by nothing matching.
	AssignPricingProfile(ctx context.Context, merchantID, profileCode string) error
}

// SandboxDefaultPricingProfile is what every self-provisioned project gets.
//
// Its rate is zero, and it is assigned rather than assumed. "Unpriced" and
// "priced at zero" look identical in a fee column and are completely different
// facts: one is a decision, the other is an absence that used to be worth the
// whole fee to whoever noticed.
const SandboxDefaultPricingProfile = "sandbox-default"

// SandboxOwner is what Core provisioned.
type SandboxOwner struct {
	MerchantID      string
	WalletID        string
	WalletAccountID string
}

// ErrWrongEnvironment: financial setup was attempted somewhere it must never work.
var ErrWrongEnvironment = errors.New("financial setup is available in sandbox only")

// ErrSetupUnavailable: the deployment cannot provision.
var ErrSetupUnavailable = errors.New("sandbox financial setup is not available on this deployment")

// SetSandboxProvisioner wires the provisioning boundary. Until set, setup
// reports UNAVAILABLE rather than failing when someone presses the button.
func (s *Service) SetSandboxProvisioner(p SandboxProvisioner) { s.provisioner = p }

// SetSandboxEnvironment gates self-service financial setup to a Sandbox
// deployment. Main sets this true ONLY in a sandbox environment, so the path is
// hard-disabled everywhere else regardless of any other configuration — the same
// shape as the fixture gate, for the same reason.
func (s *Service) SetSandboxEnvironment(sandbox bool) { s.sandboxEnv = sandbox }

// ProjectFinancialSetup answers what the Console should show.
func (s *Service) ProjectFinancialSetup(ctx context.Context, actor, projectID string) (FinancialSetup, error) {
	p, role, err := s.projectAuthz(ctx, actor, projectID)
	if err != nil {
		return FinancialSetup{}, err
	}
	out := FinancialSetup{
		Environment:  s.environmentName(),
		Role:         role,
		CanConfigure: canConfigureFinancialSandbox(role) && s.onboarding != nil,
		State:        FinancialUnconfigured,
	}
	b, err := s.store.ActiveBindingForProject(ctx, p.ID)
	if err != nil {
		return FinancialSetup{}, ErrUnavailable
	}
	if b != nil && b.MerchantID != "" {
		out.CanConfigure = false
		out.Sealed = b.ArtifactCreated
		out.State = FinancialReady
		if b.ArtifactCreated {
			out.State = FinancialSealed
		}
		if s.readiness != nil {
			r, rerr := s.readiness.SettlementReadiness(ctx, b.MerchantID)
			if rerr != nil {
				// The setup is still READY: readiness is a second question, and a
				// read that failed is not an answer to it.
				slog.WarnContext(ctx, "developer.financial_setup.readiness_unavailable",
					"project", projectID, "err", rerr.Error())
				out.ReadinessUnavailable = true
			} else {
				out.Readiness = r
			}
		}
	} else if s.onboarding == nil {
		out.State = FinancialUnavailable
	}
	out.Onboarding = s.onboardingView(ctx, p.ID, role, b, out.Readiness, out.ReadinessUnavailable)
	if out.Onboarding.State != OnboardingNotConfigured && out.Onboarding.State != OnboardingRejected &&
		out.Onboarding.State != OnboardingInformationRequired {
		out.CanConfigure = false
	}
	return out, nil
}

// ConfigureProjectFinancialSandbox gives the project a Sandbox financial owner.
//
// Idempotent by the only measure that matters: a project that already has an
// ACTIVE binding gets that binding back, not a second owner. Two callers racing
// converge on one, because the binding insert is the single point where "there
// is already one" is decided — and it decides it in the database, not here.
//
// The caller supplies a project id and nothing else. There is no field for a
// merchant, a wallet or an owner, so there is none to aim: the owner is created
// by this operation and named after the project it belongs to.
func (s *Service) ConfigureProjectFinancialSandbox(ctx context.Context, actor, projectID, ip, reqID string) (FinancialSetup, error) {
	p, role, err := s.projectAuthz(ctx, actor, projectID)
	if err != nil {
		return FinancialSetup{}, err
	}
	if !canConfigureFinancialSandbox(role) {
		return FinancialSetup{}, ErrForbidden
	}
	// A Project that already receives keeps receiving: this answers with its
	// state, as it always did for a double click.
	if b, err := s.store.ActiveBindingForProject(ctx, p.ID); err == nil && b != nil && b.MerchantID != "" {
		return s.ProjectFinancialSetup(ctx, actor, projectID)
	}
	// Anything else is retired. The one-click setup created a synthetic
	// Business and wrote its KYB as approved with nobody reviewing anything —
	// a second KYB authority, reachable by any Project owner. A Project now
	// applies through the Business review, or connects an existing Business
	// with its consent (financial_onboarding.go).
	s.audit(ctx, &actor, &p.WorkspaceID, &projectID, "project.one_click_setup_refused",
		"PROJECT:"+projectID, ip, reqID, map[string]any{"reason": "retired"})
	return FinancialSetup{}, ErrOneClickSetupRetired
}

// assertOwnerUnclaimed refuses an owner that another project already holds.
//
// Fail-closed by construction: any binding on this merchant that is not this
// project's own is a refusal, and so is a read that did not work. "I could not
// check" and "it is free" must never be the same answer here — the thing being
// checked is whether this project is about to be handed another project's money.
func (s *Service) assertOwnerUnclaimed(ctx context.Context, merchantID, projectID string) error {
	holders, err := s.store.ProjectsBoundToMerchant(ctx, merchantID)
	if err != nil {
		return ErrUnavailable
	}
	for _, held := range holders {
		if held != projectID {
			return ErrConflict
		}
	}
	return nil
}

// provisionStage names how far provisioning got, for the audit trail. No secret
// is involved: these are opaque core ids, and knowing that the merchant was made
// and the wallet was not is exactly what a reconciliation needs.
func provisionStage(o *SandboxOwner) string {
	switch {
	case o == nil || o.MerchantID == "":
		return "merchant"
	case o.WalletID == "":
		return "wallet"
	default:
		return "primary_account"
	}
}

// environmentName is what the Console shows. It reports the deployment's
// environment rather than inventing a per-project one, because there is not one.
func (s *Service) environmentName() string {
	if s.sandboxEnv {
		return "SANDBOX"
	}
	return "UNAVAILABLE"
}
