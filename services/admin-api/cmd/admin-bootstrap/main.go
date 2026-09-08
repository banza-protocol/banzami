// admin-bootstrap creates the first Banzami Admin operator.
//
//	admin-bootstrap --email fidel.monteiro@banzami.com \
//	  --full-name "Fidel Monteiro" --role SUPER_ADMIN
//
// It creates the IDENTITY and emails an activation link. The human sets the
// first password; nothing here ever holds one.
//
// That is the whole point of the change. This tool used to take a password —
// prompted or from $ADMIN_BOOTSTRAP_PASSWORD — and write its hash. Every such
// password is a credential that existed somewhere before the operator chose it:
// in a shell history, an environment, a terminal buffer, or another person's
// hands. The console already has the lifecycle for doing this properly (every
// operator created THROUGH the console is INVITED and activates by email), and
// the first operator was the one exception. It no longer is.
//
// --with-password restores the old behaviour for a deployment with no mail
// path at all. It is deliberately not the default and prints a warning.
//
// Refuses to overwrite an existing email; --force is reserved and unimplemented.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"os"
	"strings"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/term"

	"github.com/banzami/banzami/services/admin-api/internal/auth"
	mail "github.com/banzami/banzami/services/admin-api/internal/email"
	"github.com/banzami/banzami/services/admin-api/internal/service"
)

var validRoles = map[string]bool{
	"SUPER_ADMIN": true, "OPERATIONS": true, "COMPLIANCE": true, "SUPPORT": true, "READ_ONLY": true,
}

func main() {
	email := flag.String("email", "", "operator email (unique)")
	fullName := flag.String("full-name", "", "operator full name")
	role := flag.String("role", "OPERATIONS", "role: SUPER_ADMIN|OPERATIONS|COMPLIANCE|SUPPORT|READ_ONLY")
	force := flag.Bool("force", false, "(reserved) overwrite an existing operator — not supported")
	resend := flag.Bool("resend-invite", false, "re-issue the activation link for an operator that already exists (the first one has no session to do it from the console)")
	withPassword := flag.Bool("with-password", false, "legacy: set a password here instead of emailing an activation link (only for a deployment with no mail path)")
	flag.Parse()

	if *email == "" || *fullName == "" {
		fail("--email and --full-name are required")
	}
	*role = strings.ToUpper(*role)
	if !validRoles[*role] {
		fail("invalid --role")
	}
	if *force {
		fail("--force (overwrite) is intentionally not supported")
	}

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		fail("DATABASE_URL must be set")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		fail("db connect: " + err.Error())
	}
	defer pool.Close()

	users := service.NewAdminUserService(pool)

	if *resend {
		// The first operator cannot be re-invited from the console: doing that
		// needs a SUPER_ADMIN session, and the SUPER_ADMIN is the one who cannot
		// sign in. Without this, an invite that failed to send left an identity
		// that could never activate and could not be recreated.
		op, ferr := users.GetByEmail(ctx, strings.ToLower(strings.TrimSpace(*email)))
		if ferr != nil {
			fail("no operator with that email")
		}
		sendInvite(ctx, users, op.ID, op.Email, op.FullName, op.Role)
		return
	}

	if exists, _ := users.Exists(ctx, *email); exists {
		fail("an operator with that email already exists — use --resend-invite to re-issue the activation link")
	}

	var id string

	if *withPassword {
		// Legacy path: only for a deployment that cannot send mail at all.
		fmt.Fprintln(os.Stderr, "warning: --with-password sets a credential the operator did not choose.")
		password := os.Getenv("ADMIN_BOOTSTRAP_PASSWORD")
		if password == "" {
			fmt.Fprint(os.Stderr, "Password (min 12 chars, hidden): ")
			b, rerr := term.ReadPassword(int(syscall.Stdin))
			fmt.Fprintln(os.Stderr)
			if rerr != nil {
				fail("could not read password")
			}
			password = string(b)
		}
		hash, herr := auth.HashPassword(password)
		if herr != nil {
			fail(herr.Error()) // ErrWeakPassword text contains no secret
		}
		if id, err = users.Create(ctx, *email, *fullName, hash, *role); err != nil {
			if errors.Is(err, service.ErrAdminUserExists) {
				fail("an operator with that email already exists")
			}
			fail("create: " + err.Error())
		}
		// Read the state back rather than asserting one. This line used to name
		// a state as fixed text, and kept naming it after the row it had just
		// written stopped being in that state — so the tool reported the exact
		// thing the lifecycle change existed to stop being true.
		created, gerr := users.GetByID(ctx, id)
		status := service.StatusMFAEnrolmentRequired
		if gerr == nil {
			status = created.Status
		}
		fmt.Printf("created operator %s (%s) role=%s id=%s status=%s\n", *fullName, *email, *role, id, status)
		fmt.Fprintln(os.Stderr, "note: this operator cannot sign in until it enrols a second factor "+
			"and acknowledges its recovery codes. A password alone yields no session.")
		return
	}

	// The canonical path: identity now, credential by the human.
	//
	// createdBy is empty because there is no operator yet to attribute this to —
	// that is exactly what makes it a bootstrap, and the audit row says so
	// rather than inventing an actor.
	if id, err = users.CreateOperator(ctx, *email, *fullName, *role, ""); err != nil {
		if errors.Is(err, service.ErrAdminUserExists) {
			fail("an operator with that email already exists")
		}
		fail("create: " + err.Error())
	}

	sendInvite(ctx, users, id, *email, *fullName, *role)
}

// sendInvite issues an activation link and delivers it, or fails the command.
//
// It used to print "activation email sent" whether or not the transport worked:
// Deliver logged the error and returned nothing. The first real run said sent
// while Resend had failed a DNS lookup, and the operator was left INVITED,
// unable to activate, and impossible to recreate. A result the caller must act
// on does not belong in a log line.
func sendInvite(ctx context.Context, users *service.AdminUserService, id, email, fullName, role string) {
	raw, exp, err := users.CreateInviteToken(ctx, id, "")
	if err != nil {
		fail("activation token: " + err.Error())
	}
	inviteURL := strings.TrimRight(baseURL(), "/") + "/reset-password?token=" + raw

	mailer := mail.NewSender(mail.Config{
		Provider:       os.Getenv("EMAIL_PROVIDER"),
		DryRun:         strings.EqualFold(os.Getenv("EMAIL_DRY_RUN"), "true"),
		ResendAPIKey:   os.Getenv("RESEND_API_KEY"),
		SMTPHost:       os.Getenv("SMTP_HOST"),
		SMTPUser:       os.Getenv("SMTP_USER"),
		SMTPPassword:   os.Getenv("SMTP_PASSWORD"),
		FromName:       envOr("EMAIL_FROM_NAME", "Banzami"),
		FromAddress:    envOr("EMAIL_FROM_ADDRESS", "contact@banzami.com"),
		ReplyTo:        os.Getenv("EMAIL_REPLY_TO"),
		NoreplyName:    envOr("EMAIL_NOREPLY_NAME", "Banzami"),
		NoreplyAddress: envOr("EMAIL_NOREPLY_ADDRESS", "noreply@banzami.com"),
	})
	if err := mailer.AdminOperatorInviteErr(email, fullName, role, "bootstrap", inviteURL); err != nil {
		fmt.Fprintln(os.Stderr, "error: the activation email did not send — "+err.Error())
		fmt.Fprintf(os.Stderr, "the operator %s exists and is INVITED. Fix mail, then re-run with --resend-invite.\n", email)
		os.Exit(1)
	}

	// The link is a credential. Never printed here, never logged.
	// Read back, for the same reason as the password path above.
	invited, gerr := users.GetByID(ctx, id)
	invitedStatus := service.StatusInvited
	if gerr == nil {
		invitedStatus = invited.Status
	}
	fmt.Printf("operator %s (%s) role=%s id=%s status=%s\n", fullName, email, role, id, invitedStatus)
	fmt.Printf("activation email delivered to %s; the link expires %s\n", email, exp.UTC().Format(time.RFC3339))
	fmt.Println("the operator sets their own credential from that link. Nothing here holds one.")
}

func envOr(k, def string) string {
	if v := strings.TrimSpace(os.Getenv(k)); v != "" {
		return v
	}
	return def
}

func baseURL() string { return envOr("ADMIN_BASE_URL", "https://admin.banzami.com") }

func fail(msg string) {
	fmt.Fprintln(os.Stderr, "error: "+msg)
	os.Exit(1)
}
