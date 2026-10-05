package service

import (
	"context"
	"errors"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

// Account-deletion safeguard: a CLOSED consumer must never receive a new session,
// even if the credential cleanup (DeleteCredential) failed or was skipped after
// the core deletion. The authority is consumers.status = CLOSED, NOT the presence
// or absence of the credential row; DeleteCredential is only defence-in-depth.
//
// Scenario (exactly the one the deletion design must guarantee):
//  1. core deletion succeeds;
//  2. consumers.status becomes CLOSED;
//  3. credential cleanup fails / is skipped (the row is left in place on purpose);
//  4. the user attempts to sign in again;
//  5. the sign-in MUST fail, and an existing token MUST stop being a session.
func TestVerify_ClosedConsumerCannotSignInEvenWhenCredentialSurvives(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set — skipping DB-backed deletion-safeguard test")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)

	id := uuid.NewString()
	handle := "del" + id[:8]
	if _, err := pool.Exec(ctx,
		`INSERT INTO consumers (id, handle, status, display_name) VALUES ($1,$2,'ACTIVE',$2)`,
		id, handle); err != nil {
		t.Fatal(err)
	}
	h, _ := bcrypt.GenerateFromPassword([]byte("246810"), bcrypt.MinCost)
	if _, err := pool.Exec(ctx,
		`INSERT INTO public_api_credentials (consumer_id, handle, pin_hash) VALUES ($1,$2,$3)`,
		id, handle, string(h)); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM public_api_credentials WHERE consumer_id = $1`, id)
		_, _ = pool.Exec(ctx, `DELETE FROM consumers WHERE id = $1`, id)
	})
	store := NewCredentialStore(pool)

	// 1. A normal sign-in works while ACTIVE.
	_, version, err := store.Verify(ctx, handle, "246810")
	if err != nil {
		t.Fatalf("active consumer could not sign in: %v", err)
	}

	// 2. Core deletion closed the account; 3. credential cleanup is skipped on
	//    purpose — the credential row is intentionally left in place.
	if _, err := pool.Exec(ctx,
		`UPDATE consumers SET status = 'CLOSED', display_name = NULL WHERE id = $1`, id); err != nil {
		t.Fatal(err)
	}
	var stillHasCredential bool
	if err := pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM public_api_credentials WHERE consumer_id = $1)`, id,
	).Scan(&stillHasCredential); err != nil {
		t.Fatal(err)
	}
	if !stillHasCredential {
		t.Fatal("precondition: the credential row must still exist for this safeguard test")
	}

	// 4/5. The right PIN opens NOTHING for a CLOSED consumer, credential or not.
	fresh := NewCredentialStore(pool) // a store with no cached session entry
	if _, _, err := fresh.Verify(ctx, handle, "246810"); !errors.Is(err, ErrConsumerNotActive) {
		t.Fatalf("a CLOSED consumer's right PIN was answered %v (want ErrConsumerNotActive)", err)
	}
	// And the token it held before closure is no longer a valid session.
	if ok, _ := fresh.SessionValid(ctx, id, version); ok {
		t.Fatal("a CLOSED consumer's existing token is still a valid session")
	}
}
