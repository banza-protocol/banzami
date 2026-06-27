package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/admin-api/internal/auth"
	"github.com/banzami/banzami/services/admin-api/internal/middleware"
	"github.com/banzami/banzami/services/admin-api/internal/service"
)

type fakeOps struct {
	list        []service.OperatorView
	created     *service.OperatorView
	createErr   error
	superAdmins int
	roleSet     string
	statusSet   string
	inviteCalls int
	bumpCalls   int
	mailedLink  string
}

func (f *fakeOps) ListOperators(_ context.Context) ([]service.OperatorView, error) {
	return f.list, nil
}
func (f *fakeOps) GetOperator(_ context.Context, id string) (service.OperatorView, error) {
	for _, o := range f.list {
		if o.ID == id {
			return o, nil
		}
	}
	if f.created != nil && f.created.ID == id {
		return *f.created, nil
	}
	return service.OperatorView{}, service.ErrAdminUserNotFound
}
func (f *fakeOps) CreateOperator(_ context.Context, email, fullName, role, _ string) (string, error) {
	if f.createErr != nil {
		return "", f.createErr
	}
	f.created = &service.OperatorView{ID: "new-id", Email: email, FullName: fullName, Role: role, Status: "INVITED"}
	return "new-id", nil
}
func (f *fakeOps) UpdateOperatorName(_ context.Context, _, _, _ string) error { return nil }
func (f *fakeOps) SetOperatorRole(_ context.Context, _, role, _ string) error {
	f.roleSet = role
	return nil
}
func (f *fakeOps) SetOperatorStatus(_ context.Context, _, status, _ string) error {
	f.statusSet = status
	return nil
}
func (f *fakeOps) CountActiveSuperAdmins(_ context.Context) (int, error) { return f.superAdmins, nil }
func (f *fakeOps) CreateInviteToken(_ context.Context, _, _ string) (string, time.Time, error) {
	f.inviteCalls++
	return "rawinvite", time.Now().Add(72 * time.Hour), nil
}
func (f *fakeOps) BumpTokenVersion(_ context.Context, _ string) error {
	f.bumpCalls++
	return nil
}
func (f *fakeOps) AdminOperatorInvite(_, _, _, _, link string) { f.mailedLink = link }

func newOpH(f *fakeOps, showLink bool) *OperatorHandler {
	return NewOperatorHandler(f, f, "https://admin.banzami.com", showLink)
}

func opReq(method, path, body, role string) *http.Request {
	var r *http.Request
	if body != "" {
		r = httptest.NewRequest(method, path, strings.NewReader(body))
	} else {
		r = httptest.NewRequest(method, path, nil)
	}
	return r.WithContext(auth.WithPrincipal(r.Context(), auth.Principal{ID: "me", Email: "me@banzami.com", Role: role}))
}

// opRouter mirrors the real route table: authorization is enforced by the
// RequireCapability middleware (not by the handlers), so the tests exercise the
// same gate production uses.
func opRouter(h *OperatorHandler) http.Handler {
	r := chi.NewRouter()
	manage := middleware.RequireCapability(auth.CapOperatorManage)
	reset := middleware.RequireCapability(auth.CapOperatorReset)
	read := middleware.RequireCapability(auth.CapOperatorRead)
	r.With(read).Get("/admin/v1/operators", h.List)
	r.With(manage).Post("/admin/v1/operators", h.Create)
	r.With(manage).Post("/admin/v1/operators/{id}/role", h.SetRole)
	r.With(manage).Post("/admin/v1/operators/{id}/suspend", h.Suspend)
	r.With(manage).Post("/admin/v1/operators/{id}/activate", h.Activate)
	r.With(reset).Post("/admin/v1/operators/{id}/resend-invite", h.ResendInvite)
	r.With(reset).Post("/admin/v1/operators/{id}/terminate-sessions", h.TerminateSessions)
	return r
}

func TestOperators_CreateRequiresSuperAdmin(t *testing.T) {
	w := httptest.NewRecorder()
	opRouter(newOpH(&fakeOps{superAdmins: 2}, false)).ServeHTTP(w, opReq("POST", "/admin/v1/operators", `{"email":"x@b.co","full_name":"X","role":"OPERATIONS"}`, "OPERATIONS"))
	if w.Code != http.StatusForbidden {
		t.Fatalf("non-superadmin create must be 403, got %d", w.Code)
	}
}

func TestOperators_CreateInvitesAndIsInvited(t *testing.T) {
	f := &fakeOps{superAdmins: 2}
	w := httptest.NewRecorder()
	opRouter(newOpH(f, true)).ServeHTTP(w, opReq("POST", "/admin/v1/operators", `{"email":"New@b.co","full_name":"New Op","role":"OPERATIONS"}`, "SUPER_ADMIN"))
	if w.Code != http.StatusCreated {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	body := w.Body.String()
	if !strings.Contains(body, `"status":"INVITED"`) {
		t.Fatalf("new operator should be INVITED: %s", body)
	}
	if strings.Contains(body, "password_hash") || strings.Contains(body, "$2") {
		t.Fatalf("operator payload leaks password material: %s", body)
	}
	if f.inviteCalls != 1 || f.mailedLink == "" {
		t.Fatal("create should issue + email an invite")
	}
	if !strings.Contains(body, "reset-password?token=rawinvite") {
		t.Fatalf("dry-run create should return invite_url: %s", body)
	}
}

func TestOperators_CreateHidesLinkWhenEmailOn(t *testing.T) {
	f := &fakeOps{superAdmins: 2}
	w := httptest.NewRecorder()
	opRouter(newOpH(f, false)).ServeHTTP(w, opReq("POST", "/admin/v1/operators", `{"email":"n@b.co","full_name":"N","role":"OPERATIONS"}`, "SUPER_ADMIN"))
	if strings.Contains(w.Body.String(), "invite_url") || strings.Contains(w.Body.String(), "rawinvite") {
		t.Fatalf("link must not be in response when emailed: %s", w.Body.String())
	}
	if f.mailedLink == "" {
		t.Fatal("invite should have been emailed")
	}
}

func TestOperators_CreateInvalidRole(t *testing.T) {
	w := httptest.NewRecorder()
	opRouter(newOpH(&fakeOps{superAdmins: 2}, false)).ServeHTTP(w, opReq("POST", "/admin/v1/operators", `{"email":"x@b.co","full_name":"X","role":"BOSS"}`, "SUPER_ADMIN"))
	if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), "INVALID_ROLE") {
		t.Fatalf("invalid role must be 400, got %d", w.Code)
	}
}

func TestOperators_CreateDuplicate(t *testing.T) {
	w := httptest.NewRecorder()
	opRouter(newOpH(&fakeOps{superAdmins: 2, createErr: service.ErrAdminUserExists}, false)).ServeHTTP(w, opReq("POST", "/admin/v1/operators", `{"email":"dup@b.co","full_name":"Dup","role":"OPERATIONS"}`, "SUPER_ADMIN"))
	if w.Code != http.StatusConflict || !strings.Contains(w.Body.String(), "EMAIL_EXISTS") {
		t.Fatalf("duplicate must be 409, got %d", w.Code)
	}
}

func TestOperators_ResendInvite(t *testing.T) {
	f := &fakeOps{superAdmins: 2, list: []service.OperatorView{{ID: "op", Email: "op@b.co", Status: "INVITED", PasswordSet: false}}}
	w := httptest.NewRecorder()
	opRouter(newOpH(f, true)).ServeHTTP(w, opReq("POST", "/admin/v1/operators/op/resend-invite", "", "SUPER_ADMIN"))
	if w.Code != http.StatusOK || f.inviteCalls != 1 {
		t.Fatalf("resend should issue a new invite: status=%d calls=%d", w.Code, f.inviteCalls)
	}
}

func TestOperators_ResendInviteRejectedWhenActive(t *testing.T) {
	f := &fakeOps{superAdmins: 2, list: []service.OperatorView{{ID: "op", Status: "ACTIVE", PasswordSet: true}}}
	w := httptest.NewRecorder()
	opRouter(newOpH(f, false)).ServeHTTP(w, opReq("POST", "/admin/v1/operators/op/resend-invite", "", "SUPER_ADMIN"))
	if w.Code != http.StatusConflict || !strings.Contains(w.Body.String(), "ALREADY_ACTIVE") {
		t.Fatalf("resend on active must be 409, got %d", w.Code)
	}
}

func TestOperators_CannotDemoteLastSuperAdmin(t *testing.T) {
	f := &fakeOps{superAdmins: 1, list: []service.OperatorView{{ID: "sa", Role: "SUPER_ADMIN", Status: "ACTIVE"}}}
	w := httptest.NewRecorder()
	opRouter(newOpH(f, false)).ServeHTTP(w, opReq("POST", "/admin/v1/operators/sa/role", `{"role":"OPERATIONS"}`, "SUPER_ADMIN"))
	if w.Code != http.StatusConflict || !strings.Contains(w.Body.String(), "LAST_SUPER_ADMIN") {
		t.Fatalf("demoting last super admin must be 409, got %d %s", w.Code, w.Body.String())
	}
}

func TestOperators_CannotSuspendLastSuperAdmin(t *testing.T) {
	f := &fakeOps{superAdmins: 1, list: []service.OperatorView{{ID: "sa", Role: "SUPER_ADMIN", Status: "ACTIVE"}}}
	w := httptest.NewRecorder()
	opRouter(newOpH(f, false)).ServeHTTP(w, opReq("POST", "/admin/v1/operators/sa/suspend", "", "SUPER_ADMIN"))
	if w.Code != http.StatusConflict || !strings.Contains(w.Body.String(), "LAST_SUPER_ADMIN") {
		t.Fatalf("suspending last super admin must be 409, got %d", w.Code)
	}
}

func TestOperators_SuspendOtherWorks(t *testing.T) {
	f := &fakeOps{superAdmins: 2, list: []service.OperatorView{{ID: "op", Role: "OPERATIONS", Status: "ACTIVE"}}}
	w := httptest.NewRecorder()
	opRouter(newOpH(f, false)).ServeHTTP(w, opReq("POST", "/admin/v1/operators/op/suspend", "", "SUPER_ADMIN"))
	if w.Code != http.StatusOK || f.statusSet != "SUSPENDED" {
		t.Fatalf("suspend should succeed: status=%d set=%s", w.Code, f.statusSet)
	}
}

func TestOperators_ListReadableByAnyOperator(t *testing.T) {
	f := &fakeOps{list: []service.OperatorView{{ID: "op", Email: "a@b.co"}}}
	w := httptest.NewRecorder()
	opRouter(newOpH(f, false)).ServeHTTP(w, opReq("GET", "/admin/v1/operators", "", "READ_ONLY"))
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), "operators") {
		t.Fatalf("list should be readable, got %d", w.Code)
	}
}
