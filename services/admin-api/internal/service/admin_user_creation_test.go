package service

import (
	"os"
	"regexp"
	"strings"
	"testing"
)

// No route may create a privileged identity that is already ACTIVE.
//
// The invite flow was corrected to land in MFA_ENROLMENT_REQUIRED and the
// bootstrap's --with-password path was not, so the one route that creates an
// operator WITH a credential attached was also the one that skipped the
// lifecycle — and it is the route the first operator on a new deployment takes.
// That is how the first SUPER_ADMIN came to exist as ACTIVE with no factor.
//
// Reading the SQL rather than exercising a database keeps this runnable
// everywhere and catches the defect at the only place it can be introduced: an
// INSERT that names the status.
func TestNoInsertCreatesAnActiveOperator(t *testing.T) {
	for _, f := range []string{"admin_user.go", "admin_operators.go"} {
		src, err := os.ReadFile(f)
		if err != nil {
			t.Fatalf("read %s: %v", f, err)
		}
		text := string(src)

		// Every INSERT INTO admin_users in this file, with its VALUES list.
		for _, m := range regexp.MustCompile(`(?s)INSERT INTO admin_users.*?VALUES[^`+"`"+`]*`).FindAllString(text, -1) {
			if strings.Contains(m, "'ACTIVE'") {
				t.Errorf("%s: an INSERT INTO admin_users writes 'ACTIVE' — a privileged identity "+
					"must be created in a lifecycle state that cannot hold a session:\n%s", f, strings.TrimSpace(m))
			}
		}
	}
}

// The states that may not hold a session are the states an operator is created
// in. Stated here so the two lists cannot drift apart silently.
func TestCreationStatesCannotHoldASession(t *testing.T) {
	for _, s := range []string{StatusInvited, StatusMFAEnrolmentRequired} {
		if CanHoldSession(s) {
			t.Errorf("%s is a creation state and reports that it may hold a session", s)
		}
	}
}
