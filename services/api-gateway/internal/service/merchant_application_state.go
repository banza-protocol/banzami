package service

// What an operator needs to see about an application's Business without
// reading the database: the whole state it resolved to, the candidates it can
// be linked to, and a fresh activation link when the first one was lost.

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

var (
	// ErrActivationNotReissuable: only an approved, newly provisioned Business
	// whose login has not been activated yet has an activation link to reissue.
	ErrActivationNotReissuable = errors.New("this application has no pending activation")
)

// ActivationReissue is a new activation link's token, returned once.
type ActivationReissue struct {
	ApplicationID   string `json:"application_id"`
	Email           string `json:"email"`
	BusinessName    string `json:"business_name"`
	Handle          string `json:"handle"`
	Environment     string `json:"environment"`
	ActivationToken string `json:"activation_token"`
}

// ReissueActivation replaces an approved Business's pending activation link.
// Every earlier unused link stops working, so only the newest one can set the
// PIN. Nothing else changes.
func (s *PostgresMerchantApplicationAdminService) ReissueActivation(ctx context.Context, id string, ttl time.Duration) (ActivationReissue, error) {
	release, err := s.lockApplication(ctx, id)
	if err != nil {
		return ActivationReissue{}, err
	}
	defer release()
	app, err := s.Get(ctx, id)
	if err != nil {
		return ActivationReissue{}, err
	}
	if app.Status != "APPROVED" || app.Resolution != "PROVISIONED_NEW" || app.CreatedMerchantID == "" {
		return ActivationReissue{}, ErrActivationNotReissuable
	}
	var activated *time.Time
	err = s.pool.QueryRow(ctx,
		`SELECT activated_at FROM merchant_app_credentials WHERE merchant_id=$1 AND environment=$2`,
		app.CreatedMerchantID, app.Environment).Scan(&activated)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && activated != nil) {
		return ActivationReissue{}, ErrActivationNotReissuable
	}
	if err != nil {
		return ActivationReissue{}, err
	}
	raw, err := randomToken(32)
	if err != nil {
		return ActivationReissue{}, err
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return ActivationReissue{}, err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx,
		`UPDATE merchant_activation_tokens SET expires_at = LEAST(expires_at, now())
		  WHERE merchant_id=$1 AND environment=$2 AND used_at IS NULL`,
		app.CreatedMerchantID, app.Environment); err != nil {
		return ActivationReissue{}, err
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO merchant_activation_tokens (id, merchant_id, environment, token_hash, expires_at)
		 VALUES ($1, $2, $3, $4, $5)`,
		uuid.NewString(), app.CreatedMerchantID, app.Environment, hashToken(raw), time.Now().Add(ttl)); err != nil {
		return ActivationReissue{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return ActivationReissue{}, err
	}
	return ActivationReissue{ApplicationID: id, Email: app.Email, BusinessName: app.BusinessName,
		Handle: app.DesiredHandle, Environment: app.Environment, ActivationToken: raw}, nil
}

// LinkCandidate is an existing Business Account an application may be linked to.
type LinkCandidate struct {
	MerchantID          string `json:"merchant_id"`
	Name                string `json:"name"`
	Handle              string `json:"handle"`
	Status              string `json:"status"`
	KybStatus           string `json:"kyb_status"`
	BusinessAccountType string `json:"business_account_type"`
	// OwnsRequestedHandle: this Business holds the handle the application asks
	// for — the only Business such an application can be linked to.
	OwnsRequestedHandle bool `json:"owns_requested_handle"`
}

// LinkCandidates lists the Businesses an operator may link the application to:
// the owner of the requested handle, and — when the operator names one — the
// Business that uses that handle. Never a fuzzy match on names or emails.
func (s *PostgresMerchantApplicationAdminService) LinkCandidates(ctx context.Context, id, lookupHandle string) ([]LinkCandidate, error) {
	app, err := s.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	handles := []string{app.DesiredHandle}
	if h := NormaliseHandle(lookupHandle); h != "" && h != app.DesiredHandle {
		handles = append(handles, h)
	}
	rows, err := s.pool.Query(ctx,
		`SELECT m.id::text, m.name, hr.handle, m.status, COALESCE(c.kyb_status,'PENDING'),
		        COALESCE(m.business_account_type,'MERCHANT'), hr.handle = $2
		   FROM handle_registry hr
		   JOIN merchants m ON m.id = hr.owner_id
		   LEFT JOIN merchant_compliance c ON c.merchant_id = m.id
		  WHERE hr.owner_type = 'MERCHANT' AND hr.handle = ANY($1)
		  ORDER BY hr.handle = $2 DESC`, handles, app.DesiredHandle)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []LinkCandidate{}
	for rows.Next() {
		var c LinkCandidate
		if err := rows.Scan(&c.MerchantID, &c.Name, &c.Handle, &c.Status, &c.KybStatus,
			&c.BusinessAccountType, &c.OwnsRequestedHandle); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// BusinessState is the whole state of the Business an application resolved to.
type BusinessState struct {
	MerchantID          string  `json:"merchant_id"`
	Name                string  `json:"name"`
	Status              string  `json:"status"`
	BusinessAccountType string  `json:"business_account_type"`
	KybStatus           string  `json:"kyb_status"`
	Handle              string  `json:"handle"`
	WalletStatus        *string `json:"wallet_status"`
	WalletCurrency      *string `json:"wallet_currency"`
	WalletAccounts      int     `json:"wallet_accounts"`
	PricingProfile      *string `json:"pricing_profile"`
	LoginActivated      bool    `json:"login_activated"`
	LoginExists         bool    `json:"login_exists"`
	DeveloperProjects   int     `json:"developer_projects"`
	// Readiness is core's settlement readiness for this Business (the same
	// engine a Project key reads); nil when core could not answer.
	Readiness *SettlementReadiness `json:"readiness"`
}

// BusinessState reads the resolved Business's state. readiness may be nil.
func (s *PostgresMerchantApplicationAdminService) BusinessState(ctx context.Context, id string, readiness SettlementReadinessService) (*BusinessState, error) {
	app, err := s.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	if app.CreatedMerchantID == "" {
		return nil, nil
	}
	st := &BusinessState{MerchantID: app.CreatedMerchantID}
	err = s.pool.QueryRow(ctx,
		`SELECT m.name, m.status, COALESCE(m.business_account_type,'MERCHANT'),
		        COALESCE(c.kyb_status,'PENDING'),
		        COALESCE((SELECT handle FROM handle_registry WHERE owner_type='MERCHANT' AND owner_id=m.id
		                   ORDER BY handle = $2 DESC LIMIT 1), ''),
		        w.status, w.currency,
		        (SELECT count(*) FROM wallet_accounts wa WHERE wa.merchant_id = m.id)::int,
		        pp.code,
		        EXISTS (SELECT 1 FROM merchant_app_credentials mc WHERE mc.merchant_id=m.id AND mc.activated_at IS NOT NULL),
		        EXISTS (SELECT 1 FROM merchant_app_credentials mc WHERE mc.merchant_id=m.id),
		        (SELECT count(*) FROM developer.dev_project_sandbox_binding b WHERE b.merchant_id=m.id AND b.state='ACTIVE')::int
		   FROM merchants m
		   LEFT JOIN merchant_compliance c ON c.merchant_id = m.id
		   LEFT JOIN LATERAL (SELECT status, currency FROM wallets WHERE merchant_id=m.id
		                       ORDER BY (status='ACTIVE') DESC, created_at LIMIT 1) w ON TRUE
		   LEFT JOIN pricing_profiles pp ON pp.id = m.pricing_profile_id
		  WHERE m.id = $1`, app.CreatedMerchantID, app.DesiredHandle).
		Scan(&st.Name, &st.Status, &st.BusinessAccountType, &st.KybStatus, &st.Handle,
			&st.WalletStatus, &st.WalletCurrency, &st.WalletAccounts, &st.PricingProfile,
			&st.LoginActivated, &st.LoginExists, &st.DeveloperProjects)
	if err != nil {
		return nil, err
	}
	if readiness != nil {
		if r, rerr := readiness.Readiness(ctx, app.CreatedMerchantID, "AOA", nil); rerr == nil {
			st.Readiness = r
		}
	}
	return st, nil
}

var (
	// ErrInformationRequestRequired: asking for information needs a message
	// the applicant can act on.
	ErrInformationRequestRequired = errors.New("say what information is needed")
	// ErrNothingToResubmit: only an application the reviewer asked about can be
	// resubmitted, and only once what is due has been provided.
	ErrNothingToResubmit = errors.New("this application is not waiting for information")
)

// RequestInformation puts a review on hold until the applicant provides what
// the reviewer needs. It is not a rejection: the application keeps its handle
// hold and its documents, and returns to review when resubmitted.
func (s *PostgresMerchantApplicationAdminService) RequestInformation(ctx context.Context, id, reviewedBy, message string) (MerchantApplication, error) {
	message = strings.TrimSpace(message)
	if message == "" {
		return MerchantApplication{}, ErrInformationRequestRequired
	}
	release, err := s.lockApplication(ctx, id)
	if err != nil {
		return MerchantApplication{}, err
	}
	defer release()
	app, err := s.Get(ctx, id)
	if err != nil {
		return MerchantApplication{}, err
	}
	if app.Status != "SUBMITTED" && app.Status != "UNDER_REVIEW" && app.Status != "INFORMATION_REQUIRED" {
		return MerchantApplication{}, ErrApplicationNotOpen
	}
	if _, err := s.pool.Exec(ctx,
		`UPDATE merchant_applications
		    SET status = 'INFORMATION_REQUIRED', information_request = $2, information_requested_at = now(),
		        reviewed_by = $3, updated_at = now()
		  WHERE id = $1`, id, message, reviewedBy); err != nil {
		return MerchantApplication{}, err
	}
	return s.Get(ctx, id)
}

// ApplicationStatus is what the applicant — whoever holds the application's
// reference — may see: where it stands and what it still needs. No email, NIF,
// representative or reviewer note: the reference is a capability to act on
// the application, not to read its contents back.
type ApplicationStatus struct {
	ApplicationID      string       `json:"application_id"`
	Status             string       `json:"status"`
	Origin             string       `json:"origin"`
	RequestedHandle    string       `json:"requested_handle"`
	InformationRequest string       `json:"information_request,omitempty"`
	Requirements       Requirements `json:"requirements"`
	CreatedAt          time.Time    `json:"created_at"`
}

// PublicStatus reads an application's status and requirements by reference.
func (s *PostgresMerchantApplicationAdminService) PublicStatus(ctx context.Context, id string) (ApplicationStatus, error) {
	if _, err := uuid.Parse(id); err != nil {
		return ApplicationStatus{}, ErrApplicationNotFound
	}
	app, err := s.Get(ctx, id)
	if err != nil {
		return ApplicationStatus{}, err
	}
	req, err := requirementsFor(ctx, s.pool, app)
	if err != nil {
		return ApplicationStatus{}, err
	}
	st := ApplicationStatus{
		ApplicationID: app.ID, Status: app.Status, Origin: app.Origin,
		RequestedHandle: app.DesiredHandle, Requirements: req, CreatedAt: app.CreatedAt,
	}
	if app.Status == "INFORMATION_REQUIRED" {
		st.InformationRequest = app.InformationRequest
	}
	return st, nil
}

// Resubmit returns an application the reviewer asked about to review, once
// nothing the policy requires is missing. What the reviewer asked for is kept
// in the record; the applicant's answer is whatever they changed or attached.
func (s *PostgresMerchantApplicationAdminService) Resubmit(ctx context.Context, id string) (ApplicationStatus, error) {
	if _, err := uuid.Parse(id); err != nil {
		return ApplicationStatus{}, ErrApplicationNotFound
	}
	release, err := s.lockApplication(ctx, id)
	if err != nil {
		return ApplicationStatus{}, err
	}
	defer release()
	app, err := s.Get(ctx, id)
	if err != nil {
		return ApplicationStatus{}, err
	}
	if app.Status != "INFORMATION_REQUIRED" {
		return ApplicationStatus{}, ErrNothingToResubmit
	}
	app.Status = "SUBMITTED" // evaluate as it would stand once resubmitted
	req, err := requirementsFor(ctx, s.pool, app)
	if err != nil {
		return ApplicationStatus{}, err
	}
	if !req.Complete() {
		return ApplicationStatus{}, requirementsError(req)
	}
	if _, err := s.pool.Exec(ctx,
		`UPDATE merchant_applications SET status = 'SUBMITTED', updated_at = now()
		  WHERE id = $1 AND status = 'INFORMATION_REQUIRED'`, id); err != nil {
		return ApplicationStatus{}, err
	}
	return s.PublicStatus(ctx, id)
}

// requirementsError names what stands between an application and a decision.
func requirementsError(r Requirements) error {
	var codes []string
	for _, i := range r.CurrentlyDue {
		codes = append(codes, i.Code)
	}
	for _, i := range r.Errors {
		codes = append(codes, i.Code)
	}
	return fmt.Errorf("%w: %s", ErrRequiredDocumentsMissing, strings.Join(codes, ", "))
}

// ProjectApplication is a Developer Project's application as the Project's own
// Console shows it: the applicant is the developer, so the business name they
// typed comes back; nothing the reviewer wrote does, except what was asked of
// them.
type ProjectApplication struct {
	ApplicationStatus
	BusinessName   string `json:"business_name"`
	ProjectBinding string `json:"project_binding,omitempty"` // BOUND | PENDING, once APPROVED
}

// LatestForProject returns the Project's most recent application, or
// ErrApplicationNotFound when it never applied.
func (s *PostgresMerchantApplicationAdminService) LatestForProject(ctx context.Context, projectID string) (ProjectApplication, error) {
	if _, err := uuid.Parse(projectID); err != nil {
		return ProjectApplication{}, ErrApplicationNotFound
	}
	var id string
	err := s.pool.QueryRow(ctx,
		`SELECT id::text FROM merchant_applications WHERE project_id = $1 ORDER BY created_at DESC LIMIT 1`, projectID).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return ProjectApplication{}, ErrApplicationNotFound
	}
	if err != nil {
		return ProjectApplication{}, err
	}
	st, err := s.PublicStatus(ctx, id)
	if err != nil {
		return ProjectApplication{}, err
	}
	app, err := s.Get(ctx, id)
	if err != nil {
		return ProjectApplication{}, err
	}
	out := ProjectApplication{ApplicationStatus: st, BusinessName: app.BusinessName}
	if app.Status == "APPROVED" {
		out.ProjectBinding = "PENDING"
		if app.ProvisioningProjectBound {
			out.ProjectBinding = "BOUND"
		}
	}
	return out, nil
}
