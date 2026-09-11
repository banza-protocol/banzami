package service

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
)

// A public link identifier (payment-link slug, pay-link code) has one
// spelling. The router decoded the path once and the gateway pasted the result
// into core's URL, which decoded it again: %2541… or <slug>%3Fx resolved.
func TestPublicLinkIdentifiers_OnlyTheExactSpellingReachesCore(t *testing.T) {
	var calls atomic.Int64
	var lastPath string
	core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		lastPath = r.URL.EscapedPath()
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte(`{"error":{"code":"NOT_FOUND","message":"no"}}`))
	}))
	defer core.Close()
	client := NewCoreApiClient(core.URL, "k")
	links, codes := NewCoreApiPaymentLinkService(client), NewCoreApiConsumerPayLinkService(client)

	for _, slug := range []string{"ABCDEF012345", "abcdef01234", "abcdef0123456", "%2561bcdef01234", "abcdef012345?x", "abcdef012345/../x", "abcdef01234é", ""} {
		if _, err := links.GetBySlug(context.Background(), slug); !errors.Is(err, ErrPaymentLinkNotFound) {
			t.Errorf("slug %q: %v", slug, err)
		}
	}
	for _, code := range []string{"abcdefgh", "ABCDEFG", "ABCDEFGHJ", "ABCD0FGH", "%2541BCDEFGH", "ABCDEFG?"} {
		if _, err := codes.GetByCode(context.Background(), code); !errors.Is(err, ErrConsumerPayLinkNotFound) {
			t.Errorf("code %q: %v", code, err)
		}
	}
	if n := calls.Load(); n != 0 {
		t.Fatalf("%d malformed identifiers reached core", n)
	}

	_, _ = links.GetBySlug(context.Background(), "abcdef012345")
	if calls.Load() != 1 || lastPath != "/internal/v1/payment-links/by-slug/abcdef012345" {
		t.Fatalf("the canonical slug must reach core as itself: %d %q", calls.Load(), lastPath)
	}
}
