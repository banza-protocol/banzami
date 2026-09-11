package service

import (
	"fmt"
	"strings"
	"testing"
)

// A6-13 — a webhook delivery's log line names the endpoint by id and host,
// never by URL. The URL is the merchant's and may carry a query-string token
// or credentials in its userinfo; every delivery was logged with it whole.
func TestDeliveryLogAttrs_NameTheEndpointNotItsURL(t *testing.T) {
	d := pendingDelivery{
		id:         "del-1",
		endpointID: "ep-1",
		url:        "https://hook-user:hook-pass@hooks.merchant.example:8443/banzami/in?token=tok_9f8e7d&sig=abc#frag",
		secret:     "whsec_never",
	}
	attrs := deliveryLogAttrs(d)
	line := fmt.Sprint(attrs...)
	for _, leak := range []string{"hook-user", "hook-pass", "token", "tok_9f8e7d", "sig=", "/banzami/in", "frag", "whsec_never", "https://"} {
		if strings.Contains(line, leak) {
			t.Fatalf("delivery log attrs carry %q: %v", leak, attrs)
		}
	}
	got := map[string]any{}
	for i := 0; i+1 < len(attrs); i += 2 {
		got[attrs[i].(string)] = attrs[i+1]
	}
	if got["delivery_id"] != "del-1" || got["endpoint_id"] != "ep-1" || got["host"] != "hooks.merchant.example:8443" {
		t.Fatalf("delivery log attrs = %v, want delivery_id, endpoint_id and host", got)
	}
	if _, ok := got["url"]; ok {
		t.Fatalf("delivery log attrs still carry the url: %v", got)
	}
}

func TestWebhookLogHost_NeverEchoesAnUnparseableURL(t *testing.T) {
	for _, raw := range []string{"://bad url?token=secret", "", "not-a-url?token=secret"} {
		if got := webhookLogHost(raw); strings.Contains(got, "secret") || got != "(unparseable)" {
			t.Fatalf("webhookLogHost(%q) = %q", raw, got)
		}
	}
	if got := webhookLogHost("https://hooks.example.com/x?y=z"); got != "hooks.example.com" {
		t.Fatalf("host = %q", got)
	}
}
