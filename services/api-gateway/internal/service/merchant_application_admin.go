package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Admin-side merchant-application lifecycle (Merchant Lifecycle, Increment 1).
// These run inside api-gateway (the sole writer of handle_registry /
// merchant_app_credentials / merchant_activation_tokens) and are exposed only
// via INTERNAL endpoints the admin-api calls. The admin-api adds admin auth +
// email; the gateway does the orchestration.

var (
	ErrApplicationNotFound   = errors.New("application not found")
	ErrApplicationNotOpen    = errors.New("application is not open for review")
	ErrAutoApproveNotSandbox = errors.New("auto-approval is only available for sandbox applications")
	// ErrRequiredDocumentsMissing: the application cannot be approved without the
	// documents the review is made on (company registration, representative ID).
	// ErrRequiredDocumentsMissing: the application does not meet the
	// requirements policy (business_requirements.go) — something is missing
	// or was refused. The message names the requirement codes.
	ErrRequiredDocumentsMissing = errors.New("the application does not meet its requirements yet")
	// ErrHandleOwnedByBusiness: the requested @handle already belongs to a
	// Business Account. Approving would create a second owner; the application
	// can only be LINKED to the existing one.
	ErrHandleOwnedByBusiness = errors.New("the requested handle already belongs to a Business Account; link the application to it instead")
	// ErrClaimsExistingBusiness: the applicant said the Business exists already;
	// it is resolved by linking, never by provisioning a new one.
	ErrClaimsExistingBusiness = errors.New("this application claims an existing Business Account; link it instead of provisioning a new one")
	// ErrLinkTargetInvalid: the chosen Business Account cannot take this
	// application (missing, not ACTIVE, or not the owner of the requested handle).
	ErrLinkTargetInvalid = errors.New("the chosen Business Account cannot be linked to this application")
	// ErrLinkConfirmationMismatch: the operator did not type the target's handle.
	ErrLinkConfirmationMismatch = errors.New("confirmation does not match the Business Account's handle")
	// ErrApplicationNotLinkable: a partially provisioned or already correctly
	// resolved application is not re-linked.
	ErrApplicationNotLinkable = errors.New("this application cannot be linked")
	// ErrExistingBusinessNotFound: an application claiming an existing Business
	// named a handle no ACTIVE Business Account uses.
	ErrExistingBusinessNotFound = errors.New("no active Business Account uses this handle")
	ErrLinkReasonRequired       = errors.New("a reason is required to link an application to an existing Business")
)

type MerchantApplication struct {
	ID                  string `json:"id"`
	Status              string `json:"status"`
	Environment         string `json:"environment"`
	DesiredHandle       string `json:"desired_handle"`
	BusinessName        string `json:"business_name"`
	Category            string `json:"category"`
	Subcategory         string `json:"subcategory"`
	Email               string `json:"email"`
	Phone               string `json:"phone"`
	Nif                 string `json:"nif"`
	Country             string `json:"country"`
	Province            string `json:"province"`
	Municipality        string `json:"municipality"`
	City                string `json:"city"`
	Address             string `json:"address"`
	AddressReference    string `json:"address_reference"`
	LegalRepresentative string `json:"legal_representative"`
	RepresentativeRole  string `json:"representative_role"`
	RepresentativeEmail string `json:"representative_email"`
	RepresentativePhone string `json:"representative_phone"`
	BusinessActivity    string `json:"business_activity"`
	EstimatedVolume     string `json:"estimated_volume"`
	BusinessAccountType string `json:"business_account_type"`
	AdminNotes          string `json:"admin_notes"`
	MerchantMessage     string `json:"merchant_message"`
	CreatedMerchantID   string `json:"created_merchant_id"`
	// Provisioning recovery state (0079) — each Phase-A resource is recorded so a
	// retry resumes the step instead of duplicating it.
	ProvisioningWalletID       string `json:"provisioning_wallet_id"`
	ProvisioningApiKeyPrefix   string `json:"provisioning_api_key_prefix"`
	ProvisioningComplianceDone bool   `json:"provisioning_compliance_done"`
	ProvisioningError          string `json:"provisioning_error"` // failure reason, for operator visibility
	ProvisioningAttempts       int    `json:"provisioning_attempts"`
	ClaimsExistingBusiness     bool   `json:"claims_existing_business"`
	Resolution                 string `json:"resolution"` // PROVISIONED_NEW | LINKED_EXISTING, when APPROVED
	// Origin is where the application was started (0121): STANDALONE_BUSINESS
	// or DEVELOPER_PROJECT. Context only — it changes nothing about the review.
	Origin string `json:"origin"`
	// ProjectID is the Developer Project that asked, for DEVELOPER_PROJECT.
	ProjectID string `json:"project_id,omitempty"`
	// SubmittedByUserID is the Console user who submitted a Project's
	// application; the binding approval records is made in their name.
	SubmittedByUserID string `json:"submitted_by_user_id,omitempty"`
	// InformationRequest is what the reviewer asked for, while
	// INFORMATION_REQUIRED.
	InformationRequest       string     `json:"information_request,omitempty"`
	ProvisioningProjectBound bool       `json:"provisioning_project_bound"`
	CreatedAt                time.Time  `json:"created_at"`
	ReviewedAt               *time.Time `json:"reviewed_at"`
}

type ApprovalResult struct {
	ApplicationID   string `json:"application_id"`
	MerchantID      string `json:"merchant_id"`
	BusinessName    string `json:"business_name"`
	Email           string `json:"email"`
	Handle          string `json:"handle"`
	Environment     string `json:"environment"`
	ActivationToken string `json:"activation_token"` // raw, returned ONCE for the email link
	ApiKeyPrefix    string `json:"api_key_prefix"`
	// AlreadyApproved: a repeated approval (a double click, two operators) found
	// the application approved and changed nothing. No new activation token is
	// issued, so no second email is sent.
	AlreadyApproved bool `json:"already_approved"`
	// ProjectBinding, for an application from a Developer Project: BOUND when
	// the Project now receives into the new Business, PENDING when binding it
	// failed and approving again will retry it, CONFLICT when the Project was
	// already bound to another Business. Empty for a public application.
	ProjectBinding string `json:"project_binding,omitempty"`
}

// ProjectBinder records a Developer Project's payee binding (developer-api).
type ProjectBinder interface {
	BindProject(ctx context.Context, projectID, merchantID, walletID, walletAccountID, actorUserID string) error
}

// LinkResult is the outcome of attaching an application to an existing
// Business Account.
type LinkResult struct {
	ApplicationID string `json:"application_id"`
	MerchantID    string `json:"merchant_id"`
	Handle        string `json:"handle"`
	BusinessName  string `json:"business_name"`
	Environment   string `json:"environment"`
	// AlreadyLinked: the application was already linked to this Business.
	AlreadyLinked bool `json:"already_linked"`
}

type RejectionResult struct {
	ApplicationID   string `json:"application_id"`
	BusinessName    string `json:"business_name"`
	Email           string `json:"email"`
	MerchantMessage string `json:"merchant_message"`
}

type MerchantApplicationAdminService interface {
	List(ctx context.Context, status, environment string) ([]MerchantApplication, error)
	Get(ctx context.Context, id string) (MerchantApplication, error)
	Approve(ctx context.Context, id, reviewedBy string, activationTTL time.Duration) (ApprovalResult, error)
	Reject(ctx context.Context, id, reviewedBy, adminNotes, merchantMessage string) (RejectionResult, error)
	StartReview(ctx context.Context, id, reviewedBy string) (MerchantApplication, error)
	LinkExisting(ctx context.Context, id, merchantID, confirmationHandle, reviewedBy, reason string) (LinkResult, error)
	ReissueActivation(ctx context.Context, id string, ttl time.Duration) (ActivationReissue, error)
	LinkCandidates(ctx context.Context, id, lookupHandle string) ([]LinkCandidate, error)
	BusinessState(ctx context.Context, id string, readiness SettlementReadinessService) (*BusinessState, error)
	RequestInformation(ctx context.Context, id, reviewedBy, message string) (MerchantApplication, error)
	PublicStatus(ctx context.Context, id string) (ApplicationStatus, error)
	Resubmit(ctx context.Context, id string) (ApplicationStatus, error)
	LatestForProject(ctx context.Context, projectID string) (ProjectApplication, error)
}

// coreProvisioner is the slice of core-api provisioning calls the approval flow
// needs. Extracted as an interface so the flow's forward-recovery behaviour is
// testable without a live core-api. *CoreApiClient is the production implementation.
type coreProvisioner interface {
	CreateMerchant(ctx context.Context, name, email, businessAccountType string) (string, error)
	CreateWallet(ctx context.Context, merchantID, currency string) (string, error)
	CreateApiKey(ctx context.Context, merchantID, name, environment string) (string, error)
	ApproveCompliance(ctx context.Context, merchantID string) error
	AssignPricingProfile(ctx context.Context, merchantID, profileCode string) error
}

// defaultPricingProfile is what an approved Business is priced by, per
// environment. The Sandbox has an explicit zero-rate settlement profile: an
// approved Business is priced by a rule that says zero, never by nothing
// matching. A LIVE Business is priced by an operator decision, so there is no
// default and settlement stays fail-closed until one is made.
func defaultPricingProfile(environment string) string {
	if environment == "SANDBOX" {
		return "sandbox-default"
	}
	return ""
}

// requiredApplicationDocuments are the documents a review is made on.
var requiredApplicationDocuments = []string{"BUSINESS_REGISTRATION", "REPRESENTATIVE_ID"}

type PostgresMerchantApplicationAdminService struct {
	pool     *pgxpool.Pool
	core     coreProvisioner
	projects ProjectBinder
}

// SetProjectBinder wires the Developer Platform, so approving a Project's
// application binds that Project to the Business it provisions.
func (s *PostgresMerchantApplicationAdminService) SetProjectBinder(b ProjectBinder) { s.projects = b }

// ensureProjectBinding is the last provisioning step for an application a
// Developer Project started: the Project receives into the Business the
// approval created. It is recorded when it succeeds and retried by approving
// again when it did not; it never undoes the Business, which is real either way.
func (s *PostgresMerchantApplicationAdminService) ensureProjectBinding(ctx context.Context, app MerchantApplication, merchantID, walletID string) string {
	if app.Origin != ApplicationOriginDeveloperProject || app.ProjectID == "" {
		return ""
	}
	if app.ProvisioningProjectBound {
		return "BOUND"
	}
	if s.projects == nil || merchantID == "" || walletID == "" {
		return "PENDING"
	}
	var account string
	if err := s.pool.QueryRow(ctx,
		`SELECT id::text FROM wallet_accounts WHERE wallet_id = $1 AND purpose = 'PRIMARY' LIMIT 1`, walletID).Scan(&account); err != nil {
		return "PENDING"
	}
	err := s.projects.BindProject(ctx, app.ProjectID, merchantID, walletID, account, app.SubmittedByUserID)
	switch {
	case errors.Is(err, ErrProjectBoundElsewhere):
		_, _ = s.pool.Exec(ctx, `UPDATE merchant_applications SET provisioning_error = $2, updated_at = now() WHERE id = $1`,
			app.ID, "bind project: the Project is already bound to another Business")
		return "CONFLICT"
	case err != nil:
		_, _ = s.pool.Exec(ctx, `UPDATE merchant_applications SET provisioning_error = $2, updated_at = now() WHERE id = $1`,
			app.ID, "bind project: "+err.Error())
		return "PENDING"
	}
	_, _ = s.pool.Exec(ctx,
		`UPDATE merchant_applications SET provisioning_project_bound = true, provisioning_error = NULL, updated_at = now() WHERE id = $1`, app.ID)
	return "BOUND"
}

func NewPostgresMerchantApplicationAdminService(pool *pgxpool.Pool, core coreProvisioner) *PostgresMerchantApplicationAdminService {
	return &PostgresMerchantApplicationAdminService{pool: pool, core: core}
}

const appCols = `id::text, status, environment, desired_handle, business_name,
	COALESCE(category,''), COALESCE(subcategory,''), email, COALESCE(phone,''), COALESCE(nif,''), COALESCE(country,''),
	COALESCE(province,''), COALESCE(municipality,''), COALESCE(city,''), COALESCE(address,''), COALESCE(address_reference,''),
	COALESCE(legal_representative,''), COALESCE(representative_role,''), COALESCE(representative_email,''), COALESCE(representative_phone,''),
	COALESCE(business_activity,''), COALESCE(estimated_volume,''), COALESCE(business_account_type,''), COALESCE(admin_notes,''),
	COALESCE(merchant_message,''), COALESCE(created_merchant_id::text,''),
	COALESCE(provisioning_wallet_id::text,''), COALESCE(provisioning_api_key_prefix,''), provisioning_compliance_done,
	COALESCE(provisioning_error,''), provisioning_attempts,
	claims_existing_business, COALESCE(resolution,''),
	origin, COALESCE(project_id::text,''), COALESCE(submitted_by_user_id::text,''), COALESCE(information_request,''), provisioning_project_bound,
	created_at, reviewed_at`

func scanApplication(row pgx.Row) (MerchantApplication, error) {
	var a MerchantApplication
	err := row.Scan(&a.ID, &a.Status, &a.Environment, &a.DesiredHandle, &a.BusinessName,
		&a.Category, &a.Subcategory, &a.Email, &a.Phone, &a.Nif, &a.Country,
		&a.Province, &a.Municipality, &a.City, &a.Address, &a.AddressReference,
		&a.LegalRepresentative, &a.RepresentativeRole, &a.RepresentativeEmail, &a.RepresentativePhone,
		&a.BusinessActivity, &a.EstimatedVolume, &a.BusinessAccountType, &a.AdminNotes,
		&a.MerchantMessage, &a.CreatedMerchantID,
		&a.ProvisioningWalletID, &a.ProvisioningApiKeyPrefix, &a.ProvisioningComplianceDone,
		&a.ProvisioningError, &a.ProvisioningAttempts,
		&a.ClaimsExistingBusiness, &a.Resolution,
		&a.Origin, &a.ProjectID, &a.SubmittedByUserID, &a.InformationRequest, &a.ProvisioningProjectBound,
		&a.CreatedAt, &a.ReviewedAt)
	return a, err
}

func (s *PostgresMerchantApplicationAdminService) List(ctx context.Context, status, environment string) ([]MerchantApplication, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT `+appCols+` FROM merchant_applications
		  WHERE ($1 = '' OR status = $1) AND ($2 = '' OR environment = $2)
		  ORDER BY created_at DESC LIMIT 200`, status, environment)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]MerchantApplication, 0)
	for rows.Next() {
		a, err := scanApplication(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func (s *PostgresMerchantApplicationAdminService) Get(ctx context.Context, id string) (MerchantApplication, error) {
	a, err := scanApplication(s.pool.QueryRow(ctx, `SELECT `+appCols+` FROM merchant_applications WHERE id = $1`, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return MerchantApplication{}, ErrApplicationNotFound
	}
	return a, err
}

// lockApplication serialises every transition of one application across all
// gateway instances. Approval spans several core calls that cannot share a
// database transaction, so a row lock cannot cover it; a session-level advisory
// lock on a dedicated connection can. Two operators pressing Approve together —
// or one pressing it twice — are handled one after the other, and the second
// finds the first one's result.
func (s *PostgresMerchantApplicationAdminService) lockApplication(ctx context.Context, id string) (func(), error) {
	conn, err := s.pool.Acquire(ctx)
	if err != nil {
		return nil, err
	}
	const key = `hashtextextended('merchant_application:' || $1, 0)`
	if _, err := conn.Exec(ctx, `SELECT pg_advisory_lock(`+key+`)`, id); err != nil {
		conn.Release()
		return nil, err
	}
	return func() {
		_, _ = conn.Exec(context.Background(), `SELECT pg_advisory_unlock(`+key+`)`, id)
		conn.Release()
	}, nil
}

// missingDocuments returns the required document types this application has
// not supplied (uploaded or accepted, not deleted).
func (s *PostgresMerchantApplicationAdminService) missingDocuments(ctx context.Context, id string) ([]string, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT DISTINCT document_type FROM merchant_application_documents
		  WHERE application_id = $1 AND deleted_at IS NULL AND status IN ('UPLOADED','ACCEPTED')`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	have := map[string]bool{}
	for rows.Next() {
		var t string
		if err := rows.Scan(&t); err != nil {
			return nil, err
		}
		have[t] = true
	}
	var missing []string
	for _, t := range requiredApplicationDocuments {
		if !have[t] {
			missing = append(missing, t)
		}
	}
	return missing, rows.Err()
}

// handleOwner reports who holds a handle in the global registry ("" when free).
func (s *PostgresMerchantApplicationAdminService) handleOwner(ctx context.Context, handle string) (ownerType, ownerID string, err error) {
	err = s.pool.QueryRow(ctx,
		`SELECT owner_type, COALESCE(owner_id::text,'') FROM handle_registry WHERE handle = $1`, handle).
		Scan(&ownerType, &ownerID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", "", nil
	}
	return ownerType, ownerID, err
}

// StartReview moves a SUBMITTED application to UNDER_REVIEW: an operator has
// opened it. Idempotent for an application already under review.
func (s *PostgresMerchantApplicationAdminService) StartReview(ctx context.Context, id, reviewedBy string) (MerchantApplication, error) {
	release, err := s.lockApplication(ctx, id)
	if err != nil {
		return MerchantApplication{}, err
	}
	defer release()
	app, err := s.Get(ctx, id)
	if err != nil {
		return MerchantApplication{}, err
	}
	switch app.Status {
	case "UNDER_REVIEW":
		return app, nil
	case "SUBMITTED":
	default:
		return MerchantApplication{}, ErrApplicationNotOpen
	}
	if _, err := s.pool.Exec(ctx,
		`UPDATE merchant_applications SET status='UNDER_REVIEW', updated_at=now()
		  WHERE id=$1 AND status='SUBMITTED'`, id); err != nil {
		return MerchantApplication{}, err
	}
	return s.Get(ctx, id)
}

// Approve resolves an application by provisioning a NEW Business Account:
// merchant, wallet (core creates its PRIMARY account), KYB decision, the
// Sandbox default pricing profile, then — atomically in the gateway database —
// the public profile, the handle (APPLICATION hold → MERCHANT), a PIN-less
// Business App credential with an activation token, and APPROVED.
//
// What the applicant supplied never classifies the account: it is created as
// the default type, MERCHANT. APPLICATION/PLATFORM is a separate, privileged
// operator decision (ADR-057) — approval must not repeat the promotion
// migration 0115 had to revert.
//
// Idempotent and replay-safe. Transitions are serialised per application; an
// application already APPROVED is returned as it is (AlreadyApproved) with no
// new token; each core step records what it created and a retry resumes it;
// a failure records PROVISIONING_FAILED only if nothing approved it meanwhile.
func (s *PostgresMerchantApplicationAdminService) Approve(ctx context.Context, id, reviewedBy string, activationTTL time.Duration) (ApprovalResult, error) {
	release, err := s.lockApplication(ctx, id)
	if err != nil {
		return ApprovalResult{}, err
	}
	defer release()

	app, err := s.Get(ctx, id)
	if err != nil {
		return ApprovalResult{}, err
	}
	if app.Status == "APPROVED" {
		return ApprovalResult{
			ApplicationID: id, MerchantID: app.CreatedMerchantID, BusinessName: app.BusinessName,
			Email: app.Email, Handle: app.DesiredHandle, Environment: app.Environment,
			ApiKeyPrefix: app.ProvisioningApiKeyPrefix, AlreadyApproved: true,
			// Approving again is how a Project binding that failed is retried.
			ProjectBinding: s.ensureProjectBinding(ctx, app, app.CreatedMerchantID, app.ProvisioningWalletID),
		}, nil
	}
	// PROVISIONING_FAILED is re-approvable too — that IS the reprocess path.
	if app.Status != "SUBMITTED" && app.Status != "UNDER_REVIEW" && app.Status != "PROVISIONING_FAILED" {
		return ApprovalResult{}, ErrApplicationNotOpen
	}
	if app.ClaimsExistingBusiness {
		return ApprovalResult{}, ErrClaimsExistingBusiness
	}
	if req, err := requirementsFor(ctx, s.pool, app); err != nil {
		return ApprovalResult{}, err
	} else if !req.Complete() {
		return ApprovalResult{}, requirementsError(req)
	}
	// The requested handle must still be this application's to convert. If a
	// Business Account owns it, this is an existing Business: link, do not
	// create a second owner.
	ownerType, ownerID, err := s.handleOwner(ctx, app.DesiredHandle)
	if err != nil {
		return ApprovalResult{}, err
	}
	switch {
	case ownerType == "MERCHANT" && ownerID != app.CreatedMerchantID:
		return ApprovalResult{}, ErrHandleOwnedByBusiness
	case ownerType == "APPLICATION" && ownerID != id:
		return ApprovalResult{}, ErrMerchantHandleTaken
	case ownerType == "CONSUMER" || ownerType == "SYSTEM":
		return ApprovalResult{}, ErrMerchantHandleTaken
	}

	// Count the attempt and clear any prior error up front.
	_, _ = s.pool.Exec(ctx,
		`UPDATE merchant_applications SET provisioning_attempts=provisioning_attempts+1, provisioning_error=NULL, updated_at=now() WHERE id=$1`, id)

	// fail records PROVISIONING_FAILED + the failing step so an operator sees it
	// and can reprocess. Conditional: it never overwrites an approval.
	fail := func(step string, e error) (ApprovalResult, error) {
		_, _ = s.pool.Exec(ctx,
			`UPDATE merchant_applications SET status='PROVISIONING_FAILED', provisioning_error=$2, updated_at=now()
			  WHERE id=$1 AND status <> 'APPROVED'`,
			id, step+": "+e.Error())
		return ApprovalResult{}, fmt.Errorf("%s: %w", step, e)
	}

	// Phase A — non-transactional core calls, each recorded as soon as it
	// succeeds so a retry RESUMES instead of duplicating.

	// Step 1 — merchant, always the default account type.
	merchantID := app.CreatedMerchantID
	if merchantID == "" {
		merchantID, err = s.core.CreateMerchant(ctx, app.BusinessName, app.Email, "")
		if err != nil {
			return fail("create merchant", err)
		}
		if _, err = s.pool.Exec(ctx,
			`UPDATE merchant_applications SET created_merchant_id=$2, updated_at=now() WHERE id=$1`, id, merchantID); err != nil {
			return fail("record merchant id", err)
		}
	}

	// Step 2 — wallet.
	walletID := app.ProvisioningWalletID
	if walletID == "" {
		walletID, err = s.core.CreateWallet(ctx, merchantID, "AOA")
		if err != nil {
			return fail("create wallet", err)
		}
		if _, err = s.pool.Exec(ctx,
			`UPDATE merchant_applications SET provisioning_wallet_id=$2, updated_at=now() WHERE id=$1`, id, nullStr(walletID)); err != nil {
			return fail("record wallet id", err)
		}
	}

	// Step 3 — api key.
	apiKeyPrefix := app.ProvisioningApiKeyPrefix
	if apiKeyPrefix == "" {
		apiKeyPrefix, err = s.core.CreateApiKey(ctx, merchantID, "default", app.Environment)
		if err != nil {
			return fail("create api key", err)
		}
		if _, err = s.pool.Exec(ctx,
			`UPDATE merchant_applications SET provisioning_api_key_prefix=$2, updated_at=now() WHERE id=$1`, id, nullStr(apiKeyPrefix)); err != nil {
			return fail("record api key", err)
		}
	}

	// Step 4 — compliance: the approval IS the KYB decision.
	if !app.ProvisioningComplianceDone {
		if err := s.core.ApproveCompliance(ctx, merchantID); err != nil {
			return fail("approve compliance", err)
		}
		if _, err = s.pool.Exec(ctx,
			`UPDATE merchant_applications SET provisioning_compliance_done=true, updated_at=now() WHERE id=$1`, id); err != nil {
			return fail("record compliance", err)
		}
	}

	// Step 5 — pricing. An approved Sandbox Business is priced by the explicit
	// zero-rate default, so its first settlement resolves a rule rather than
	// failing as unpriced. Idempotent (an assignment, not a creation).
	if code := defaultPricingProfile(app.Environment); code != "" {
		if err := s.core.AssignPricingProfile(ctx, merchantID, code); err != nil {
			return fail("assign pricing profile", err)
		}
	}

	rawToken, err := randomToken(32)
	if err != nil {
		return fail("activation token", err)
	}

	// Phase B — atomic gateway DB (all-or-nothing).
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fail("begin provisioning tx", err)
	}
	defer tx.Rollback(ctx)

	pbErr := func() error {
		if _, err := tx.Exec(ctx,
			`INSERT INTO merchant_profiles (merchant_id, handle, display_name, category, wallet_id, public)
			 VALUES ($1, $2, $3, $4, $5, false)
			 ON CONFLICT (merchant_id) DO NOTHING`,
			merchantID, app.DesiredHandle, app.BusinessName, nullStr(app.Category), nullStr(walletID)); err != nil {
			return err
		}
		// The handle becomes the Business's — only from THIS application's hold
		// (or already the Business's, on a resumed attempt). A hold that lapsed
		// and was taken meanwhile fails the approval instead of being overwritten.
		tag, err := tx.Exec(ctx,
			`INSERT INTO handle_registry (handle, owner_type, owner_id)
			 VALUES ($1, 'MERCHANT', $2)
			 ON CONFLICT (handle) DO UPDATE
			    SET owner_type='MERCHANT', owner_id=$2, reserved_until=NULL, reserved_reason=NULL
			  WHERE (handle_registry.owner_type='APPLICATION' AND handle_registry.owner_id=$3::uuid)
			     OR (handle_registry.owner_type='MERCHANT' AND handle_registry.owner_id=$2::uuid)`,
			app.DesiredHandle, merchantID, id)
		if err != nil {
			return err
		}
		if tag.RowsAffected() != 1 {
			return fmt.Errorf("handle @%s is no longer held by this application", app.DesiredHandle)
		}
		if _, err := tx.Exec(ctx,
			`INSERT INTO merchant_app_credentials (merchant_id, environment, handle, pin_hash, activated_at)
			 VALUES ($1, $2, $3, NULL, NULL)
			 ON CONFLICT (merchant_id, environment) DO UPDATE SET handle=EXCLUDED.handle`,
			merchantID, app.Environment, app.DesiredHandle); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx,
			`INSERT INTO merchant_activation_tokens (id, merchant_id, environment, token_hash, expires_at)
			 VALUES ($1, $2, $3, $4, $5)`,
			uuid.NewString(), merchantID, app.Environment, hashToken(rawToken), time.Now().Add(activationTTL)); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx,
			`UPDATE merchant_applications
			    SET status='APPROVED', resolution='PROVISIONED_NEW', created_merchant_id=$2,
			        reviewed_by=$3, reviewed_at=now(), updated_at=now()
			  WHERE id=$1`, id, merchantID, reviewedBy); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx,
			`UPDATE merchant_application_documents SET merchant_id=$2, updated_at=now()
			  WHERE application_id=$1 AND deleted_at IS NULL`, id, merchantID); err != nil {
			return err
		}
		if err := BridgeFromApplicationTx(ctx, tx, id, merchantID, app.Environment); err != nil {
			return fmt.Errorf("bridge kyb documents: %w", err)
		}
		return tx.Commit(ctx)
	}()
	if pbErr != nil {
		_ = tx.Rollback(ctx) // release row locks before fail() touches the row
		return fail("provisioning (phase b)", pbErr)
	}

	return ApprovalResult{
		ApplicationID:   id,
		MerchantID:      merchantID,
		BusinessName:    app.BusinessName,
		Email:           app.Email,
		Handle:          app.DesiredHandle,
		Environment:     app.Environment,
		ActivationToken: rawToken,
		ApiKeyPrefix:    apiKeyPrefix,
		ProjectBinding:  s.ensureProjectBinding(ctx, app, merchantID, walletID),
	}, nil
}

// LinkExisting resolves an application by attaching it to a Business Account
// that already exists: the application's institutional and KYB truth — its
// reviewed documents and the approval — become that Business's. Nothing is
// created and nothing moves: no merchant, no wallet, no handle, no login, no
// Project binding, no ledger. It is how a Business provisioned some other way
// first (an operator setup, a Developer Project's financial owner) enters the
// application lifecycle.
//
// Never automatic. The operator chooses the target and confirms it by typing
// its @handle; a reason is recorded. The requested handle is never transferred:
// if a Business owns it, the target must BE that Business.
//
// An application already APPROVED against a Business that has since lost the
// requested handle may be re-linked to the handle's current owner — the case of
// a handle consolidated after approval. Nothing else re-links.
func (s *PostgresMerchantApplicationAdminService) LinkExisting(ctx context.Context, id, merchantID, confirmationHandle, reviewedBy, reason string) (LinkResult, error) {
	if strings.TrimSpace(reason) == "" {
		return LinkResult{}, ErrLinkReasonRequired
	}
	release, err := s.lockApplication(ctx, id)
	if err != nil {
		return LinkResult{}, err
	}
	defer release()

	app, err := s.Get(ctx, id)
	if err != nil {
		return LinkResult{}, err
	}

	// The target: an ACTIVE Business Account with a handle.
	var status, targetHandle string
	err = s.pool.QueryRow(ctx,
		`SELECT m.status,
		        COALESCE((SELECT hr.handle FROM handle_registry hr
		                   WHERE hr.owner_type='MERCHANT' AND hr.owner_id=m.id
		                   ORDER BY (hr.handle = $2) DESC, hr.handle LIMIT 1), '')
		   FROM merchants m WHERE m.id = $1`, merchantID, app.DesiredHandle).
		Scan(&status, &targetHandle)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && (status != "ACTIVE" || targetHandle == "")) {
		return LinkResult{}, ErrLinkTargetInvalid
	}
	if err != nil {
		return LinkResult{}, err
	}
	if NormaliseHandle(confirmationHandle) != targetHandle {
		return LinkResult{}, ErrLinkConfirmationMismatch
	}

	// No handle transfer: a Business that owns the requested handle is the
	// only Business this application can be linked to.
	ownerType, ownerID, err := s.handleOwner(ctx, app.DesiredHandle)
	if err != nil {
		return LinkResult{}, err
	}
	if ownerType == "MERCHANT" && ownerID != merchantID {
		return LinkResult{}, ErrLinkTargetInvalid
	}

	switch app.Status {
	case "APPROVED":
		if app.CreatedMerchantID == merchantID {
			return LinkResult{ApplicationID: id, MerchantID: merchantID, Handle: targetHandle,
				BusinessName: app.BusinessName, Environment: app.Environment, AlreadyLinked: true}, nil
		}
		// Re-link only an approval whose Business no longer holds the handle, to
		// the Business that does.
		if !(ownerType == "MERCHANT" && ownerID == merchantID) {
			return LinkResult{}, ErrApplicationNotLinkable
		}
	case "SUBMITTED", "UNDER_REVIEW", "PROVISIONING_FAILED":
		// A partial provisioning created resources for a NEW Business; linking
		// would strand them. Reprocess or reject that application instead.
		if app.CreatedMerchantID != "" {
			return LinkResult{}, ErrApplicationNotLinkable
		}
	default:
		return LinkResult{}, ErrApplicationNotOpen
	}

	if req, err := requirementsFor(ctx, s.pool, app); err != nil {
		return LinkResult{}, err
	} else if !req.Complete() {
		return LinkResult{}, requirementsError(req)
	}

	// The reviewed application is the KYB decision for the existing Business.
	if err := s.core.ApproveCompliance(ctx, merchantID); err != nil {
		return LinkResult{}, fmt.Errorf("approve compliance: %w", err)
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return LinkResult{}, err
	}
	defer tx.Rollback(ctx)
	// This application's own hold on a handle the Business does not use returns
	// to the pool; the Business keeps the handle it has.
	if _, err := tx.Exec(ctx,
		`DELETE FROM handle_registry WHERE handle=$1 AND owner_type='APPLICATION' AND owner_id=$2::uuid`,
		app.DesiredHandle, id); err != nil {
		return LinkResult{}, err
	}
	if _, err := tx.Exec(ctx,
		`UPDATE merchant_applications
		    SET status='APPROVED', resolution='LINKED_EXISTING', created_merchant_id=$2,
		        reviewed_by=$3, reviewed_at=now(), updated_at=now(), provisioning_error=NULL,
		        admin_notes = concat_ws(E'\n', NULLIF(admin_notes,''), $4::text)
		  WHERE id=$1`, id, merchantID, reviewedBy, "Associada a @"+targetHandle+": "+strings.TrimSpace(reason)); err != nil {
		return LinkResult{}, err
	}
	if _, err := tx.Exec(ctx,
		`UPDATE merchant_application_documents SET merchant_id=$2, updated_at=now()
		  WHERE application_id=$1 AND deleted_at IS NULL`, id, merchantID); err != nil {
		return LinkResult{}, err
	}
	if err := BridgeFromApplicationTx(ctx, tx, id, merchantID, app.Environment); err != nil {
		return LinkResult{}, fmt.Errorf("bridge kyb documents: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return LinkResult{}, err
	}
	return LinkResult{ApplicationID: id, MerchantID: merchantID, Handle: targetHandle,
		BusinessName: app.BusinessName, Environment: app.Environment}, nil
}

// Reject marks the application REJECTED and releases ITS handle hold, keeping
// the admin notes + applicant message for audit/email. A failed provisioning
// that created nothing can be rejected too; one that created a Business is
// reprocessed instead, so nothing is stranded.
func (s *PostgresMerchantApplicationAdminService) Reject(ctx context.Context, id, reviewedBy, adminNotes, merchantMessage string) (RejectionResult, error) {
	release, err := s.lockApplication(ctx, id)
	if err != nil {
		return RejectionResult{}, err
	}
	defer release()
	app, err := s.Get(ctx, id)
	if err != nil {
		return RejectionResult{}, err
	}
	switch app.Status {
	case "SUBMITTED", "UNDER_REVIEW":
	case "PROVISIONING_FAILED":
		if app.CreatedMerchantID != "" {
			return RejectionResult{}, ErrApplicationNotOpen
		}
	default:
		return RejectionResult{}, ErrApplicationNotOpen
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return RejectionResult{}, err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx,
		`DELETE FROM handle_registry WHERE handle=$1 AND owner_type='APPLICATION' AND owner_id=$2::uuid`,
		app.DesiredHandle, id); err != nil {
		return RejectionResult{}, err
	}
	if _, err := tx.Exec(ctx,
		`UPDATE merchant_applications
		    SET status='REJECTED', reviewed_by=$2, admin_notes=$3, merchant_message=$4,
		        reviewed_at=now(), updated_at=now()
		  WHERE id=$1`, id, reviewedBy, nullStr(adminNotes), nullStr(merchantMessage)); err != nil {
		return RejectionResult{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return RejectionResult{}, err
	}

	return RejectionResult{
		ApplicationID:   id,
		BusinessName:    app.BusinessName,
		Email:           app.Email,
		MerchantMessage: merchantMessage,
	}, nil
}
