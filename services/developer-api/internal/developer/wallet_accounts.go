package developer

import (
	"context"
	"errors"
	"log/slog"
	"strings"
)

// Wallet accounts — the segregated destinations a developer actually builds with.
//
// This is the primitive DOA uses for a campaign: one account per thing that must
// hold money separately, so that a payment for one cannot be confused with a
// payment for another. It has been publicly available through the API and the
// published SDK all along; what was missing was a way to open one without
// writing code, which meant a developer could not get a Sandbox project into a
// usable shape from the Console alone.
//
// What stays internal is everything above it: the financial owner, its root
// wallet, and the PRIMARY ledger account made with that wallet. A developer
// never chooses, creates or names any of those — they exist so the operator's
// books balance, not so an integration can address them.

// canManageWalletAccounts reports whether a role may open a segregated account.
//
// OWNER, ADMIN and DEVELOPER. This is building, not spending: an account is a
// destination an application needs in order to work, and the person writing the
// application is the one who knows how many and what they are for. It reads the
// same as canBuild today and is deliberately its own predicate — the authority to
// shape an integration and the authority to create projects and keys are the same
// answer for the same reason right now, and could reasonably stop being.
//
// FINANCE and VIEWER are denied. Neither builds.
func canManageWalletAccounts(role string) bool {
	return role == RoleOwner || role == RoleAdmin || role == RoleDeveloper
}

// WalletAccountRequest is what the Console sends. There is no merchant, wallet
// or owner field, and there is nothing to add: those are derived from the
// project's binding, and a caller-supplied one would be a caller-supplied payee.
type WalletAccountRequest struct {
	Label     string
	Purpose   string
	Reference string
}

// WalletAccountProvisioner is the Core boundary this needs.
type WalletAccountProvisioner interface {
	WalletForMerchant(ctx context.Context, merchantID string) (string, error)
	CreateWalletAccount(ctx context.Context, walletID, merchantID, purpose, refType, refID, label string) (string, error)
}

// The purposes a developer may open. PRIMARY is absent on purpose: it is made
// with the wallet, Core refuses to create a second, and offering it would be
// offering an operation that cannot succeed.
var walletAccountPurposes = map[string]bool{
	"CAMPAIGN":   true, // one destination per campaign, project, listing, ride…
	"COLLECTION": true,
	"ESCROW":     true,
}

// ErrUnsupportedPurpose: a purpose that is not open to developers.
var ErrUnsupportedPurpose = errors.New("unsupported wallet account purpose")

// SetWalletAccountProvisioner wires the Core boundary. Until set, creation
// reports unavailable rather than failing at the point of use.
func (s *Service) SetWalletAccountProvisioner(p WalletAccountProvisioner) { s.walletProv = p }

// CreateProjectWalletAccount opens a segregated account under the project's own
// financial owner.
//
// The authority chain is the one every project-scoped write here uses, with the
// build capability added: session → membership → a role that may build → the
// project's ACTIVE binding → the merchant it names → that merchant's wallet. The
// caller names a label, a purpose and a reference of their own choosing, and
// nothing that decides whose money it is.
func (s *Service) CreateProjectWalletAccount(ctx context.Context, actor, projectID string, in WalletAccountRequest, ip, reqID string) (WalletAccountView, error) {
	p, role, err := s.projectAuthz(ctx, actor, projectID)
	if err != nil {
		return WalletAccountView{}, err
	}
	if !canManageWalletAccounts(role) {
		return WalletAccountView{}, ErrForbidden
	}
	if s.walletProv == nil {
		return WalletAccountView{}, ErrSetupUnavailable
	}
	label := strings.TrimSpace(in.Label)
	if label == "" || len(label) > 80 {
		return WalletAccountView{}, ErrValidation
	}
	purpose := strings.ToUpper(strings.TrimSpace(in.Purpose))
	if purpose == "" {
		purpose = "CAMPAIGN"
	}
	if !walletAccountPurposes[purpose] {
		return WalletAccountView{}, ErrUnsupportedPurpose
	}

	// The merchant comes from the binding, and a project with no binding gets the
	// lifecycle answer rather than a failure: there is a step to take first.
	merchant, err := s.projectMerchant(ctx, actor, projectID)
	if err != nil {
		return WalletAccountView{}, err
	}
	wallet, err := s.walletProv.WalletForMerchant(ctx, merchant)
	if err != nil || wallet == "" {
		slog.ErrorContext(ctx, "developer.wallet_account.no_wallet", "project", projectID)
		return WalletAccountView{}, ErrUnavailable
	}

	reference := strings.TrimSpace(in.Reference)
	if reference == "" {
		reference = projectID
	}
	id, err := s.walletProv.CreateWalletAccount(ctx, wallet, merchant, purpose, "DEVELOPER_PROJECT", reference, label)
	if err != nil {
		slog.ErrorContext(ctx, "developer.wallet_account.create_failed", "project", projectID, "err", err.Error())
		return WalletAccountView{}, ErrUnavailable
	}

	s.audit(ctx, &actor, &p.WorkspaceID, &projectID, "project.wallet_account_created",
		"WALLET_ACCOUNT:"+id, ip, reqID, map[string]any{"purpose": purpose, "label": label})

	// Read it back rather than assembling a response from the request. What the
	// developer sees is what the operator recorded, including anything Core
	// normalised on the way in.
	accounts, err := s.store.WalletAccountsForMerchant(ctx, merchant, WalletAccountFilter{Limit: 200})
	if err == nil {
		for _, a := range accounts {
			if a.ID == id {
				return a, nil
			}
		}
	}
	return WalletAccountView{ID: id, Label: label, Purpose: purpose, Currency: "AOA"}, nil
}
