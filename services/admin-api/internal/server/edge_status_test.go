package server

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// Cloudflare replaces the body of a 502 or 504 with its own page, so BANZADMIN
// would show "error code: 502" instead of the operator message. No handler may
// choose those statuses, and the router must rewrite any forwarded one.
func TestEdge_NoHandlerChoosesAStatusTheEdgeReplaces(t *testing.T) {
	src, err := os.ReadFile("server.go")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(src), `r.Use(edgestatus.Middleware("/internal/"))`) {
		t.Fatal("server.go does not wire edgestatus.Middleware")
	}
	bad := regexp.MustCompile(`http\.Status(BadGateway|GatewayTimeout)\b`)
	files, _ := filepath.Glob("../handler/*.go")
	for _, f := range files {
		if strings.HasSuffix(f, "_test.go") {
			continue
		}
		b, _ := os.ReadFile(f)
		if loc := bad.FindIndex(b); loc != nil {
			t.Errorf("%s writes %s", f, b[loc[0]:loc[1]])
		}
	}
}
