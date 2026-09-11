package middleware

import "net/http"

// CORS sets cross-origin headers for local development only. In a deployment
// the console calls this service on its own origin (admin.banzami.com/api), so
// no CORS header is needed or sent. Allowed origins are restricted to localhost
// app ports.
//
// Credentials are allowed for those origins because the operator session is a
// cookie (A6-12): `next dev` on :3002 calling this service on :8082 is a
// cross-origin, same-site request, and a browser only attaches the cookie — and
// only lets the page read the answer — when the response allows credentials.
// It grants nothing to anyone else: the cookies are SameSite=Strict and
// host-only, so a localhost page never carries admin.banzami.com's session.
func CORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if isAllowedOrigin(origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, Idempotency-Key, X-Admin-Key, X-CSRF-Token, X-Banzadmin-Activity")
			w.Header().Set("Access-Control-Max-Age", "86400")
			w.Header().Add("Vary", "Origin")
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
