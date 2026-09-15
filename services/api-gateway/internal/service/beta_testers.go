package service

// Beta tester registration (APP-BETA-001).
//
// The public site's beta form lands here. The apps are functional and given to
// invited testers through TestFlight (iOS) and Google Play testing (Android);
// this records who wants in. One row per email: registering again from another
// device, or for the other app, MERGES into the same row rather than making a
// duplicate — so a person is asked nothing twice and the operator sees one
// tester, not five. It stores contact details only: no money, no @banza, no
// secret, and it is never written by Core.

import (
	"context"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

// BetaRegistration is one public submission.
type BetaRegistration struct {
	FirstName    string
	LastName     string
	Email        string
	WantsIOS     bool
	WantsAndroid bool
	AppBanzami   bool
	AppMerchant  bool
	DeviceModel  string
	OSVersion    string
	Country      string
	Source       string
}

// BetaTesterService records beta registrations.
type BetaTesterService interface {
	Register(ctx context.Context, in BetaRegistration) error
}

// PostgresBetaTesterService writes the beta_testers table.
type PostgresBetaTesterService struct {
	pool *pgxpool.Pool
}

func NewPostgresBetaTesterService(pool *pgxpool.Pool) *PostgresBetaTesterService {
	return &PostgresBetaTesterService{pool: pool}
}

// NormalizeEmail trims and lower-cases. It does NOT apply provider-specific
// transforms (a Gmail dot is significant to someone; removing it would merge two
// people). The original spelling is stored separately for display.
func NormalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

// Register inserts the tester, or merges the submission into their existing row.
//
// The merge is additive on intent — wanting iOS never un-wants Android, wanting
// the merchant app never drops the consumer app — and refreshes the name and the
// optional QA fields with the latest non-empty values. A REMOVED tester who
// registers again is reopened as PENDING; an INVITED/ACTIVE one keeps their
// status (re-submitting must not demote someone already in the programme). It is
// idempotent and reveals nothing: the caller gets the same answer whether the
// email was new or already present.
func (s *PostgresBetaTesterService) Register(ctx context.Context, in BetaRegistration) error {
	norm := NormalizeEmail(in.Email)
	_, err := s.pool.Exec(ctx, `
		INSERT INTO beta_testers
			(email_normalized, email_display, first_name, last_name,
			 wants_ios, wants_android, app_banzami, app_merchant,
			 device_model, os_version, country, source, status)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
			NULLIF($9,''), NULLIF($10,''), NULLIF($11,''), NULLIF($12,''), 'PENDING')
		ON CONFLICT (email_normalized) DO UPDATE SET
			email_display = EXCLUDED.email_display,
			first_name    = EXCLUDED.first_name,
			last_name     = EXCLUDED.last_name,
			wants_ios     = beta_testers.wants_ios     OR EXCLUDED.wants_ios,
			wants_android = beta_testers.wants_android OR EXCLUDED.wants_android,
			app_banzami   = beta_testers.app_banzami   OR EXCLUDED.app_banzami,
			app_merchant  = beta_testers.app_merchant  OR EXCLUDED.app_merchant,
			device_model  = COALESCE(EXCLUDED.device_model, beta_testers.device_model),
			os_version    = COALESCE(EXCLUDED.os_version,   beta_testers.os_version),
			country       = COALESCE(EXCLUDED.country,      beta_testers.country),
			status        = CASE WHEN beta_testers.status = 'REMOVED' THEN 'PENDING' ELSE beta_testers.status END,
			removed_at    = CASE WHEN beta_testers.status = 'REMOVED' THEN NULL ELSE beta_testers.removed_at END,
			updated_at    = now()`,
		norm, strings.TrimSpace(in.Email), in.FirstName, in.LastName,
		in.WantsIOS, in.WantsAndroid, in.AppBanzami, in.AppMerchant,
		in.DeviceModel, in.OSVersion, in.Country, in.Source)
	return err
}
