package service

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/banzami/banzami/services/admin-api/internal/auth"
	"github.com/banzami/banzami/services/common/webhookprov"
)

// A5-04. Seeds stored before the deployment had a key are rewritten under it,
// and still verify afterwards.
func TestEncryptStoredSecrets_MovesPlaintextSeedsUnderTheKey(t *testing.T) {
	pool := mfaPoolOrSkip(t)
	defer pool.Close()
	ctx := context.Background()
	id := uuid.NewString()
	if _, err := pool.Exec(ctx, `INSERT INTO admin_users (id, email, full_name, role) VALUES ($1,$2,'enc','READ_ONLY')`, id, id+"@test"); err != nil {
		t.Fatal(err)
	}
	defer pool.Exec(ctx, `DELETE FROM admin_users WHERE id=$1`, id) //nolint:errcheck
	seed, _ := auth.NewTOTPSecret()
	if _, err := pool.Exec(ctx, `INSERT INTO admin_mfa (admin_user_id, secret_encrypted, confirmed_at) VALUES ($1,$2,now())`, id, seed); err != nil {
		t.Fatal(err)
	}
	c, err := webhookprov.NewSecretCipher("MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=")
	if err != nil {
		t.Fatal(err)
	}
	svc := NewMFAService(pool, c)
	if n, err := svc.EncryptStoredSecrets(ctx); err != nil || n < 1 {
		t.Fatalf("moved %d (err %v)", n, err)
	}
	var stored string
	_ = pool.QueryRow(ctx, `SELECT secret_encrypted FROM admin_mfa WHERE admin_user_id=$1`, id).Scan(&stored)
	if !strings.HasPrefix(stored, "enc:v1:") || strings.Contains(stored, seed) {
		t.Fatalf("the seed is still in the clear: %q", stored)
	}
	code, _ := auth.TOTPCodeAt(seed, time.Now().Unix()/30)
	if err := svc.Verify(ctx, id, code); err != nil {
		t.Fatalf("the re-encrypted seed no longer verifies: %v", err)
	}
}

func mfaPoolOrSkip(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set — skipping DB-backed MFA test")
	}
	p, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		t.Fatal(err)
	}
	return p
}
