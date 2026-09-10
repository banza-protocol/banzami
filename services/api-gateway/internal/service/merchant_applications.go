package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Merchant onboarding applications (Merchant Lifecycle, Track 1). A merchant
// applies for a @negócio on banzami.com; the desired handle is reserved in
// handle_registry at submission (owner_type=APPLICATION, reserved_until=+30d).

var ErrApplicationIncomplete = errors.New("application is missing required fields")

// Handle availability reason codes (non-secret; safe for the public form).
const (
	HandleAvailable      = ""
	HandleReasonInvalid  = "INVALID"
	HandleReasonReserved = "RESERVED"
	HandleReasonTaken    = "TAKEN"
	HandleReasonPending  = "PENDING" // held by another in-flight application
	// HandleReasonBusiness: an existing Business Account uses this handle. It
	// cannot be requested as new; its owner can apply to regularise it
	// (existing_business), resolved by an operator link.
	HandleReasonBusiness = "BUSINESS"
)

// applicationHandleTTL is how long a submitted application holds its handle.
const applicationHandleTTL = "30 days"

type MerchantApplicationInput struct {
	Environment         string
	DesiredHandle       string
	BusinessName        string
	Category            string
	Subcategory         string
	Email               string
	Phone               string
	Nif                 string
	Country             string
	Province            string
	Municipality        string
	City                string
	Address             string
	AddressReference    string
	LegalRepresentative string
	RepresentativeRole  string
	RepresentativeEmail string
	RepresentativePhone string
	BusinessActivity    string
	EstimatedVolume     string
	// ExistingBusiness: the applicant says the requested handle is already
	// their Business's. No hold is taken; it is resolved by an operator link.
	ExistingBusiness bool
	// IdempotencyKey: the public form's per-session key. A resubmission with the
	// same key returns the application the first one created.
	IdempotencyKey string
	TermsAccepted  bool
	// Origin is where the application was started: ApplicationOriginStandalone
	// (the public form) or ApplicationOriginDeveloperProject (a Project's
	// Financial Setup, with ProjectID and the Console user who submitted).
	// Required: no writer is assumed to be the public form.
	Origin            string
	ProjectID         string
	SubmittedByUserID string
}

// Application origins (migration 0121).
const (
	ApplicationOriginStandalone       = "STANDALONE_BUSINESS"
	ApplicationOriginDeveloperProject = "DEVELOPER_PROJECT"
)

var (
	// ErrApplicationOrigin: the origin is missing, unknown, or inconsistent
	// with a Project (a Project application names its Project; a public one
	// never does).
	ErrApplicationOrigin = errors.New("application origin is missing or inconsistent")
	// ErrProjectHasOpenApplication: a Project has at most one application in
	// progress.
	ErrProjectHasOpenApplication = errors.New("this Project already has an application in progress")
)

type MerchantApplicationService interface {
	CheckHandle(ctx context.Context, handle string) (available bool, reason string, err error)
	Submit(ctx context.Context, in MerchantApplicationInput) (applicationID string, err error)
}

type PostgresMerchantApplicationService struct {
	pool *pgxpool.Pool
}

func NewPostgresMerchantApplicationService(pool *pgxpool.Pool) *PostgresMerchantApplicationService {
	return &PostgresMerchantApplicationService{pool: pool}
}

// classifyHandle maps a handle_registry row to (available, reason). An expired
// APPLICATION reservation is treated as available.
func classifyHandle(ownerType string, reservedReason *string, reservedUntil *time.Time) (bool, string) {
	if ownerType == "SYSTEM" || reservedReason != nil {
		return false, HandleReasonReserved
	}
	if ownerType == "APPLICATION" {
		if reservedUntil != nil && reservedUntil.After(time.Now()) {
			return false, HandleReasonPending
		}
		return true, HandleAvailable // expired reservation → available again
	}
	if ownerType == "MERCHANT" {
		return false, HandleReasonBusiness
	}
	return false, HandleReasonTaken // CONSUMER
}

// CheckHandle reports whether a desired @negócio can be requested right now.
func (s *PostgresMerchantApplicationService) CheckHandle(ctx context.Context, handle string) (bool, string, error) {
	handle = NormaliseHandle(handle)
	if ValidateHandle(handle) != nil {
		return false, HandleReasonInvalid, nil
	}

	var (
		ownerType string
		reserved  *string
		until     *time.Time
	)
	err := s.pool.QueryRow(ctx,
		`SELECT owner_type, reserved_reason, reserved_until FROM handle_registry WHERE handle = $1`, handle).
		Scan(&ownerType, &reserved, &until)
	if errors.Is(err, pgx.ErrNoRows) {
		return true, HandleAvailable, nil
	}
	if err != nil {
		return false, "", err
	}
	available, reason := classifyHandle(ownerType, reserved, until)
	return available, reason, nil
}

func nullStr(s string) any {
	if s == "" {
		return nil
	}
	return s
}

// Submit validates the application, reserves the handle (rejecting a race), and
// stores the application as SUBMITTED — all atomically. The handle is reserved
// ONLY after full validation passes.
func (s *PostgresMerchantApplicationService) Submit(ctx context.Context, in MerchantApplicationInput) (string, error) {
	handle := NormaliseHandle(in.DesiredHandle)
	if err := ValidateHandle(handle); err != nil {
		return "", ErrHandleInvalid
	}
	if in.BusinessName == "" || in.Email == "" || !in.TermsAccepted {
		return "", ErrApplicationIncomplete
	}
	switch in.Origin {
	case ApplicationOriginStandalone:
		if in.ProjectID != "" {
			return "", ErrApplicationOrigin
		}
	case ApplicationOriginDeveloperProject:
		// A Project that already has a Business connects it with the
		// Business's consent (a link code), not by claiming its handle here.
		if in.ProjectID == "" || in.ExistingBusiness {
			return "", ErrApplicationOrigin
		}
		if _, err := uuid.Parse(in.ProjectID); err != nil {
			return "", ErrApplicationOrigin
		}
	default:
		return "", ErrApplicationOrigin
	}
	env := "LIVE"
	if in.Environment == "SANDBOX" {
		env = "SANDBOX"
	}

	var keyHash any
	if k := strings.TrimSpace(in.IdempotencyKey); k != "" {
		sum := sha256.Sum256([]byte(k))
		keyHash = hex.EncodeToString(sum[:])
		var existing string
		err := s.pool.QueryRow(ctx,
			`SELECT id::text FROM merchant_applications WHERE submit_idempotency_key = $1`, keyHash).Scan(&existing)
		if err == nil {
			return existing, nil
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return "", err
		}
	}

	appID := uuid.NewString()

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx)

	if in.ExistingBusiness {
		// The handle must already be an ACTIVE Business's. It is not held or
		// touched: it stays with its owner until an operator links the
		// application to that owner — or rejects it.
		var ownerStatus string
		err := tx.QueryRow(ctx,
			`SELECT m.status FROM handle_registry hr JOIN merchants m ON m.id = hr.owner_id
			  WHERE hr.handle = $1 AND hr.owner_type = 'MERCHANT'`, handle).Scan(&ownerStatus)
		if errors.Is(err, pgx.ErrNoRows) || (err == nil && ownerStatus != "ACTIVE") {
			return "", ErrExistingBusinessNotFound
		}
		if err != nil {
			return "", err
		}
		if err := s.insertApplication(ctx, tx, appID, env, handle, in, keyHash); err != nil {
			return "", err
		}
		if err := tx.Commit(ctx); err != nil {
			return "", err
		}
		return appID, nil
	}

	// Lock the handle row (if any) and decide whether we can reserve it.
	var (
		ownerType string
		reserved  *string
		until     *time.Time
	)
	scanErr := tx.QueryRow(ctx,
		`SELECT owner_type, reserved_reason, reserved_until
		   FROM handle_registry WHERE handle = $1 FOR UPDATE`, handle).
		Scan(&ownerType, &reserved, &until)
	switch {
	case errors.Is(scanErr, pgx.ErrNoRows):
		if _, err := tx.Exec(ctx,
			`INSERT INTO handle_registry (handle, owner_type, owner_id, reserved_until)
			 VALUES ($1, 'APPLICATION', $2, now() + interval '`+applicationHandleTTL+`')`,
			handle, appID); err != nil {
			return "", err
		}
	case scanErr != nil:
		return "", scanErr
	default:
		available, reason := classifyHandle(ownerType, reserved, until)
		if !available {
			if reason == HandleReasonReserved {
				return "", ErrHandleReserved
			}
			if reason == HandleReasonBusiness {
				return "", ErrHandleOwnedByBusiness
			}
			return "", ErrMerchantHandleTaken
		}
		// Expired APPLICATION reservation → take it over.
		if _, err := tx.Exec(ctx,
			`UPDATE handle_registry
			    SET owner_type='APPLICATION', owner_id=$2, reserved_reason=NULL,
			        reserved_until = now() + interval '`+applicationHandleTTL+`'
			  WHERE handle=$1`, handle, appID); err != nil {
			return "", err
		}
	}

	if err := s.insertApplication(ctx, tx, appID, env, handle, in, keyHash); err != nil {
		return "", err
	}

	if err := tx.Commit(ctx); err != nil {
		return "", err
	}
	return appID, nil
}

// insertApplication writes a SUBMITTED application inside the caller's tx.
func (s *PostgresMerchantApplicationService) insertApplication(ctx context.Context, tx pgx.Tx, appID, env, handle string, in MerchantApplicationInput, keyHash any) error {
	_, err := tx.Exec(ctx,
		`INSERT INTO merchant_applications
		   (id, status, environment, desired_handle, business_name, category, subcategory, email, phone,
		    nif, country, province, municipality, city, address, address_reference,
		    legal_representative, representative_role, representative_email, representative_phone,
		    business_activity, estimated_volume, claims_existing_business, submit_idempotency_key, terms_accepted_at,
		    origin, project_id, submitted_by_user_id)
		 VALUES ($1,'SUBMITTED',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23, now(),
		         $24, $25::uuid, $26::uuid)`,
		appID, env, handle, in.BusinessName, nullStr(in.Category), nullStr(in.Subcategory), in.Email, nullStr(in.Phone),
		nullStr(in.Nif), nullStr(in.Country), nullStr(in.Province), nullStr(in.Municipality), nullStr(in.City),
		nullStr(in.Address), nullStr(in.AddressReference),
		nullStr(in.LegalRepresentative), nullStr(in.RepresentativeRole), nullStr(in.RepresentativeEmail), nullStr(in.RepresentativePhone),
		nullStr(in.BusinessActivity), nullStr(in.EstimatedVolume), in.ExistingBusiness, keyHash,
		in.Origin, nullStr(in.ProjectID), nullStr(in.SubmittedByUserID),
	)
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.ConstraintName == "uq_merchant_applications_open_per_project" {
		return ErrProjectHasOpenApplication
	}
	return err
}
