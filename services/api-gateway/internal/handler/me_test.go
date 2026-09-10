// GET /v1/me is the whole released developer-key surface, so what it names a
// project is the name every integration will store.
package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
)

const testProjectUUID = "6367749d-aaaa-4bbb-8ccc-ddddeeeeffff"

func getMe(p *middleware.DeveloperPrincipal) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, "/v1/me", nil)
	if p != nil {
		req = req.WithContext(middleware.ContextWithDeveloperPrincipal(req.Context(), p))
	}
	rec := httptest.NewRecorder()
	NewMeHandler().Me(rec, req)
	return rec
}

func devPrincipal(slug string) *middleware.DeveloperPrincipal {
	return &middleware.DeveloperPrincipal{
		Environment: "SANDBOX",
		WorkspaceID: "ws-internal-uuid",
		KeyID:       "key-internal-uuid",
		ProjectID:   testProjectUUID,
		ProjectSlug: slug,
		ProjectName: "Doa Sandbox",
		KeyStatus:   "ACTIVE",
		Scopes:      []string{"identity:read"},
		Bound:       true,
		MerchantID:  "merchant-internal-uuid",
		WalletID:    "wallet-internal-uuid",
	}
}

func decodeMe(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body.String())
	}
	var out map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	return out
}

// The Project is an object: its own id — the one the Console addresses it by —
// its name, and the ref (slug) the developer chose.
func TestMe_NamesTheProjectByItsOwnId(t *testing.T) {
	out := decodeMe(t, getMe(devPrincipal("doa-sandbox")))
	project, ok := out["project"].(map[string]any)
	if !ok {
		t.Fatalf("project is not an object: %#v", out["project"])
	}
	if project["id"] != testProjectUUID {
		t.Errorf("project.id = %v, want the Project's own id %s", project["id"], testProjectUUID)
	}
	if project["name"] != "Doa Sandbox" || project["ref"] != "doa-sandbox" {
		t.Errorf("project = %#v", project)
	}
	if _, stale := out["project_id"]; stale {
		t.Error("the derived project_id is withdrawn; project.id is the identifier")
	}
}

// The slug is what a developer typed and can retype. Renaming a project used to
// change the only identifier /v1/me published, so anything that had filed
// records under it lost the link.
func TestMe_ProjectIdSurvivesARename(t *testing.T) {
	before := decodeMe(t, getMe(devPrincipal("doa-sandbox")))["project"].(map[string]any)
	after := decodeMe(t, getMe(devPrincipal("doa-producao")))["project"].(map[string]any)

	if before["ref"] == after["ref"] {
		t.Fatal("precondition: the slug should have changed")
	}
	if before["id"] == "" || before["id"] != after["id"] {
		t.Fatalf("project.id changed on rename: %v → %v", before["id"], after["id"])
	}
}

// What stays out is everything behind the Project: the workspace and key, and
// the financial owner, wallet and account the binding resolves to.
func TestMe_PublishesNoInternalIdentifiers(t *testing.T) {
	raw := getMe(devPrincipal("doa-sandbox")).Body.String()
	for _, leaked := range []string{
		"ws-internal-uuid", "workspace_id",
		"key-internal-uuid", "key_id",
		"merchant-internal-uuid", "merchant_id",
		"wallet-internal-uuid", "wallet_id",
		"binding",
	} {
		if strings.Contains(raw, leaked) {
			t.Fatalf("/v1/me leaked %q: %s", leaked, raw)
		}
	}
}

func TestMe_RequiresIdentityReadScope(t *testing.T) {
	p := devPrincipal("doa-sandbox")
	p.Scopes = []string{"payments:write"}
	if rec := getMe(p); rec.Code != http.StatusForbidden {
		t.Fatalf("want 403 without identity:read, got %d", rec.Code)
	}
	if rec := getMe(nil); rec.Code != http.StatusUnauthorized {
		t.Fatalf("want 401 unauthenticated, got %d", rec.Code)
	}
}
