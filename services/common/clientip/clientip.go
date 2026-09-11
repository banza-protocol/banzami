// Package clientip decides who the client is, once, for every Go service.
//
// Every per-IP limit (credential sign-in, OTP requests, application
// submissions, proof lookups) and every audited "ip" keys on this answer, so it
// must not be the caller's own word. The services used to take it from request
// headers sent by ANY peer — chi's RealIP (True-Client-IP, X-Real-IP, the first
// X-Forwarded-For entry) and hand-rolled readers of the same headers — so any
// container that could reach a service directly chose its own address and got
// a fresh allowance per request (A9-09).
//
// The rule now: the forwarding header is honoured ONLY when the direct peer
// (r.RemoteAddr, the TCP connection) is inside a configured trusted-proxy list.
// The Sandbox edge (infra/nginx/sandbox-edge.conf.template) is that proxy: it
// decides the client address itself — Cloudflare's CF-Connecting-IP, believed
// only from Cloudflare's ranges — and OVERWRITES X-Real-IP with it. X-Real-IP
// is a single address, so there is no list to pick an entry from.
//
// Default: nothing is trusted, and the client is the direct peer. That is safe
// (a header can never raise anyone's allowance) but coarse behind a proxy:
// every request then keys on the proxy's own address and all clients share one
// bucket. Deployments behind the edge set TRUSTED_PROXY_CIDRS to the edge's
// address on the application network.
//
// A second concern lives here too (A9-04): an IPv6 client controls at least a
// /64, so keying a limiter on the full address hands it 2^64 buckets. LimiterKey
// aggregates IPv6 to its /64; IPv4 (and IPv4-mapped IPv6) stays per address.
package clientip

import (
	"fmt"
	"net/http"
	"net/netip"
	"os"
	"strings"
)

const (
	// EnvTrustedProxies names the environment variable holding the trusted-proxy
	// list: comma- or space-separated CIDRs or bare addresses.
	EnvTrustedProxies = "TRUSTED_PROXY_CIDRS"

	// HeaderRealIP is the one header the edge overwrites with the client
	// address it decided (proxy_set_header X-Real-IP $remote_addr).
	HeaderRealIP = "X-Real-IP"
)

// Resolver resolves the client address of a request. A nil *Resolver trusts
// no proxy: the client is always the direct peer.
type Resolver struct {
	header  string
	trusted []netip.Prefix
}

// New returns a Resolver that believes header only from peers inside trusted.
func New(header string, trusted []netip.Prefix) *Resolver {
	return &Resolver{header: header, trusted: append([]netip.Prefix(nil), trusted...)}
}

// Load builds a Resolver for header from the trusted-proxy list in envVar.
// Unset or empty means no proxy is trusted. A malformed list is an error —
// the caller refuses to start rather than guess which half was meant.
func Load(envVar, header string) (*Resolver, error) {
	trusted, err := ParsePrefixes(os.Getenv(envVar))
	if err != nil {
		return nil, fmt.Errorf("%s: %w", envVar, err)
	}
	return New(header, trusted), nil
}

// LoadEdge is Load for the edge: TRUSTED_PROXY_CIDRS and X-Real-IP.
func LoadEdge() (*Resolver, error) { return Load(EnvTrustedProxies, HeaderRealIP) }

// ParsePrefixes parses a comma- or whitespace-separated list of CIDRs or bare
// addresses (a bare address is its own /32 or /128). A prefix of length zero
// is refused: trusting every peer is the defect this package removes, and
// "0.0.0.0/0" is the easy wrong answer to "every client shares one bucket".
func ParsePrefixes(s string) ([]netip.Prefix, error) {
	var out []netip.Prefix
	for _, f := range strings.FieldsFunc(s, func(r rune) bool { return r == ',' || r == ' ' || r == '\t' || r == '\n' }) {
		var p netip.Prefix
		if strings.Contains(f, "/") {
			var err error
			if p, err = netip.ParsePrefix(f); err != nil {
				return nil, fmt.Errorf("invalid CIDR %q", f)
			}
		} else {
			a, err := netip.ParseAddr(f)
			if err != nil {
				return nil, fmt.Errorf("invalid address %q", f)
			}
			a = a.WithZone("")
			p = netip.PrefixFrom(a, a.BitLen())
		}
		if p.Bits() == 0 {
			return nil, fmt.Errorf("%q trusts every peer; name the proxy's own address or network", f)
		}
		if p.Addr().Is4In6() {
			// ::ffff:10.0.0.0/104 means 10.0.0.0/8; peers are compared unmapped.
			if p.Bits() < 96 {
				return nil, fmt.Errorf("invalid IPv4-mapped CIDR %q", f)
			}
			p = netip.PrefixFrom(p.Addr().Unmap(), p.Bits()-96)
		}
		out = append(out, p.Masked())
	}
	return out, nil
}

// Resolve returns the client address of req as a bare IP string.
//
// It is the value of the configured header when the direct peer is a trusted
// proxy and the header holds exactly one valid address; otherwise the direct
// peer. The header is never believed from anyone else, and a malformed value
// from a trusted proxy falls back to the proxy itself — never to a guess.
func (r *Resolver) Resolve(req *http.Request) string {
	peer, ok := parseAddr(req.RemoteAddr)
	if !ok {
		return req.RemoteAddr
	}
	peer = canonical(peer)
	if r.trusts(peer) {
		if v := strings.TrimSpace(req.Header.Get(r.header)); v != "" {
			if a, err := netip.ParseAddr(v); err == nil {
				return canonical(a).String()
			}
		}
	}
	return peer.String()
}

// Middleware replaces req.RemoteAddr with Resolve(req), as chi's RealIP did —
// so request logs, audit rows and limiters downstream all read one answer —
// but believing the header only from a trusted proxy. The address is always
// written without a port: an ephemeral port in a limiter key would give every
// new connection a fresh allowance.
func (r *Resolver) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		req.RemoteAddr = r.Resolve(req)
		next.ServeHTTP(w, req)
	})
}

func (r *Resolver) trusts(a netip.Addr) bool {
	if r == nil || r.header == "" {
		return false
	}
	for _, p := range r.trusted {
		if p.Contains(a) {
			return true
		}
	}
	return false
}

// Host returns the bare, canonical IP in addr ("ip" or "ip:port"). Use it for
// what is recorded (audit rows, request logs); use LimiterKey for what is
// counted. An unparseable addr is returned unchanged.
func Host(addr string) string {
	a, ok := parseAddr(addr)
	if !ok {
		return addr
	}
	return canonical(a).String()
}

// LimiterKey returns the rate-limit bucket for addr ("ip" or "ip:port"):
// the address itself for IPv4 (and IPv4-mapped IPv6), the enclosing /64 for
// IPv6 — the smallest block a single subscriber is routinely given, so
// rotating through it buys nothing. An unparseable addr is returned unchanged.
func LimiterKey(addr string) string {
	a, ok := parseAddr(addr)
	if !ok {
		return addr
	}
	a = canonical(a)
	if a.Is4() {
		return a.String()
	}
	return netip.PrefixFrom(a, 64).Masked().String()
}

// parseAddr accepts "ip", "ip:port" and "[ipv6]:port".
func parseAddr(s string) (netip.Addr, bool) {
	s = strings.TrimSpace(s)
	if ap, err := netip.ParseAddrPort(s); err == nil {
		return ap.Addr(), true
	}
	if a, err := netip.ParseAddr(strings.TrimSuffix(strings.TrimPrefix(s, "["), "]")); err == nil {
		return a, true
	}
	return netip.Addr{}, false
}

// canonical drops a zone and unmaps IPv4-mapped IPv6, so ::ffff:192.0.2.1 and
// 192.0.2.1 are one client.
func canonical(a netip.Addr) netip.Addr { return a.WithZone("").Unmap() }
