package main

import (
	"os"
	"regexp"
	"strings"
	"testing"
)

// The first operator must not receive a password somebody else chose.
//
// This tool used to take one — prompted, or from $ADMIN_BOOTSTRAP_PASSWORD —
// and write its hash. Every such password exists somewhere before the operator
// does: a shell history, an environment, a terminal buffer, another person's
// hands. The console already invites every other operator by email and lets
// them set their own; the first one was the exception.
//
// These read the source because what matters is which path is the DEFAULT and
// what the tool is capable of printing — properties of the program, not of one
// run of it.
func source(t *testing.T) string {
	t.Helper()
	b, err := os.ReadFile("main.go")
	if err != nil {
		t.Fatalf("cannot read main.go: %v", err)
	}
	return string(b)
}

func TestBootstrap_DefaultPathCreatesAnIdentityNotACredential(t *testing.T) {
	src := source(t)
	// The canonical path: create INVITED, issue an activation token, email it.
	for _, want := range []string{"users.CreateOperator(", "users.CreateInviteToken(", "AdminOperatorInvite("} {
		if !strings.Contains(src, want) {
			t.Fatalf("the default path does not call %s", want)
		}
	}
	// And the password path must be behind an explicit, non-default flag.
	if !regexp.MustCompile(`flag\.Bool\("with-password", false`).MatchString(src) {
		t.Fatal("--with-password is missing or defaults to true")
	}
	if !strings.Contains(src, "if *withPassword {") {
		t.Fatal("the password path is not gated behind --with-password")
	}
}

func TestBootstrap_NeverPrintsTheActivationLinkOrAPassword(t *testing.T) {
	src := source(t)
	// The activation link is a credential: whoever holds it sets the password.
	// Printing it to a terminal would put it in scrollback and in whatever
	// captured the deploy output.
	// String literals are stripped first: what matters is whether a VALUE is
	// passed, not whether the word appears in a sentence explaining the rule.
	lit := regexp.MustCompile(`"(\\.|[^"\\])*"`)
	for _, line := range strings.Split(src, "\n") {
		if !strings.Contains(line, "Print") && !strings.Contains(line, "slog.") {
			continue
		}
		code := lit.ReplaceAllString(line, `""`)
		for _, forbidden := range []string{"inviteURL", "raw", "password", "hash"} {
			if regexp.MustCompile(`\b` + forbidden + `\b`).MatchString(code) {
				t.Fatalf("a print/log statement passes %q as a value: %s", forbidden, strings.TrimSpace(line))
			}
		}
	}
}

func TestBootstrap_RefusesToLeaveAnOperatorWhoCannotActivate(t *testing.T) {
	src := source(t)
	// An INVITED operator with no mail path can never activate and cannot be
	// re-created (the tool refuses duplicates). It must say so and exit non-zero
	// rather than report success.
	if !strings.Contains(src, "!mailer.Enabled()") {
		t.Fatal("the tool does not check that mail is configured")
	}
	i := strings.Index(src, "!mailer.Enabled()")
	tail := src[i:min(len(src), i+900)]
	if !strings.Contains(tail, "os.Exit(1)") {
		t.Fatal("an unsendable invite does not fail the command")
	}
	if !strings.Contains(tail, "resend the invite") {
		t.Fatal("the failure does not say how to recover")
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
