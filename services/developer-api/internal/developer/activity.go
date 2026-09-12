package developer

import (
	"context"
	"encoding/base64"
	"fmt"
	"strings"
	"time"
)

// Workspace Activity — who changed what, to whom, and when.
//
// developer.audit_events has been written on every membership and workspace
// change since the domain shipped, and nothing has ever read it. That is worse
// than not recording at all: the rows exist, so the question "who removed this
// person" has an answer, and nobody outside the database can reach it.
//
// This is the read side, and it is deliberately narrow.
//
//   - One workspace. The rows are filtered on workspace_id, and the id comes
//     from a membership the caller was already authorised against, so Workspace
//     A has no way to phrase a request for Workspace B's history.
//   - Administrative events only. API requests and webhook deliveries are
//     integration traffic and belong on Logs; answering "who changed the team"
//     with a list of HTTP calls would be answering a different question.
//   - No secrets, no personal account history. The projection is an allow-list
//     twice over — of actions, and of metadata keys — so a field reaches this
//     surface by being named here, never by existing in the table. Nothing
//     about a person's own sessions, OTPs or security settings is in this table
//     to begin with, and a workspace audit is not an account history.
//
// It is Console-internal. The public API stays v1 and gains nothing from this:
// an integrator has no business reading who was removed from a workspace.

// ActivityEvent is one administrative change, as a person would read it.
type ActivityEvent struct {
	ID        string    `json:"id"`
	Action    string    `json:"action"`
	CreatedAt time.Time `json:"created_at"`

	// Who did it. Resolved to a person where the identity is still readable; an
	// actor whose account has since gone keeps the id and loses the name, which
	// is honest, rather than dropping the event, which would not be.
	ActorUserID string `json:"actor_user_id,omitempty"`
	ActorName   string `json:"actor_name,omitempty"`
	ActorEmail  string `json:"actor_email,omitempty"`

	// Who or what it was done to. Kind says how to read Ref: a user id, an
	// invited address, or the id of a project/key/invite this workspace owns.
	TargetKind  string `json:"target_kind,omitempty"`
	TargetRef   string `json:"target_ref,omitempty"`
	TargetName  string `json:"target_name,omitempty"`
	TargetEmail string `json:"target_email,omitempty"`

	// The role transition, where the action has one. Both halves: "changed to
	// VIEWER" does not say whether somebody was demoted from OWNER, and that is
	// usually the thing the reader came to find out.
	Role         string `json:"role,omitempty"`
	PreviousRole string `json:"previous_role,omitempty"`
}

// ActivityPage is one page of events, newest first.
type ActivityPage struct {
	Events     []ActivityEvent `json:"events"`
	NextCursor string          `json:"next_cursor,omitempty"`
}

// activityActions is the allow-list of actions this surface serves.
//
// An action appears in Workspace Activity by being named here, not by being
// written. Serving everything in the table would mean the next person to add a
// call to s.audit — for anything, about anything — publishes it to every
// workspace admin without knowing they did.
var activityActions = []string{
	// membership and access: the questions this surface exists to answer
	"member.invited", "member.joined", "member.left", "member.removed",
	"member.role_changed", "invite.revoked",
	// the workspace itself
	"workspace.created", "workspace.renamed", "workspace.archived", "workspace.deleted",
	// administrative acts inside it
	"project.created", "project.renamed", "project.archived", "project.deleted",
	"apikey.created", "apikey.rotated", "apikey.revoked",
}

// activityMetadataKeys is the only metadata that ever leaves the store.
//
// The rest of the JSONB stays in the row. Returning the whole object would make
// every future metadata field a disclosure decision taken by whoever wrote the
// audit call — apikey.created already carries a key prefix, and a projection
// that shipped "whatever is in metadata" would have published it.
var activityMetadataKeys = []string{"role", "previous_role"}

// ActivityActions and ActivityMetadataKeys expose the two allow-lists so a test
// can assert what this surface is permitted to serve, rather than asserting what
// it happened to serve on the day the test was written.
func ActivityActions() []string      { return append([]string(nil), activityActions...) }
func ActivityMetadataKeys() []string { return append([]string(nil), activityMetadataKeys...) }

const activityPageSize = 50

// WorkspaceActivity returns the administrative history of one workspace.
//
// Managers only, and the same refusal for both ways of not being one: a
// non-member and a VIEWER both get ErrForbidden, so a workspace id can never be
// used to learn whether somebody else's workspace exists. Reading who holds
// authority in a workspace is a management question, and the roles that can
// change membership are the roles that can review it.
func (s *Service) WorkspaceActivity(ctx context.Context, actor, wsID, cursor string) (ActivityPage, error) {
	role, err := s.roleOf(ctx, wsID, actor)
	if err != nil || !isManager(role) {
		return ActivityPage{}, ErrForbidden
	}

	before, err := decodeActivityCursor(cursor)
	if err != nil {
		return ActivityPage{}, ErrValidation
	}

	// One more than the page, so "is there another page" is answered by the same
	// read rather than by a count that can disagree with it.
	events, err := s.store.WorkspaceActivity(ctx, wsID, activityActions, before, activityPageSize+1)
	if err != nil {
		return ActivityPage{}, ErrUnavailable
	}

	page := ActivityPage{Events: events}
	if page.Events == nil {
		page.Events = []ActivityEvent{}
	}
	if len(events) > activityPageSize {
		page.Events = events[:activityPageSize]
		page.NextCursor = encodeActivityCursor(page.Events[len(page.Events)-1].CreatedAt)
	}
	return page, nil
}

// The cursor is a timestamp, opaque to the caller.
//
// Opaque because the moment a cursor looks like a value somebody constructs one,
// and a hand-made cursor is a way of asking for rows the page never offered.
// Garbage decodes to an error rather than silently to "from the beginning" — a
// mistyped cursor must not quietly return a different page than it names.
func encodeActivityCursor(t time.Time) string {
	return base64.RawURLEncoding.EncodeToString([]byte(t.UTC().Format(time.RFC3339Nano)))
}

func decodeActivityCursor(c string) (*time.Time, error) {
	if strings.TrimSpace(c) == "" {
		return nil, nil
	}
	raw, err := base64.RawURLEncoding.DecodeString(c)
	if err != nil {
		return nil, fmt.Errorf("cursor is not base64: %w", err)
	}
	t, err := time.Parse(time.RFC3339Nano, string(raw))
	if err != nil {
		return nil, fmt.Errorf("cursor is not a timestamp: %w", err)
	}
	return &t, nil
}

// splitSubject reads an audit subject, which is written as KIND:value.
// An unrecognised or malformed subject yields no target rather than a guess.
func splitSubject(subject string) (kind, ref string) {
	i := strings.IndexByte(subject, ':')
	if i <= 0 {
		return "", ""
	}
	return subject[:i], subject[i+1:]
}

// activityMetadata copies through only the allow-listed keys, as strings.
//
// It reads activityMetadataKeys rather than three literals so that shortening
// the allow-list actually shortens what is served; a projection that named its
// keys inline would keep serving them after somebody "removed" one.
func activityMetadata(meta map[string]any) (role, previousRole string) {
	allowed := map[string]bool{}
	for _, k := range activityMetadataKeys {
		allowed[k] = true
	}
	get := func(k string) string {
		if !allowed[k] {
			return ""
		}
		s, _ := meta[k].(string)
		return s
	}
	return get("role"), get("previous_role")
}
