package service

import "testing"

// The recovery policy is the single authority for which factor/channel may
// recover a PIN per environment. Sandbox = verified email; LIVE = verified phone
// via SMS, fail-closed (never an email fallback). Angola-only phone numbers.
func TestRecoveryPolicy_PerEnvironment(t *testing.T) {
	sandbox := NewRecoveryPolicy("SANDBOX", false)
	if sandbox.Channel() != RecoveryChannelEmail {
		t.Fatalf("sandbox channel should be EMAIL, got %s", sandbox.Channel())
	}
	if !sandbox.EmailRecoveryAllowed() {
		t.Fatal("sandbox must allow email recovery")
	}
	if ok, ch := sandbox.Available(); !ok || ch != RecoveryChannelEmail {
		t.Fatalf("sandbox recovery should be available on EMAIL, got %v %s", ok, ch)
	}

	// LIVE with no SMS sender: channel is SMS, email recovery is NOT allowed, and
	// automatic recovery is fail-closed (unavailable) — never falls back to email.
	liveNoSms := NewRecoveryPolicy("PRODUCTION", false)
	if liveNoSms.Channel() != RecoveryChannelSMS {
		t.Fatalf("live channel should be SMS, got %s", liveNoSms.Channel())
	}
	if liveNoSms.EmailRecoveryAllowed() {
		t.Fatal("LIVE must NEVER allow email recovery")
	}
	if ok, _ := liveNoSms.Available(); ok {
		t.Fatal("LIVE without an SMS sender must be fail-closed (recovery unavailable)")
	}

	// LIVE with an SMS sender configured: recovery available on SMS (still never
	// email).
	liveSms := NewRecoveryPolicy("PRODUCTION", true)
	if ok, ch := liveSms.Available(); !ok || ch != RecoveryChannelSMS {
		t.Fatalf("LIVE with SMS should be available on SMS, got %v %s", ok, ch)
	}
	if liveSms.EmailRecoveryAllowed() {
		t.Fatal("LIVE with SMS must still never allow email recovery")
	}
}

func TestValidateAngolaMobile_Only244(t *testing.T) {
	valid := []string{"+244912345678", "+244923456789", "+244999999999"}
	for _, v := range valid {
		if !ValidateAngolaMobile(v) {
			t.Errorf("expected %q to be a valid Angolan mobile", v)
		}
	}
	invalid := []string{
		"+351912345678",  // Portugal
		"+1234567890",    // US-ish
		"244912345678",   // no +
		"+244812345678",  // not a mobile (does not start 9)
		"+24491234567",   // too short
		"+2449123456789", // too long
		"912345678",      // no country code
		"",
	}
	for _, v := range invalid {
		if ValidateAngolaMobile(v) {
			t.Errorf("expected %q to be rejected (Angola +244 mobile only)", v)
		}
	}
}
