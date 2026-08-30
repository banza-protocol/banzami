package service

import (
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
)

// The webhook destination is merchant-supplied, so the disallow list is a
// security control: any range that reaches internal infrastructure must be
// refused. net.IP's own predicates do not cover several such ranges.
func TestIsDisallowedIP_CoversReservedAndInternalRanges(t *testing.T) {
	disallowed := []struct{ ip, why string }{
		{"127.0.0.1", "loopback"},
		{"10.1.2.3", "RFC1918"},
		{"172.16.0.1", "RFC1918"},
		{"192.168.1.1", "RFC1918"},
		{"169.254.169.254", "cloud metadata (link-local)"},
		{"100.64.0.1", "carrier-grade NAT — cloud-internal / mesh VPN space"},
		{"100.127.255.254", "carrier-grade NAT upper bound"},
		{"0.0.0.0", "unspecified"},
		{"0.1.2.3", "this-network /8"},
		{"255.255.255.255", "broadcast"},
		{"240.0.0.1", "reserved /4"},
		{"198.18.0.1", "benchmarking range"},
		{"192.0.0.1", "IETF protocol assignments"},
		{"::1", "IPv6 loopback"},
		{"fc00::1", "IPv6 ULA"},
		{"fe80::1", "IPv6 link-local"},
		{"::", "IPv6 unspecified"},
		{"64:ff9b::7f00:1", "NAT64-embedded IPv4"},
		{"::ffff:127.0.0.1", "IPv4-mapped loopback"},
		{"::ffff:169.254.169.254", "IPv4-mapped metadata"},
		{"::ffff:100.64.0.1", "IPv4-mapped CGNAT"},
	}
	for _, tc := range disallowed {
		ip := net.ParseIP(tc.ip)
		if ip == nil {
			t.Fatalf("bad fixture %q", tc.ip)
		}
		if !isDisallowedIP(ip) {
			t.Errorf("%s (%s) must be disallowed as a webhook target", tc.ip, tc.why)
		}
	}
}

// Ordinary public addresses must keep working — the hardening must not turn
// into a functional outage for legitimate merchant endpoints.
func TestIsDisallowedIP_AllowsPublicAddresses(t *testing.T) {
	for _, s := range []string{"93.184.216.34", "8.8.8.8", "1.1.1.1", "2606:4700::1111", "99.255.255.255", "101.0.0.1"} {
		ip := net.ParseIP(s)
		if ip == nil {
			t.Fatalf("bad fixture %q", s)
		}
		if isDisallowedIP(ip) {
			t.Errorf("%s is a public address and must be allowed", s)
		}
	}
}

// Registration-time policy: scheme and obviously-internal hostnames.
func TestValidateWebhookURL(t *testing.T) {
	bad := []string{
		"http://example.com/hook",      // cleartext
		"https://localhost/hook",       // loopback name
		"https://svc.internal/hook",    // internal TLD
		"https://box.local/hook",       // mDNS
		"https://169.254.169.254/hook", // metadata literal
		"https://100.64.0.1/hook",      // CGNAT literal
		"https://[::1]/hook",           // IPv6 loopback literal
		"ftp://example.com/hook",       // wrong scheme
		"https:///hook",                // no host
	}
	for _, u := range bad {
		if err := ValidateWebhookURL(u); err == nil {
			t.Errorf("ValidateWebhookURL(%q) must reject", u)
		}
	}
	if err := ValidateWebhookURL("https://hooks.example.com/banzami"); err != nil {
		t.Errorf("legitimate https endpoint rejected: %v", err)
	}
}

// The delivery client must refuse cleartext redirects: Go forwards the custom
// Banza-Signature header across redirects, so a downgrade would put the signed
// payload on the wire in plaintext.
func TestSafeWebhookClient_RefusesNonHTTPSRedirect(t *testing.T) {
	c := newSafeWebhookClient(1)
	if c.CheckRedirect == nil {
		t.Fatal("delivery client has no redirect policy")
	}
	httpReq := mustRequest(t, "http://example.com/next")
	if err := c.CheckRedirect(httpReq, nil); err == nil {
		t.Error("redirect to http:// must be refused")
	}
	httpsReq := mustRequest(t, "https://example.com/next")
	if err := c.CheckRedirect(httpsReq, nil); err != nil {
		t.Errorf("redirect to https:// must be allowed: %v", err)
	}
}

func TestSafeWebhookClient_BoundsRedirectChain(t *testing.T) {
	c := newSafeWebhookClient(1)
	req := mustRequest(t, "https://example.com/next")
	via := make([]*http.Request, 3)
	if err := c.CheckRedirect(req, via); err == nil {
		t.Error("an unbounded redirect chain must be refused")
	}
}

func mustRequest(t *testing.T, url string) *http.Request {
	t.Helper()
	return httptest.NewRequest(http.MethodPost, url, nil)
}
