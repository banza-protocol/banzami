package clientip

import (
	"net/http"
	"net/http/httptest"
	"net/netip"
	"testing"
)

func mustPrefixes(t *testing.T, s string) []netip.Prefix {
	t.Helper()
	p, err := ParsePrefixes(s)
	if err != nil {
		t.Fatalf("ParsePrefixes(%q): %v", s, err)
	}
	return p
}

func request(remote string, hdr map[string]string) *http.Request {
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.RemoteAddr = remote
	for k, v := range hdr {
		r.Header.Set(k, v)
	}
	return r
}

// Every header a caller could use to name itself, all at once.
var spoof = map[string]string{
	"X-Real-IP":        "198.51.100.77",
	"X-Forwarded-For":  "198.51.100.78, 10.0.0.1",
	"True-Client-IP":   "198.51.100.79",
	"CF-Connecting-IP": "198.51.100.80",
	"Forwarded":        "for=198.51.100.81",
}

// A9-09: a peer that is not a trusted proxy names nobody but itself, whatever
// headers it sends.
func TestUntrustedPeerCannotSpoof(t *testing.T) {
	for _, res := range []*Resolver{
		nil,                    // no configuration at all
		New(HeaderRealIP, nil), // the default: nothing trusted
		New(HeaderRealIP, mustPrefixes(t, "172.18.0.2/32")), // a different peer is trusted
	} {
		got := res.Resolve(request("203.0.113.9:51234", spoof))
		if got != "203.0.113.9" {
			t.Fatalf("untrusted peer resolved to %q; want its own address 203.0.113.9", got)
		}
	}
}

func TestTrustedProxyHeaderIsBelieved(t *testing.T) {
	res := New(HeaderRealIP, mustPrefixes(t, "172.18.0.0/16"))
	got := res.Resolve(request("172.18.0.5:40000", spoof))
	if got != "198.51.100.77" {
		t.Fatalf("trusted edge's X-Real-IP not used: got %q", got)
	}
}

// Only the one header the edge overwrites; the others are the caller's.
func TestTrustedProxyOnlyTheConfiguredHeader(t *testing.T) {
	res := New(HeaderRealIP, mustPrefixes(t, "172.18.0.5"))
	hdr := map[string]string{"X-Forwarded-For": "198.51.100.1", "True-Client-IP": "198.51.100.2"}
	if got := res.Resolve(request("172.18.0.5:40000", hdr)); got != "172.18.0.5" {
		t.Fatalf("a header other than X-Real-IP was believed: %q", got)
	}
}

func TestTrustedProxyMalformedHeaderFallsBackToPeer(t *testing.T) {
	res := New(HeaderRealIP, mustPrefixes(t, "172.18.0.5"))
	for _, v := range []string{"198.51.100.1, 198.51.100.2", "not-an-ip", "198.51.100.1:80", " "} {
		if got := res.Resolve(request("172.18.0.5:40000", map[string]string{"X-Real-IP": v})); got != "172.18.0.5" {
			t.Fatalf("X-Real-IP %q: got %q, want the proxy itself", v, got)
		}
	}
}

func TestMappedPeerMatchesIPv4Trust(t *testing.T) {
	res := New(HeaderRealIP, mustPrefixes(t, "172.18.0.5"))
	got := res.Resolve(request("[::ffff:172.18.0.5]:40000", map[string]string{"X-Real-IP": "198.51.100.1"}))
	if got != "198.51.100.1" {
		t.Fatalf("IPv4-mapped peer not matched against IPv4 trust: %q", got)
	}
}

// The middleware writes a bare address: RemoteAddr with an ephemeral port as a
// limiter key would give every connection a fresh bucket.
func TestMiddlewareRewritesRemoteAddrWithoutPort(t *testing.T) {
	var seen []string
	h := New(HeaderRealIP, nil).Middleware(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		seen = append(seen, r.RemoteAddr)
	}))
	h.ServeHTTP(httptest.NewRecorder(), request("203.0.113.9:1111", spoof))
	h.ServeHTTP(httptest.NewRecorder(), request("[2001:db8::1]:2222", spoof))
	if seen[0] != "203.0.113.9" || seen[1] != "2001:db8::1" {
		t.Fatalf("RemoteAddr after middleware = %v", seen)
	}
}

func TestParsePrefixes(t *testing.T) {
	got := mustPrefixes(t, " 172.18.0.5, 10.0.0.0/8 2001:db8::/48\t::ffff:192.168.0.0/112 ")
	want := []string{"172.18.0.5/32", "10.0.0.0/8", "2001:db8::/48", "192.168.0.0/16"}
	if len(got) != len(want) {
		t.Fatalf("got %v", got)
	}
	for i := range want {
		if got[i].String() != want[i] {
			t.Fatalf("prefix %d = %s, want %s", i, got[i], want[i])
		}
	}
	if p := mustPrefixes(t, ""); len(p) != 0 {
		t.Fatalf("empty list parsed to %v", p)
	}
	for _, bad := range []string{"0.0.0.0/0", "::/0", "10.0.0.0/33", "edge", "10.0.0.1/8/8"} {
		if _, err := ParsePrefixes(bad); err == nil {
			t.Fatalf("ParsePrefixes(%q) accepted", bad)
		}
	}
}

func TestLoad(t *testing.T) {
	t.Setenv(EnvTrustedProxies, "")
	res, err := LoadEdge()
	if err != nil {
		t.Fatal(err)
	}
	if got := res.Resolve(request("172.18.0.5:1", spoof)); got != "172.18.0.5" {
		t.Fatalf("unset TRUSTED_PROXY_CIDRS trusted a peer: %q", got)
	}
	t.Setenv(EnvTrustedProxies, "172.18.0.5/32")
	if res, err = LoadEdge(); err != nil {
		t.Fatal(err)
	}
	if got := res.Resolve(request("172.18.0.5:1", spoof)); got != "198.51.100.77" {
		t.Fatalf("configured edge not trusted: %q", got)
	}
	t.Setenv(EnvTrustedProxies, "0.0.0.0/0")
	if _, err := LoadEdge(); err == nil {
		t.Fatal("a trust-everything list loaded")
	}
}

// A9-04: one IPv6 subscriber's /64 is one bucket; IPv4 stays per address.
func TestLimiterKey(t *testing.T) {
	cases := map[string]string{
		"198.51.100.7":                           "198.51.100.7",
		"198.51.100.7:4000":                      "198.51.100.7",
		"::ffff:198.51.100.7":                    "198.51.100.7",
		"[::ffff:198.51.100.7]:4000":             "198.51.100.7",
		"2001:db8:1:2::1":                        "2001:db8:1:2::/64",
		"2001:db8:1:2:ffff:ffff:ffff:ffff":       "2001:db8:1:2::/64",
		"[2001:db8:1:2:aaaa:bbbb:cccc:dddd]:443": "2001:db8:1:2::/64",
		"2001:DB8:1:2::9":                        "2001:db8:1:2::/64",
		"fe80::1%eth0":                           "fe80::/64",
		"2001:db8:1:3::1":                        "2001:db8:1:3::/64",
		"garbage":                                "garbage",
	}
	for in, want := range cases {
		if got := LimiterKey(in); got != want {
			t.Errorf("LimiterKey(%q) = %q, want %q", in, got, want)
		}
	}
	// Two addresses in one /64 share a key; neighbouring /64s do not.
	if LimiterKey("2001:db8:1:2::1") != LimiterKey("2001:db8:1:2:dead:beef:0:1") {
		t.Fatal("addresses in one /64 got different keys")
	}
	if LimiterKey("2001:db8:1:2::1") == LimiterKey("2001:db8:1:3::1") {
		t.Fatal("different /64s share a key")
	}
}

func TestHost(t *testing.T) {
	cases := map[string]string{
		"198.51.100.7:4000":       "198.51.100.7",
		"198.51.100.7":            "198.51.100.7",
		"[2001:db8::1]:443":       "2001:db8::1",
		"2001:db8::1":             "2001:db8::1",
		"[::ffff:198.51.100.7]:1": "198.51.100.7",
		"garbage":                 "garbage",
	}
	for in, want := range cases {
		if got := Host(in); got != want {
			t.Errorf("Host(%q) = %q, want %q", in, got, want)
		}
	}
}
