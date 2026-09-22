package handler

// Beta testers — the operator surface (APP-BETA-001).
//
// Read the queue of prospective mobile testers, advance one through the
// lifecycle, and export the current view as CSV. PII (name, email) is shown only
// to operators who hold the capability; there is no public listing and these
// routes are never indexable (the admin app is noindex throughout). No money, no
// Developer resource — a beta tester is contact detail.

import (
	"encoding/csv"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/admin-api/internal/email"
	"github.com/banzami/banzami/services/admin-api/internal/service"
)

// BetaTesterAdminHandler serves the operator beta-tester routes.
type BetaTesterAdminHandler struct {
	svc    *service.BetaTesterAdminService
	mailer *email.Sender // may be nil (email not configured / tests) — a no-op then
}

func NewBetaTesterAdminHandler(svc *service.BetaTesterAdminService, mailer *email.Sender) *BetaTesterAdminHandler {
	return &BetaTesterAdminHandler{svc: svc, mailer: mailer}
}

func (h *BetaTesterAdminHandler) available(w http.ResponseWriter) bool {
	if h.svc == nil {
		writeError(w, http.StatusServiceUnavailable, "UNAVAILABLE", "beta tester administration is not available in this environment")
		return false
	}
	return true
}

// filterFromQuery reads the shared list/export filter, validating the
// enumerations so a bad value is a 400, never a silent full-table scan under the
// wrong assumption.
func filterFromQuery(r *http.Request) (service.BetaListFilter, string) {
	q := r.URL.Query()
	f := service.BetaListFilter{
		Status:   strings.ToUpper(strings.TrimSpace(q.Get("status"))),
		App:      strings.ToUpper(strings.TrimSpace(q.Get("app"))),
		Platform: strings.ToUpper(strings.TrimSpace(q.Get("platform"))),
		Search:   q.Get("q"),
	}
	switch f.Status {
	case "", "PENDING", "INVITED", "ACTIVE", "REMOVED":
	default:
		return f, "status must be PENDING, INVITED, ACTIVE or REMOVED"
	}
	switch f.App {
	case "", "APP_BANZAMI", "APP_MERCHANT":
	default:
		return f, "app must be APP_BANZAMI or APP_MERCHANT"
	}
	switch f.Platform {
	case "", "IOS", "ANDROID":
	default:
		return f, "platform must be IOS or ANDROID"
	}
	if v := q.Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			f.Limit = n
		}
	}
	if v := q.Get("offset"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			f.Offset = n
		}
	}
	return f, ""
}

// GET /admin/v1/beta-testers
func (h *BetaTesterAdminHandler) List(w http.ResponseWriter, r *http.Request) {
	if !h.available(w) {
		return
	}
	f, verr := filterFromQuery(r)
	if verr != "" {
		writeError(w, http.StatusBadRequest, "VALIDATION_ERROR", verr)
		return
	}
	rows, total, err := h.svc.List(r.Context(), f)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", internalErrorMessage)
		return
	}
	if rows == nil {
		rows = []service.BetaTesterRow{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"testers": rows, "total": total})
}

type betaStatusBody struct {
	Status string  `json:"status"`
	Note   *string `json:"note"`
}

// POST /admin/v1/beta-testers/{id}/status
func (h *BetaTesterAdminHandler) SetStatus(w http.ResponseWriter, r *http.Request) {
	if !h.available(w) {
		return
	}
	id := strings.TrimSpace(chi.URLParam(r, "id"))
	if id == "" {
		writeError(w, http.StatusBadRequest, "VALIDATION_ERROR", "id is required")
		return
	}
	var body betaStatusBody
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION_ERROR", "invalid request body")
		return
	}
	body.Status = strings.ToUpper(strings.TrimSpace(body.Status))
	if body.Note != nil {
		n := strings.TrimSpace(*body.Note)
		if len(n) > 2000 {
			writeError(w, http.StatusBadRequest, "VALIDATION_ERROR", "note is too long")
			return
		}
		body.Note = &n
	}
	row, justInvited, err := h.svc.SetStatus(r.Context(), id, body.Status, body.Note)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrBetaInvalidStatus):
			writeError(w, http.StatusBadRequest, "VALIDATION_ERROR", "status must be INVITED, ACTIVE or REMOVED")
		case errors.Is(err, service.ErrBetaTesterNotFound):
			writeError(w, http.StatusNotFound, "NOT_FOUND", "beta tester not found")
		default:
			writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", internalErrorMessage)
		}
		return
	}

	// The tester was just added to the tests → tell them, once. Non-blocking:
	// a failed notification must never fail the status change the operator made.
	// The install invite itself still comes from Apple/Google, by hand.
	if justInvited && h.mailer != nil && strings.TrimSpace(row.Email) != "" {
		go h.mailer.BetaTesterAdded(row.Email, row.FirstName, row.AppBanzami, row.AppMerchant, row.WantsIOS, row.WantsAndroid)
	}

	writeJSON(w, http.StatusOK, row)
}

// GET /admin/v1/beta-testers/export.csv
func (h *BetaTesterAdminHandler) ExportCSV(w http.ResponseWriter, r *http.Request) {
	if !h.available(w) {
		return
	}
	f, verr := filterFromQuery(r)
	if verr != "" {
		writeError(w, http.StatusBadRequest, "VALIDATION_ERROR", verr)
		return
	}
	rows, err := h.svc.Export(r.Context(), f)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", internalErrorMessage)
		return
	}

	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", "attachment; filename=\"beta-testers-"+time.Now().UTC().Format("20060102")+".csv\"")
	cw := csv.NewWriter(w)
	_ = cw.Write([]string{
		"first_name", "last_name", "email", "platform", "apps",
		"device_model", "os_version", "country", "source", "status",
		"created_at", "invited_at", "activated_at", "removed_at",
	})
	for _, t := range rows {
		_ = cw.Write([]string{
			csvCell(t.FirstName), csvCell(t.LastName), csvCell(t.Email),
			csvCell(platformLabel(t.WantsIOS, t.WantsAndroid)),
			csvCell(appsLabel(t.AppBanzami, t.AppMerchant)),
			csvCell(t.DeviceModel), csvCell(t.OSVersion), csvCell(t.Country),
			csvCell(t.Source), csvCell(t.Status),
			csvCell(t.CreatedAt.UTC().Format(time.RFC3339)),
			csvCell(fmtTime(t.InvitedAt)), csvCell(fmtTime(t.ActivatedAt)), csvCell(fmtTime(t.RemovedAt)),
		})
	}
	cw.Flush()
}

func platformLabel(ios, android bool) string {
	switch {
	case ios && android:
		return "iOS + Android"
	case ios:
		return "iOS"
	case android:
		return "Android"
	default:
		return ""
	}
}

func appsLabel(banzami, merchant bool) string {
	var parts []string
	if banzami {
		parts = append(parts, "App Banzami")
	}
	if merchant {
		parts = append(parts, "App Comerciante")
	}
	return strings.Join(parts, " + ")
}

func fmtTime(t *time.Time) string {
	if t == nil {
		return ""
	}
	return t.UTC().Format(time.RFC3339)
}

// csvCell neutralises spreadsheet formula injection. A cell a spreadsheet would
// evaluate — one starting with = + - @, or a tab / carriage return that Excel
// treats as a formula lead — is prefixed with a single quote so the value is
// shown literally and never executed. The stored data is unchanged; only the
// exported representation is made inert. (A tester cannot set most of these
// fields to a formula anyway, but the name and device fields are free text from
// an unauthenticated form, so the export is hardened rather than trusted.)
func csvCell(s string) string {
	if s == "" {
		return s
	}
	switch s[0] {
	case '=', '+', '-', '@', '\t', '\r':
		return "'" + s
	}
	return s
}
