// Package webhookprov holds the parts of webhook-endpoint provisioning that
// more than one service needs.
//
// The gateway has always owned this: it validated the destination URL, minted
// the signing secret and encrypted it at rest. That was fine while a webhook
// endpoint could only be created with a developer key. It stopped being fine
// when the Developers Console had to create one too — the Console authenticates
// a person, not a key, and the alternative to sharing this code was either a
// second implementation of an SSRF policy (two places to get it wrong) or a
// command-line step outside the product.
//
// So the policy, the generator and the cipher live here, and both services use
// exactly these. Delivery — the transport that re-checks the resolved IP of
// every hop — stays in the gateway, which is the only thing that delivers.
package webhookprov

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"net"
	"net/url"
	"strings"
)

// GenerateSecret mints a webhook signing secret. 32 bytes of crypto/rand behind
// a `whsec_` prefix, so a leaked value is recognisable in a log or a paste.
func GenerateSecret() string {
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	return "whsec_" + base64.URLEncoding.EncodeToString(b)
}

// ValidateURL enforces the registration-time policy. Returns a
// caller-safe error message (no internal detail).
func ValidateURL(raw string) error {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return fmt.Errorf("invalid webhook URL")
	}
	if u.Scheme != "https" {
		return fmt.Errorf("webhook URL must use https")
	}
	host := u.Hostname()
	if host == "" {
		return fmt.Errorf("webhook URL must include a host")
	}
	// Literal IPs: check directly. Hostnames: block obvious internal names and
	// defer the authoritative check to resolution time (safeWebhookTransport).
	if ip := net.ParseIP(host); ip != nil {
		if IsDisallowedIP(ip) {
			return fmt.Errorf("webhook URL host is not a public address")
		}
		return nil
	}
	lower := strings.ToLower(host)
	if lower == "localhost" || strings.HasSuffix(lower, ".localhost") ||
		strings.HasSuffix(lower, ".internal") || strings.HasSuffix(lower, ".local") {
		return fmt.Errorf("webhook URL host is not a public address")
	}
	return nil
}

// extraDisallowedCIDRs covers ranges that net.IP's own predicates do NOT report.
// net.IP.IsPrivate only knows 10/8, 172.16/12, 192.168/16 and fc00::/7, and
// IsUnspecified matches only the single address 0.0.0.0 — so without these a
// webhook could still be pointed at carrier-grade-NAT space (widely used for
// cloud-internal endpoints and mesh VPNs) or at "this network" addresses.
var extraDisallowedCIDRs = func() []*net.IPNet {
	nets := []*net.IPNet{}
	for _, c := range []string{
		"0.0.0.0/8",       // "this network" (RFC 1122) — 0.0.0.0 alone is IsUnspecified
		"100.64.0.0/10",   // carrier-grade NAT (RFC 6598) — cloud-internal / mesh VPN space
		"192.0.0.0/24",    // IETF protocol assignments (RFC 6890)
		"192.0.2.0/24",    // TEST-NET-1
		"198.18.0.0/15",   // benchmarking (RFC 2544)
		"198.51.100.0/24", // TEST-NET-2
		"203.0.113.0/24",  // TEST-NET-3
		"240.0.0.0/4",     // reserved (RFC 1112), includes 255.255.255.255 broadcast
		"::/128",          // IPv6 unspecified
		"64:ff9b::/96",    // NAT64 — embeds an IPv4 destination
		"2001:db8::/32",   // IPv6 documentation
	} {
		if _, n, err := net.ParseCIDR(c); err == nil {
			nets = append(nets, n)
		}
	}
	return nets
}()

// IsDisallowedIP reports whether an IP is in a range a public webhook must
// never target: loopback, private, link-local, ULA, unspecified, multicast, and
// the additional reserved/internal ranges in extraDisallowedCIDRs.
func IsDisallowedIP(ip net.IP) bool {
	if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() ||
		ip.IsLinkLocalMulticast() || ip.IsMulticast() || ip.IsUnspecified() ||
		ip.IsInterfaceLocalMulticast() {
		return true
	}
	// IPv4-mapped IPv6 (::ffff:a.b.c.d) — unwrap and re-check.
	if v4 := ip.To4(); v4 != nil && !ip.Equal(v4) {
		return IsDisallowedIP(v4)
	}
	for _, n := range extraDisallowedCIDRs {
		if n.Contains(ip) {
			return true
		}
	}
	return false
}
