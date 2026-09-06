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

// WalletAccountRequest is what the Console sends — the same shape the published
// SDK sends, deliberately.
//
// The first version of this took a single `reference` and stamped the type
// itself, which quietly created a SECOND public model: the SDK's callers chose
// their own referenceType and the Console's could not. One resource cannot have
// two contracts, so this one is the SDK's.
//
// There is no merchant, wallet or owner field, and nothing to add: those are
// derived from the project's binding, and a caller-supplied one would be a
// caller-supplied payee.
type WalletAccountRequest struct {
	Label         string
	Purpose       string
	ReferenceType string
	ReferenceID   string
}

// WalletAccountProvisioner is the Core boundary this needs.
type WalletAccountProvisioner interface {
	WalletForMerchant(ctx context.Context, merchantID string) (string, error)
	CreateWalletAccount(ctx context.Context, walletID, merchantID, purpose, refType, refID, label string) (string, error)
}

// The purposes a developer may open — Core's own list, minus PRIMARY.
//
// It mirrors rather than narrows deliberately. The first version listed three,
// one of which (COLLECTION) Core does not accept at all: a request for it passed
// validation here and was refused there, which is the worst of both — the
// developer is told their input is fine and then told nothing useful.
//
// The list is generic on purpose. An external developer must not have to model a
// shop, a seller or a fund as a "campaign" because that is the word the first
// application on the platform happened to need; CUSTOM exists for everything
// these words do not fit.
//
// PRIMARY is absent because it is made with the wallet, Core refuses a second,
// and offering it would be offering an operation that cannot succeed.
var walletAccountPurposes = map[string]bool{
	"CAMPAIGN":   true,
	"PROJECT":    true,
	"EVENT":      true,
	"STORE":      true,
	"ESCROW":     true,
	"RESERVE":    true,
	"SETTLEMENT": true,
	"CUSTOM":     true,
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

	// The application's own correlation metadata, passed through untouched. The
	// operator has no knowledge of what these mean and must not acquire any: DOA
	// writes DOA_CAMPAIGN, a shop writes SELLER, and neither is more correct.
	//
	// Together with the purpose they are also the natural key Core uses for
	// idempotency — a repeat of the same (purpose, reference_type, reference_id)
	// under one owner returns the account that exists rather than opening a
	// second — so leaving them empty means the caller has opted out of that.
	refType := strings.TrimSpace(in.ReferenceType)
	refID := strings.TrimSpace(in.ReferenceID)
	id, err := s.walletProv.CreateWalletAccount(ctx, wallet, merchant, purpose, refType, refID, label)
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
