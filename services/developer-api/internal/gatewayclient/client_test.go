package gatewayclient

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

// The boundary carries the Gateway's reasoned refusals to the developer with
// their codes, reports "never applied" as nothing rather than an error, and
// treats anything else — including its own credential being refused — as an
// outage, never as a "no".
func TestClient_RefusalsOutagesAndAbsence(t *testing.T) {
	var gotKey string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotKey = r.Header.Get("X-Internal-Key")
		switch r.URL.Path {
		case "/internal/v1/merchant-applications/for-project/none":
			w.WriteHeader(404)
			_, _ = w.Write([]byte(`{"code":"APPLICATION_NOT_FOUND"}`))
		case "/internal/v1/business-link-codes/redeem":
			w.WriteHeader(422)
			_, _ = w.Write([]byte(`{"code":"LINK_CODE_INVALID","message":"the code is not valid"}`))
		case "/internal/v1/merchant-applications/for-project":
			w.WriteHeader(401)
		default:
			w.WriteHeader(500)
		}
	}))
	defer srv.Close()
	c := New(srv.URL, "k-internal")
	ctx := context.Background()

	if app, err := c.LatestForProject(ctx, "none"); err != nil || app != nil {
		t.Fatalf("never applied: %v %v", app, err)
	}
	if gotKey != "k-internal" {
		t.Fatal("the internal credential was not sent")
	}
	_, err := c.RedeemLinkCode(ctx, "X", "p")
	var r *Refusal
	if !errors.As(err, &r) || r.Code != "LINK_CODE_INVALID" || r.Status != 422 {
		t.Fatalf("refusal: %v", err)
	}
	if _, err := c.SubmitForProject(ctx, ApplicationInput{}); !errors.Is(err, ErrUnavailable) {
		t.Fatalf("our own credential refused is an outage, not the developer's error: %v", err)
	}
	if _, err := c.LatestForProject(ctx, "boom"); !errors.Is(err, ErrUnavailable) {
		t.Fatalf("5xx: %v", err)
	}
	if New("", "k") != nil || New(srv.URL, "") != nil {
		t.Fatal("an unconfigured client must be nil")
	}
}

// A Business's public identity comes from the Gateway's internal route, with the
// internal credential; an outage is an outage.
func TestClient_BusinessPublicIdentity(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Internal-Key") != "k-internal" {
			w.WriteHeader(401)
			return
		}
		if r.URL.Path == "/internal/v1/businesses/m-1/public-identity" {
			_, _ = w.Write([]byte(`{"display_name":"Doa","handle":"doa"}`))
			return
		}
		w.WriteHeader(500)
	}))
	defer srv.Close()
	c := New(srv.URL, "k-internal")
	b, err := c.BusinessPublicIdentity(context.Background(), "m-1")
	if err != nil || b.DisplayName != "Doa" || b.Handle != "doa" {
		t.Fatalf("identity: %+v %v", b, err)
	}
	if _, err := c.BusinessPublicIdentity(context.Background(), "m-2"); !errors.Is(err, ErrUnavailable) {
		t.Fatalf("5xx: %v", err)
	}
}
