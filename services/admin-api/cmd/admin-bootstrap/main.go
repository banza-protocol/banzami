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
	if exists, _ := users.Exists(ctx, *email); exists {
		fail("an operator with that email already exists")
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
		fmt.Printf("created operator %s (%s) role=%s id=%s status=ACTIVE\n", *fullName, *email, *role, id)
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
	if !mailer.Enabled() {
		// Fail loudly rather than leave an operator who can never activate. The
		// identity is created; re-running after fixing mail would hit "already
		// exists", so say what to do about it.
		fmt.Fprintln(os.Stderr, "error: no mail provider configured — the activation email cannot be sent.")
		fmt.Fprintf(os.Stderr, "the operator %s was created and is INVITED; configure mail and resend the invite from the console.\n", *email)
		os.Exit(1)
	}
	mailer.AdminOperatorInvite(*email, *fullName, *role, "bootstrap", inviteURL)

	// The link is a credential. It is never printed here, and never logged.
	fmt.Printf("created operator %s (%s) role=%s id=%s status=INVITED\n", *fullName, *email, *role, id)
	fmt.Printf("activation email sent to %s; the link expires %s\n", *email, exp.UTC().Format(time.RFC3339))
	fmt.Println("the operator sets their own password from that link. Nothing here holds one.")
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
