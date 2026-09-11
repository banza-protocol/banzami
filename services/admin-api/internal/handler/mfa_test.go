package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/banzami/banzami/services/admin-api/internal/auth"
	"github.com/banzami/banzami/services/admin-api/internal/service"
)

// A password alone must never open the operator console.
//
// Everything BANZADMIN can do — approve KYB, price a customer, suspend a
// business — is done in the operator's name, and a password is one reusable
// secret that leaves a copy wherever it is typed. These are the behaviours that
// make the second factor a control rather than a screen.

const testSecret = "test-jwt-secret-for-the-mfa-handler-tests"

type fakeMFA struct {
	enrolled     bool
	acceptCode   string
	verifies     int
	confirms     int
	resetCalls   int
	replacements int
	regenerated  int
	seeds        []string
	reauths      int
}

func (f *fakeMFA) Status(context.Context, string) (service.MFAStatus, error) {
	return service.MFAStatus{Enrolled: f.enrolled}, nil
}
func (f *fakeMFA) BeginEnrolment(_ context.Context, _, email string) (string, string, error) {
	// A different seed every time, so a test can tell a fresh one from a reused
	// one — which is the whole of "the exposed seed must not come back".
	seed := "SEED" + itoa(len(f.seeds)) + "AAAAAAAAAAAAAAAAAAAAAAAAAAAA"
	f.seeds = append(f.seeds, seed)
	return seed, auth.TOTPProvisioningURI(seed, email, "BANZADMIN"), nil
}
func (f *fakeMFA) BeginReplacement(ctx context.Context, id, email string) (string, string, error) {
	f.replacements++
	// The confirmed factor keeps guarding until the new one proves a code
	// (the real service keeps it; see TestMFAReplacement_* in the service).
	return f.BeginEnrolment(ctx, id, email)
}
func (f *fakeMFA) VerifyForReauthentication(_ context.Context, _, code string) error {
	f.reauths++
	if code != f.acceptCode {
		return service.ErrMFACodeRejected
	}
	return nil
}
func (f *fakeMFA) ConfirmEnrolment(_ context.Context, _, code string) ([]string, error) {
	f.confirms++
	if code != f.acceptCode {
		return nil, service.ErrMFACodeRejected
	}
	f.enrolled = true
	return []string{"aaaaa-bbbbb", "ccccc-ddddd"}, nil
}
func (f *fakeMFA) Verify(_ context.Context, _, code string) error {
	f.verifies++
	if code != f.acceptCode {
		return service.ErrMFACodeRejected
	}
	// One-time in both flavours: whatever was accepted is now spent.
	f.acceptCode = "\x00consumed"
	return nil
}
func (f *fakeMFA) Reset(context.Context, string) error { f.resetCalls++; return nil }
func (f *fakeMFA) RegenerateRecoveryCodes(context.Context, string) ([]string, error) {
	f.regenerated++
	return []string{"eeeee-fffff", "ggggg-hhhhh"}, nil
}

type fakeLogins struct {
	user service.AdminUser
	// "FROM→TO" for each lifecycle transition, so a test can assert the state
	// actually moved rather than that a response was 200.
	transitions []string
}

func (f *fakeLogins) AdvanceLifecycle(_ context.Context, id, from, to string) error {
	if f.user.ID == id && f.user.Status == from {
		f.user.Status = to
		f.transitions = append(f.transitions, from+"\u2192"+to)
		return nil
	}
	return service.ErrLifecycleNotApplicable
}

func (f *fakeLogins) GetByEmail(context.Context, string) (service.AdminUser, error) {
	return f.user, nil
}
func (f *fakeLogins) GetByID(context.Context, string) (service.AdminUser, error) { return f.user, nil }
func (f *fakeLogins) RecordLoginAttempt(context.Context, string, *string, string, string, bool, string) {
}
func (f *fakeLogins) RecordFailedLogin(context.Context, string) (*time.Time, error) { return nil, nil }
func (f *fakeLogins) ResetLoginCountersAndTouch(context.Context, string)            {}
func (f *fakeLogins) BumpTokenVersion(context.Context, string) error                { return nil }
func (f *fakeLogins) UpdatePassword(context.Context, string, string) error          { return nil }

func mfaFixture(t *testing.T, enrolled bool) (*MFAHandler, *fakeMFA, service.AdminUser) {
	t.Helper()
	u := service.AdminUser{ID: "op-1", Email: "fidel.monteiro@banzami.com", FullName: "Fidel Monteiro", Role: "SUPER_ADMIN", Status: "ACTIVE", TokenVersion: 3}
	f := &fakeMFA{enrolled: enrolled, acceptCode: "123456"}
	return NewMFAHandler(f, &fakeLogins{user: u}, testSecret, time.Hour), f, u
}

func tokenFor(t *testing.T, u service.AdminUser, purpose string) string {
	t.Helper()
	p := auth.Principal{ID: u.ID, Email: u.Email, FullName: u.FullName, Role: u.Role, TokenVersion: u.TokenVersion, Purpose: purpose}
	tok, _, err := auth.Issue(testSecret, p, time.Hour, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	return tok
}

func post(h http.HandlerFunc, tok, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/x", strings.NewReader(body))
	if tok != "" {
		req.Header.Set("Authorization", "Bearer "+tok)
	}
	w := httptest.NewRecorder()
	h(w, req)
	return w
}

func TestMFA_ChallengeTokenCannotBeUsedToEnrol(t *testing.T) {
	h, _, u := mfaFixture(t, true)
	// A challenge token says "this password was right". It must not also mean
	// "replace the factor guarding this account" — that is the whole attack.
	w := post(h.Enrol, tokenFor(t, u, auth.PurposeMFAChallenge), "")
	if w.Code != http.StatusForbidden || !strings.Contains(w.Body.String(), "WRONG_TOKEN_PURPOSE") {
		t.Fatalf("a challenge token enrolled a factor: %d %s", w.Code, w.Body.String())
	}
}

func TestMFA_EnrolmentTokenCannotBeUsedToVerify(t *testing.T) {
	h, _, u := mfaFixture(t, false)
	w := post(h.Verify, tokenFor(t, u, auth.PurposeMFAEnroll), `{"code":"123456"}`)
	if w.Code != http.StatusForbidden {
		t.Fatalf("an enrolment token completed a challenge: %d", w.Code)
	}
}

func TestMFA_ASessionTokenIsNotAChallenge(t *testing.T) {
	h, _, u := mfaFixture(t, true)
	// Belt and braces: a full session must not be replayable into the MFA
	// endpoints either, or a stolen session could quietly re-enrol a factor.
	if w := post(h.Enrol, tokenFor(t, u, auth.PurposeSession), ""); w.Code != http.StatusForbidden {
		t.Fatalf("a session token enrolled a factor: %d", w.Code)
	}
	if w := post(h.Verify, tokenFor(t, u, auth.PurposeSession), `{"code":"123456"}`); w.Code != http.StatusForbidden {
		t.Fatalf("a session token completed a challenge: %d", w.Code)
	}
}

func TestMFA_ValidCodeIssuesASessionAndAWrongOneDoesNot(t *testing.T) {
	h, _, u := mfaFixture(t, true)

	bad := post(h.Verify, tokenFor(t, u, auth.PurposeMFAChallenge), `{"code":"999999"}`)
	if bad.Code != http.StatusUnauthorized {
		t.Fatalf("a wrong code was accepted: %d", bad.Code)
	}
	if strings.Contains(bad.Body.String(), "token") {
		t.Fatalf("a rejected code returned a token: %s", bad.Body.String())
	}

	ok := post(h.Verify, tokenFor(t, u, auth.PurposeMFAChallenge), `{"code":"123456"}`)
	if ok.Code != http.StatusOK {
		t.Fatalf("a valid code did not produce a session: %d %s", ok.Code, ok.Body.String())
	}
	var out struct {
		Token string `json:"token"`
	}
	_ = json.Unmarshal(ok.Body.Bytes(), &out)
	p, err := auth.Parse(testSecret, out.Token)
	if err != nil {
		t.Fatalf("the issued token does not parse: %v", err)
	}
	// The thing that matters: what comes out of a completed challenge IS a
	// session, and what went in was not.
	if p.Purpose != auth.PurposeSession {
		t.Fatalf("MFA issued a %q token, not a session", p.Purpose)
	}
}

func TestMFA_AConsumedCodeIsRefusedOnReuse(t *testing.T) {
	h, f, u := mfaFixture(t, true)
	if w := post(h.Verify, tokenFor(t, u, auth.PurposeMFAChallenge), `{"code":"123456"}`); w.Code != http.StatusOK {
		t.Fatalf("first use failed: %d", w.Code)
	}
	// Replay: the same code, the same window. A one-time code accepted twice is
	// not one-time — this is the TOTP replay and the recovery-code reuse in the
	// same shape.
	if w := post(h.Verify, tokenFor(t, u, auth.PurposeMFAChallenge), `{"code":"123456"}`); w.Code != http.StatusUnauthorized {
		t.Fatalf("a consumed code was accepted again: %d", w.Code)
	}
	if f.verifies != 2 {
		t.Fatalf("the second attempt did not reach the service (%d calls)", f.verifies)
	}
}

func TestMFA_EnrolmentRevealsTheRecoveryCodesExactlyOnceAndThenASession(t *testing.T) {
	h, _, u := mfaFixture(t, false)
	w := post(h.ConfirmEnrol, tokenFor(t, u, auth.PurposeMFAEnroll), `{"code":"123456"}`)
	if w.Code != http.StatusOK {
		t.Fatalf("confirmation failed: %d %s", w.Code, w.Body.String())
	}
	var out struct {
		Token            string   `json:"token"`
		AcknowledgeToken string   `json:"acknowledge_token"`
		RecoveryCodes    []string `json:"recovery_codes"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &out)
	if len(out.RecoveryCodes) == 0 {
		t.Fatal("enrolment issued no recovery codes")
	}
	// Confirming the factor must NOT hand back a session. The codes are on
	// screen exactly once; a session here lets the operator navigate away with
	// the only copy still showing.
	if out.Token != "" {
		t.Fatal("confirmation returned a session before the codes were acknowledged")
	}
	if out.AcknowledgeToken == "" {
		t.Fatal("confirmation issued no acknowledgement step")
	}
	ackP, err := auth.Parse(testSecret, out.AcknowledgeToken)
	if err != nil || ackP.Purpose != auth.PurposeMFAAck {
		t.Fatalf("confirmation issued a %q token, want an acknowledgement token", ackP.Purpose)
	}

	// And the acknowledgement completes the login.
	done := post(h.AcknowledgeRecovery, out.AcknowledgeToken, "")
	if done.Code != http.StatusOK {
		t.Fatalf("acknowledgement failed: %d %s", done.Code, done.Body.String())
	}
	var fin struct {
		Token         string   `json:"token"`
		RecoveryCodes []string `json:"recovery_codes"`
	}
	_ = json.Unmarshal(done.Body.Bytes(), &fin)
	sess, _ := auth.Parse(testSecret, fin.Token)
	if sess.Purpose != auth.PurposeSession {
		t.Fatalf("acknowledgement issued a %q token", sess.Purpose)
	}
	// The codes are hashed by now — nothing can show them again, including this.
	if len(fin.RecoveryCodes) != 0 {
		t.Fatal("the acknowledgement response repeated the recovery codes")
	}
}

func TestMFA_TheAcknowledgementTokenCanDoNothingElse(t *testing.T) {
	h, _, u := mfaFixture(t, true)
	ackTok := tokenFor(t, u, auth.PurposeMFAAck)

	// It exists for one click. It must not enrol, verify, or pass the session
	// middleware — otherwise "I saved the codes" would be a login.
	if w := post(h.Enrol, ackTok, ""); w.Code != http.StatusForbidden {
		t.Fatalf("an acknowledgement token enrolled a factor: %d", w.Code)
	}
	if w := post(h.Verify, ackTok, `{"code":"123456"}`); w.Code != http.StatusForbidden {
		t.Fatalf("an acknowledgement token completed a challenge: %d", w.Code)
	}
}

func TestMFA_RecoveryCodesAreManyAndSingleUseShaped(t *testing.T) {
	h, _, u := mfaFixture(t, false)
	w := post(h.ConfirmEnrol, tokenFor(t, u, auth.PurposeMFAEnroll), `{"code":"123456"}`)
	var out struct {
		RecoveryCodes []string `json:"recovery_codes"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &out)
	// Several codes, not one reusable master key: losing an authenticator is
	// not the only thing that happens, and one code is one chance.
	if len(out.RecoveryCodes) < 2 {
		t.Fatalf("only %d recovery code(s) issued", len(out.RecoveryCodes))
	}
	seen := map[string]bool{}
	for _, c := range out.RecoveryCodes {
		if seen[c] {
			t.Fatal("a recovery code was issued twice")
		}
		seen[c] = true
	}
}

func TestMFA_UnconfiguredDeploymentRefusesRatherThanPanicking(t *testing.T) {
	h := NewMFAHandler(nil, nil, testSecret, time.Hour)
	for _, f := range []http.HandlerFunc{h.Enrol, h.ConfirmEnrol, h.Verify} {
		if w := post(f, "", ""); w.Code != http.StatusServiceUnavailable {
			t.Fatalf("an unconfigured deployment answered %d", w.Code)
		}
	}
}

// Login must never hand back a session when a second factor exists.
//
// This is the property the whole design rests on: the password step produces a
// CHALLENGE, and only the second step produces a session. Without it every
// other control here is decoration.
func TestLogin_WithAFactorReturnsAChallengeNotASession(t *testing.T) {
	u := service.AdminUser{
		ID: "op-1", Email: "fidel.monteiro@banzami.com", FullName: "Fidel Monteiro",
		Role: "SUPER_ADMIN", Status: "ACTIVE", TokenVersion: 3,
		PasswordHash: mustHash(t, "correct horse battery staple"),
	}
	gate := &fakeMFA{enrolled: true, acceptCode: "123456"}
	h := NewAuthHandler(&fakeLogins{user: u}, testSecret, time.Hour).WithMFA(gate)

	w := post(h.Login, "", `{"email":"fidel.monteiro@banzami.com","password":"correct horse battery staple"}`)
	if w.Code != http.StatusOK {
		t.Fatalf("login failed: %d %s", w.Code, w.Body.String())
	}
	var out struct {
		MFARequired    bool   `json:"mfa_required"`
		ChallengeToken string `json:"challenge_token"`
		Token          string `json:"token"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &out)

	if out.Token != "" {
		t.Fatalf("login returned a session token despite a confirmed factor")
	}
	if !out.MFARequired || out.ChallengeToken == "" {
		t.Fatalf("login did not issue a challenge: %s", w.Body.String())
	}
	p, err := auth.Parse(testSecret, out.ChallengeToken)
	if err != nil {
		t.Fatalf("the challenge does not parse: %v", err)
	}
	if p.Purpose != auth.PurposeMFAChallenge {
		t.Fatalf("login issued a %q token, want a challenge", p.Purpose)
	}
}

// An operator with no factor gets exactly one thing: the ability to enrol one.
func TestLogin_WithoutAFactorReturnsAnEnrolmentTokenNotASession(t *testing.T) {
	u := service.AdminUser{
		ID: "op-2", Email: "fidel.monteiro@banzami.com", Role: "SUPER_ADMIN", Status: "ACTIVE", TokenVersion: 1,
		PasswordHash: mustHash(t, "another correct password"),
	}
	h := NewAuthHandler(&fakeLogins{user: u}, testSecret, time.Hour).WithMFA(&fakeMFA{enrolled: false})

	w := post(h.Login, "", `{"email":"fidel.monteiro@banzami.com","password":"another correct password"}`)
	var out struct {
		ChallengeToken string `json:"challenge_token"`
		Token          string `json:"token"`
		Next           string `json:"next"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &out)
	if out.Token != "" {
		t.Fatal("an operator with no second factor was given a session")
	}
	p, _ := auth.Parse(testSecret, out.ChallengeToken)
	if p.Purpose != auth.PurposeMFAEnroll {
		t.Fatalf("login issued a %q token, want an enrolment token", p.Purpose)
	}
	if out.Next != "MFA_ENROLMENT_REQUIRED" {
		t.Fatalf("login did not say what to do next: %q", out.Next)
	}
}

func mustHash(t *testing.T, pw string) string {
	t.Helper()
	h, err := auth.HashPassword(pw)
	if err != nil {
		t.Fatal(err)
	}
	return h
}

// ── Re-authentication: a session is not enough to change what guards the account

func sessionReq(t *testing.T, u service.AdminUser, body string) *http.Request {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/x", strings.NewReader(body))
	return req.WithContext(auth.WithPrincipal(req.Context(), auth.Principal{
		ID: u.ID, Email: u.Email, FullName: u.FullName, Role: u.Role, TokenVersion: u.TokenVersion, Purpose: auth.PurposeSession,
	}))
}

func reauthFixture(t *testing.T) (*MFAHandler, *fakeMFA, service.AdminUser) {
	t.Helper()
	u := service.AdminUser{
		ID: "op-1", Email: "fidel.monteiro@banzami.com", FullName: "Fidel Monteiro",
		Role: "SUPER_ADMIN", Status: "ACTIVE", TokenVersion: 3,
		PasswordHash: mustHash(t, "the real password"),
	}
	f := &fakeMFA{enrolled: true, acceptCode: "123456"}
	return NewMFAHandler(f, &fakeLogins{user: u}, testSecret, time.Hour), f, u
}

func TestMFA_RegeneratingRecoveryCodesNeedsMoreThanASession(t *testing.T) {
	h, f, u := reauthFixture(t)

	// A session is what someone has who walked past an unlocked laptop.
	// Regenerating invalidates every code the operator holds, so it must not be
	// reachable from that position.
	w := httptest.NewRecorder()
	h.RegenerateRecoveryCodes(w, sessionReq(t, u, `{}`))
	if w.Code != http.StatusBadRequest {
		t.Fatalf("regeneration without re-authentication returned %d", w.Code)
	}
	if f.regenerated != 0 {
		t.Fatal("codes were regenerated without re-authentication")
	}

	w = httptest.NewRecorder()
	h.RegenerateRecoveryCodes(w, sessionReq(t, u, `{"password":"wrong","code":"123456"}`))
	if w.Code != http.StatusUnauthorized || f.regenerated != 0 {
		t.Fatalf("a wrong password regenerated codes (%d)", w.Code)
	}

	w = httptest.NewRecorder()
	h.RegenerateRecoveryCodes(w, sessionReq(t, u, `{"password":"the real password","code":"000000"}`))
	if w.Code != http.StatusUnauthorized || f.regenerated != 0 {
		t.Fatalf("a wrong second factor regenerated codes (%d)", w.Code)
	}

	w = httptest.NewRecorder()
	h.RegenerateRecoveryCodes(w, sessionReq(t, u, `{"password":"the real password","code":"123456"}`))
	if w.Code != http.StatusOK || f.regenerated != 1 {
		t.Fatalf("correct re-authentication did not regenerate: %d %s", w.Code, w.Body.String())
	}
	var out struct {
		RecoveryCodes []string `json:"recovery_codes"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &out)
	if len(out.RecoveryCodes) < 2 {
		t.Fatalf("regeneration returned %d codes", len(out.RecoveryCodes))
	}
}

func TestMFA_ReplacementNeedsReauthenticationAndIssuesAFreshSeed(t *testing.T) {
	h, f, u := reauthFixture(t)

	w := httptest.NewRecorder()
	h.Replace(w, sessionReq(t, u, `{"password":"wrong","code":"123456"}`))
	if w.Code != http.StatusUnauthorized || f.replacements != 0 {
		t.Fatalf("a wrong password started a replacement (%d)", w.Code)
	}

	w = httptest.NewRecorder()
	h.Replace(w, sessionReq(t, u, `{"password":"the real password","code":"123456"}`))
	if w.Code != http.StatusOK {
		t.Fatalf("replacement refused after correct re-authentication: %d %s", w.Code, w.Body.String())
	}
	var out struct {
		Secret         string `json:"secret"`
		OtpauthURI     string `json:"otpauth_uri"`
		EnrolmentToken string `json:"enrolment_token"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &out)

	// A genuinely new seed, not the old one handed back.
	if len(f.seeds) < 1 || out.Secret == "" {
		t.Fatal("replacement issued no seed")
	}
	if out.Secret != f.seeds[len(f.seeds)-1] {
		t.Fatal("replacement did not return the seed it just minted")
	}
	// The manual key and the QR must describe the same secret — otherwise one of
	// the two enrolment paths silently produces an authenticator that never works.
	if !strings.Contains(out.OtpauthURI, "secret="+out.Secret) {
		t.Fatalf("the otpauth URI does not carry the same seed as the manual key: %s", out.OtpauthURI)
	}
	// And what comes back is an ENROLMENT step, not a session.
	p, err := auth.Parse(testSecret, out.EnrolmentToken)
	if err != nil || p.Purpose != auth.PurposeMFAEnroll {
		t.Fatalf("replacement issued a %q token", p.Purpose)
	}
}

func TestMFA_ReplacementNeverLeavesASuperAdminWithoutAFactor(t *testing.T) {
	h, f, u := reauthFixture(t)
	w := httptest.NewRecorder()
	h.Replace(w, sessionReq(t, u, `{"password":"the real password","code":"123456"}`))
	if w.Code != http.StatusOK {
		t.Fatalf("replacement failed: %d", w.Code)
	}
	// Mid-replacement the old factor still guards the account: a password alone
	// is answered with a CHALLENGE for that factor — not an enrolment token,
	// which is what used to lead, three calls later, to a session (A5-01).
	st, _ := f.Status(context.Background(), u.ID)
	if !st.Enrolled {
		t.Fatal("starting a replacement dropped the confirmed factor")
	}
	login := NewAuthHandler(&fakeLogins{user: u}, testSecret, time.Hour).WithMFA(f)
	lw := post(login.Login, "", `{"email":"fidel.monteiro@banzami.com","password":"the real password"}`)
	var out struct {
		Token          string `json:"token"`
		ChallengeToken string `json:"challenge_token"`
	}
	_ = json.Unmarshal(lw.Body.Bytes(), &out)
	if out.Token != "" {
		t.Fatal("mid-replacement, a password alone produced a session")
	}
	p, _ := auth.Parse(testSecret, out.ChallengeToken)
	if p.Purpose != auth.PurposeMFAChallenge {
		t.Fatalf("mid-replacement login issued a %q token, want a challenge", p.Purpose)
	}
}

// Five wrong answers — password or code — lock the account, and the lock
// covers the second step. When it engages, every token the account holds dies.
func TestMFA_WrongCodesLockTheAccountAndEndItsTokens(t *testing.T) {
	u := service.AdminUser{ID: "op-1", Email: "op@banzami.com", Role: "SUPER_ADMIN", Status: "ACTIVE", TokenVersion: 3}
	logins := &lockingLogins{fakeLogins: fakeLogins{user: u}}
	f := &fakeMFA{enrolled: true, acceptCode: "123456"}
	h := NewMFAHandler(f, logins, testSecret, time.Hour)
	chal := tokenFor(t, u, auth.PurposeMFAChallenge)

	for i := 1; i <= 4; i++ {
		if w := post(h.Verify, chal, `{"code":"000000"}`); w.Code != http.StatusUnauthorized {
			t.Fatalf("wrong code %d: %d", i, w.Code)
		}
	}
	if w := post(h.Verify, chal, `{"code":"000000"}`); w.Code != http.StatusTooManyRequests {
		t.Fatalf("the fifth wrong code did not lock the account: %d", w.Code)
	}
	if logins.bumps != 1 {
		t.Fatalf("the lock did not end the account's tokens (bumps=%d)", logins.bumps)
	}
	// Locked: even the right code is not checked.
	verifies := f.verifies
	if w := post(h.Verify, chal, `{"code":"123456"}`); w.Code != http.StatusTooManyRequests || f.verifies != verifies {
		t.Fatalf("a locked account's code was checked (%d)", w.Code)
	}
}

type lockingLogins struct {
	fakeLogins
	bumps int
}

func (l *lockingLogins) RecordFailedLogin(context.Context, string) (*time.Time, error) {
	l.user.FailedLoginAttempts++
	if l.user.FailedLoginAttempts >= service.MaxFailedLogins {
		until := time.Now().Add(service.LockoutWindow)
		l.user.LockedUntil = &until
	}
	return l.user.LockedUntil, nil
}
func (l *lockingLogins) BumpTokenVersion(context.Context, string) error {
	l.bumps++
	l.user.TokenVersion++
	return nil
}
func (l *lockingLogins) GetByID(context.Context, string) (service.AdminUser, error) {
	return l.user, nil
}

func TestMFA_EveryEnrolmentMintsADifferentSeed(t *testing.T) {
	h, f, u := mfaFixture(t, false)
	for i := 0; i < 3; i++ {
		w := post(h.Enrol, tokenFor(t, u, auth.PurposeMFAEnroll), "")
		if w.Code != http.StatusOK {
			t.Fatalf("enrolment %d failed: %d", i, w.Code)
		}
	}
	seen := map[string]bool{}
	for _, s := range f.seeds {
		if seen[s] {
			t.Fatal("a seed was reused across enrolments — an exposed one could come back")
		}
		seen[s] = true
	}
}
