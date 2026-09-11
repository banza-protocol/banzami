package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrMemberNotFound  = errors.New("team member not found")
	ErrDuplicateMember = errors.New("a team member with this email already exists")
	ErrInvalidRole     = errors.New("role must be VIEWER or OPERATOR")
	// ErrInvalidMemberEmail is the caller's mistake: named so the handler can
	// say so without answering every other failure as one (A6-11).
	ErrInvalidMemberEmail = errors.New("invalid email")
)

// TeamMember is a dashboard user attached to a merchant with a permission role.
type TeamMember struct {
	ID        string     `json:"id"`
	Email     string     `json:"email"`
	Role      string     `json:"role"`   // VIEWER | OPERATOR
	Status    string     `json:"status"` // INVITED | ACTIVE | REMOVED
	InvitedAt time.Time  `json:"invited_at"`
	JoinedAt  *time.Time `json:"joined_at,omitempty"`
}

// AccessLogEntry is one row of the per-member access/action audit trail.
type AccessLogEntry struct {
	ID         string    `json:"id"`
	MemberID   *string   `json:"member_id,omitempty"`
	ActorEmail string    `json:"actor_email"`
	Action     string    `json:"action"`
	CreatedAt  time.Time `json:"created_at"`
}

func validRole(role string) bool {
	return role == "VIEWER" || role == "OPERATOR"
}

// TeamService manages a merchant's dashboard team and its access log.
type TeamService interface {
	ListMembers(ctx context.Context, merchantID string) ([]*TeamMember, error)
	InviteMember(ctx context.Context, merchantID, email, role string) (*TeamMember, error)
	RemoveMember(ctx context.Context, merchantID, memberID string) error
	ListAccessLog(ctx context.Context, merchantID string, limit int) ([]*AccessLogEntry, error)
}

// ---------------------------------------------------------------------------
// PostgreSQL implementation
// ---------------------------------------------------------------------------

type PostgresTeamService struct {
	pool *pgxpool.Pool
}

func NewPostgresTeamService(pool *pgxpool.Pool) *PostgresTeamService {
	return &PostgresTeamService{pool: pool}
}

func (s *PostgresTeamService) ListMembers(ctx context.Context, merchantID string) ([]*TeamMember, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, email, role, status, invited_at, joined_at
		 FROM merchant_team_members
		 WHERE merchant_id = $1 AND status <> 'REMOVED'
		 ORDER BY invited_at ASC`,
		merchantID,
	)
	if err != nil {
		return nil, fmt.Errorf("list team members: %w", err)
	}
	defer rows.Close()

	var out []*TeamMember
	for rows.Next() {
		var m TeamMember
		if err := rows.Scan(&m.ID, &m.Email, &m.Role, &m.Status, &m.InvitedAt, &m.JoinedAt); err != nil {
			return nil, fmt.Errorf("scan team member: %w", err)
		}
		out = append(out, &m)
	}
	return out, nil
}

func (s *PostgresTeamService) InviteMember(ctx context.Context, merchantID, email, role string) (*TeamMember, error) {
	email = strings.TrimSpace(email)
	if email == "" || !strings.Contains(email, "@") {
		return nil, ErrInvalidMemberEmail
	}
	if role == "" {
		role = "VIEWER"
	}
	if !validRole(role) {
		return nil, ErrInvalidRole
	}

	id := uuid.NewString()
	var m TeamMember
	err := s.pool.QueryRow(ctx,
		`INSERT INTO merchant_team_members (id, merchant_id, email, role, status)
		 VALUES ($1, $2, $3, $4, 'INVITED')
		 RETURNING id, email, role, status, invited_at, joined_at`,
		id, merchantID, email, role,
	).Scan(&m.ID, &m.Email, &m.Role, &m.Status, &m.InvitedAt, &m.JoinedAt)
	if err != nil {
		if strings.Contains(err.Error(), "merchant_team_members_unique_email") {
			return nil, ErrDuplicateMember
		}
		return nil, fmt.Errorf("invite team member: %w", err)
	}

	s.record(ctx, merchantID, &m.ID, email, "MEMBER_INVITED:"+role)
	return &m, nil
}

func (s *PostgresTeamService) RemoveMember(ctx context.Context, merchantID, memberID string) error {
	var email string
	err := s.pool.QueryRow(ctx,
		`UPDATE merchant_team_members
		 SET status = 'REMOVED', removed_at = now()
		 WHERE id = $1 AND merchant_id = $2 AND status <> 'REMOVED'
		 RETURNING email`,
		memberID, merchantID,
	).Scan(&email)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrMemberNotFound
		}
		return fmt.Errorf("remove team member: %w", err)
	}
	s.record(ctx, merchantID, &memberID, email, "MEMBER_REMOVED")
	return nil
}

func (s *PostgresTeamService) ListAccessLog(ctx context.Context, merchantID string, limit int) ([]*AccessLogEntry, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := s.pool.Query(ctx,
		`SELECT id, member_id, actor_email, action, created_at
		 FROM merchant_access_log
		 WHERE merchant_id = $1
		 ORDER BY created_at DESC
		 LIMIT $2`,
		merchantID, limit,
	)
	if err != nil {
		return nil, fmt.Errorf("list access log: %w", err)
	}
	defer rows.Close()

	var out []*AccessLogEntry
	for rows.Next() {
		var e AccessLogEntry
		if err := rows.Scan(&e.ID, &e.MemberID, &e.ActorEmail, &e.Action, &e.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan access log: %w", err)
		}
		out = append(out, &e)
	}
	return out, nil
}

// record writes an access-log row. Best-effort: a logging failure never fails
// the originating operation.
func (s *PostgresTeamService) record(ctx context.Context, merchantID string, memberID *string, actorEmail, action string) {
	_, _ = s.pool.Exec(ctx,
		`INSERT INTO merchant_access_log (merchant_id, member_id, actor_email, action)
		 VALUES ($1, $2, $3, $4)`,
		merchantID, memberID, actorEmail, action,
	)
}

// ---------------------------------------------------------------------------
// In-memory stub (used when DATABASE_URL is not configured)
// ---------------------------------------------------------------------------

type StubTeamService struct {
	mu      sync.Mutex
	members map[string][]*TeamMember     // merchantID -> members
	log     map[string][]*AccessLogEntry // merchantID -> log
}

func NewStubTeamService() *StubTeamService {
	return &StubTeamService{
		members: make(map[string][]*TeamMember),
		log:     make(map[string][]*AccessLogEntry),
	}
}

func (s *StubTeamService) ListMembers(_ context.Context, merchantID string) ([]*TeamMember, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.members[merchantID], nil
}

func (s *StubTeamService) InviteMember(_ context.Context, merchantID, email, role string) (*TeamMember, error) {
	if role == "" {
		role = "VIEWER"
	}
	if !validRole(role) {
		return nil, ErrInvalidRole
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, m := range s.members[merchantID] {
		if strings.EqualFold(m.Email, email) && m.Status != "REMOVED" {
			return nil, ErrDuplicateMember
		}
	}
	m := &TeamMember{ID: uuid.NewString(), Email: email, Role: role, Status: "INVITED", InvitedAt: time.Now().UTC()}
	s.members[merchantID] = append(s.members[merchantID], m)
	s.log[merchantID] = append([]*AccessLogEntry{{ID: uuid.NewString(), MemberID: &m.ID, ActorEmail: email, Action: "MEMBER_INVITED:" + role, CreatedAt: time.Now().UTC()}}, s.log[merchantID]...)
	return m, nil
}

func (s *StubTeamService) RemoveMember(_ context.Context, merchantID, memberID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, m := range s.members[merchantID] {
		if m.ID == memberID && m.Status != "REMOVED" {
			m.Status = "REMOVED"
			s.log[merchantID] = append([]*AccessLogEntry{{ID: uuid.NewString(), MemberID: &memberID, ActorEmail: m.Email, Action: "MEMBER_REMOVED", CreatedAt: time.Now().UTC()}}, s.log[merchantID]...)
			return nil
		}
	}
	return ErrMemberNotFound
}

func (s *StubTeamService) ListAccessLog(_ context.Context, merchantID string, limit int) ([]*AccessLogEntry, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	entries := s.log[merchantID]
	if limit > 0 && len(entries) > limit {
		entries = entries[:limit]
	}
	return entries, nil
}
