package developer

import (
	"context"
	"strings"

	"github.com/banzami/banzami/services/developer-api/internal/coreclient"
)

// coreProvisioner adapts the Core client to the SandboxProvisioner the service
// asks for, so the domain states its own rules without importing a transport.
type coreProvisioner struct{ c *coreclient.ProvisionClient }

// NewSandboxProvisioner returns nil when the client is nil, so an unconfigured
// deployment stays nil all the way to the state answer rather than becoming a
// client that fails at the point of use.
func NewSandboxProvisioner(c *coreclient.ProvisionClient) SandboxProvisioner {
	if c == nil {
		return nil
	}
	return &coreProvisioner{c: c}
}

func (p *coreProvisioner) AssignPricingProfile(ctx context.Context, merchantID, profileCode string) error {
	return p.c.AssignPricingProfile(ctx, merchantID, profileCode)
}

func (p *coreProvisioner) ProvisionSandboxReadiness(ctx context.Context, merchantID, projectID string) (string, string, error) {
	return p.c.ProvisionSandboxReadiness(ctx, merchantID, projectID)
}

func (p *coreProvisioner) ProvisionSandboxOwner(ctx context.Context, name, email string) (*SandboxOwner, error) {
	o, err := p.c.ProvisionSandboxOwner(ctx, name, email)
	if o == nil {
		return nil, err
	}
	// Returned even on error: how far provisioning got is what a reconciliation
	// needs, and discarding it would turn a resumable failure into a mystery.
	return &SandboxOwner{
		MerchantID:      o.MerchantID,
		WalletID:        o.WalletID,
		WalletAccountID: o.WalletAccountID,
	}, err
}

// NewReadinessReader adapts core's settlement readiness to the Console's
// projection. Nil when core is not configured.
func NewReadinessReader(c *coreclient.ProvisionClient) ReadinessReader {
	if c == nil {
		return nil
	}
	return &coreReadiness{c: c}
}

type coreReadiness struct{ c *coreclient.ProvisionClient }

func (r *coreReadiness) SettlementReadiness(ctx context.Context, merchantID string) (*ProjectReadiness, error) {
	cr, err := r.c.SettlementReadiness(ctx, merchantID)
	if err != nil {
		return nil, err
	}
	return projectReadiness(cr), nil
}

func atHandle(h *string) *string {
	if h == nil || *h == "" {
		return nil
	}
	v := "@" + strings.TrimPrefix(*h, "@")
	return &v
}

// projectReadiness renders core's answer. Nothing is recomputed.
func projectReadiness(cr *coreclient.SettlementReadiness) *ProjectReadiness {
	out := &ProjectReadiness{}
	out.FinancialIdentity.Handle = atHandle(cr.FinancialIdentity.Handle)
	if cr.Kyb.Status != "" {
		k := cr.Kyb.Status
		out.Kyb.Status = &k
	}
	out.Wallet.Status, out.Wallet.Ready, out.Wallet.Currency = cr.Wallet.Status, cr.Wallet.Ready, cr.Wallet.Currency
	out.Pricing.Profile, out.Pricing.SettlementBps, out.Pricing.PayoutBps = cr.Pricing.Profile, cr.Pricing.SettlementBps, cr.Pricing.PayoutBps
	fd, cf := &out.FeeDestination, cr.FeeDestination
	fd.Handle = atHandle(cf.Handle)
	fd.Required, fd.Resolved, fd.OwnedByProject = cf.Required, cf.Resolved, cf.OwnedByProject
	fd.KybApproved, fd.WalletActive, fd.TypeAllowed = cf.KybApproved, cf.WalletActive, cf.TypeAllowed
	// The fee is credited to the destination's own account (ADR-028); ready
	// means that account can receive.
	fd.ApplicationAccountReady = cf.Resolved && cf.WalletActive
	fd.Eligible, fd.Blocker = cf.Eligible, cf.Blocker
	out.Settlement.Ready = cr.Settlement.Ready
	out.Settlement.Blockers = append([]string{}, cr.Settlement.Blockers...)
	out.Settlement.Warnings = append([]string{}, cr.Settlement.Warnings...)
	return out
}
