package developer

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// pgStore is the Postgres-backed developer Store (developer.* schema).
type pgStore struct{ pool *pgxpool.Pool }

// NewPGStore builds a Postgres developer Store.
func NewPGStore(pool *pgxpool.Pool) Store { return &pgStore{pool: pool} }

func isUnique(err error) bool {
	var pg *pgconn.PgError
	return errors.As(err, &pg) && pg.Code == "23505"
}

// ── workspaces ───────────────────────────────────────────────────────────────

func (s *pgStore) CreateWorkspace(ctx context.Context, name, slug, owner string) (Workspace, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Workspace{}, err
	}
	defer tx.Rollback(ctx)
	var w Workspace
	err = tx.QueryRow(ctx,
		`INSERT INTO developer.dev_workspaces (name, slug, created_by)
		 VALUES ($1,$2,$3) RETURNING id, name, slug, created_by, status, created_at, updated_at`,
		name, slug, owner).Scan(&w.ID, &w.Name, &w.Slug, &w.CreatedBy, &w.Status, &w.CreatedAt, &w.UpdatedAt)
	if err != nil {
		if isUnique(err) {
			return Workspace{}, ErrConflict
		}
		return Workspace{}, err
	}
	if _, err = tx.Exec(ctx,
		`INSERT INTO developer.dev_workspace_members (workspace_id, user_id, role, accepted_at, status)
		 VALUES ($1,$2,'OWNER', now(), 'ACTIVE')`, w.ID, owner); err != nil {
		return Workspace{}, err
	}
	return w, tx.Commit(ctx)
}

func (s *pgStore) WorkspacesForUser(ctx context.Context, userID string) ([]Workspace, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT w.id, w.name, w.slug, w.created_by, w.status, w.created_at, w.updated_at
		   FROM developer.dev_workspaces w
		   JOIN developer.dev_workspace_members m ON m.workspace_id = w.id
		  WHERE m.user_id = $1 AND m.status = 'ACTIVE'
		  ORDER BY w.created_at`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Workspace
	for rows.Next() {
		var w Workspace
		if err := rows.Scan(&w.ID, &w.Name, &w.Slug, &w.CreatedBy, &w.Status, &w.CreatedAt, &w.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, w)
	}
	return out, rows.Err()
}

func (s *pgStore) Workspace(ctx context.Context, id string) (Workspace, error) {
	var w Workspace
	err := s.pool.QueryRow(ctx,
		`SELECT id, name, slug, created_by, status, created_at, updated_at
		   FROM developer.dev_workspaces WHERE id = $1`, id).
		Scan(&w.ID, &w.Name, &w.Slug, &w.CreatedBy, &w.Status, &w.CreatedAt, &w.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Workspace{}, ErrNotFound
	}
	return w, err
}

func (s *pgStore) Membership(ctx context.Context, workspaceID, userID string) (*Member, error) {
	var m Member
	err := s.pool.QueryRow(ctx,
		`SELECT id, workspace_id, user_id, role, status, created_at
		   FROM developer.dev_workspace_members
		  WHERE workspace_id = $1 AND user_id = $2 AND status = 'ACTIVE'`,
		workspaceID, userID).Scan(&m.ID, &m.WorkspaceID, &m.UserID, &m.Role, &m.Status, &m.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &m, nil
}

func (s *pgStore) Members(ctx context.Context, workspaceID string) ([]Member, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, workspace_id, user_id, role, status, created_at
		   FROM developer.dev_workspace_members
		  WHERE workspace_id = $1 AND status = 'ACTIVE' ORDER BY created_at`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Member
	for rows.Next() {
		var m Member
		if err := rows.Scan(&m.ID, &m.WorkspaceID, &m.UserID, &m.Role, &m.Status, &m.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (s *pgStore) CountOwners(ctx context.Context, workspaceID string) (int, error) {
	var n int
	err := s.pool.QueryRow(ctx,
		`SELECT count(*) FROM developer.dev_workspace_members
		  WHERE workspace_id = $1 AND role = 'OWNER' AND status = 'ACTIVE'`, workspaceID).Scan(&n)
	return n, err
}

func (s *pgStore) SetMemberRole(ctx context.Context, workspaceID, userID, role string) error {
	ct, err := s.pool.Exec(ctx,
		`UPDATE developer.dev_workspace_members SET role = $3, updated_at = now()
		  WHERE workspace_id = $1 AND user_id = $2 AND status = 'ACTIVE'`, workspaceID, userID, role)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *pgStore) RemoveMember(ctx context.Context, workspaceID, userID string) error {
	ct, err := s.pool.Exec(ctx,
		`UPDATE developer.dev_workspace_members SET status = 'REMOVED', updated_at = now()
		  WHERE workspace_id = $1 AND user_id = $2 AND status = 'ACTIVE'`, workspaceID, userID)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ── invites ──────────────────────────────────────────────────────────────────

func scanInvite(row pgx.Row) (*Invite, error) {
	var i Invite
	err := row.Scan(&i.ID, &i.WorkspaceID, &i.Email, &i.Role, &i.InvitedBy, &i.ExpiresAt, &i.AcceptedAt, &i.RevokedAt, &i.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &i, nil
}

const inviteCols = `id, workspace_id, email, role, coalesce(invited_by_user_id::text,''), expires_at, accepted_at, revoked_at, created_at`

func (s *pgStore) CreateInvite(ctx context.Context, in InviteInsert) (Invite, error) {
	i, err := scanInvite(s.pool.QueryRow(ctx,
		`INSERT INTO developer.dev_workspace_invites (workspace_id, email, role, token_hash, invited_by_user_id, expires_at)
		 VALUES ($1, lower($2), $3, $4, nullif($5,'')::uuid, $6)
		 RETURNING `+inviteCols,
		in.WorkspaceID, in.Email, in.Role, in.TokenHash, in.InvitedBy, in.ExpiresAt))
	if err != nil {
		if isUnique(err) {
			return Invite{}, ErrConflict
		}
		return Invite{}, err
	}
	return *i, nil
}

func (s *pgStore) ActiveInviteByEmail(ctx context.Context, workspaceID, email string) (*Invite, error) {
	return scanInvite(s.pool.QueryRow(ctx,
		`SELECT `+inviteCols+` FROM developer.dev_workspace_invites
		  WHERE workspace_id = $1 AND lower(email) = lower($2)
		    AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()
		  LIMIT 1`, workspaceID, email))
}

func (s *pgStore) InviteByTokenHash(ctx context.Context, tokenHash string) (*Invite, error) {
	return scanInvite(s.pool.QueryRow(ctx,
		`SELECT `+inviteCols+` FROM developer.dev_workspace_invites WHERE token_hash = $1`, tokenHash))
}

func (s *pgStore) AcceptInvite(ctx context.Context, inviteID, userID string) (Member, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Member{}, err
	}
	defer tx.Rollback(ctx)
	var wsID, role string
	if err = tx.QueryRow(ctx,
		`UPDATE developer.dev_workspace_invites SET accepted_at = now(), updated_at = now()
		  WHERE id = $1 RETURNING workspace_id, role`, inviteID).Scan(&wsID, &role); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Member{}, ErrNotFound
		}
		return Member{}, err
	}
	var m Member
	if err = tx.QueryRow(ctx,
		`INSERT INTO developer.dev_workspace_members (workspace_id, user_id, role, accepted_at, status)
		 VALUES ($1,$2,$3, now(), 'ACTIVE')
		 ON CONFLICT (workspace_id, user_id)
		 DO UPDATE SET role = EXCLUDED.role, status = 'ACTIVE', updated_at = now()
		 RETURNING id, workspace_id, user_id, role, status, created_at`,
		wsID, userID, role).Scan(&m.ID, &m.WorkspaceID, &m.UserID, &m.Role, &m.Status, &m.CreatedAt); err != nil {
		return Member{}, err
	}
	return m, tx.Commit(ctx)
}

func (s *pgStore) RevokeInvite(ctx context.Context, inviteID string) error {
	ct, err := s.pool.Exec(ctx,
		`UPDATE developer.dev_workspace_invites SET revoked_at = now(), updated_at = now()
		  WHERE id = $1 AND accepted_at IS NULL AND revoked_at IS NULL`, inviteID)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ── projects ─────────────────────────────────────────────────────────────────

func (s *pgStore) CreateProject(ctx context.Context, workspaceID, name, slug string) (Project, error) {
	var p Project
	err := s.pool.QueryRow(ctx,
		`INSERT INTO developer.dev_projects (workspace_id, name, slug)
		 VALUES ($1,$2,$3) RETURNING id, workspace_id, name, slug, status, created_at, updated_at`,
		workspaceID, name, slug).Scan(&p.ID, &p.WorkspaceID, &p.Name, &p.Slug, &p.Status, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		if isUnique(err) {
			return Project{}, ErrConflict
		}
		return Project{}, err
	}
	return p, nil
}

func (s *pgStore) ProjectsForWorkspace(ctx context.Context, workspaceID string) ([]Project, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, workspace_id, name, slug, status, created_at, updated_at
		   FROM developer.dev_projects WHERE workspace_id = $1 ORDER BY created_at`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Project
	for rows.Next() {
		var p Project
		if err := rows.Scan(&p.ID, &p.WorkspaceID, &p.Name, &p.Slug, &p.Status, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (s *pgStore) Project(ctx context.Context, id string) (*Project, error) {
	var p Project
	err := s.pool.QueryRow(ctx,
		`SELECT id, workspace_id, name, slug, status, created_at, updated_at
		   FROM developer.dev_projects WHERE id = $1`, id).
		Scan(&p.ID, &p.WorkspaceID, &p.Name, &p.Slug, &p.Status, &p.CreatedAt, &p.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &p, nil
}

// ── api keys ─────────────────────────────────────────────────────────────────

const keyMetaCols = `id, project_id, environment, kind, name, key_prefix, coalesce(public_value,''), scopes, status, rotated_from, created_at, last_used_at`

func scanKey(row pgx.Row) (*APIKey, error) {
	var k APIKey
	err := row.Scan(&k.ID, &k.ProjectID, &k.Environment, &k.Kind, &k.Name, &k.KeyPrefix,
		&k.PublicValue, &k.Scopes, &k.Status, &k.RotatedFrom, &k.CreatedAt, &k.LastUsedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &k, nil
}

func (s *pgStore) insertKeyTx(ctx context.Context, q pgx.Tx, in APIKeyInsert) (APIKey, error) {
	k, err := scanKey(q.QueryRow(ctx,
		`INSERT INTO developer.dev_api_keys
		    (project_id, environment, kind, name, key_prefix, key_hash, hash_version, public_value, scopes, created_by, rotated_from)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,nullif($8,''),$9,$10,$11)
		 RETURNING `+keyMetaCols,
		in.ProjectID, in.Environment, in.Kind, in.Name, in.KeyPrefix, in.KeyHash, in.HashVersion,
		in.PublicValue, in.Scopes, in.CreatedBy, in.RotatedFrom))
	if err != nil {
		return APIKey{}, err
	}
	return *k, nil
}

func (s *pgStore) CreateAPIKey(ctx context.Context, in APIKeyInsert) (APIKey, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return APIKey{}, err
	}
	defer tx.Rollback(ctx)
	k, err := s.insertKeyTx(ctx, tx, in)
	if err != nil {
		return APIKey{}, err
	}
	return k, tx.Commit(ctx)
}

func (s *pgStore) APIKeysForProject(ctx context.Context, projectID string) ([]APIKey, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT `+keyMetaCols+` FROM developer.dev_api_keys WHERE project_id = $1 ORDER BY created_at`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []APIKey
	for rows.Next() {
		var k APIKey
		if err := rows.Scan(&k.ID, &k.ProjectID, &k.Environment, &k.Kind, &k.Name, &k.KeyPrefix,
			&k.PublicValue, &k.Scopes, &k.Status, &k.RotatedFrom, &k.CreatedAt, &k.LastUsedAt); err != nil {
			return nil, err
		}
		out = append(out, k)
	}
	return out, rows.Err()
}

func (s *pgStore) APIKeyByID(ctx context.Context, id string) (*APIKey, error) {
	return scanKey(s.pool.QueryRow(ctx, `SELECT `+keyMetaCols+` FROM developer.dev_api_keys WHERE id = $1`, id))
}

func (s *pgStore) APIKeyByHash(ctx context.Context, keyHash string) (*APIKeyAuth, error) {
	var a APIKeyAuth
	err := s.pool.QueryRow(ctx,
		`SELECT id, project_id, environment, status, scopes FROM developer.dev_api_keys WHERE key_hash = $1`,
		keyHash).Scan(&a.ID, &a.ProjectID, &a.Environment, &a.Status, &a.Scopes)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &a, nil
}

func (s *pgStore) RevokeAPIKey(ctx context.Context, id string) error {
	ct, err := s.pool.Exec(ctx,
		`UPDATE developer.dev_api_keys SET status = 'REVOKED', revoked_at = now()
		  WHERE id = $1 AND status = 'ACTIVE'`, id)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *pgStore) RotateAPIKey(ctx context.Context, oldID string, replacement APIKeyInsert) (APIKey, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return APIKey{}, err
	}
	defer tx.Rollback(ctx)
	nk, err := s.insertKeyTx(ctx, tx, replacement)
	if err != nil {
		return APIKey{}, err
	}
	ct, err := tx.Exec(ctx,
		`UPDATE developer.dev_api_keys SET status = 'REVOKED', revoked_at = now()
		  WHERE id = $1 AND status = 'ACTIVE'`, oldID)
	if err != nil {
		return APIKey{}, err
	}
	if ct.RowsAffected() == 0 {
		return APIKey{}, ErrNotFound
	}
	return nk, tx.Commit(ctx)
}

// ── project→merchant sandbox binding (ADR-047) ───────────────────────────────

const bindingCols = `id, project_id, environment, merchant_id, wallet_id, wallet_account_id,
	state, artifact_created, created_by_user_id, created_at`

func scanBinding(row pgx.Row) (*SandboxBinding, error) {
	var b SandboxBinding
	err := row.Scan(&b.ID, &b.ProjectID, &b.Environment, &b.MerchantID, &b.WalletID,
		&b.WalletAccountID, &b.State, &b.ArtifactCreated, &b.CreatedByUserID, &b.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &b, nil
}

func (s *pgStore) CreateBinding(ctx context.Context, in BindingInsert) (SandboxBinding, error) {
	b, err := scanBinding(s.pool.QueryRow(ctx,
		`INSERT INTO developer.dev_project_sandbox_binding
		    (project_id, merchant_id, wallet_id, wallet_account_id, created_by_user_id)
		 VALUES ($1,$2,$3,$4,$5) RETURNING `+bindingCols,
		in.ProjectID, in.MerchantID, in.WalletID, in.WalletAccountID, in.CreatedByUserID))
	if err != nil {
		if isUnique(err) {
			return SandboxBinding{}, ErrConflict // one ACTIVE binding per project
		}
		return SandboxBinding{}, err
	}
	return *b, nil
}

func (s *pgStore) ActiveBindingForProject(ctx context.Context, projectID string) (*SandboxBinding, error) {
	b, err := scanBinding(s.pool.QueryRow(ctx,
		`SELECT `+bindingCols+` FROM developer.dev_project_sandbox_binding
		 WHERE project_id = $1 AND state = 'ACTIVE'`, projectID))
	if errors.Is(err, ErrNotFound) {
		return nil, nil // no active binding is not an error
	}
	return b, err
}

func (s *pgStore) MarkBindingArtifactCreated(ctx context.Context, bindingID string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE developer.dev_project_sandbox_binding
		    SET artifact_created = true, updated_at = now()
		  WHERE id = $1`, bindingID)
	return err
}

// ── audit ────────────────────────────────────────────────────────────────────

func (s *pgStore) InsertAudit(ctx context.Context, ev AuditEvent) error {
	meta := ev.Metadata
	if meta == nil {
		meta = map[string]any{}
	}
	b, err := json.Marshal(meta)
	if err != nil {
		return err
	}
	_, err = s.pool.Exec(ctx,
		`INSERT INTO developer.audit_events
		    (actor_user_id, workspace_id, project_id, action, subject, metadata, request_ip, request_id)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
		ev.ActorUserID, ev.WorkspaceID, ev.ProjectID, ev.Action, nz(ev.Subject), b, nz(ev.RequestIP), nz(ev.RequestID))
	return err
}

func nz(s string) any {
	if s == "" {
		return nil
	}
	return s
}

// ── Webhook visibility ───────────────────────────────────────────────────────
//
// Every query is scoped by merchant_id in the statement itself. The merchant is
// never taken from a request; the caller resolves it from the project binding
// before calling here.

func (s *pgStore) WebhookEndpointsForMerchant(ctx context.Context, merchantID string) ([]WebhookEndpointView, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, url, events, active, created_at
		   FROM webhook_endpoints
		  WHERE merchant_id = $1
		  ORDER BY created_at DESC`, merchantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []WebhookEndpointView{}
	for rows.Next() {
		var v WebhookEndpointView
		if err := rows.Scan(&v.ID, &v.URL, &v.Events, &v.Active, &v.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

func (s *pgStore) WebhookEventsForMerchant(ctx context.Context, merchantID string, limit int) ([]WebhookEventView, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := s.pool.Query(ctx,
		`SELECT id, event_type, created_at
		   FROM webhook_events
		  WHERE merchant_id = $1
		  ORDER BY created_at DESC
		  LIMIT $2`, merchantID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []WebhookEventView{}
	for rows.Next() {
		var v WebhookEventView
		if err := rows.Scan(&v.ID, &v.EventType, &v.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

func (s *pgStore) WebhookDeliveriesForEvent(ctx context.Context, merchantID, eventID string) ([]WebhookDeliveryView, error) {
	// Joined through webhook_events so a caller naming another tenant's event id
	// gets an empty list rather than that tenant's delivery history — naming an
	// id is not authority over it (RA-060 sibling of the gateway's own rule).
	rows, err := s.pool.Query(ctx,
		`SELECT d.id, d.event_id, d.endpoint_id, d.status, d.status_code,
		        d.attempt_count, d.delivered_at, d.created_at
		   FROM webhook_deliveries d
		   JOIN webhook_events e ON e.id = d.event_id
		  WHERE d.event_id = $1 AND e.merchant_id = $2
		  ORDER BY d.created_at DESC`, eventID, merchantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []WebhookDeliveryView{}
	for rows.Next() {
		var v WebhookDeliveryView
		if err := rows.Scan(&v.ID, &v.EventID, &v.EndpointID, &v.Status, &v.StatusCode,
			&v.AttemptCount, &v.DeliveredAt, &v.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}
