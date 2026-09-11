package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/admin-api/internal/auth"
	"github.com/banzami/banzami/services/admin-api/internal/service"
)

// ComplianceCasesHandler is the unified Compliance Operations Console surface
// (ADR-023). One inbox of CASES synced from every source. LIVE uses the primary
// database; SANDBOX uses the staging database (when configured).
type ComplianceCasesHandler struct {
	live    *service.ComplianceService
	sandbox *service.ComplianceService
}

func NewComplianceCasesHandler(live, sandbox *service.ComplianceService) *ComplianceCasesHandler {
	return &ComplianceCasesHandler{live: live, sandbox: sandbox}
}

// It answers the request itself when it returns false: 400 for an environment
// it does not recognise (requestedEnvironment, A2-22), 503 when the
// environment has no compliance service.
func (h *ComplianceCasesHandler) pick(w http.ResponseWriter, r *http.Request) (*service.ComplianceService, bool) {
	e, ok := requestedEnvironment(w, r)
	if !ok {
		return nil, false
	}
	svc := h.live
	if e.IsSandbox() {
		svc = h.sandbox
	}
	if svc == nil {
		h.unavailable(w)
		return nil, false
	}
	return svc, true
}

func (h *ComplianceCasesHandler) fail(w http.ResponseWriter, err error) {
	if errors.Is(err, service.ErrComplianceCaseNotFound) {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "compliance case not found")
		return
	}
	writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "could not process the request")
}

func (h *ComplianceCasesHandler) unavailable(w http.ResponseWriter) {
	writeError(w, http.StatusServiceUnavailable, "UNAVAILABLE", "compliance inbox is not configured for this environment")
}

// GET /admin/v1/compliance/cases — unified inbox (synced, filtered, paginated).
func (h *ComplianceCasesHandler) List(w http.ResponseWriter, r *http.Request) {
	svc, ok := h.pick(w, r)
	if !ok {
		return
	}
	// Sync is a best-effort refresh before listing: on failure we still serve the
	// last-known cases (stale rather than empty), but the failure must be visible
	// — a silently dropped error hid sync outages entirely. No PII in the log.
	env := "LIVE"
	if r.URL.Query().Get("environment") == "SANDBOX" {
		env = "SANDBOX"
	}
	if err := svc.Sync(r.Context()); err != nil {
		slog.ErrorContext(r.Context(), "compliance.sync.failed", "environment", env, "error", err)
	}
	q := r.URL.Query()
	page, _ := strconv.Atoi(q.Get("page"))
	pageSize, _ := strconv.Atoi(q.Get("page_size"))
	cases, total, err := svc.List(r.Context(), service.CaseFilters{
		CaseType: q.Get("case_type"), Status: q.Get("status"), Priority: q.Get("priority"),
		Risk: q.Get("risk"), Operator: q.Get("operator"), Search: q.Get("q"),
		Page: page, PageSize: pageSize,
	})
	if err != nil {
		h.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"cases": cases, "total": total, "page": maxInt(page, 1)})
}

// GET /admin/v1/compliance/cases/{id}
func (h *ComplianceCasesHandler) Get(w http.ResponseWriter, r *http.Request) {
	svc, ok := h.pick(w, r)
	if !ok {
		return
	}
	c, err := svc.Get(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		h.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, c)
}

// GET /admin/v1/compliance/cases/{id}/notes
func (h *ComplianceCasesHandler) ListNotes(w http.ResponseWriter, r *http.Request) {
	svc, ok := h.pick(w, r)
	if !ok {
		return
	}
	notes, err := svc.ListNotes(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		h.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"notes": notes})
}

// POST /admin/v1/compliance/cases/{id}/notes  {body}
func (h *ComplianceCasesHandler) AddNote(w http.ResponseWriter, r *http.Request) {
	svc, ok := h.pick(w, r)
	if !ok {
		return
	}
	var body struct {
		Body string `json:"body"`
	}
	_ = json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&body)
	if len(body.Body) == 0 {
		writeError(w, http.StatusBadRequest, "MISSING_FIELD", "body is required")
		return
	}
	id := chi.URLParam(r, "id")
	p, _ := auth.FromContext(r.Context())
	note, err := svc.AddNote(r.Context(), id, p.ID, p.FullName, body.Body)
	if err != nil {
		h.fail(w, err)
		return
	}
	// The note body is operator-internal; the audit records only that a note exists.
	complianceCaseAudit(r, "ADD_CASE_NOTE", id, map[string]any{"note_id": note.ID})
	writeJSON(w, http.StatusCreated, note)
}

// action wires a status/assignment mutation + its audit.
func (h *ComplianceCasesHandler) action(w http.ResponseWriter, r *http.Request, auditAction string, fn func(*service.ComplianceService, string) error) {
	svc, ok := h.pick(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	if err := fn(svc, id); err != nil {
		h.fail(w, err)
		return
	}
	complianceCaseAudit(r, auditAction, id, nil)
	w.WriteHeader(http.StatusNoContent)
}

// POST /admin/v1/compliance/cases/{id}/assign — assume the case (caller owns it).
func (h *ComplianceCasesHandler) Assign(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.FromContext(r.Context())
	h.action(w, r, "ASSIGN_CASE", func(s *service.ComplianceService, id string) error {
		return s.Assign(r.Context(), id, p.ID, p.FullName)
	})
}

// POST /admin/v1/compliance/cases/{id}/transfer  {operator_id, operator_name}
func (h *ComplianceCasesHandler) Transfer(w http.ResponseWriter, r *http.Request) {
	var body struct {
		OperatorID   string `json:"operator_id"`
		OperatorName string `json:"operator_name"`
	}
	_ = json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&body)
	if body.OperatorID == "" {
		writeError(w, http.StatusBadRequest, "MISSING_FIELD", "operator_id is required")
		return
	}
	h.action(w, r, "TRANSFER_CASE", func(s *service.ComplianceService, id string) error {
		return s.Assign(r.Context(), id, body.OperatorID, body.OperatorName)
	})
}

// POST /admin/v1/compliance/cases/{id}/release
func (h *ComplianceCasesHandler) Release(w http.ResponseWriter, r *http.Request) {
	h.action(w, r, "RELEASE_CASE", func(s *service.ComplianceService, id string) error { return s.Release(r.Context(), id) })
}

// POST /admin/v1/compliance/cases/{id}/escalate
func (h *ComplianceCasesHandler) Escalate(w http.ResponseWriter, r *http.Request) {
	h.action(w, r, "ESCALATE_CASE", func(s *service.ComplianceService, id string) error { return s.Escalate(r.Context(), id) })
}

// POST /admin/v1/compliance/cases/{id}/resolve
func (h *ComplianceCasesHandler) Resolve(w http.ResponseWriter, r *http.Request) {
	h.action(w, r, "RESOLVE_CASE", func(s *service.ComplianceService, id string) error { return s.Resolve(r.Context(), id) })
}

// POST /admin/v1/compliance/cases/{id}/priority  {priority}
func (h *ComplianceCasesHandler) SetPriority(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Priority string `json:"priority"`
	}
	_ = json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<10)).Decode(&body)
	if !validCasePriority(body.Priority) {
		writeError(w, http.StatusBadRequest, "INVALID_FIELD", "priority must be LOW, NORMAL, HIGH or CRITICAL")
		return
	}
	h.action(w, r, "SET_CASE_PRIORITY", func(s *service.ComplianceService, id string) error {
		return s.SetPriority(r.Context(), id, body.Priority)
	})
}

// POST /admin/v1/compliance/cases/{id}/risk  {risk}
func (h *ComplianceCasesHandler) SetRisk(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Risk string `json:"risk"`
	}
	_ = json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<10)).Decode(&body)
	if !validCaseRisk(body.Risk) {
		writeError(w, http.StatusBadRequest, "INVALID_FIELD", "risk must be LOW, MEDIUM, HIGH or CRITICAL")
		return
	}
	h.action(w, r, "SET_CASE_RISK", func(s *service.ComplianceService, id string) error { return s.SetRisk(r.Context(), id, body.Risk) })
}

func validCasePriority(p string) bool {
	switch p {
	case "LOW", "NORMAL", "HIGH", "CRITICAL":
		return true
	}
	return false
}
func validCaseRisk(p string) bool {
	switch p {
	case "LOW", "MEDIUM", "HIGH", "CRITICAL":
		return true
	}
	return false
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func complianceCaseAudit(r *http.Request, action, id string, after map[string]any) {
	auditAnnotate(r, func(a *auth.AuditAnnotation) {
		a.Action = action
		a.EntityType = "compliance_case"
		a.EntityID = id
		a.After = after
	})
}
