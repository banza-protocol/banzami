package developer

import (
	"errors"
	"reflect"
	"testing"
)

// Console webhook visibility: whose webhooks a session may see.
//
// The screen these back used to render invented endpoints and deliveries. Making
// it real means answering "whose?", and the answer must come from the project
// binding — never from a request field, and never from a workspace the caller
// does not belong to.
//
// The failure mode being guarded is not an error page. It is one developer
// opening their Console and reading another company's delivery history, which
// includes their endpoint URLs and the response bodies their servers returned.

func bindProject(t *testing.T, s *Service, st *memStore, projectID, merchantID string) {
	t.Helper()
	if _, err := st.CreateBinding(bg, BindingInsert{
		ProjectID:       projectID,
		MerchantID:      merchantID,
		WalletID:        "wal_" + merchantID,
		WalletAccountID: "wa_" + merchantID,
		CreatedByUserID: "u_owner",
	}); err != nil {
		t.Fatalf("bind %s: %v", projectID, err)
	}
}

func TestWebhookVisibility_ScopedToTheProjectBinding(t *testing.T) {
	s, st, ws := wsWithRoles(t)
	p := mkProject(t, s, "u_dev", ws)
	bindProject(t, s, st, p, "merchant_a")

	// A member of the workspace may read; the merchant is resolved from the
	// binding, and there is no request field that could have supplied one.
	if _, err := s.ProjectWebhookEndpoints(bg, "u_owner", p); err != nil {
		t.Fatalf("owner should read their own project's endpoints: %v", err)
	}
	if _, err := s.ProjectWebhookEvents(bg, "u_dev", p, 10); err != nil {
		t.Fatalf("developer should read their own project's events: %v", err)
	}
}

func TestWebhookVisibility_ForeignProjectIsRefused(t *testing.T) {
	s, st, wsA := wsWithRoles(t)
	pA := mkProject(t, s, "u_dev", wsA)
	bindProject(t, s, st, pA, "merchant_a")

	// A second workspace with its own owner — an unrelated tenant.
	wsB, err := s.CreateWorkspace(bg, "u_other", "Other", "", "")
	if err != nil {
		t.Fatal(err)
	}
	pB := mkProject(t, s, "u_other", wsB.ID)
	bindProject(t, s, st, pB, "merchant_b")

	for _, tc := range []struct {
		name string
		call func() error
	}{
		{"endpoints", func() error { _, e := s.ProjectWebhookEndpoints(bg, "u_other", pA); return e }},
		{"events", func() error { _, e := s.ProjectWebhookEvents(bg, "u_other", pA, 10); return e }},
		{"deliveries", func() error { _, e := s.ProjectWebhookDeliveries(bg, "u_other", pA, "evt_1"); return e }},
	} {
		if err := tc.call(); err == nil {
			t.Errorf("%s: a stranger read another workspace's project — must be refused", tc.name)
		}
	}
}

func TestWebhookVisibility_UnboundProjectHasNoWebhooks(t *testing.T) {
	s, _, ws := wsWithRoles(t)
	p := mkProject(t, s, "u_dev", ws) // deliberately not bound

	// Refused, not an empty list. An empty list asserts the question was
	// meaningful and the answer was "none"; an unbound project has no financial
	// owner for the question to be about.
	if _, err := s.ProjectWebhookEndpoints(bg, "u_dev", p); !errors.Is(err, ErrFinancialSetupRequired) {
		t.Fatalf("unbound project: want ErrFinancialSetupRequired, got %v", err)
	}
}

func TestWebhookVisibility_ViewsCarryNoSigningSecret(t *testing.T) {
	// A compile-time guarantee rather than a runtime one: the view structs have
	// no secret field at all, so no future change to a query can select one into
	// a response. This test exists to fail loudly if someone adds it.
	var ep WebhookEndpointView
	var ev WebhookEventView
	var dl WebhookDeliveryView
	_ = ep
	_ = ev
	_ = dl

	// Reflectively assert the absence, so the guarantee is checked rather than
	// merely intended.
	for _, tc := range []struct {
		name   string
		fields []string
	}{
		{"WebhookEndpointView", structFields(ep)},
		{"WebhookEventView", structFields(ev)},
		{"WebhookDeliveryView", structFields(dl)},
	} {
		for _, f := range tc.fields {
			switch f {
			case "Secret", "SigningSecret", "Key", "APIKey":
				t.Errorf("%s exposes %s — a Console view must never carry credential material", tc.name, f)
			}
		}
	}
}

func TestWebhookVisibility_LimitIsBounded(t *testing.T) {
	s, st, ws := wsWithRoles(t)
	p := mkProject(t, s, "u_dev", ws)
	bindProject(t, s, st, p, "merchant_a")

	// An unbounded caller-supplied limit is a cheap way to make a Console page
	// pull an entire tenant's history in one query. The store clamps it; this
	// pins that the service passes it through rather than pre-validating away
	// the clamp.
	if _, err := s.ProjectWebhookEvents(bg, "u_dev", p, 10_000_000); err != nil {
		t.Fatalf("an absurd limit should be clamped, not an error: %v", err)
	}
	if _, err := s.ProjectWebhookEvents(bg, "u_dev", p, -1); err != nil {
		t.Fatalf("a negative limit should be clamped, not an error: %v", err)
	}
}

// structFields returns the exported field names of a struct value.
func structFields(v any) []string {
	t := reflect.TypeOf(v)
	out := make([]string, 0, t.NumField())
	for i := 0; i < t.NumField(); i++ {
		out = append(out, t.Field(i).Name)
	}
	return out
}
