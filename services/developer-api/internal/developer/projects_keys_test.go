package developer

import (
	"strings"
	"testing"
	"time"
)

func wsWithRoles(t *testing.T) (*Service, *memStore, string) {
	t.Helper()
	s, st := newSvc(time.Hour)
	ws, _ := s.CreateWorkspace(bg, "u_owner", "WS", "", "")
	addMember(t, s, "u_owner", ws.ID, "dev@x.co", RoleDeveloper, "u_dev")
	addMember(t, s, "u_owner", ws.ID, "view@x.co", RoleViewer, "u_view")
	return s, st, ws.ID
}

// ── projects ─────────────────────────────────────────────────────────────────

func TestProject_CreateAndIsolation(t *testing.T) {
	s, _, ws := wsWithRoles(t)
	p, err := s.CreateProject(bg, "u_dev", ws, "Checkout", "", "")
	if err != nil {
		t.Fatalf("developer create project: %v", err)
	}
	// Outsider (no membership) cannot read the project → isolation.
	if _, err := s.GetProject(bg, "u_outsider", p.ID); err != ErrForbidden {
		t.Errorf("cross-workspace project read: want Forbidden, got %v", err)
	}
	// Viewer can read but cannot create.
	if _, err := s.GetProject(bg, "u_view", p.ID); err != nil {
		t.Errorf("member should read project: %v", err)
	}
	if _, err := s.CreateProject(bg, "u_view", ws, "Nope", "", ""); err != ErrForbidden {
		t.Errorf("viewer create project: want Forbidden, got %v", err)
	}
}

func TestProject_UniqueNameWithinWorkspace(t *testing.T) {
	s, _, ws := wsWithRoles(t)
	if _, err := s.CreateProject(bg, "u_owner", ws, "Store", "", ""); err != nil {
		t.Fatal(err)
	}
	p2, err := s.CreateProject(bg, "u_owner", ws, "Store", "", "")
	if err != nil {
		t.Fatalf("duplicate name should auto-suffix, not fail: %v", err)
	}
	if p2.Slug == "store" {
		t.Error("second project must get a distinct slug within the workspace")
	}
}

// ── API keys ─────────────────────────────────────────────────────────────────

func mkProject(t *testing.T, s *Service, actor, ws string) string {
	t.Helper()
	p, err := s.CreateProject(bg, actor, ws, "Proj", "", "")
	if err != nil {
		t.Fatal(err)
	}
	return p.ID
}

func TestAPIKey_SandboxPrefixesAndRevealOnce(t *testing.T) {
	s, st, ws := wsWithRoles(t)
	pid := mkProject(t, s, "u_owner", ws)

	// Secret key: raw returned once, bz_test_sk_ prefix, hash stored (not raw).
	key, raw, err := s.CreateAPIKey(bg, "u_owner", pid, KindSecret, "server", []string{"payments:write"}, "", "")
	if err != nil {
		t.Fatalf("create secret key: %v", err)
	}
	if !strings.HasPrefix(raw, "bz_test_sk_") {
		t.Errorf("secret raw must be bz_test_sk_: %q", raw)
	}
	if key.Environment != EnvSandbox {
		t.Errorf("key env must be SANDBOX, got %q", key.Environment)
	}
	// Reveal-once: list returns metadata only, never the raw or hash.
	keys, _ := s.ListAPIKeys(bg, "u_owner", pid)
	for _, k := range keys {
		if k.PublicValue == raw || strings.Contains(k.KeyPrefix, raw) {
			t.Error("list must not expose the raw secret")
		}
	}
	// Raw secret is not stored anywhere in the DB.
	for _, r := range st.apiKeys {
		if r.keyHash == raw {
			t.Error("secret stored in plaintext")
		}
		if r.keyHash != hashKey(raw, "key-pepper") {
			t.Error("secret must be stored as HMAC(raw, pepper)")
		}
	}
	// Publishable key: full value re-displayable, bz_test_pk_ prefix.
	pk, pkraw, err := s.CreateAPIKey(bg, "u_owner", pid, KindPublishable, "web", []string{"payments:read"}, "", "")
	if err != nil {
		t.Fatal(err)
	}
	if pkraw != "" {
		t.Error("publishable key has no separate secret")
	}
	if !strings.HasPrefix(pk.PublicValue, "bz_test_pk_") {
		t.Errorf("publishable value must be bz_test_pk_: %q", pk.PublicValue)
	}
}

func TestAPIKey_ScopeEnforcement(t *testing.T) {
	s, _, ws := wsWithRoles(t)
	pid := mkProject(t, s, "u_owner", ws)
	_, raw, _ := s.CreateAPIKey(bg, "u_owner", pid, KindSecret, "k", []string{"payments:write"}, "", "")

	if _, err := s.AuthorizeKey(bg, raw, "payments:write"); err != nil {
		t.Errorf("authorized scope should pass: %v", err)
	}
	if _, err := s.AuthorizeKey(bg, raw, "refunds:write"); err != ErrForbidden {
		t.Errorf("missing scope: want Forbidden, got %v", err)
	}
	// Invalid scope at creation is rejected.
	if _, _, err := s.CreateAPIKey(bg, "u_owner", pid, KindSecret, "k2", []string{"not:a:scope"}, "", ""); err != ErrValidation {
		t.Errorf("invalid scope: want Validation, got %v", err)
	}
}

func TestAPIKey_RevokeRejected(t *testing.T) {
	s, _, ws := wsWithRoles(t)
	pid := mkProject(t, s, "u_owner", ws)
	key, raw, _ := s.CreateAPIKey(bg, "u_owner", pid, KindSecret, "k", []string{"payments:read"}, "", "")
	if _, err := s.AuthorizeKey(bg, raw, ""); err != nil {
		t.Fatalf("key should authorize before revoke: %v", err)
	}
	if err := s.RevokeAPIKey(bg, "u_owner", key.ID, "", ""); err != nil {
		t.Fatal(err)
	}
	if _, err := s.AuthorizeKey(bg, raw, ""); err != ErrForbidden {
		t.Errorf("revoked key: want Forbidden, got %v", err)
	}
}

func TestAPIKey_RotateRejectsOld(t *testing.T) {
	s, _, ws := wsWithRoles(t)
	pid := mkProject(t, s, "u_owner", ws)
	key, oldRaw, _ := s.CreateAPIKey(bg, "u_owner", pid, KindSecret, "k", []string{"payments:read"}, "", "")

	nk, newRaw, err := s.RotateAPIKey(bg, "u_owner", key.ID, "", "")
	if err != nil {
		t.Fatal(err)
	}
	if newRaw == oldRaw || nk.RotatedFrom == nil || *nk.RotatedFrom != key.ID {
		t.Error("rotation must mint a new key linked to the old one")
	}
	if _, err := s.AuthorizeKey(bg, oldRaw, ""); err != ErrForbidden {
		t.Errorf("rotated-away old key: want Forbidden, got %v", err)
	}
	if _, err := s.AuthorizeKey(bg, newRaw, "payments:read"); err != nil {
		t.Errorf("new rotated key should authorize: %v", err)
	}
}

func TestAPIKey_LiveIssuanceHasNoPath(t *testing.T) {
	s, _, ws := wsWithRoles(t)
	pid := mkProject(t, s, "u_owner", ws)
	// Every issued key is SANDBOX bz_test_ — there is no parameter to request Live.
	key, _, _ := s.CreateAPIKey(bg, "u_owner", pid, KindSecret, "k", []string{"payments:read"}, "", "")
	if key.Environment != EnvSandbox || !strings.HasPrefix(key.KeyPrefix, "bz_test_") {
		t.Errorf("issued key must be sandbox bz_test_: env=%q prefix=%q", key.Environment, key.KeyPrefix)
	}
	// A forged bz_live_ key is rejected outright by authorization.
	if _, err := s.AuthorizeKey(bg, "bz_live_sk_forged", "payments:read"); err != ErrForbidden {
		t.Errorf("bz_live_ key: want Forbidden, got %v", err)
	}
}

func TestAPIKey_CreateAuthz(t *testing.T) {
	s, _, ws := wsWithRoles(t)
	pid := mkProject(t, s, "u_owner", ws)
	// Viewer cannot create keys; outsider cannot either.
	if _, _, err := s.CreateAPIKey(bg, "u_view", pid, KindSecret, "k", nil, "", ""); err != ErrForbidden {
		t.Errorf("viewer create key: want Forbidden, got %v", err)
	}
	if _, _, err := s.CreateAPIKey(bg, "u_outsider", pid, KindSecret, "k", nil, "", ""); err != ErrForbidden {
		t.Errorf("outsider create key: want Forbidden, got %v", err)
	}
}

// No raw secret ever appears in audit metadata for create/revoke/rotate.
func TestAPIKey_NoRawSecretInAudit(t *testing.T) {
	s, st, ws := wsWithRoles(t)
	pid := mkProject(t, s, "u_owner", ws)
	key, raw, _ := s.CreateAPIKey(bg, "u_owner", pid, KindSecret, "k", []string{"payments:read"}, "", "")
	_, raw2, _ := s.RotateAPIKey(bg, "u_owner", key.ID, "", "")
	for _, ev := range st.Audits {
		for _, v := range ev.Metadata {
			if v == raw || v == raw2 {
				t.Error("audit metadata leaked a raw key")
			}
		}
		if strings.Contains(ev.Subject, raw) || strings.Contains(ev.Subject, raw2) {
			t.Error("audit subject leaked a raw key")
		}
	}
}

// A publishable key ships inside something the user can read — a mobile binary,
// a browser bundle — so anyone with the app has the key. Nothing restricted what
// one could carry, so it could be minted with transfers:write: financial write
// authority in an app store download, on routes the gateway accepts bz_test_pk_
// for. Reads are fine; moving money is not.
//
// Payment capability is RELEASED in these tests, so the refusal comes from the
// client-safety rule and not from the payment gate — otherwise the test would
// pass for a reason that disappears the moment payments are released.
func TestCreateAPIKey_PublishableRejectsFinancialWriteScopes(t *testing.T) {
	s, _, ws := wsWithRoles(t)
	s.SetPaymentCapabilityReleased(true)
	pid := mkProject(t, s, "u_owner", ws)
	for _, sc := range []string{
		"transfers:write", "refunds:write", "wallet_accounts:create",
		"payment_sessions:write", "application_settlements:write", "payments:write",
	} {
		if _, _, err := s.CreateAPIKey(bg, "u_owner", pid, KindPublishable, "pk", []string{sc}, "", ""); err != ErrValidation {
			t.Errorf("publishable key accepted %s (err=%v) — a client-embeddable credential must not move money", sc, err)
		}
	}
}

func TestCreateAPIKey_PublishableAllowsReadScopes(t *testing.T) {
	s, _, ws := wsWithRoles(t)
	s.SetPaymentCapabilityReleased(true)
	pid := mkProject(t, s, "u_owner", ws)
	k, _, err := s.CreateAPIKey(bg, "u_owner", pid, KindPublishable, "pk", []string{"identity:read", "payment_sessions:read"}, "", "")
	if err != nil {
		t.Fatalf("publishable key with read-only scopes rejected: %v", err)
	}
	if !strings.HasPrefix(k.PublicValue, "bz_test_pk_") {
		t.Errorf("publishable value = %q, want bz_test_pk_ prefix", k.PublicValue)
	}
}

// The secret kind is unaffected: financial writes belong on a server credential.
func TestCreateAPIKey_SecretStillAcceptsFinancialWriteScopes(t *testing.T) {
	s, _, ws := wsWithRoles(t)
	s.SetPaymentCapabilityReleased(true)
	pid := mkProject(t, s, "u_owner", ws)
	if _, _, err := s.CreateAPIKey(bg, "u_owner", pid, KindSecret, "sk", []string{"transfers:write"}, "", ""); err != nil {
		t.Fatalf("secret key with transfers:write rejected: %v", err)
	}
}
