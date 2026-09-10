package middleware

import (
	"bytes"
	"encoding/json"
	"mime"
	"net/http"
	"strconv"
)

// ownerIdentifierKeys are the fields that name the financial owner behind a
// Project. A Developer Platform key acts for its Project; which Business
// Account the operator bound that Project to is the operator's to know, not the
// integration's (ADR-057). Every resource a Project key can reach — payment
// sessions, refunds, webhook endpoints and events — carried the owner's id
// anyway, because each was first written for a merchant session, where the id
// is the caller's own.
var ownerIdentifierKeys = []string{"merchant_id"}

// RedactOwnerIdentifiers removes the owner's identifier from every JSON response
// served to a Developer Platform principal.
//
// One middleware on the dual-credential group rather than a field-by-field edit
// in each handler, because the defect was exactly that each handler had to
// remember: a resource added next month would have leaked it again. A merchant
// session is untouched — the id there is its own.
//
// Must be installed AFTER the authentication middleware, so the principal is in
// the request context it reads.
func RedactOwnerIdentifiers(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, isDev := GetDeveloperPrincipal(r.Context()); !isDev {
			next.ServeHTTP(w, r)
			return
		}
		buf := &bufferedResponse{header: w.Header(), status: http.StatusOK}
		next.ServeHTTP(buf, r)

		body := buf.body.Bytes()
		if isJSONContent(w.Header().Get("Content-Type")) && len(body) > 0 {
			if redacted, ok := redactOwnerIdentifiers(body); ok {
				body = redacted
				w.Header().Set("Content-Length", strconv.Itoa(len(body)))
			}
		}
		w.WriteHeader(buf.status)
		_, _ = w.Write(body)
	})
}

type bufferedResponse struct {
	header      http.Header
	body        bytes.Buffer
	status      int
	wroteHeader bool
}

func (b *bufferedResponse) Header() http.Header { return b.header }
func (b *bufferedResponse) Write(p []byte) (int, error) {
	if !b.wroteHeader {
		b.WriteHeader(http.StatusOK)
	}
	return b.body.Write(p)
}
func (b *bufferedResponse) WriteHeader(status int) {
	if b.wroteHeader {
		return
	}
	b.status, b.wroteHeader = status, true
}

func isJSONContent(ct string) bool {
	mt, _, err := mime.ParseMediaType(ct)
	return err == nil && (mt == "application/json" || mt == "application/problem+json")
}

// redactOwnerIdentifiers returns the body without any owner-identifier key, at
// any depth. ok is false when the body is not JSON or held nothing to remove,
// in which case the original bytes are sent unchanged.
func redactOwnerIdentifiers(body []byte) ([]byte, bool) {
	dec := json.NewDecoder(bytes.NewReader(body))
	dec.UseNumber() // amounts are integers in minor units; never round-trip them through float64
	var v any
	if err := dec.Decode(&v); err != nil {
		return nil, false
	}
	if !strip(v) {
		return nil, false
	}
	// Encoder, not Marshal: Marshal escapes <, > and & in strings, which would
	// change a description the payer wrote into \u003c… on the way out.
	var out bytes.Buffer
	enc := json.NewEncoder(&out)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(v); err != nil {
		return nil, false
	}
	return out.Bytes(), true
}

func strip(v any) bool {
	changed := false
	switch t := v.(type) {
	case map[string]any:
		for _, k := range ownerIdentifierKeys {
			if _, ok := t[k]; ok {
				delete(t, k)
				changed = true
			}
		}
		for _, child := range t {
			if strip(child) {
				changed = true
			}
		}
	case []any:
		for _, child := range t {
			if strip(child) {
				changed = true
			}
		}
	}
	return changed
}
