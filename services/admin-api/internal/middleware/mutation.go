package middleware

import (
	"net/http"

	chimiddleware "github.com/go-chi/chi/v5/middleware"
)

// AfterMutation calls fn once a mutating request (anything but GET, HEAD,
// OPTIONS) has been answered with a non-error status. Used to drop cached
// read models — the operator attention summary — that the mutation may have
// changed.
func AfterMutation(fn func()) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			switch r.Method {
			case http.MethodGet, http.MethodHead, http.MethodOptions:
				next.ServeHTTP(w, r)
				return
			}
			ww := chimiddleware.NewWrapResponseWriter(w, r.ProtoMajor)
			next.ServeHTTP(ww, r)
			status := ww.Status()
			if status == 0 {
				status = http.StatusOK
			}
			if status < 400 {
				fn()
			}
		})
	}
}
