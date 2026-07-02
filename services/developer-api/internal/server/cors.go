package server

import "net/http"

// cors returns credentialed CORS scoped to exactly one origin — the Developer
// Console (ADR-033). Never a wildcard; credentials are only ever allowed for the
// configured console origin. Requests from any other origin get no CORS headers.
func cors(consoleOrigin string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if origin != "" && origin == consoleOrigin {
				h := w.Header()
				h.Set("Access-Control-Allow-Origin", consoleOrigin)
				h.Add("Vary", "Origin")
				h.Set("Access-Control-Allow-Credentials", "true")
				h.Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
				h.Set("Access-Control-Allow-Headers", "Content-Type, X-CSRF-Token")
				h.Set("Access-Control-Max-Age", "600")
			}
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
