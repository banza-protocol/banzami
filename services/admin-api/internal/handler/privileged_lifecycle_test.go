package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/banzami/banzami/services/admin-api/internal/auth"
	"github.com/banzami/banzami/services/admin-api/internal/service"
)

// ACTIVE must mean fully enrolled, not "has a password".
//
// The status column used to answer "has this person set a password?", and
// whether a second factor existed was a row in another table. So the first
// SUPER_ADMIN sat at ACTIVE with no factor, and the only thing between that and
// a privileged session was a branch inside the login handler.
//
// That branch was correct and it is not the same as the state saying so. A
// status whose meaning depends on a row somewhere else is one a reader will get
// wrong — an export, a support query, a dashboard counting "active admins", or
// the next authorisation branch someone writes.

func superAdmin(t *testing.T, status string) *service.AdminUser {
	t.Helper()
	u := activeUser(t)
	u.Role = "SUPER_ADMIN"
	u.Status = status
	return u
}

func TestLifecycle_SuperAdminWithoutAFactorIsNotActive(t *testing.T) {
	// What migration 0110 backfills: an operator with a password and no
	// confirmed factor is MFA_ENROLMENT_REQUIRED, not ACTIVE.
	u := superAdmin(t, service.StatusMFAEnrolmentRequired)

	if service.CanHoldSession(u.Status) {
		t.Fatal("an operator awaiting enrolment reports that it may hold a session")
	}
	if !service.CanContinueEnrolment(u.Status) {
		t.Fatal("an operator awaiting enrolment cannot prove its password to continue")
	}
}

func TestLifecycle_PasswordInAnEnrolmentStateNeverYieldsASession(t *testing.T) {
	for _, status := range []string{service.StatusMFAEnrolmentRequired, service.StatusMFARecoveryAck} {
		store := &fakeStore{user: superAdmin(t, status)}
		h := NewAuthHandler(store, "secret-xyz", time.Hour).WithMFA(&fakeMFA{enrolled: status == service.StatusMFARecoveryAck})

		w := httptest.NewRecorder()
		h.Login(w, loginReq(`{"email":"op@banzami.com","password":"a-strong-password"}`))

		var body map[string]any
		_ = json.Unmarshal(w.Body.Bytes(), &body)
		if _, ok := body["token"]; ok {
			t.Fatalf("%s: a session token was issued", status)
		}
		if body["mfa_required"] != true {
			t.Fatalf("%s: login did not demand a second factor: %s", status, w.Body.String())
		}
	}
}

func TestLifecycle_NoSessionSurvivesAnEnrolmentState(t *testing.T) {
	// Even a token that was minted while the account was ACTIVE stops working
	// the moment the account is not: the middleware asks the store, not the JWT.
	for _, status := range []string{
		service.StatusInvited,
		service.StatusMFAEnrolmentRequired,
		service.StatusMFARecoveryAck,
		service.StatusSuspended,
	} {
		if service.CanHoldSession(status) {
			t.Errorf("%s reports that it may hold a privileged session", status)
		}
	}
	if !service.CanHoldSession(service.StatusActive) {
		t.Error("ACTIVE cannot hold a session")
	}
}

func TestLifecycle_EnrolmentWalksEnrolmentRequiredToAckToActive(t *testing.T) {
	u := superAdmin(t, service.StatusMFAEnrolmentRequired)
	logins := &fakeLogins{user: *u}
	mfa := &fakeMFA{acceptCode: "123456"}
	h := NewMFAHandler(mfa, logins, testSecret, time.Hour)

	// Confirming the factor moves to MFA_RECOVERY_ACK_REQUIRED — the codes are
	// on screen and unacknowledged, so this is not yet an active account.
	rec := post(h.ConfirmEnrol, tokenFor(t, *u, auth.PurposeMFAEnroll), `{"code":"123456"}`)

	if rec.Code != http.StatusOK {
		t.Fatalf("confirm: status %d — %s", rec.Code, rec.Body.String())
	}
	var confirmed map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &confirmed)
	if _, isSession := confirmed["token"]; isSession {
		t.Fatal("confirming a factor returned a session")
	}
	if logins.user.Status != service.StatusMFARecoveryAck {
		t.Fatalf("after confirm the status is %s, want %s", logins.user.Status, service.StatusMFARecoveryAck)
	}

	// Acknowledgement is the only route to ACTIVE.
	rec2 := post(h.AcknowledgeRecovery, tokenFor(t, logins.user, auth.PurposeMFAAck), "")

	if rec2.Code != http.StatusOK {
		t.Fatalf("acknowledge: status %d — %s", rec2.Code, rec2.Body.String())
	}
	if logins.user.Status != service.StatusActive {
		t.Fatalf("after acknowledge the status is %s, want ACTIVE", logins.user.Status)
	}
	want := []string{
		service.StatusMFAEnrolmentRequired + "→" + service.StatusMFARecoveryAck,
		service.StatusMFARecoveryAck + "→" + service.StatusActive,
	}
	if len(logins.transitions) != 2 || logins.transitions[0] != want[0] || logins.transitions[1] != want[1] {
		t.Fatalf("transitions = %v, want %v", logins.transitions, want)
	}
}

func TestLifecycle_AcknowledgementCannotBeSkipped(t *testing.T) {
	// A replayed or forged acknowledgement against an account that has not
	// confirmed a factor must not reach ACTIVE. The transition is guarded on the
	// FROM state, so it is a no-op rather than a shortcut.
	u := superAdmin(t, service.StatusMFAEnrolmentRequired)
	logins := &fakeLogins{user: *u}
	h := NewMFAHandler(&fakeMFA{}, logins, testSecret, time.Hour)

	_ = post(h.AcknowledgeRecovery, tokenFor(t, *u, auth.PurposeMFAAck), "")

	if logins.user.Status == service.StatusActive {
		t.Fatal("acknowledging without a confirmed factor reached ACTIVE")
	}
}
