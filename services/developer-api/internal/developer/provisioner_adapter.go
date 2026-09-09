package developer

import (
	"context"

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
