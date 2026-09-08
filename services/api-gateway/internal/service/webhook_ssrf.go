package service

// Webhook SSRF protection (Assurance RA-023).
//
// Two layers of defence, and they now live in two places for a reason:
//
//  1. registration-time policy — moved to services/common/webhookprov, because
//     the Developers Console creates endpoints too and a second copy of an SSRF
//     policy is a second place to get it wrong;
//  2. delivery-time guard — stays here, because the gateway is the only thing
//     that delivers. It re-checks the *resolved* IP of every connection, which
//     is what defeats DNS rebinding where a hostname passes step 1 and resolves
//     to a private address at delivery.

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"time"

	"github.com/banzami/banzami/services/common/webhookprov"
)

// ValidateWebhookURL enforces the registration-time policy. Kept as the
// gateway's name for it so every existing caller and test still reads the same.
func ValidateWebhookURL(raw string) error { return webhookprov.ValidateURL(raw) }

// isDisallowedIP is the delivery-time predicate, shared with registration.
func isDisallowedIP(ip net.IP) bool { return webhookprov.IsDisallowedIP(ip) }

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
