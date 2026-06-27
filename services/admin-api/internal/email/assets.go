package email

import (
	"embed"
	"net/http"
	"strings"
)

// Email icon assets. Gmail strips inline SVG, so the badge/notice/hero icons are
// served as hosted PNGs (transparent, brand colors) generated from the handoff's
// icon paths. They are embedded in the binary and served by AssetsHandler.
//
//go:embed assets/*.png
var assetsFS embed.FS

// AssetsHandler serves the embedded email icon PNGs at /email-assets/<file>.png.
// Public, read-only, long-cacheable — contains no data, no secrets.
func AssetsHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		name := strings.TrimPrefix(r.URL.Path, "/email-assets/")
		if name == "" || strings.Contains(name, "/") || !strings.HasSuffix(name, ".png") {
			http.NotFound(w, r)
			return
		}
		b, err := assetsFS.ReadFile("assets/" + name)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "image/png")
		w.Header().Set("Cache-Control", "public, max-age=604800, immutable")
		_, _ = w.Write(b)
	})
}
