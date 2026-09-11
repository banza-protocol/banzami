package obs

import (
	"regexp"
	"strings"
)

// RedactPath is a request path as it may appear in a log.
//
// Some values in a path are bearer capabilities: whoever holds one can use it.
// A proof reference opens the proof (amount, both @handles); an API key opens
// the Project. A log line is copied, shipped and read by people who were never
// meant to hold either, so neither is ever written whole — on ANY route. The
// mask keys on the value, not the path: a 404 on a mistyped route (/V1/…,
// //v1/…) carries a reference exactly as the real route does.
//
//   - a proof reference — "bzm" in any case, and whatever follows it in the
//     segment — keeps its first 8 characters ("BZM-HPXT…");
//   - six hyphen-separated groups of four (a reference without its prefix)
//     keep the first group;
//   - a Banzami API key is replaced whole.
//
// The query string is dropped and the result capped, as before.
func RedactPath(p string) string {
	if i := strings.IndexByte(p, '?'); i >= 0 {
		p = p[:i]
	}
	p = apiKeyInPath.ReplaceAllString(p, "[REDACTED]")
	p = proofRefInPath.ReplaceAllStringFunc(p, keepPrefix(8))
	p = proofPayloadInPath.ReplaceAllStringFunc(p, keepPrefix(4))
	if len(p) > 512 {
		p = p[:512]
	}
	return p
}

var (
	apiKeyInPath       = regexp.MustCompile(`bz_(test|live)_(sk|pk)_[A-Za-z0-9_-]+`)
	proofRefInPath     = regexp.MustCompile(`(?i)bzm[^/]*`)
	proofPayloadInPath = regexp.MustCompile(`(?i)[0-9a-z%]{4}(?:-[0-9a-z%]{4}){5}[^/]*`)
)

func keepPrefix(n int) func(string) string {
	return func(s string) string {
		if len(s) <= n {
			return s + "…"
		}
		return s[:n] + "…"
	}
}
