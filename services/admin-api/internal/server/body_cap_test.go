package server

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

// Every route sits behind one request-body ceiling. Some handlers decode r.Body
// with no bound of their own; without the ceiling one of them is how a client
// makes this service buffer an arbitrarily large body.
func TestRequestBodyIsCapped(t *testing.T) {
	var readErr error
	h := bodyCap()(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, readErr = io.ReadAll(r.Body)
	}))

	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(make([]byte, maxRequestBody))))
	if readErr != nil {
		t.Fatalf("a body at the ceiling must be readable: %v", readErr)
	}
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(make([]byte, maxRequestBody+1))))
	if readErr == nil {
		t.Fatal("a body over the ceiling was read in full")
	}

	// And the router actually installs it, before any route is mounted.
	src, err := os.ReadFile("server.go")
	if err != nil {
		t.Fatal(err)
	}
	use := strings.Index(string(src), "r.Use(bodyCap())")
	firstRoute := strings.Index(string(src), "r.Get(")
	if use < 0 || firstRoute < 0 || use > firstRoute {
		t.Fatal("server.go must install bodyCap() before mounting routes")
	}
}
