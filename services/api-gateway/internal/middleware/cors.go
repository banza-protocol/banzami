package middleware

import "net/http"

func CORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if isAllowedOrigin(origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", allowedRequestHeaders)
			w.Header().Set("Access-Control-Max-Age", "86400")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// allowedRequestHeaders are the request headers a Banzami browser surface may
// send. Idempotency-Key is the one the Gateway actually reads (see
// idempotency.go); the public Business application sends it so a double click
// or a retried request returns the same application. It was missing here, so
// the browser's preflight refused every submission of the form.
const allowedRequestHeaders = "Authorization, Content-Type, Idempotency-Key, X-Idempotency-Key"

var allowedOrigins = map[string]bool{
	// Local development
	"http://localhost:3010": true,
	"http://localhost:3002": true,
	"http://localhost:3003": true,
	"http://localhost:3004": true,
	"http://localhost:3005": true, // website (banzami.com) dev server
	// Production — nginx handles admin/business; pay + the public website
	// (Business onboarding form) need app-level CORS.
	"https://pay.banzami.com": true,
	"https://banzami.com":     true,
	"https://www.banzami.com": true,
	// The Developer Console. It is the same Next app as banzami.com but a
	// different origin, and it was never added here when it moved to its own
	// host — so every Console page load failed its platform-mode call on CORS.
	"https://developers.banzami.com": true,
}

func isAllowedOrigin(origin string) bool {
	return allowedOrigins[origin]
}
