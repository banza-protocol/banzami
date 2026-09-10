package service

import (
	"context"
	"fmt"
)

// Privileged-identity lifecycle states.
//
// `status` used to answer "has this person set a password?", and whether a
// second factor existed lived in another table. So an operator sat at ACTIVE
// with no factor, and the guarantee that this could not become a session lived
// in a branch inside the login handler rather than in the state itself.
//
// A status whose meaning depends on a row somewhere else is a status a reader
// will get wrong — an export, a support query, a dashboard counting "active
// admins", or the next authorisation branch someone writes. Each state now
// names what is still missing.
const (
	StatusInvited              = "INVITED"                   // identity exists, no credential
	StatusMFAEnrolmentRequired = "MFA_ENROLMENT_REQUIRED"    // password set, no confirmed factor
	StatusMFARecoveryAck       = "MFA_RECOVERY_ACK_REQUIRED" // factor confirmed, codes not acknowledged
	StatusActive               = "ACTIVE"                    // password + factor + codes + acknowledgement
	StatusSuspended            = "SUSPENDED"                 // disabled
)

// EnrollingStatuses are the states in which an operator may complete a password
// challenge and continue enrolment — and in which they may NOT be issued a
// session. Kept as one list so a new state cannot be added to the lifecycle
// without a decision about which side of that line it falls on.
var EnrollingStatuses = []string{StatusMFAEnrolmentRequired, StatusMFARecoveryAck}

// CanContinueEnrolment reports whether a password may be checked for this state.
func CanContinueEnrolment(status string) bool {
	for _, s := range EnrollingStatuses {
		if status == s {
			return true
		}
	}
	return false
}

// CanHoldSession reports whether a privileged session may exist for this state.
// Exactly one status qualifies, and it is spelled out rather than inferred from
// "not suspended".
func CanHoldSession(status string) bool { return status == StatusActive }

// AdvanceLifecycle moves an operator from one lifecycle state to the next.
//
// The `from` state is part of the WHERE clause on purpose: a transition that
// does not apply must change nothing rather than force a state. That makes a
// replayed request, a stale tab or a concurrent enrolment a no-op instead of a
// way to reach ACTIVE by a route the lifecycle does not have — in particular, it
// makes it impossible to skip the recovery-code acknowledgement.
//
// SUSPENDED is never a `from`, so a disabled operator cannot walk themselves
// back to ACTIVE by finishing an enrolment they had started.
func (s *AdminUserService) AdvanceLifecycle(ctx context.Context, adminUserID, from, to string) error {
	if s == nil || s.pool == nil {
		return fmt.Errorf("admin user service is not configured")
	}
	tag, err := s.pool.Exec(ctx,
		`UPDATE admin_users SET status = $3, updated_at = now()
		  WHERE id = $1 AND status = $2`, adminUserID, from, to)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		// Not an error the caller should surface as a failure: the account was
		// simply not in the state this transition applies to.
		return ErrLifecycleNotApplicable
	}
	return nil
}

// ErrLifecycleNotApplicable means the operator was not in the expected `from`
// state, so nothing moved.
var ErrLifecycleNotApplicable = fmt.Errorf("lifecycle transition does not apply to the current status")
