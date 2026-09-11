package handler

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"

	"github.com/banzami/banzami/services/public-api/internal/service"
)

// A6-08. Search returns handles only, and `%`/`_` are literal — `?q=%%` used to
// list the whole directory with names.
func TestConsumerSearch_HandlesOnlyAndWildcardsAreLiteral(t *testing.T) {
	var mu sync.Mutex
	var asked []string
	core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		asked = append(asked, r.URL.Query().Get("handle"))
		mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"handle":"ana_m","display_name":"Ana Maria Private","status":"ACTIVE"}]}`))
	}))
	defer core.Close()
	h := NewConsumerHandler(nil, service.NewCorePublicClient(core.URL))

	w := httptest.NewRecorder()
	h.Search(w, httptest.NewRequest(http.MethodGet, "/v1/consumers/search?q="+url.QueryEscape("%_"), nil))
	if strings.Contains(w.Body.String(), "Ana Maria Private") || !strings.Contains(w.Body.String(), `"handle":"ana_m"`) {
		t.Fatalf("search must return the handle only: %s", w.Body.String())
	}
	mu.Lock()
	defer mu.Unlock()
	if len(asked) != 1 || asked[0] != `\%\_` {
		t.Fatalf("the wildcards reached core unescaped: %q", asked)
	}
}
