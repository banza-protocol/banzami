package developer

import (
	"strings"
	"testing"
)

// ADR-047 (RT04 §2/§3) — Project→Merchant Sandbox binding authority.
//
// developer-api is the single authority for a Project's SANDBOX payee. These
// tests pin the structural invariants the Gateway and Core rely on:
//   * one ACTIVE binding per project;
//   * a valid key with no binding introspects as Bound=false (never a default);
//   * introspection surfaces the operator-provisioned opaque core ids;
//   * sealing an artifact is idempotent and never erases the binding.

// opaque core ids (developer-api never interprets these).
const (
	mID  = "11111111-1111-1111-1111-111111111111"
	wID  = "22222222-2222-2222-2222-222222222222"
	waID = "33333333-3333-3333-3333-333333333333"
)

func TestBinding_OneActivePerProject(t *testing.T) {
	s, _, ws := wsWithRoles(t)
	pid := mkProject(t, s, "u_owner", ws)

	if _, err := s.BindProjectSandbox(bg, pid, mID, wID, waID, "u_owner", "", ""); err != nil {
		t.Fatalf("first bind should succeed: %v", err)
	}
	// A second ACTIVE binding for the same project must be refused.
	if _, err := s.BindProjectSandbox(bg, pid, "9", "9", "9", "u_owner", "", ""); err != ErrConflict {
		t.Fatalf("second active bind: want ErrConflict, got %v", err)
	}
}

func TestBinding_RequiresAllIdsAndProject(t *testing.T) {
	s, _, ws := wsWithRoles(t)
	pid := mkProject(t, s, "u_owner", ws)

	if _, err := s.BindProjectSandbox(bg, pid, "", wID, waID, "u_owner", "", ""); err != ErrValidation {
		t.Errorf("missing merchant_id: want ErrValidation, got %v", err)
	}
	if _, err := s.BindProjectSandbox(bg, pid, mID, wID, "", "u_owner", "", ""); err != ErrValidation {
		t.Errorf("missing wallet_account_id: want ErrValidation, got %v", err)
	}
	// Unknown project cannot be bound.
	if _, err := s.BindProjectSandbox(bg, "p_missing", mID, wID, waID, "u_owner", "", ""); err != ErrNotFound {
		t.Errorf("unknown project: want ErrNotFound, got %v", err)
	}
}

func TestIntrospect_UnboundProjectIsBoundFalse(t *testing.T) {
	s, _, ws := wsWithRoles(t)
	pid := mkProject(t, s, "u_owner", ws)
	_, raw, err := s.CreateAPIKey(bg, "u_owner", pid, KindSecret, "srv", []string{"payment_sessions:write"}, "", "")
	if err != nil {
		t.Fatal(err)
	}
	intro, err := s.IntrospectKey(bg, raw)
	if err != nil {
		t.Fatalf("valid key must introspect even with no binding: %v", err)
	}
	if intro.Bound || intro.MerchantID != "" || intro.WalletAccountID != "" {
		t.Errorf("unbound project must yield Bound=false with no payee ids, got %+v", intro)
	}
}

func TestIntrospect_BoundProjectSurfacesPayee(t *testing.T) {
	s, _, ws := wsWithRoles(t)
	pid := mkProject(t, s, "u_owner", ws)
	if _, err := s.BindProjectSandbox(bg, pid, mID, wID, waID, "u_owner", "", ""); err != nil {
		t.Fatal(err)
	}
	_, raw, _ := s.CreateAPIKey(bg, "u_owner", pid, KindSecret, "srv", []string{"payment_sessions:write"}, "", "")

	intro, err := s.IntrospectKey(bg, raw)
	if err != nil {
		t.Fatal(err)
	}
	if !intro.Bound || intro.MerchantID != mID || intro.WalletID != wID || intro.WalletAccountID != waID {
		t.Errorf("bound project must surface opaque payee ids, got %+v", intro)
	}
}

func TestBinding_SealArtifactIdempotentAndPreservesBinding(t *testing.T) {
	s, st, ws := wsWithRoles(t)
	pid := mkProject(t, s, "u_owner", ws)
	if _, err := s.BindProjectSandbox(bg, pid, mID, wID, waID, "u_owner", "", ""); err != nil {
		t.Fatal(err)
	}
	if err := s.SealBindingArtifact(bg, pid); err != nil {
		t.Fatalf("first seal: %v", err)
	}
	if err := s.SealBindingArtifact(bg, pid); err != nil {
		t.Fatalf("seal must be idempotent: %v", err)
	}
	b, _ := st.ActiveBindingForProject(bg, pid)
	if b == nil || !b.ArtifactCreated {
		t.Fatalf("binding must remain ACTIVE and sealed, got %+v", b)
	}
	// Sealing a project with no binding is a NotFound, never a silent success.
	if err := s.SealBindingArtifact(bg, "p_missing"); err != ErrNotFound {
		t.Errorf("seal unbound: want ErrNotFound, got %v", err)
	}
}

func TestBinding_AuditRecordsNoSecretsAndIdentifiesMerchant(t *testing.T) {
	s, st, ws := wsWithRoles(t)
	pid := mkProject(t, s, "u_owner", ws)
	if _, err := s.BindProjectSandbox(bg, pid, mID, wID, waID, "u_owner", "1.2.3.4", "req-1"); err != nil {
		t.Fatal(err)
	}
	var found bool
	for _, ev := range st.Audits {
		if ev.Action == "project.sandbox_bound" {
			found = true
			if ev.Metadata["merchant_id"] != mID {
				t.Errorf("audit must record the bound merchant, got %v", ev.Metadata["merchant_id"])
			}
			for k := range ev.Metadata {
				if strings.Contains(strings.ToLower(k), "secret") || strings.Contains(strings.ToLower(k), "key") {
					t.Errorf("audit metadata must not carry secrets, saw key %q", k)
				}
			}
		}
	}
	if !found {
		t.Error("binding must emit a project.sandbox_bound audit event")
	}
}
