package obs

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCorrelation_GeneratesWhenAbsent(t *testing.T) {
	var gotCID, gotRID string
	h := Correlation(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotCID, gotRID = CorrelationID(r.Context()), RequestID(r.Context())
	}))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/", nil))
	if gotCID == "" || gotRID == "" {
		t.Fatal("correlation_id and request_id must be generated when absent")
	}
	if rec.Header().Get(HeaderCorrelationID) != gotCID {
		t.Fatal("response must echo the correlation id header")
	}
}

func TestCorrelation_PreservesIncoming(t *testing.T) {
	var gotCID, gotRID string
	h := Correlation(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotCID, gotRID = CorrelationID(r.Context()), RequestID(r.Context())
	}))
	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set(HeaderCorrelationID, "flow-123")
	req.Header.Set(HeaderRequestID, "upstream-req-999")
	h.ServeHTTP(httptest.NewRecorder(), req)
	if gotCID != "flow-123" {
		t.Fatalf("correlation id must be preserved, got %q", gotCID)
	}
	if gotRID == "upstream-req-999" || gotRID == "" {
		t.Fatalf("request id must be fresh per service, got %q", gotRID)
	}
}

func TestContextHandler_InjectsIdsAndNoSecrets(t *testing.T) {
	var buf bytes.Buffer
	logger := slog.New(NewContextHandler(slog.NewJSONHandler(&buf, nil)))
	ctx := context.WithValue(context.WithValue(context.Background(), correlationKey, "flow-abc"), requestKey, "req-xyz")

	logger.InfoContext(ctx, "merchant.application.submitted", "application_id", "app-1")

	var rec map[string]any
	if err := json.Unmarshal(buf.Bytes(), &rec); err != nil {
		t.Fatalf("log not json: %v", err)
	}
	if rec["correlation_id"] != "flow-abc" || rec["request_id"] != "req-xyz" {
		t.Fatalf("log missing flow ids: %+v", rec)
	}
	// The handler must add ONLY the two ids — no token/secret/storage_key keys.
	for _, forbidden := range []string{"token", "secret", "signed_url", "storage_key", "authorization", "pin"} {
		if _, ok := rec[forbidden]; ok {
			t.Fatalf("handler leaked %q", forbidden)
		}
	}
}

func TestPropagationTransport_CopiesCorrelation(t *testing.T) {
	var seen string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen = r.Header.Get(HeaderCorrelationID)
	}))
	defer srv.Close()

	client := &http.Client{Transport: NewPropagationTransport(nil)}
	ctx := context.WithValue(context.Background(), correlationKey, "flow-prop")
	req, _ := http.NewRequestWithContext(ctx, "GET", srv.URL, nil)
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	resp.Body.Close()
	if seen != "flow-prop" {
		t.Fatalf("downstream did not receive the correlation id, got %q", seen)
	}
}

func TestPropagationTransport_NoCorrelationNoHeader(t *testing.T) {
	var present string = "unset"
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		present = r.Header.Get(HeaderCorrelationID)
	}))
	defer srv.Close()
	client := &http.Client{Transport: NewPropagationTransport(nil)}
	req, _ := http.NewRequest("GET", srv.URL, nil) // no correlation in context
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	resp.Body.Close()
	if strings.TrimSpace(present) != "" {
		t.Fatalf("must not set a correlation header when none in context, got %q", present)
	}
}
