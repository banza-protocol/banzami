package developer

// Creating a webhook endpoint, from the Console.
//
// The Console could list endpoints, events and deliveries. It could not create
// one: the empty state told the developer to call createWebhookEndpoint with a
// project key, which means writing and running code before receiving a first
// event — and, worse, it pushed the signing secret through a terminal instead
// of the reveal-once the product already has for API keys.
//
// The gateway route that creates endpoints authenticates a KEY. The Console
// authenticates a PERSON. Rather than mint a key on someone's behalf — synthetic
// authority for a developer action — this is the same operation performed under
// the session that already owns the project. The URL policy, the secret
// generator and the at-rest cipher are the gateway's, shared through
// services/common/webhookprov, so there is one SSRF policy and one encryption
// construction rather than two.

import (
	"context"
	"errors"
	"strings"

	"github.com/banzami/banzami/services/common/webhookprov"
)

// canManageWebhooks reports whether a workspace role may create, disable or
// rotate a webhook endpoint.
//
// Same line as building anything else in the project: OWNER, ADMIN, DEVELOPER.
// A webhook endpoint receives copies of events; it moves no money and grants no
// authority over the account, so it does not need the narrower financial gate
// that refunds do. VIEWER and FINANCE may read the delivery history like every
// other member and may not change where events go.
func canManageWebhooks(role string) bool { return canBuild(role) }

// ErrWebhookURLRejected is the endpoint URL failing the public policy: https
// only, and never an address inside infrastructure.
var ErrWebhookURLRejected = errors.New("webhook url rejected")

// ErrUnsupportedEvent names an event the platform does not emit. Accepting a
// typo would produce an endpoint that silently never fires.
var ErrUnsupportedEvent = errors.New("unsupported event type")

// SupportedWebhookEvents is what the operator actually emits. Kept in step with
// the gateway's own list by webhook_events_test.go — a Console that offered an
// event nothing emits would be a subscription that never delivers.
var SupportedWebhookEvents = map[string]bool{
	"payment.completed":                true,
	"payment_link.paid":                true,
	"payout.sent":                      true,
	"payment_session.created":          true,
	"payment_session.paid":             true,
	"application_settlement.completed": true,
	"application_settlement.cancelled": true,
	"application_settlement.failed":    true,
	"refund.completed":                 true,
}

// MaxWebhookURLLength bounds the stored destination (RA-063).
const MaxWebhookURLLength = 2048

// NewWebhookEndpoint is a created endpoint. Secret is present exactly once, in
// the response to creation or rotation, and is never stored in the clear or
// returned by any other call.
type NewWebhookEndpoint struct {
	WebhookEndpointView
	Secret string `json:"secret"`
}

// SetWebhookCipher wires the at-rest cipher. Nil means secrets are stored in
// the clear, which the gateway also permits and which is why it is refused
// outside sandbox at startup rather than silently accepted here.
func (s *Service) SetWebhookCipher(c *webhookprov.SecretCipher) { s.webhookCipher = c }

// CreateProjectWebhookEndpoint registers an endpoint for the project's own
// financial owner and returns the signing secret once.
func (s *Service) CreateProjectWebhookEndpoint(
	ctx context.Context, actor, projectID, rawURL string, events []string,
) (*NewWebhookEndpoint, error) {
	_, role, err := s.projectAuthz(ctx, actor, projectID)
	if err != nil {
		return nil, err
	}
	if !canManageWebhooks(role) {
		return nil, ErrForbidden
	}

	url := strings.TrimSpace(rawURL)
	if len(url) > MaxWebhookURLLength {
		return nil, ErrWebhookURLRejected
	}
	if err := webhookprov.ValidateURL(url); err != nil {
		return nil, ErrWebhookURLRejected
	}
	if len(events) == 0 {
		return nil, ErrValidation
	}
	seen := map[string]bool{}
	clean := make([]string, 0, len(events))
	for _, e := range events {
		e = strings.TrimSpace(e)
		if !SupportedWebhookEvents[e] {
			return nil, ErrUnsupportedEvent
		}
		if seen[e] {
			continue // a repeated subscription is one subscription
		}
		seen[e] = true
		clean = append(clean, e)
	}

	merchant, err := s.projectMerchant(ctx, actor, projectID)
	if err != nil {
		return nil, err
	}

	secret := webhookprov.GenerateSecret()
	stored := secret
	if s.webhookCipher != nil {
		if stored, err = s.webhookCipher.Encrypt(secret); err != nil {
			return nil, ErrUnavailable
		}
	}

	view, err := s.store.CreateWebhookEndpoint(ctx, merchant, url, clean, stored)
	if err != nil {
		return nil, err
	}
	return &NewWebhookEndpoint{WebhookEndpointView: *view, Secret: secret}, nil
}

// RotateProjectWebhookSecret issues a new signing secret for an endpoint the
// project owns and returns it once.
//
// The old secret stops working immediately. That is the point — a rotation that
// left both valid would keep a compromised secret alive for as long as the
// rollout took — and it is why the Console says so before doing it.
func (s *Service) RotateProjectWebhookSecret(
	ctx context.Context, actor, projectID, endpointID string,
) (*NewWebhookEndpoint, error) {
	_, role, err := s.projectAuthz(ctx, actor, projectID)
	if err != nil {
		return nil, err
	}
	if !canManageWebhooks(role) {
		return nil, ErrForbidden
	}
	merchant, err := s.projectMerchant(ctx, actor, projectID)
	if err != nil {
		return nil, err
	}

	secret := webhookprov.GenerateSecret()
	stored := secret
	if s.webhookCipher != nil {
		if stored, err = s.webhookCipher.Encrypt(secret); err != nil {
			return nil, ErrUnavailable
		}
	}
	// Scoped by merchant in the UPDATE itself: knowing an endpoint id is not
	// authority over it, and a project must not be able to rotate a stranger's
	// secret by guessing a uuid.
	view, err := s.store.RotateWebhookEndpointSecret(ctx, merchant, endpointID, stored)
	if err != nil {
		return nil, err
	}
	return &NewWebhookEndpoint{WebhookEndpointView: *view, Secret: secret}, nil
}

// SetProjectWebhookEndpointActive enables or disables delivery to an endpoint.
//
// Disable rather than delete: the delivery history stays readable, and an
// endpoint that stopped receiving is a fact someone will want to explain later.
func (s *Service) SetProjectWebhookEndpointActive(
	ctx context.Context, actor, projectID, endpointID string, active bool,
) (*WebhookEndpointView, error) {
	_, role, err := s.projectAuthz(ctx, actor, projectID)
	if err != nil {
		return nil, err
	}
	if !canManageWebhooks(role) {
		return nil, ErrForbidden
	}
	merchant, err := s.projectMerchant(ctx, actor, projectID)
	if err != nil {
		return nil, err
	}
	return s.store.SetWebhookEndpointActive(ctx, merchant, endpointID, active)
}

// ReplayProjectWebhookDelivery asks for a failed delivery to be sent again.
//
// This is the one webhook operation a developer needs most and could not reach:
// an endpoint that was down for ten minutes lost those events with no way to ask
// for them back, so the only remedy was to reconcile by hand against the API.
//
// A delivery that already succeeded is refused rather than re-queued. The
// integrator received that event and acted on it; sending it again is a second
// "payment received" for one payment, and a webhook consumer that is not
// idempotent would double-count it.
func (s *Service) ReplayProjectWebhookDelivery(ctx context.Context, actor, projectID, deliveryID string) error {
	_, role, err := s.projectAuthz(ctx, actor, projectID)
	if err != nil {
		return err
	}
	if !canManageWebhooks(role) {
		return ErrForbidden
	}
	merchant, err := s.projectMerchant(ctx, actor, projectID)
	if err != nil {
		return err
	}
	return s.store.ReplayWebhookDelivery(ctx, merchant, deliveryID)
}

// DeleteProjectWebhookEndpoint removes an endpoint that never delivered.
//
// Deleting and disabling answer different questions. Disabling stops deliveries
// to an endpoint that is real; deleting is for one that should not be in the
// list at all — a URL typed wrong, a service that no longer exists — and a list
// a developer cannot tidy stops being read.
//
// An endpoint that HAS delivered is refused, because its deliveries reference it
// and that history is not the endpoint's to take with it. That endpoint is
// disabled instead.
func (s *Service) DeleteProjectWebhookEndpoint(ctx context.Context, actor, projectID, endpointID string) error {
	_, role, err := s.projectAuthz(ctx, actor, projectID)
	if err != nil {
		return err
	}
	if !canManageWebhooks(role) {
		return ErrForbidden
	}
	merchant, err := s.projectMerchant(ctx, actor, projectID)
	if err != nil {
		return err
	}
	return s.store.DeleteWebhookEndpoint(ctx, merchant, endpointID)
}
