// admin-bootstrap creates the first (or an additional) Banzami Admin operator.
//
//	go run ./cmd/admin-bootstrap --email fidelmonteiro@banzami.com \
//	  --full-name "Fidel Monteiro" --role SUPER_ADMIN
//
// The password is read from $ADMIN_BOOTSTRAP_PASSWORD, or prompted without echo.
// It is never printed or logged. Refuses to overwrite an existing email unless
// --force is given (reserved; overwrite is intentionally not implemented).
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

	password := os.Getenv("ADMIN_BOOTSTRAP_PASSWORD")
	if password == "" {
		fmt.Fprint(os.Stderr, "Password (min 10 chars, hidden): ")
		b, err := term.ReadPassword(int(syscall.Stdin))
		fmt.Fprintln(os.Stderr)
		if err != nil {
			fail("could not read password")
		}
		password = string(b)
	}

	hash, err := auth.HashPassword(password)
	if err != nil {
		fail(err.Error()) // ErrWeakPassword text contains no secret
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
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

	id, err := users.Create(ctx, *email, *fullName, hash, *role)
	if err != nil {
		if errors.Is(err, service.ErrAdminUserExists) {
			fail("an operator with that email already exists")
		}
		fail("create: " + err.Error())
	}

	fmt.Printf("created operator %s (%s) role=%s id=%s\n", *fullName, *email, *role, id)
}

func fail(msg string) {
	fmt.Fprintln(os.Stderr, "error: "+msg)
	os.Exit(1)
}
