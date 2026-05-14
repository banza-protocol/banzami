package middleware

import "net/http"

// CORS sets permissive cross-origin headers for local development and same-origin
// production deployments. Allowed origins are restricted to localhost app ports.
func CORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if isAllowedOrigin(origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Admin-Key")
			w.Header().Set("Access-Control-Max-Age", "86400")
		}

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

var allowedOrigins = map[string]bool{
	"http://localhost:3002": true, // admin-app
	"http://localhost:3010": true, // dashboard
	"http://localhost:3003": true, // pay
}

func isAllowedOrigin(origin string) bool {
	return allowedOrigins[origin]
}
