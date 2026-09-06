package service

import "testing"

func TestValidateWebhookURL_RejectsNonPublic(t *testing.T) {
	rejected := []string{
		"http://example.com/hook",         // not https
		"https://localhost/hook",          // loopback name
		"https://127.0.0.1/hook",          // loopback ip
		"https://169.254.169.254/latest",  // cloud metadata
		"https://10.0.0.5/hook",           // RFC1918
		"https://192.168.1.10/hook",       // RFC1918
		"https://172.16.4.4/hook",         // RFC1918
		"https://[::1]/hook",              // ipv6 loopback
		"https://[fd00::1]/hook",          // ipv6 ULA (private)
		"https://[::ffff:127.0.0.1]/hook", // ipv4-mapped loopback
		"https://api.internal/hook",       // internal suffix
		"https://svc.local/hook",          // mDNS/local suffix
		"https:///nohost",                 // no host
		"://broken",                       // unparseable scheme
	}
	for _, u := range rejected {
		if err := ValidateWebhookURL(u); err == nil {
			t.Errorf("expected rejection for %q, got nil", u)
		}
	}
}

func TestValidateWebhookURL_AllowsPublicHTTPS(t *testing.T) {
	allowed := []string{
		"https://example.com/webhooks/banzami",
		"https://hooks.merchant.co/inbound",
		"https://8.8.8.8/hook", // public literal IP
	}
	for _, u := range allowed {
		if err := ValidateWebhookURL(u); err != nil {
			t.Errorf("expected %q to be allowed, got %v", u, err)
		}
	}
}
