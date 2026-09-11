// Package corepath guards the one invariant every service-to-service path
// keeps: one path, one query, each query key once, no dot segment, no fragment.
//
// Call sites build these paths by concatenation, and a path parameter reaches
// them already decoded by the router. An id written "<victim>%3Fmerchant_id=…"
// arrives with a literal '?', and pasted in front of the caller's own query it
// moves the caller's scope out of the value the callee reads (A3-01: another
// tenant's refund, read through the gateway). Call sites escape what they
// paste; this refuses anything that would still change the request's shape, so
// a site that forgets fails closed instead of answering for someone else.
package corepath

import (
	"net/url"
	"strings"
)

// WellFormed reports whether path (with its query) has the shape a caller that
// escaped every value would produce.
func WellFormed(path string) bool {
	if strings.ContainsAny(path, "#\x00\r\n\t ") || strings.Count(path, "?") > 1 {
		return false
	}
	p, q, _ := strings.Cut(path, "?")
	for _, seg := range strings.Split(p, "/") {
		if seg == "." || seg == ".." {
			return false
		}
		if u, err := url.PathUnescape(seg); err != nil || u == "." || u == ".." {
			return false
		}
	}
	if q == "" {
		return true
	}
	seen := map[string]bool{}
	for _, pair := range strings.Split(q, "&") {
		k, _, _ := strings.Cut(pair, "=")
		key, err := url.QueryUnescape(k)
		if err != nil || seen[key] {
			return false
		}
		seen[key] = true
	}
	return true
}
