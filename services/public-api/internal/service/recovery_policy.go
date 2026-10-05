package service

// Recovery policy — the single place that decides, per environment, which factor
// and channel may recover a Consumer's PIN. It exists so the rule is not spread
// as `if sandbox email / if live sms` across handlers.
//
// Canonical policy:
//
//	SANDBOX (test money):  recovery factor = VERIFIED EMAIL, channel = EMAIL (Resend)
//	LIVE (real money):     recovery factor = VERIFIED PHONE, channel = SMS
//
// LIVE is fail-closed: with no SMS sender configured (or no verified phone),
// there is NO automatic recovery — NEVER an email fallback. Email in LIVE is
// contact/notification only. Login is always @banza + PIN; this is recovery only.
//
// LIVE phone numbers are Angola only (+244). This is architecture-ready: SMS is
// not operational yet, so in LIVE recovery is simply unavailable until a provider
// and verified phones exist.

import (
	"regexp"
	"strings"
)

// RecoveryChannel is the OTP delivery channel a recovery uses.
type RecoveryChannel string

const (
	RecoveryChannelEmail RecoveryChannel = "EMAIL"
	RecoveryChannelSMS   RecoveryChannel = "SMS"
)

// RecoveryPolicy resolves the environment's recovery factor/channel and whether
// automatic recovery is currently available (fail-closed in LIVE without SMS).
type RecoveryPolicy struct {
	sandbox       bool
	smsConfigured bool
}

// NewRecoveryPolicy builds the policy. environment is the service environment
// ("PRODUCTION"/"SANDBOX"); smsConfigured reports whether a real SMS OTP sender
// is wired (false today — SMS is not operational).
func NewRecoveryPolicy(environment string, smsConfigured bool) RecoveryPolicy {
	return RecoveryPolicy{
		sandbox:       !strings.EqualFold(strings.TrimSpace(environment), "PRODUCTION"),
		smsConfigured: smsConfigured,
	}
}

// Channel is the recovery channel for this environment: EMAIL in Sandbox, SMS in
// LIVE. (Which channel the OTP MUST use — independent of availability.)
func (p RecoveryPolicy) Channel() RecoveryChannel {
	if p.sandbox {
		return RecoveryChannelEmail
	}
	return RecoveryChannelSMS
}

// EmailRecoveryAllowed reports whether email may be used to recover a PIN. Only
// in Sandbox. In LIVE this is always false — email never recovers a LIVE account.
func (p RecoveryPolicy) EmailRecoveryAllowed() bool { return p.sandbox }

// Available reports whether automatic recovery can run now, and on which channel.
// Sandbox → (true, EMAIL). LIVE → (smsConfigured, SMS): fail-closed with no SMS.
func (p RecoveryPolicy) Available() (bool, RecoveryChannel) {
	if p.sandbox {
		return true, RecoveryChannelEmail
	}
	return p.smsConfigured, RecoveryChannelSMS
}

// angolaMobileRe: +244 followed by a 9-digit Angolan mobile number (starts 9).
// The LIVE recovery phone is Angola only (+244).
var angolaMobileRe = regexp.MustCompile(`^\+2449\d{8}$`)

// ValidateAngolaMobile returns nil if s is a well-formed Angolan (+244) mobile
// number in E.164. Used for the LIVE verified-phone recovery factor; Angola only.
func ValidateAngolaMobile(s string) bool {
	return angolaMobileRe.MatchString(strings.TrimSpace(s))
}

// SecurityOtpSender delivers a recovery OTP over a channel. EmailOtpSender
// (Resend) is operational in Sandbox; an SmsOtpSender for LIVE implements the
// same contract so the recovery lifecycle (OTP, grants, rate limits, audit,
// credential reset, recovery state machine) is reused unchanged when SMS lands.
type SecurityOtpSender interface {
	Channel() RecoveryChannel
	// Send delivers code to destination (an email address or an Angolan +244
	// number, per Channel). It must never log the code.
	Send(destination, code string) error
}
