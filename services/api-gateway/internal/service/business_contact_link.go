package service

// Business verified contacts and the two OTP flows that stand on them (ADR-060,
// Path B). A Business may use email as a proof-of-control factor only once that
// email has itself been verified by Banzami — an OTP delivered to it was
// returned. Two deliberately separate purposes:
//
//   BUSINESS_CONTACT_VERIFY  — prove control of an address → persist it as the
//                              Business's verified contact. (StartContactVerify →
//                              ConfirmContactVerify → PersistVerifiedContact.)
//   BUSINESS_PROJECT_LINK    — use that already-verified contact to prove control
//                              for linking the Business to a Project.
//                              (StartProjectLink → ConfirmProjectLink →
//                              RedeemProjectLinkGrant.)
//
// Purpose isolation is strict: a contact-verify OTP can never authorise a project
// link, and vice versa (enforced by the purpose/kind columns and by every query
// below naming the purpose it expects). Mirrors the proven mechanics of
// account_deletion_request.go and the consumer recovery engine: HMAC(pepper) over
// the code and the grant token, the attempt counter claimed in its own commit
// before the constant-time compare, a single live code per subject+purpose, and a
// DB-backed resend cooldown + issue window. Only hashes are stored.
//
// The developer never supplies the destination for a link OTP: it is the
// Business's server-side verified contact, resolved here. A synthetic Business's
// non-deliverable .test placeholder is NOT a verified contact and never receives
// an OTP.

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	// ErrBusinessContactUnavailable: the engine is not configured (no pepper) or
	// its store could not answer. Fail-closed — never a refusal.
	ErrBusinessContactUnavailable = errors.New("business contact verification unavailable")
	// ErrBusinessContactInvalid: a confirm whose subject/code/state/expiry does not
	// line up. Non-enumerating — one generic answer for all of them.
	ErrBusinessContactInvalid = errors.New("invalid or expired verification")
	// ErrBusinessContactLocked: too many wrong codes for this subject+purpose.
	ErrBusinessContactLocked = errors.New("too many attempts; request a new code")
	// ErrBusinessContactCooldown: a new code was asked for too soon.
	ErrBusinessContactCooldown = errors.New("a code was sent recently; wait before asking again")
	// ErrNoVerifiedContact: the Business has no active primary verified contact, so
	// there is no destination for a link OTP. The caller falls back to a link code.
	ErrNoVerifiedContact = errors.New("business has no verified contact")
	// ErrBusinessLinkGrantInvalid: a grant that is unknown, wrong kind, expired,
	// spent, or bound to a different project/environment.
	ErrBusinessLinkGrantInvalid = errors.New("invalid or expired link authorisation")
	// ErrBusinessLinkNotReady: the resolved Business is not in a linkable state
	// (not ACTIVE, no handle, or no active AOA PRIMARY account).
	ErrBusinessLinkNotReady = errors.New("business is not ready to link")
)

const (
	businessOTPTTL         = 10 * time.Minute
	businessGrantTTL       = 15 * time.Minute
	businessMaxAttempts    = 5
	businessResendCooldown = 60 * time.Second
	businessIssueWindow    = 15 * time.Minute
	businessMaxPerWindow   = 5
)

// BusinessContactService owns verified Business contacts and the two OTP purposes.
type BusinessContactService struct {
	pool   *pgxpool.Pool
	pepper string
	env    string
	now    func() time.Time
}

// NewBusinessContactService returns the engine, or nil when no pepper is
// configured (routes that need it are then not mounted — fail-closed). env is the
// gateway's ENVIRONMENT (SANDBOX/LIVE); every row is written and read under it.
func NewBusinessContactService(pool *pgxpool.Pool, pepper, environment string) *BusinessContactService {
	env := strings.ToUpper(strings.TrimSpace(environment))
	if pool == nil || strings.TrimSpace(pepper) == "" || (env != "SANDBOX" && env != "LIVE") {
		return nil
	}
	return &BusinessContactService{pool: pool, pepper: pepper, env: env, now: time.Now}
}

func (s *BusinessContactService) hashCode(code string) string {
	mac := hmac.New(sha256.New, []byte(s.pepper))
	mac.Write([]byte("bc-otp:" + code))
	return hex.EncodeToString(mac.Sum(nil))
}

func (s *BusinessContactService) hashToken(raw string) string {
	mac := hmac.New(sha256.New, []byte(s.pepper))
	mac.Write([]byte("bc-grant:" + raw))
	return hex.EncodeToString(mac.Sum(nil))
}

func newBusinessOTP() (string, error) {
	var b strings.Builder
	b.Grow(6)
	for i := 0; i < 6; i++ {
		n, err := rand.Int(rand.Reader, big.NewInt(10))
		if err != nil {
			return "", err
		}
		b.WriteByte(byte('0' + n.Int64()))
	}
	return b.String(), nil
}

func newBusinessGrantToken() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

// maskEmail renders a privacy-preserving form: f••••@example.com. The first
// local-part character is kept, the rest masked, the domain shown.
func maskEmail(email string) string {
	email = strings.TrimSpace(email)
	at := strings.LastIndex(email, "@")
	if at <= 0 {
		return "•••"
	}
	local, domain := email[:at], email[at+1:]
	first := local[:1]
	return first + "••••@" + domain
}

func normaliseEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

// looksLikeBusinessEmail is a conservative shape check (the handler package has
// its own looksLikeEmail; the service must not import handler). One @, a dot in
// the domain, no spaces — enough to reject obvious junk before an OTP is sent.
func looksLikeBusinessEmail(e string) bool {
	e = strings.TrimSpace(e)
	if len(e) < 6 || len(e) > 254 || strings.ContainsAny(e, " \t\r\n") {
		return false
	}
	at := strings.LastIndex(e, "@")
	if at <= 0 || at == len(e)-1 {
		return false
	}
	domain := e[at+1:]
	return strings.Contains(domain, ".") && !strings.HasPrefix(domain, ".") && !strings.HasSuffix(domain, ".")
}

// checkIssuePolicy enforces the resend cooldown and the per-window issue cap for a
// subject+purpose, from the persisted OTP history (survives restarts). It runs
// before a new code is written.
func (s *BusinessContactService) checkIssuePolicy(ctx context.Context, subjectID, purpose string) error {
	var (
		lastAt   *time.Time
		inWindow int
	)
	if err := s.pool.QueryRow(ctx,
		`SELECT max(created_at),
		        count(*) FILTER (WHERE created_at > $3)
		   FROM business_contact_otps
		  WHERE subject_id = $1 AND purpose = $2`,
		subjectID, purpose, s.now().Add(-businessIssueWindow)).Scan(&lastAt, &inWindow); err != nil {
		return fmt.Errorf("%w: issue policy: %w", ErrBusinessContactUnavailable, err)
	}
	if lastAt != nil && s.now().Sub(*lastAt) < businessResendCooldown {
		return ErrBusinessContactCooldown
	}
	if inWindow >= businessMaxPerWindow {
		return ErrBusinessContactLocked
	}
	return nil
}

// issueOTP supersedes any live code for the subject+purpose and writes a fresh
// one, returning the raw code (the handler emails it; only the hash is stored).
func (s *BusinessContactService) issueOTP(ctx context.Context, subjectID string, projectID *string, purpose, email, ip string) (string, error) {
	if err := s.checkIssuePolicy(ctx, subjectID, purpose); err != nil {
		return "", err
	}
	code, err := newBusinessOTP()
	if err != nil {
		return "", fmt.Errorf("%w: generate code: %w", ErrBusinessContactUnavailable, err)
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return "", fmt.Errorf("%w: begin: %w", ErrBusinessContactUnavailable, err)
	}
	defer tx.Rollback(ctx)
	// Supersede the live code (the single-live partial unique index would otherwise
	// reject the insert).
	if _, err := tx.Exec(ctx,
		`UPDATE business_contact_otps SET consumed_at = now(), updated_at = now()
		  WHERE subject_id = $1 AND purpose = $2 AND consumed_at IS NULL`,
		subjectID, purpose); err != nil {
		return "", fmt.Errorf("%w: supersede: %w", ErrBusinessContactUnavailable, err)
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO business_contact_otps
		   (id, purpose, subject_id, project_id, contact_value, environment, code_hash, expires_at, request_ip)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		uuid.NewString(), purpose, subjectID, projectID, normaliseEmail(email), s.env,
		s.hashCode(code), s.now().Add(businessOTPTTL), nullString(ip)); err != nil {
		return "", fmt.Errorf("%w: store code: %w", ErrBusinessContactUnavailable, err)
	}
	if err := tx.Commit(ctx); err != nil {
		return "", fmt.Errorf("%w: commit: %w", ErrBusinessContactUnavailable, err)
	}
	return code, nil
}

// consumeOTP claims one attempt (in its own commit, so a storm of guesses cannot
// each read "0 attempts"), then compares in constant time, marking the code
// consumed on a match. It returns the row's contact_value on success. It never
// reveals which of subject/code/state/expiry was wrong.
func (s *BusinessContactService) consumeOTP(ctx context.Context, subjectID, purpose, code string) (contactValue string, err error) {
	if _, e := uuid.Parse(subjectID); e != nil || len(code) != 6 {
		return "", ErrBusinessContactInvalid
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return "", fmt.Errorf("%w: begin: %w", ErrBusinessContactUnavailable, err)
	}
	defer tx.Rollback(ctx)

	var (
		id       string
		otpHash  string
		expires  time.Time
		attempts int
		contact  string
	)
	err = tx.QueryRow(ctx,
		`SELECT id, code_hash, expires_at, attempts, contact_value
		   FROM business_contact_otps
		  WHERE subject_id = $1 AND purpose = $2 AND consumed_at IS NULL
		  FOR UPDATE`, subjectID, purpose).
		Scan(&id, &otpHash, &expires, &attempts, &contact)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrBusinessContactInvalid
	}
	if err != nil {
		return "", fmt.Errorf("%w: read code: %w", ErrBusinessContactUnavailable, err)
	}
	if attempts >= businessMaxAttempts {
		return "", ErrBusinessContactLocked
	}
	if !s.now().Before(expires) {
		return "", ErrBusinessContactInvalid
	}
	if _, err := tx.Exec(ctx,
		`UPDATE business_contact_otps SET attempts = attempts + 1, updated_at = now() WHERE id = $1`, id); err != nil {
		return "", fmt.Errorf("%w: claim attempt: %w", ErrBusinessContactUnavailable, err)
	}
	if subtle.ConstantTimeCompare([]byte(s.hashCode(code)), []byte(otpHash)) != 1 {
		if err := tx.Commit(ctx); err != nil {
			return "", fmt.Errorf("%w: commit attempt: %w", ErrBusinessContactUnavailable, err)
		}
		return "", ErrBusinessContactInvalid
	}
	if _, err := tx.Exec(ctx,
		`UPDATE business_contact_otps SET consumed_at = now(), updated_at = now() WHERE id = $1`, id); err != nil {
		return "", fmt.Errorf("%w: consume: %w", ErrBusinessContactUnavailable, err)
	}
	if err := tx.Commit(ctx); err != nil {
		return "", fmt.Errorf("%w: commit consumed: %w", ErrBusinessContactUnavailable, err)
	}
	return contact, nil
}

func (s *BusinessContactService) issueGrant(ctx context.Context, kind, subjectID string, merchantID, projectID *string, contact string) (string, error) {
	token, err := newBusinessGrantToken()
	if err != nil {
		return "", fmt.Errorf("%w: generate grant: %w", ErrBusinessContactUnavailable, err)
	}
	if _, err := s.pool.Exec(ctx,
		`INSERT INTO business_link_grants
		   (id, kind, token_hash, subject_id, merchant_id, project_id, contact_value, environment, expires_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		uuid.NewString(), kind, s.hashToken(token), subjectID, merchantID, projectID,
		contact, s.env, s.now().Add(businessGrantTTL)); err != nil {
		return "", fmt.Errorf("%w: store grant: %w", ErrBusinessContactUnavailable, err)
	}
	return token, nil
}

// ── BUSINESS_CONTACT_VERIFY ─────────────────────────────────────────────────

// StartContactVerify sends a contact-verification code to email for a subject
// (a project_id pre-provision in Path A, or a merchant_id for enrolment on an
// existing Business). It returns the raw code (the handler emails it) and a masked
// form of the destination. The destination comes from the authorised caller, not
// from an unauthenticated visitor — authorisation is the developer service's job.
func (s *BusinessContactService) StartContactVerify(ctx context.Context, subjectID, email, ip string) (code, masked string, err error) {
	if _, e := uuid.Parse(subjectID); e != nil {
		return "", "", ErrBusinessContactInvalid
	}
	email = normaliseEmail(email)
	if !looksLikeBusinessEmail(email) {
		return "", "", ErrBusinessContactInvalid
	}
	code, err = s.issueOTP(ctx, subjectID, nil, "BUSINESS_CONTACT_VERIFY", email, ip)
	if err != nil {
		return "", "", err
	}
	return code, maskEmail(email), nil
}

// ConfirmContactVerify checks a contact-verification code for a subject and, on
// success, issues a single-use CONTACT_VERIFIED grant carrying the proven email.
// The grant — not the code — is what later persists the verified contact.
func (s *BusinessContactService) ConfirmContactVerify(ctx context.Context, subjectID, code string) (grant, email string, err error) {
	contact, err := s.consumeOTP(ctx, subjectID, "BUSINESS_CONTACT_VERIFY", code)
	if err != nil {
		return "", "", err
	}
	token, err := s.issueGrant(ctx, "CONTACT_VERIFIED", subjectID, nil, nil, contact)
	if err != nil {
		return "", "", err
	}
	return token, contact, nil
}

// PersistVerifiedContact spends a CONTACT_VERIFIED grant to record merchantID's
// primary verified email contact. It replaces any previous primary email contact
// (the single-primary index), writes verified_at = now, and consumes the grant.
// Returns the masked contact. Idempotent-safe: a spent/expired grant is refused.
func (s *BusinessContactService) PersistVerifiedContact(ctx context.Context, grant, merchantID string) (masked string, err error) {
	if _, e := uuid.Parse(merchantID); e != nil {
		return "", ErrBusinessLinkGrantInvalid
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return "", fmt.Errorf("%w: begin: %w", ErrBusinessContactUnavailable, err)
	}
	defer tx.Rollback(ctx)

	var (
		id, kind, contact, env string
		expires                time.Time
		consumed               *time.Time
	)
	err = tx.QueryRow(ctx,
		`SELECT id, kind, contact_value, environment, expires_at, consumed_at
		   FROM business_link_grants WHERE token_hash = $1 FOR UPDATE`, s.hashToken(grant)).
		Scan(&id, &kind, &contact, &env, &expires, &consumed)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrBusinessLinkGrantInvalid
	}
	if err != nil {
		return "", fmt.Errorf("%w: read grant: %w", ErrBusinessContactUnavailable, err)
	}
	if kind != "CONTACT_VERIFIED" || env != s.env || consumed != nil || !s.now().Before(expires) {
		return "", ErrBusinessLinkGrantInvalid
	}
	// Retire any existing primary email contact, then write the new verified one.
	if _, err := tx.Exec(ctx,
		`UPDATE business_contacts SET revoked_at = now(), updated_at = now()
		  WHERE merchant_id = $1 AND environment = $2 AND contact_type = 'EMAIL'
		    AND is_primary = TRUE AND revoked_at IS NULL`,
		merchantID, s.env); err != nil {
		return "", fmt.Errorf("%w: retire prior contact: %w", ErrBusinessContactUnavailable, err)
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO business_contacts
		   (id, merchant_id, contact_type, value_normalized, is_primary, verified_at, environment)
		 VALUES ($1, $2, 'EMAIL', $3, TRUE, now(), $4)`,
		uuid.NewString(), merchantID, contact, s.env); err != nil {
		return "", fmt.Errorf("%w: write contact: %w", ErrBusinessContactUnavailable, err)
	}
	if _, err := tx.Exec(ctx,
		`UPDATE business_link_grants SET consumed_at = now() WHERE id = $1`, id); err != nil {
		return "", fmt.Errorf("%w: consume grant: %w", ErrBusinessContactUnavailable, err)
	}
	if err := tx.Commit(ctx); err != nil {
		return "", fmt.Errorf("%w: commit: %w", ErrBusinessContactUnavailable, err)
	}
	return maskEmail(contact), nil
}

// VerifiedContactFor returns merchantID's active primary verified email and its
// masked form, or ok=false when there is none.
func (s *BusinessContactService) VerifiedContactFor(ctx context.Context, merchantID string) (email, masked string, ok bool, err error) {
	if _, e := uuid.Parse(merchantID); e != nil {
		return "", "", false, ErrBusinessContactInvalid
	}
	err = s.pool.QueryRow(ctx,
		`SELECT value_normalized FROM business_contacts
		  WHERE merchant_id = $1 AND environment = $2 AND contact_type = 'EMAIL'
		    AND is_primary = TRUE AND verified_at IS NOT NULL AND revoked_at IS NULL
		  ORDER BY verified_at DESC LIMIT 1`, merchantID, s.env).Scan(&email)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", "", false, nil
	}
	if err != nil {
		return "", "", false, fmt.Errorf("%w: read contact: %w", ErrBusinessContactUnavailable, err)
	}
	return email, maskEmail(email), true, nil
}

// ── BUSINESS_PROJECT_LINK ───────────────────────────────────────────────────

// StartProjectLink sends a link code to the Business's verified contact (never a
// request-supplied address). It returns the raw code, the real destination (for
// the internal handler to deliver to — never shown to the client) and a masked
// form (for the client). Refuses with ErrNoVerifiedContact when there is none.
func (s *BusinessContactService) StartProjectLink(ctx context.Context, merchantID, projectID, ip string) (code, email, masked string, err error) {
	if _, e := uuid.Parse(merchantID); e != nil {
		return "", "", "", ErrBusinessContactInvalid
	}
	if _, e := uuid.Parse(projectID); e != nil {
		return "", "", "", ErrBusinessContactInvalid
	}
	email, masked, ok, err := s.VerifiedContactFor(ctx, merchantID)
	if err != nil {
		return "", "", "", err
	}
	if !ok {
		return "", "", "", ErrNoVerifiedContact
	}
	pid := projectID
	code, err = s.issueOTP(ctx, merchantID, &pid, "BUSINESS_PROJECT_LINK", email, ip)
	if err != nil {
		return "", "", "", err
	}
	return code, email, masked, nil
}

// ConfirmProjectLink checks the link code for (merchant, project) and issues a
// single-use BUSINESS_PROJECT_LINK grant bound to both.
func (s *BusinessContactService) ConfirmProjectLink(ctx context.Context, merchantID, projectID, code string) (grant string, err error) {
	// The live link OTP is unique per (subject_id, project_id); consumeOTP keys on
	// (subject_id, purpose), which is safe because a given merchant has at most one
	// live link OTP per project and issuing a new one for another project would be
	// a different row — but to be exact we verify the project on the row too.
	if _, e := uuid.Parse(projectID); e != nil {
		return "", ErrBusinessContactInvalid
	}
	contact, err := s.consumeLinkOTP(ctx, merchantID, projectID, code)
	if err != nil {
		return "", err
	}
	mid, pid := merchantID, projectID
	return s.issueGrant(ctx, "BUSINESS_PROJECT_LINK", merchantID, &mid, &pid, contact)
}

// consumeLinkOTP is consumeOTP specialised to a (subject=merchant, project) pair,
// so a code issued for one project cannot be spent against another.
func (s *BusinessContactService) consumeLinkOTP(ctx context.Context, merchantID, projectID, code string) (contactValue string, err error) {
	if _, e := uuid.Parse(merchantID); e != nil || len(code) != 6 {
		return "", ErrBusinessContactInvalid
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return "", fmt.Errorf("%w: begin: %w", ErrBusinessContactUnavailable, err)
	}
	defer tx.Rollback(ctx)
	var (
		id       string
		otpHash  string
		expires  time.Time
		attempts int
		contact  string
	)
	err = tx.QueryRow(ctx,
		`SELECT id, code_hash, expires_at, attempts, contact_value
		   FROM business_contact_otps
		  WHERE subject_id = $1 AND purpose = 'BUSINESS_PROJECT_LINK' AND project_id = $2
		    AND consumed_at IS NULL
		  FOR UPDATE`, merchantID, projectID).
		Scan(&id, &otpHash, &expires, &attempts, &contact)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrBusinessContactInvalid
	}
	if err != nil {
		return "", fmt.Errorf("%w: read code: %w", ErrBusinessContactUnavailable, err)
	}
	if attempts >= businessMaxAttempts {
		return "", ErrBusinessContactLocked
	}
	if !s.now().Before(expires) {
		return "", ErrBusinessContactInvalid
	}
	if _, err := tx.Exec(ctx,
		`UPDATE business_contact_otps SET attempts = attempts + 1, updated_at = now() WHERE id = $1`, id); err != nil {
		return "", fmt.Errorf("%w: claim attempt: %w", ErrBusinessContactUnavailable, err)
	}
	if subtle.ConstantTimeCompare([]byte(s.hashCode(code)), []byte(otpHash)) != 1 {
		if err := tx.Commit(ctx); err != nil {
			return "", fmt.Errorf("%w: commit attempt: %w", ErrBusinessContactUnavailable, err)
		}
		return "", ErrBusinessContactInvalid
	}
	if _, err := tx.Exec(ctx,
		`UPDATE business_contact_otps SET consumed_at = now(), updated_at = now() WHERE id = $1`, id); err != nil {
		return "", fmt.Errorf("%w: consume: %w", ErrBusinessContactUnavailable, err)
	}
	if err := tx.Commit(ctx); err != nil {
		return "", fmt.Errorf("%w: commit consumed: %w", ErrBusinessContactUnavailable, err)
	}
	return contact, nil
}

// RedeemProjectLinkGrant spends a BUSINESS_PROJECT_LINK grant for projectID and
// returns the Business as a link target (same shape as a consent-code redeem),
// ready for the developer service to bind. Single-use; project- and
// environment-bound; refuses a Business that is not in a linkable state.
func (s *BusinessContactService) RedeemProjectLinkGrant(ctx context.Context, grant, projectID string) (BusinessLinkTarget, error) {
	if _, e := uuid.Parse(projectID); e != nil {
		return BusinessLinkTarget{}, ErrBusinessLinkGrantInvalid
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return BusinessLinkTarget{}, fmt.Errorf("%w: begin: %w", ErrBusinessContactUnavailable, err)
	}
	defer tx.Rollback(ctx)

	var (
		id, kind, env string
		merchantID    *string
		grantProject  *string
		expires       time.Time
		consumed      *time.Time
	)
	err = tx.QueryRow(ctx,
		`SELECT id, kind, environment, merchant_id::text, project_id::text, expires_at, consumed_at
		   FROM business_link_grants WHERE token_hash = $1 FOR UPDATE`, s.hashToken(grant)).
		Scan(&id, &kind, &env, &merchantID, &grantProject, &expires, &consumed)
	if errors.Is(err, pgx.ErrNoRows) {
		return BusinessLinkTarget{}, ErrBusinessLinkGrantInvalid
	}
	if err != nil {
		return BusinessLinkTarget{}, fmt.Errorf("%w: read grant: %w", ErrBusinessContactUnavailable, err)
	}
	if kind != "BUSINESS_PROJECT_LINK" || env != s.env || consumed != nil || !s.now().Before(expires) ||
		merchantID == nil || grantProject == nil || *grantProject != projectID {
		return BusinessLinkTarget{}, ErrBusinessLinkGrantInvalid
	}

	target := BusinessLinkTarget{MerchantID: *merchantID, Environment: env}
	var status string
	err = tx.QueryRow(ctx,
		`SELECT m.name, m.status,
		        COALESCE((SELECT hr.handle FROM handle_registry hr
		                   WHERE hr.owner_type = 'MERCHANT' AND hr.owner_id = m.id
		                   ORDER BY hr.created_at, hr.handle LIMIT 1), ''),
		        COALESCE((SELECT c.kyb_status FROM merchant_compliance c WHERE c.merchant_id = m.id), 'PENDING'),
		        COALESCE(w.id::text, ''), COALESCE(wa.id::text, '')
		   FROM merchants m
		   LEFT JOIN wallets w ON w.merchant_id = m.id AND w.currency = 'AOA' AND w.status = 'ACTIVE'
		   LEFT JOIN wallet_accounts wa ON wa.wallet_id = w.id AND wa.purpose = 'PRIMARY'
		  WHERE m.id = $1`, *merchantID).
		Scan(&target.BusinessName, &status, &target.Handle, &target.KybStatus, &target.WalletID, &target.WalletAccountID)
	if err != nil {
		return BusinessLinkTarget{}, fmt.Errorf("%w: resolve target: %w", ErrBusinessContactUnavailable, err)
	}
	if status != "ACTIVE" || target.Handle == "" || target.WalletID == "" || target.WalletAccountID == "" {
		return BusinessLinkTarget{}, ErrBusinessLinkNotReady
	}
	if _, err := tx.Exec(ctx, `UPDATE business_link_grants SET consumed_at = now() WHERE id = $1`, id); err != nil {
		return BusinessLinkTarget{}, fmt.Errorf("%w: consume grant: %w", ErrBusinessContactUnavailable, err)
	}
	if err := tx.Commit(ctx); err != nil {
		return BusinessLinkTarget{}, fmt.Errorf("%w: commit: %w", ErrBusinessContactUnavailable, err)
	}
	return target, nil
}

func nullString(s string) any {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	return s
}
