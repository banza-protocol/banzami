package service

import (
	"context"
	"strings"
	"testing"

	"github.com/google/uuid"

	crypto "github.com/banzami/banzami/services/common/webhookprov"
	"github.com/banzami/banzami/services/common/env"
)

// A6-10. A signing secret stored before the deployment had a key is rewritten
// under it — and still decrypts to exactly the secret the integrator holds, so
// their verification does not change.
func TestEncryptStoredSecrets_KeepsTheSecretAndEncryptsItsStorage(t *testing.T) {
	pool := dbPoolOrSkip(t)
	defer pool.Close()
	ctx := context.Background()
	id := uuid.NewString()
	const secret = "whsec_plaintext_before_the_key"
	if _, err := pool.Exec(ctx,
		`INSERT INTO webhook_endpoints (id, merchant_id, url, events, secret, environment)
		 VALUES ($1, gen_random_uuid(), 'https://example.test/h', '{payment_link.paid}', $2, 'SANDBOX')`, id, secret); err != nil {
		t.Fatal(err)
	}
	defer pool.Exec(ctx, `DELETE FROM webhook_endpoints WHERE id=$1`, id) //nolint:errcheck
	c, err := crypto.NewSecretCipher("MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=")
	if err != nil {
		t.Fatal(err)
	}
	svc := NewPostgresWebhookService(pool, c, env.Parse("SANDBOX"))
	if n, err := svc.EncryptStoredSecrets(ctx); err != nil || n < 1 {
		t.Fatalf("moved %d (err %v)", n, err)
	}
	var stored string
	_ = pool.QueryRow(ctx, `SELECT secret FROM webhook_endpoints WHERE id=$1`, id).Scan(&stored)
	if !strings.HasPrefix(stored, "enc:v1:") || strings.Contains(stored, secret) {
		t.Fatalf("still in the clear: %q", stored)
	}
	if back, err := c.Decrypt(stored); err != nil || back != secret {
		t.Fatalf("the integrator's secret changed: %q (err %v)", back, err)
	}
}
