package middleware

import (
	"bytes"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// A public proof reference is a bearer capability; the access log keeps a
// prefix of it and never the whole.
func TestLoggerDoesNotWriteTheFullProofReference(t *testing.T) {
	const ref = "BZM-AMFY-ADZ2-32E5-QDWV-K4EC-NTRE"
	var buf bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&buf, nil)))
	defer slog.SetDefault(prev)

	h := Logger(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusOK) }))
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/v1/public/proofs/"+ref, nil))

	out := buf.String()
	if strings.Contains(out, ref) || strings.Contains(out, "32E5-QDWV") {
		t.Fatalf("the full reference reached the log: %s", out)
	}
	if !strings.Contains(out, "/v1/public/proofs/BZM-AMFY") {
		t.Fatalf("the log lost the route entirely: %s", out)
	}
}

func TestLoggedPathLeavesOtherRoutesAlone(t *testing.T) {
	for _, p := range []string{"/v1/wallets", "/v1/merchant/auth/token", "/v1/public/proofs/"} {
		if got := LoggedPath(p); got != p {
			t.Fatalf("LoggedPath(%q) = %q", p, got)
		}
	}
}
