package service

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// Core's axum JSON extractor refuses a body with no content type (415). The
// first deployed PUT /v1/sandbox/external-rail got exactly that, because the
// request was built by hand; this pins the header and the path.
func TestSetSandboxExternalRail_SendsJSONToCoresPath(t *testing.T) {
	var gotCT, gotPath, gotMethod, gotBody string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotCT, gotPath, gotMethod = r.Header.Get("Content-Type"), r.URL.Path, r.Method
		b, _ := io.ReadAll(r.Body)
		gotBody = string(b)
		if !strings.HasPrefix(gotCT, "application/json") {
			w.WriteHeader(http.StatusUnsupportedMediaType)
			return
		}
		_, _ = w.Write([]byte(`{"state":"UNAVAILABLE","simulated":true}`))
	}))
	defer srv.Close()
	c := NewCoreApiClient(srv.URL, "k")
	got, err := c.SetSandboxExternalRail(context.Background(), "9d1c0b7a-0000-4000-8000-00000000000a", "3f2a6c1e-0000-4000-8000-000000000001", "UNAVAILABLE")
	if err != nil || got.State != "UNAVAILABLE" {
		t.Fatalf("set rail: %v %+v (content-type %q)", err, got, gotCT)
	}
	if gotMethod != http.MethodPut || gotPath != "/internal/v1/sandbox/projects/9d1c0b7a-0000-4000-8000-00000000000a/external-rail/3f2a6c1e-0000-4000-8000-000000000001" || !strings.Contains(gotBody, `"UNAVAILABLE"`) {
		t.Fatalf("request: %s %s %s", gotMethod, gotPath, gotBody)
	}
}
