package service

import (
	"context"
	"errors"
	"fmt"
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
	ErrApplicationNotFound = errors.New("application not found")
	ErrApplicationNotOpen  = errors.New("application is not open for review")
)

type MerchantApplication struct {
	ID                  string     `json:"id"`
	Status              string     `json:"status"`
	Environment         string     `json:"environment"`
	DesiredHandle       string     `json:"desired_handle"`
	BusinessName        string     `json:"business_name"`
	Category            string     `json:"category"`
	Subcategory         string     `json:"subcategory"`
	Email               string     `json:"email"`
	Phone               string     `json:"phone"`
	Nif                 string     `json:"nif"`
	Country             string     `json:"country"`
	Province            string     `json:"province"`
	Municipality        string     `json:"municipality"`
	City                string     `json:"city"`
	Address             string     `json:"address"`
	AddressReference    string     `json:"address_reference"`
	LegalRepresentative string     `json:"legal_representative"`
	RepresentativeRole  string     `json:"representative_role"`
	RepresentativeEmail string     `json:"representative_email"`
	RepresentativePhone string     `json:"representative_phone"`
	BusinessActivity    string     `json:"business_activity"`
	EstimatedVolume     string     `json:"estimated_volume"`
	AdminNotes          string     `json:"admin_notes"`
	MerchantMessage     string     `json:"merchant_message"`
	CreatedMerchantID   string     `json:"created_merchant_id"`
	CreatedAt           time.Time  `json:"created_at"`
	ReviewedAt          *time.Time `json:"reviewed_at"`
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
}

type PostgresMerchantApplicationAdminService struct {
	pool *pgxpool.Pool
	core *CoreApiClient
}

func NewPostgresMerchantApplicationAdminService(pool *pgxpool.Pool, core *CoreApiClient) *PostgresMerchantApplicationAdminService {
	return &PostgresMerchantApplicationAdminService{pool: pool, core: core}
}

const appCols = `id::text, status, environment, desired_handle, business_name,
	COALESCE(category,''), COALESCE(subcategory,''), email, COALESCE(phone,''), COALESCE(nif,''), COALESCE(country,''),
	COALESCE(province,''), COALESCE(municipality,''), COALESCE(city,''), COALESCE(address,''), COALESCE(address_reference,''),
	COALESCE(legal_representative,''), COALESCE(representative_role,''), COALESCE(representative_email,''), COALESCE(representative_phone,''),
	COALESCE(business_activity,''), COALESCE(estimated_volume,''), COALESCE(admin_notes,''),
	COALESCE(merchant_message,''), COALESCE(created_merchant_id::text,''), created_at, reviewed_at`

func scanApplication(row pgx.Row) (MerchantApplication, error) {
	var a MerchantApplication
	err := row.Scan(&a.ID, &a.Status, &a.Environment, &a.DesiredHandle, &a.BusinessName,
		&a.Category, &a.Subcategory, &a.Email, &a.Phone, &a.Nif, &a.Country,
		&a.Province, &a.Municipality, &a.City, &a.Address, &a.AddressReference,
		&a.LegalRepresentative, &a.RepresentativeRole, &a.RepresentativeEmail, &a.RepresentativePhone,
		&a.BusinessActivity, &a.EstimatedVolume, &a.AdminNotes,
		&a.MerchantMessage, &a.CreatedMerchantID, &a.CreatedAt, &a.ReviewedAt)
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

// Approve provisions the merchant (core: merchant + wallet + api-key +
// compliance), then atomically (gateway DB) creates the profile, converts the
// handle APPLICATION→MERCHANT, creates a PIN-less credential + activation token,
// and marks the application APPROVED. Returns the raw activation token ONCE.
//
// Compensation: core resources cannot share the gateway DB transaction. If a
// core step fails, the application stays SUBMITTED (re-approvable; any partial
// core resource is an orphan an admin can clean — a saga/outbox is the
// production follow-up). The application only flips to APPROVED after the
// gateway transaction commits, so it is never left half-approved.
func (s *PostgresMerchantApplicationAdminService) Approve(ctx context.Context, id, reviewedBy string, activationTTL time.Duration) (ApprovalResult, error) {
	app, err := s.Get(ctx, id)
	if err != nil {
		return ApprovalResult{}, err
	}
	if app.Status != "SUBMITTED" && app.Status != "UNDER_REVIEW" {
		return ApprovalResult{}, ErrApplicationNotOpen
	}

	merchantID, err := s.core.CreateMerchant(ctx, app.BusinessName, app.Email)
	if err != nil {
		return ApprovalResult{}, fmt.Errorf("create merchant: %w", err)
	}
	walletID, err := s.core.CreateWallet(ctx, merchantID, "AOA")
	if err != nil {
		return ApprovalResult{}, fmt.Errorf("create wallet: %w", err)
	}
	apiKeyPrefix, err := s.core.CreateApiKey(ctx, merchantID, "default", app.Environment)
	if err != nil {
		return ApprovalResult{}, fmt.Errorf("create api key: %w", err)
	}
	if err := s.core.ApproveCompliance(ctx, merchantID); err != nil {
		return ApprovalResult{}, fmt.Errorf("approve compliance: %w", err)
	}

	rawToken, err := randomToken(32)
	if err != nil {
		return ApprovalResult{}, err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return ApprovalResult{}, err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx,
		`INSERT INTO merchant_profiles (merchant_id, handle, display_name, category, wallet_id, public)
		 VALUES ($1, $2, $3, $4, $5, false)
		 ON CONFLICT (merchant_id) DO NOTHING`,
		merchantID, app.DesiredHandle, app.BusinessName, nullStr(app.Category), nullStr(walletID)); err != nil {
		return ApprovalResult{}, err
	}
	if _, err := tx.Exec(ctx,
		`UPDATE handle_registry
		    SET owner_type='MERCHANT', owner_id=$2, reserved_until=NULL, reserved_reason=NULL
		  WHERE handle=$1`, app.DesiredHandle, merchantID); err != nil {
		return ApprovalResult{}, err
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO merchant_app_credentials (merchant_id, environment, handle, pin_hash, activated_at)
		 VALUES ($1, $2, $3, NULL, NULL)
		 ON CONFLICT (merchant_id, environment) DO UPDATE SET handle=EXCLUDED.handle`,
		merchantID, app.Environment, app.DesiredHandle); err != nil {
		return ApprovalResult{}, err
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO merchant_activation_tokens (id, merchant_id, environment, token_hash, expires_at)
		 VALUES ($1, $2, $3, $4, $5)`,
		uuid.NewString(), merchantID, app.Environment, hashToken(rawToken), time.Now().Add(activationTTL)); err != nil {
		return ApprovalResult{}, err
	}
	if _, err := tx.Exec(ctx,
		`UPDATE merchant_applications
		    SET status='APPROVED', created_merchant_id=$2, reviewed_by=$3, reviewed_at=now(), updated_at=now()
		  WHERE id=$1`, id, merchantID, reviewedBy); err != nil {
		return ApprovalResult{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return ApprovalResult{}, err
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
	}, nil
}

// Reject marks the application REJECTED and releases its APPLICATION-reserved
// handle, keeping the admin notes + applicant message for audit/email.
func (s *PostgresMerchantApplicationAdminService) Reject(ctx context.Context, id, reviewedBy, adminNotes, merchantMessage string) (RejectionResult, error) {
	app, err := s.Get(ctx, id)
	if err != nil {
		return RejectionResult{}, err
	}
	if app.Status != "SUBMITTED" && app.Status != "UNDER_REVIEW" {
		return RejectionResult{}, ErrApplicationNotOpen
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return RejectionResult{}, err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx,
		`DELETE FROM handle_registry WHERE handle=$1 AND owner_type='APPLICATION'`, app.DesiredHandle); err != nil {
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
