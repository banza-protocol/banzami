package developer

import (
	"errors"
	"strings"
	"testing"
)

// Creating a webhook endpoint from the Console.
//
// This existed only behind a project API key, which meant an ordinary developer
// had to write and run code before receiving a first event, and the signing
// secret arrived through a terminal instead of the reveal-once the product
// already has. These are the guards that make the Console path safe to offer:
// ownership, the SSRF policy, the event vocabulary, and reveal-once.

// setupWebhookProject builds a project with a financial owner, the way the
// Console does: workspace, project, Financial Setup. Everything below needs a
// bound project, because an endpoint belongs to the project's owner and a
// project without one has nothing to attach events to.
func setupWebhookProject(t *testing.T) (*Service, string, string) {
	t.Helper()
	// setupSvc is the cleanroom's starting position: a Sandbox deployment, a
	// workspace with one member of every role, and a project with no financial
	// owner. Everything below needs that owner, because an endpoint belongs to
	// it and a project without one has nothing to attach events to.
	svc, _, pid := setupSvc(t)
	if _, err := svc.ConfigureProjectFinancialSandbox(bg, "u_owner", pid, "", ""); err != nil {
		t.Fatalf("financial setup: %v", err)
	}
	return svc, "u_owner", pid
}

func TestCreateWebhookEndpoint_RevealsTheSecretExactlyOnce(t *testing.T) {
	svc, owner, proj := setupWebhookProject(t)
	ep, err := svc.CreateProjectWebhookEndpoint(bg, owner, proj,
		"https://example.test/hooks/banzami", []string{"payment_session.paid"})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if !strings.HasPrefix(ep.Secret, "whsec_") || len(ep.Secret) < 40 {
		t.Fatalf("secret does not look like a signing secret (len %d)", len(ep.Secret))
	}
	if !ep.Active {
		t.Fatalf("a new endpoint must be active")
	}

	// Every later read must be secret-free. The view type has no field for one,
	// so this is really asserting that the list route keeps returning the view.
	list, err := svc.ProjectWebhookEndpoints(bg, owner, proj)
	if err != nil || len(list) != 1 {
		t.Fatalf("list: %v (%d endpoints)", err, len(list))
	}
	if list[0].ID != ep.ID {
		t.Fatalf("listed endpoint %q, created %q", list[0].ID, ep.ID)
	}
}

func TestCreateWebhookEndpoint_RefusesNonPublicDestinations(t *testing.T) {
	svc, owner, proj := setupWebhookProject(t)

	// The whole point of the policy: a developer supplies this URL, and the
	// operator makes signed requests to it. Loopback, cloud metadata and
	// RFC1918 would turn that into a request into infrastructure.
	for _, bad := range []string{
		"http://example.test/hook",       // not https
		"https://localhost/hook",         // loopback by name
		"https://127.0.0.1/hook",         // loopback by address
		"https://169.254.169.254/latest", // cloud metadata
		"https://10.0.0.5/hook",          // RFC1918
		"https://192.168.1.1/hook",       // RFC1918
		"https://[::1]/hook",             // IPv6 loopback
		"https://internal.internal/hook", // internal suffix
		"not a url at all",
	} {
		if _, err := svc.CreateProjectWebhookEndpoint(bg, owner, proj, bad, []string{"payment_session.paid"}); !errors.Is(err, ErrWebhookURLRejected) {
			t.Fatalf("%q was not rejected (got %v)", bad, err)
		}
	}
}

func TestCreateWebhookEndpoint_RefusesAnEventNothingEmits(t *testing.T) {
	svc, owner, proj := setupWebhookProject(t)

	// A typo that is accepted produces an endpoint that never fires, and the
	// developer debugs their server instead of their subscription.
	_, err := svc.CreateProjectWebhookEndpoint(bg, owner, proj,
		"https://example.test/hook", []string{"payment_session.pais"})
	if !errors.Is(err, ErrUnsupportedEvent) {
		t.Fatalf("want ErrUnsupportedEvent, got %v", err)
	}

	if _, err := svc.CreateProjectWebhookEndpoint(bg, owner, proj, "https://example.test/hook", nil); !errors.Is(err, ErrValidation) {
		t.Fatalf("an endpoint subscribed to nothing must be refused, got %v", err)
	}
}

func TestRotateWebhookSecret_IssuesANewOneAndKeepsTheEndpoint(t *testing.T) {
	svc, owner, proj := setupWebhookProject(t)

	ep, err := svc.CreateProjectWebhookEndpoint(bg, owner, proj, "https://example.test/hook", []string{"payment_session.paid"})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	rotated, err := svc.RotateProjectWebhookSecret(bg, owner, proj, ep.ID)
	if err != nil {
		t.Fatalf("rotate: %v", err)
	}
	if rotated.ID != ep.ID {
		t.Fatalf("rotation must keep the endpoint, got %q want %q", rotated.ID, ep.ID)
	}
	if rotated.Secret == ep.Secret {
		t.Fatalf("rotation returned the same secret")
	}
	// Twice, because "different from the one at creation" is also true of a
	// hard-coded rotation value. Each rotation must mint a fresh secret.
	again, err := svc.RotateProjectWebhookSecret(bg, owner, proj, ep.ID)
	if err != nil {
		t.Fatalf("second rotate: %v", err)
	}
	if again.Secret == rotated.Secret {
		t.Fatalf("two rotations produced the same secret")
	}
	if rotated.URL != ep.URL {
		t.Fatalf("rotation changed the destination")
	}
}

func TestWebhookEndpoint_DisableAndReEnable(t *testing.T) {
	svc, owner, proj := setupWebhookProject(t)

	ep, _ := svc.CreateProjectWebhookEndpoint(bg, owner, proj, "https://example.test/hook", []string{"payment_session.paid"})

	off, err := svc.SetProjectWebhookEndpointActive(bg, owner, proj, ep.ID, false)
	if err != nil || off.Active {
		t.Fatalf("disable: %v active=%v", err, off.Active)
	}
	// Disabled, not deleted — the delivery history stays readable, and someone
	// will want to explain why events stopped.
	list, _ := svc.ProjectWebhookEndpoints(bg, owner, proj)
	if len(list) != 1 {
		t.Fatalf("a disabled endpoint must still be listed, got %d", len(list))
	}
	on, err := svc.SetProjectWebhookEndpointActive(bg, owner, proj, ep.ID, true)
	if err != nil || !on.Active {
		t.Fatalf("re-enable: %v active=%v", err, on.Active)
	}
}

func TestWebhookEndpoint_KnowingAnIdIsNotAuthorityOverIt(t *testing.T) {
	svc, _, _ := setupSvc(t)

	mk := func(user, ws, proj string) string {
		w, err := svc.CreateWorkspace(bg, user, ws, "", "")
		if err != nil {
			t.Fatalf("workspace: %v", err)
		}
		p, err := svc.CreateProject(bg, user, w.ID, proj, "", "")
		if err != nil {
			t.Fatalf("project: %v", err)
		}
		if _, err := svc.ConfigureProjectFinancialSandbox(bg, user, p.ID, "", ""); err != nil {
			t.Fatalf("financial setup: %v", err)
		}
		return p.ID
	}
	projA := mk("user-a", "A", "PA")
	projB := mk("user-b", "B", "PB")

	epA, err := svc.CreateProjectWebhookEndpoint(bg, "user-a", projA, "https://a.test/hook", []string{"payment_session.paid"})
	if err != nil {
		t.Fatalf("create A: %v", err)
	}

	// B knows A's endpoint id. That must buy nothing — and the refusal must not
	// distinguish "not yours" from "does not exist", or it becomes an oracle for
	// which ids are real.
	if _, err := svc.RotateProjectWebhookSecret(bg, "user-b", projB, epA.ID); err == nil {
		t.Fatalf("B rotated A's signing secret")
	}
	if _, err := svc.SetProjectWebhookEndpointActive(bg, "user-b", projB, epA.ID, false); err == nil {
		t.Fatalf("B disabled A's endpoint")
	}
	// And B may not act on A's project either, id or no id.
	if _, err := svc.CreateProjectWebhookEndpoint(bg, "user-b", projA, "https://b.test/hook", []string{"payment_session.paid"}); err == nil {
		t.Fatalf("B created an endpoint on A's project")
	}
}

// The Console's event vocabulary must be what the platform emits. The gateway
// holds the authoritative list; a Console offering an event nothing emits sells
// a subscription that never delivers.
func TestSupportedWebhookEvents_MatchesTheGateway(t *testing.T) {
	gw := gatewaySupportedEvents(t)
	for e := range SupportedWebhookEvents {
		if !gw[e] {
			t.Fatalf("developer-api offers %q, which the gateway does not emit", e)
		}
	}
	for e := range gw {
		if !SupportedWebhookEvents[e] {
			t.Fatalf("the gateway emits %q, which the Console cannot subscribe to", e)
		}
	}
}
