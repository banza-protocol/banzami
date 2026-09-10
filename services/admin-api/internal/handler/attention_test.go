package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"sort"
	"sync/atomic"
	"testing"
	"time"

	"github.com/banzami/banzami/services/admin-api/internal/auth"
)

type fakeAttentionGW struct {
	env   string
	code  int
	err   error
	calls atomic.Int32
	cats  map[string]int
}

func (f *fakeAttentionGW) AttentionSummaryRaw(context.Context) (json.RawMessage, int, error) {
	f.calls.Add(1)
	if f.err != nil {
		return nil, 0, f.err
	}
	cats := map[string]attentionCount{}
	for k, v := range f.cats {
		cats[k] = attentionCount{Count: v}
	}
	b, _ := json.Marshal(map[string]any{"environment": f.env, "generated_at": time.Now().UTC(), "categories": cats})
	code := f.code
	if code == 0 {
		code = http.StatusOK
	}
	return b, code, nil
}

type fakeCases struct {
	open    int
	syncErr error
}

func (f *fakeCases) Sync(context.Context) error             { return f.syncErr }
func (f *fakeCases) OpenCount(context.Context) (int, error) { return f.open, nil }

type fakeUnread struct{ n int }

func (f *fakeUnread) Generate(context.Context) error           { return nil }
func (f *fakeUnread) UnreadCount(context.Context) (int, error) { return f.n, nil }

func sandboxGW() *fakeAttentionGW {
	return &fakeAttentionGW{env: "SANDBOX", cats: map[string]int{
		"business_applications": 4, "kyb_documents": 2, "kyc_documents": 1, "settlements": 0,
		"payouts": 3, "reconciliation": 0, "disputes": 1, "risk_flags": 5, "application_settlements": 0,
		"future_category_nobody_mapped": 7,
	}}
}

type attentionReply struct {
	Environment string                    `json:"environment"`
	Total       int                       `json:"total"`
	Categories  map[string]attentionCount `json:"categories"`
	Unread      *int                      `json:"unread_notifications"`
	Error       *struct{ Code string }    `json:"error"`
}

func askAttention(t *testing.T, h *AttentionHandler, role, env string) (int, attentionReply) {
	t.Helper()
	r := httptest.NewRequest(http.MethodGet, "/admin/v1/attention-summary?environment="+env, nil)
	if role != "" {
		r = r.WithContext(auth.WithPrincipal(r.Context(), auth.Principal{ID: "op", Email: "op@banzami.test", Role: role}))
	}
	w := httptest.NewRecorder()
	h.Summary(w, r)
	var out attentionReply
	_ = json.Unmarshal(w.Body.Bytes(), &out)
	return w.Code, out
}

func keys(m map[string]attentionCount) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

func TestAttention_SuperAdminSeesEveryMappedCategory(t *testing.T) {
	h := NewAttentionHandler(map[string]AttentionSource{"SANDBOX": {Gateway: sandboxGW(), Compliance: &fakeCases{open: 9}, Notifications: &fakeUnread{n: 21}}})
	code, got := askAttention(t, h, auth.RoleSuperAdmin, "SANDBOX")
	if code != http.StatusOK {
		t.Fatalf("status %d", code)
	}
	if len(got.Categories) != len(AttentionCategories) {
		t.Fatalf("categories %v, want every mapped one (%d)", keys(got.Categories), len(AttentionCategories))
	}
	if _, leaked := got.Categories["future_category_nobody_mapped"]; leaked {
		t.Fatal("a category without a capability mapping was returned")
	}
	// 4+2+1+0+3+0+1+5+0 = 16; the Inbox (9) aggregates other queues and stays out.
	if got.Total != 16 {
		t.Fatalf("total %d, want 16 (inbox excluded)", got.Total)
	}
	if got.Categories["inbox"].Count != 9 || got.Unread == nil || *got.Unread != 21 {
		t.Fatalf("inbox %d unread %v", got.Categories["inbox"].Count, got.Unread)
	}
}

// Each role gets exactly the categories whose page it may open — and the total
// counts only those.
func TestAttention_RBACPerCategory(t *testing.T) {
	for _, role := range []string{"OPERATIONS", "COMPLIANCE", "SUPPORT", "READ_ONLY", "NO_SUCH_ROLE"} {
		h := NewAttentionHandler(map[string]AttentionSource{"SANDBOX": {Gateway: sandboxGW(), Compliance: &fakeCases{open: 9}}})
		code, got := askAttention(t, h, role, "SANDBOX")
		if code != http.StatusOK {
			t.Fatalf("%s: status %d", role, code)
		}
		gw := sandboxGW()
		want := 0
		for key, capability := range AttentionCategories {
			_, present := got.Categories[key]
			allowed := auth.Can(role, capability)
			if present != allowed {
				t.Errorf("%s: category %s present=%v, capability %s allowed=%v", role, key, present, capability, allowed)
			}
			if allowed && key != "inbox" {
				want += gw.cats[key]
			}
		}
		if got.Total != want {
			t.Errorf("%s: total %d, want %d (visible categories only)", role, got.Total, want)
		}
	}
	// COMPLIANCE has no settlement/payout/dispute view: those counts must not leak.
	h := NewAttentionHandler(map[string]AttentionSource{"SANDBOX": {Gateway: sandboxGW()}})
	_, got := askAttention(t, h, "COMPLIANCE", "SANDBOX")
	for _, hidden := range []string{"settlements", "payouts", "disputes"} {
		if _, ok := got.Categories[hidden]; ok {
			t.Errorf("COMPLIANCE sees %s", hidden)
		}
	}
}

func TestAttention_NoPrincipalIsUnauthorized(t *testing.T) {
	h := NewAttentionHandler(map[string]AttentionSource{"SANDBOX": {Gateway: sandboxGW()}})
	if code, _ := askAttention(t, h, "", "SANDBOX"); code != http.StatusUnauthorized {
		t.Fatalf("status %d, want 401", code)
	}
}

// A failing gateway never becomes a zeroed summary: the console must hide its
// badges, not show "nothing to do".
func TestAttention_FailuresAreErrorsNotZeros(t *testing.T) {
	cases := map[string]*fakeAttentionGW{
		"transport": {env: "SANDBOX", err: errors.New("dial tcp: connection refused")},
		"5xx":       {env: "SANDBOX", code: http.StatusInternalServerError},
		// A client pointed at the other environment's gateway.
		"mismatch": {env: "LIVE", cats: map[string]int{"business_applications": 1}},
	}
	for name, gw := range cases {
		h := NewAttentionHandler(map[string]AttentionSource{"SANDBOX": {Gateway: gw}})
		code, got := askAttention(t, h, auth.RoleSuperAdmin, "SANDBOX")
		if code != http.StatusBadGateway || got.Error == nil || got.Categories != nil {
			t.Errorf("%s: status %d body %+v, want 502 with no categories", name, code, got)
		}
	}
	// An environment this deployment does not serve is 503, not an empty summary.
	h := NewAttentionHandler(map[string]AttentionSource{"SANDBOX": {Gateway: sandboxGW()}})
	if code, _ := askAttention(t, h, auth.RoleSuperAdmin, "LIVE"); code != http.StatusServiceUnavailable {
		t.Errorf("LIVE without a source: %d, want 503", code)
	}
}

// Environments never share a cache entry or a source.
func TestAttention_EnvironmentsAreSeparate(t *testing.T) {
	live := &fakeAttentionGW{env: "LIVE", cats: map[string]int{"business_applications": 1}}
	sbx := &fakeAttentionGW{env: "SANDBOX", cats: map[string]int{"business_applications": 7}}
	h := NewAttentionHandler(map[string]AttentionSource{"LIVE": {Gateway: live}, "SANDBOX": {Gateway: sbx}})
	_, a := askAttention(t, h, auth.RoleSuperAdmin, "SANDBOX")
	_, b := askAttention(t, h, auth.RoleSuperAdmin, "LIVE")
	if a.Categories["business_applications"].Count != 7 || b.Categories["business_applications"].Count != 1 {
		t.Fatalf("SANDBOX %d LIVE %d", a.Categories["business_applications"].Count, b.Categories["business_applications"].Count)
	}
	if a.Environment != "SANDBOX" || b.Environment != "LIVE" {
		t.Fatalf("environments %s / %s", a.Environment, b.Environment)
	}
}

// A failed Inbox sync drops the Inbox category (hidden badge) instead of
// showing the last-known count as current; the rest of the summary stands.
func TestAttention_InboxSyncFailureHidesOnlyTheInbox(t *testing.T) {
	h := NewAttentionHandler(map[string]AttentionSource{"SANDBOX": {Gateway: sandboxGW(), Compliance: &fakeCases{open: 9, syncErr: errors.New("boom")}}})
	code, got := askAttention(t, h, auth.RoleSuperAdmin, "SANDBOX")
	if code != http.StatusOK {
		t.Fatalf("status %d", code)
	}
	if _, ok := got.Categories["inbox"]; ok {
		t.Fatal("inbox shown after a failed sync")
	}
	if got.Categories["business_applications"].Count != 4 {
		t.Fatal("the other categories must still be served")
	}
}

// Cached briefly; a mutation drops the cache so the operator's own action
// shows on the next read.
func TestAttention_CacheAndInvalidation(t *testing.T) {
	gw := sandboxGW()
	h := NewAttentionHandler(map[string]AttentionSource{"SANDBOX": {Gateway: gw}})
	now := time.Now()
	h.now = func() time.Time { return now }

	askAttention(t, h, auth.RoleSuperAdmin, "SANDBOX")
	askAttention(t, h, auth.RoleSuperAdmin, "SANDBOX")
	if n := gw.calls.Load(); n != 1 {
		t.Fatalf("gateway calls %d, want 1 (second read cached)", n)
	}

	gw.cats["business_applications"] = 5 // a new application arrived
	h.InvalidateAttention()              // …and the operator acted on something
	_, got := askAttention(t, h, auth.RoleSuperAdmin, "SANDBOX")
	if gw.calls.Load() != 2 || got.Categories["business_applications"].Count != 5 {
		t.Fatalf("after invalidation: calls %d count %d", gw.calls.Load(), got.Categories["business_applications"].Count)
	}

	now = now.Add(attentionTTL + time.Second)
	askAttention(t, h, auth.RoleSuperAdmin, "SANDBOX")
	if gw.calls.Load() != 3 {
		t.Fatalf("expired entry served: calls %d", gw.calls.Load())
	}
}
