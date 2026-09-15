package handler

import (
	"net/http/httptest"
	"strings"
	"testing"
)

// The export must never hand a spreadsheet a live formula. A name from the
// public form beginning with = + - @ (or a tab/CR lead) is neutralised with a
// leading quote; ordinary text is untouched. This is the BETA_EXPORT_CSV_
// FORMULA_INJECTION=0 guarantee.
func TestCSVCell_NeutralisesFormulaInjection(t *testing.T) {
	dangerous := []string{
		"=cmd|' /C calc'!A0",
		"+1+1",
		"-2+3",
		"@SUM(A1:A9)",
		"\t=1",
		"\r=2",
	}
	for _, in := range dangerous {
		got := csvCell(in)
		if !strings.HasPrefix(got, "'") {
			t.Fatalf("csvCell(%q) = %q, want a leading quote to defuse it", in, got)
		}
	}
	safe := []string{"María-José", "d'Almeida", "iPhone 15 Pro", "Luanda", "", "PENDING"}
	for _, in := range safe {
		if got := csvCell(in); got != in {
			t.Fatalf("csvCell(%q) = %q, want it unchanged", in, got)
		}
	}
}

func TestPlatformAndAppsLabels(t *testing.T) {
	if got := platformLabel(true, true); got != "iOS + Android" {
		t.Fatalf("platformLabel(true,true) = %q", got)
	}
	if got := platformLabel(false, true); got != "Android" {
		t.Fatalf("platformLabel(false,true) = %q", got)
	}
	if got := appsLabel(true, true); got != "App Banzami + App Comerciante" {
		t.Fatalf("appsLabel(true,true) = %q", got)
	}
	if got := appsLabel(false, true); got != "App Comerciante" {
		t.Fatalf("appsLabel(false,true) = %q", got)
	}
}

func TestFilterFromQuery_ValidatesEnums(t *testing.T) {
	bad := []string{"status=NONSENSE", "app=APP_X", "platform=WINDOWS"}
	for _, qs := range bad {
		r := httptest.NewRequest("GET", "/admin/v1/beta-testers?"+qs, nil)
		if _, verr := filterFromQuery(r); verr == "" {
			t.Fatalf("filterFromQuery(%q) accepted an invalid value", qs)
		}
	}
	r := httptest.NewRequest("GET", "/admin/v1/beta-testers?status=pending&app=app_banzami&platform=ios&q=ana&limit=25&offset=50", nil)
	f, verr := filterFromQuery(r)
	if verr != "" {
		t.Fatalf("filterFromQuery rejected a valid query: %s", verr)
	}
	if f.Status != "PENDING" || f.App != "APP_BANZAMI" || f.Platform != "IOS" || f.Search != "ana" || f.Limit != 25 || f.Offset != 50 {
		t.Fatalf("filterFromQuery parsed wrong: %+v", f)
	}
}

// With no database configured the surface is unavailable, not a panic: every
// route answers 503 through the nil-service guard.
func TestBetaAdmin_UnavailableWithoutService(t *testing.T) {
	h := NewBetaTesterAdminHandler(nil)
	for _, call := range []func(){
		func() {
			w := httptest.NewRecorder()
			h.List(w, httptest.NewRequest("GET", "/admin/v1/beta-testers", nil))
			if w.Code != 503 {
				t.Fatalf("List without svc = %d, want 503", w.Code)
			}
		},
		func() {
			w := httptest.NewRecorder()
			h.ExportCSV(w, httptest.NewRequest("GET", "/admin/v1/beta-testers/export.csv", nil))
			if w.Code != 503 {
				t.Fatalf("ExportCSV without svc = %d, want 503", w.Code)
			}
		},
	} {
		call()
	}
}
