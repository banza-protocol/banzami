package auth

// The operator session as the browser holds it (A6-12, A5-08).
//
// The session is a signed JWT, as before, but it no longer reaches JavaScript.
// admin-api sets it as an HttpOnly cookie on the same origin the console is
// served from (admin.banzami.com; nginx routes /api/ to this service), so an
// injected script can use the session while the page is open but cannot read
// it, copy it, or keep it after the tab closes. It used to be a 12-hour bearer
// in localStorage.
//
// Three clocks bound a session:
//
//   idle      SessionIdleTimeout. Every request the operator makes re-issues
//             the cookie with a fresh expiry; thirty minutes without one and the
//             JWT's own exp has passed. Stateless: the expiry is in the signed
//             token and only this service can move it.
//   absolute  SessionAbsoluteLifetime from AuthTime, the moment both factors
//             were proven. Sliding never crosses it.
//   step-up   StepUpWindow. The highest-risk routes want SteppedUpAt within
//             the last five minutes: a fresh code from the authenticator.
//
// Cross-site request forgery. The cookies are SameSite=Strict, which a sibling
// subdomain of banzami.com does not count as cross-site — so SameSite alone
// would let a script on any other *.banzami.com host post to the console with
// the operator's cookie. Every state-changing request must therefore also carry
// X-CSRF-Token, whose value is an HMAC of the session's identity (operator,
// AuthTime, token_version) under the service key. The value is delivered in a
// second, readable __Host- cookie that only admin.banzami.com can read or set;
// the server does not compare it to that cookie but recomputes it from the
// session, so a planted cookie cannot fix a token either.

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const (
	// SessionIdleTimeout ends a session nobody has used for this long.
	SessionIdleTimeout = 30 * time.Minute
	// SessionAbsoluteLifetime ends a session this long after sign-in, used or not.
	SessionAbsoluteLifetime = 12 * time.Hour
	// StepUpWindow is how recent a second-factor proof must be for a
	// high-risk action.
	StepUpWindow = 5 * time.Minute

	// SessionCookieName carries the session JWT. HttpOnly.
	//
	// The __Host- prefix is enforced by the browser: the cookie must be Secure,
	// Path=/ and carry no Domain, so it is bound to exactly the host that set it
	// and no subdomain can set or overwrite it.
	SessionCookieName = "__Host-bzadm_session"
	// CSRFCookieName carries the CSRF token. Readable by the console's own
	// script, which echoes it in CSRFHeader.
	CSRFCookieName = "__Host-bzadm_csrf"
	// CSRFHeader is where a state-changing request presents the CSRF token.
	CSRFHeader = "X-CSRF-Token"
	// ActivityHeader lets the console mark a request as background work
	// ("passive"): the attention badges and the bell poll on a timer, and a
	// poll is not an operator using the console. A passive request is served
	// normally but does not extend the idle deadline.
	ActivityHeader  = "X-Banzadmin-Activity"
	ActivityPassive = "passive"
)

// ErrSessionOver is returned when a session has reached its absolute lifetime
// and cannot be re-issued.
var ErrSessionOver = errors.New("session reached its absolute lifetime")

// IssueSession signs a session token for p. AuthTime is set to now when the
// principal does not carry one (a fresh sign-in). The expiry is the idle
// deadline, capped at AuthTime + absolute.
func IssueSession(secret string, p Principal, now time.Time, absolute time.Duration) (string, time.Time, error) {
	if p.AuthTime.IsZero() {
		p.AuthTime = now
	}
	p.Purpose = PurposeSession
	exp := now.Add(SessionIdleTimeout)
	if hard := p.AuthTime.Add(absolute); hard.Before(exp) {
		exp = hard
	}
	if !exp.After(now) {
		return "", time.Time{}, ErrSessionOver
	}
	return Issue(secret, p, exp.Sub(now), now)
}

// CSRFToken is the token a state-changing request must present for session p.
// It changes whenever the session is re-established (a new sign-in moves
// AuthTime; revocation moves token_version), and not when it merely slides.
func CSRFToken(secret string, p Principal) string {
	m := hmac.New(sha256.New, []byte(secret))
	m.Write([]byte("banzadmin-csrf-v1|" + p.ID + "|" + strconv.FormatInt(unixOrZero(p.AuthTime), 10) + "|" + strconv.Itoa(p.TokenVersion)))
	return base64.RawURLEncoding.EncodeToString(m.Sum(nil))
}

// ValidCSRF reports whether presented is the CSRF token for session p, in
// constant time.
func ValidCSRF(secret string, p Principal, presented string) bool {
	if presented == "" || secret == "" {
		return false
	}
	return hmac.Equal([]byte(presented), []byte(CSRFToken(secret, p)))
}

// SetSessionCookies writes the session and CSRF cookies for a token that
// expires at exp. Any cookie of the same name already queued on this response
// is replaced, so a handler that re-issues after the middleware slid the
// session sends one value, not two.
func SetSessionCookies(w http.ResponseWriter, secret string, p Principal, token string, exp, now time.Time) {
	maxAge := int(exp.Sub(now).Seconds())
	if maxAge < 1 {
		maxAge = 1
	}
	replaceCookie(w, &http.Cookie{
		Name: SessionCookieName, Value: token, Path: "/", MaxAge: maxAge, Expires: exp,
		Secure: true, HttpOnly: true, SameSite: http.SameSiteStrictMode,
	})
	replaceCookie(w, &http.Cookie{
		Name: CSRFCookieName, Value: CSRFToken(secret, p), Path: "/", MaxAge: maxAge, Expires: exp,
		Secure: true, HttpOnly: false, SameSite: http.SameSiteStrictMode,
	})
}

// ClearSessionCookies tells the browser to drop both cookies. Any value queued
// earlier on this response is removed first.
func ClearSessionCookies(w http.ResponseWriter) {
	for _, name := range []string{SessionCookieName, CSRFCookieName} {
		replaceCookie(w, &http.Cookie{
			Name: name, Value: "", Path: "/", MaxAge: -1, Expires: time.Unix(0, 0),
			Secure: true, HttpOnly: name == SessionCookieName, SameSite: http.SameSiteStrictMode,
		})
	}
}

func replaceCookie(w http.ResponseWriter, c *http.Cookie) {
	h := w.Header()
	prefix := c.Name + "="
	var kept []string
	for _, v := range h.Values("Set-Cookie") {
		if !strings.HasPrefix(v, prefix) {
			kept = append(kept, v)
		}
	}
	h.Del("Set-Cookie")
	for _, v := range kept {
		h.Add("Set-Cookie", v)
	}
	if s := c.String(); s != "" {
		h.Add("Set-Cookie", s)
	}
}
