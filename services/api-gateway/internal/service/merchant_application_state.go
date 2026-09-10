package service

// What an operator needs to see about an application's Business without
// reading the database: the whole state it resolved to, the candidates it can
// be linked to, and a fresh activation link when the first one was lost.

import (
	"context"
	"errors"
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
