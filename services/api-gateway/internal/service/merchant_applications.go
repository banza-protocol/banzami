package service

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
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
	TermsAccepted       bool
}

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
	return false, HandleReasonTaken // CONSUMER or MERCHANT
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
	env := "LIVE"
	if in.Environment == "SANDBOX" {
		env = "SANDBOX"
	}

	appID := uuid.NewString()

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx)

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

	if _, err := tx.Exec(ctx,
		`INSERT INTO merchant_applications
		   (id, status, environment, desired_handle, business_name, category, subcategory, email, phone,
		    nif, country, province, municipality, city, address, address_reference,
		    legal_representative, representative_role, representative_email, representative_phone,
		    business_activity, estimated_volume, terms_accepted_at)
		 VALUES ($1,'SUBMITTED',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21, now())`,
		appID, env, handle, in.BusinessName, nullStr(in.Category), nullStr(in.Subcategory), in.Email, nullStr(in.Phone),
		nullStr(in.Nif), nullStr(in.Country), nullStr(in.Province), nullStr(in.Municipality), nullStr(in.City),
		nullStr(in.Address), nullStr(in.AddressReference),
		nullStr(in.LegalRepresentative), nullStr(in.RepresentativeRole), nullStr(in.RepresentativeEmail), nullStr(in.RepresentativePhone),
		nullStr(in.BusinessActivity), nullStr(in.EstimatedVolume),
	); err != nil {
		return "", err
	}

	if err := tx.Commit(ctx); err != nil {
		return "", err
	}
	return appID, nil
}
