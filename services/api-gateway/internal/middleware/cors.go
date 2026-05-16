package middleware

import "net/http"

func CORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if isAllowedOrigin(origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Idempotency-Key")
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
	// Local development
	"http://localhost:3010": true,
	"http://localhost:3002": true,
	"http://localhost:3003": true,
	"http://localhost:3004": true,
	// Production
	"https://pay.banzami.org":      true,
	"https://admin.banzami.org":    true,
	"https://business.banzami.org": true,
}

func isAllowedOrigin(origin string) bool {
	return allowedOrigins[origin]
}
