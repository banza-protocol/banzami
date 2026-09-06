package accountidentity

import (
	"strings"
	"testing"
)

// TestRenderVerificationCode proves the OTP email composes from the shared design
// system with the security anatomy, the six digit boxes, the expiry notice, and
// no CTA button / URL fallback (the code is the action).
func TestRenderVerificationCode(t *testing.T) {
	html, text := RenderVerificationCode("482915")

	for _, m := range []string{
		"O seu código de verificação",
		"Developers",           // header subtitle
		"Segurança",            // security badge
		"expira em 10 minutos", // expiry notice
		"'Nunito'", "border-collapse:separate", "email-assets/",
	} {
		if !strings.Contains(html, m) {
			t.Errorf("html missing %q", m)
		}
	}
	// No CTA button / URL fallback in an OTP email.
	if strings.Contains(html, "overflow-wrap:anywhere") {
		t.Error("OTP email must not render a URL fallback")
	}
	if strings.Contains(html, "<svg") {
		t.Error("must not use inline SVG")
	}
	// Digits render in separate boxes (not contiguous in HTML).
	for _, d := range []string{"4", "8", "2", "9", "1", "5"} {
		if !strings.Contains(html, ">"+d+"</td>") {
			t.Errorf("missing digit box for %q", d)
		}
	}
	// Plain-text alternative carries the whole code.
	if !strings.Contains(text, "482915") {
		t.Error("text alternative must contain the code")
	}
}
