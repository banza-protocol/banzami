package service

// Webhook SSRF protection (Assurance RA-023).
//
// A merchant supplies the destination URL for webhook delivery. Without
// validation, a merchant could point an endpoint at loopback, link-local
// (cloud metadata 169.254.169.254), or RFC1918 addresses and have the
// gateway make authenticated requests into internal infrastructure.
//
// Two layers of defence:
//  1. ValidateWebhookURL — rejected at registration time (https only, no
//     private/loopback/link-local/ULA hosts, no bare IPs into private space).
//  2. safeWebhookTransport — a delivery-time DialContext guard that re-checks
//     the *resolved* IP for every connection, defeating DNS-rebinding where a
//     hostname passes step 1 but resolves to a private address at delivery.

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// ValidateWebhookURL enforces the registration-time policy. Returns a
// caller-safe error message (no internal detail).
func ValidateWebhookURL(raw string) error {
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
		if isDisallowedIP(ip) {
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

// isDisallowedIP reports whether an IP is in a range a public webhook must
// never target: loopback, private, link-local, ULA, unspecified, multicast, and
// the additional reserved/internal ranges in extraDisallowedCIDRs.
func isDisallowedIP(ip net.IP) bool {
	if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() ||
		ip.IsLinkLocalMulticast() || ip.IsMulticast() || ip.IsUnspecified() ||
		ip.IsInterfaceLocalMulticast() {
		return true
	}
	// IPv4-mapped IPv6 (::ffff:a.b.c.d) — unwrap and re-check.
	if v4 := ip.To4(); v4 != nil && !ip.Equal(v4) {
		return isDisallowedIP(v4)
	}
	for _, n := range extraDisallowedCIDRs {
		if n.Contains(ip) {
			return true
		}
	}
	return false
}

// newSafeWebhookClient builds the delivery http.Client whose dialer refuses to
// connect to disallowed IPs even if a hostname resolves to one (DNS rebinding).
func newSafeWebhookClient(timeout time.Duration) *http.Client {
	dialer := &net.Dialer{Timeout: 10 * time.Second}
	transport := &http.Transport{
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(addr)
			if err != nil {
				return nil, err
			}
			ips, err := net.DefaultResolver.LookupIP(ctx, "ip", host)
			if err != nil {
				return nil, err
			}
			for _, ip := range ips {
				if isDisallowedIP(ip) {
					return nil, fmt.Errorf("webhook target resolves to a non-public address")
				}
			}
			// Reconnect to the validated IP (first) to avoid a re-resolution
			// race between check and dial.
			return dialer.DialContext(ctx, network, net.JoinHostPort(ips[0].String(), port))
		},
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          100,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
	}
	return &http.Client{
		Timeout:   timeout,
		Transport: transport,
		// Bound redirect chains and refuse to downgrade to cleartext. The dialer
		// above re-validates the resolved IP of every hop, so a redirect cannot
		// reach internal space; this additionally stops a merchant endpoint from
		// bouncing the signed payload (and its Banza-Signature header, which Go
		// forwards because it is not a well-known credential header) onto plain
		// HTTP, and caps redirect loops.
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 3 {
				return fmt.Errorf("webhook target redirected too many times")
			}
			if req.URL.Scheme != "https" {
				return fmt.Errorf("webhook target redirected to a non-https URL")
			}
			return nil
		},
	}
}
