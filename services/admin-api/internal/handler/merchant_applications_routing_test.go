package handler

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/banzami/banzami/services/admin-api/internal/service"
)

// Named only so the assertion can say WHICH stack a request reached.
type stubGateway struct{ name string }

func (s *stubGateway) ListApplicationsRaw(context.Context, string, string) (json.RawMessage, int, error) {
	return json.RawMessage(`{}`), 200, nil
}
func (s *stubGateway) GetApplicationRaw(context.Context, string) (json.RawMessage, int, error) {
	return json.RawMessage(`{}`), 200, nil
}
func (s *stubGateway) ApproveApplication(context.Context, string, string) (service.ApprovalResult, int, error) {
	return service.ApprovalResult{}, 200, nil
}
func (s *stubGateway) RejectApplication(context.Context, string, string, string, string) (service.RejectionResult, int, error) {
	return service.RejectionResult{}, 200, nil
}
func (s *stubGateway) ListApplicationDocumentsRaw(context.Context, string) (json.RawMessage, int, error) {
	return json.RawMessage(`{}`), 200, nil
}
func (s *stubGateway) CreateDocumentReadURLRaw(context.Context, string, string) (json.RawMessage, int, error) {
	return json.RawMessage(`{}`), 200, nil
}
func (s *stubGateway) AcceptDocumentRaw(context.Context, string, string, string) (json.RawMessage, int, error) {
	return json.RawMessage(`{}`), 200, nil
}
func (s *stubGateway) RejectDocumentRaw(context.Context, string, string, string, string) (json.RawMessage, int, error) {
	return json.RawMessage(`{}`), 200, nil
}

type stubPlatform struct{ mode string }

func (s stubPlatform) GetMode(context.Context) service.PlatformMode {
	return service.PlatformMode{Mode: s.mode}
}

// An unqualified request must follow the platform's mode, not default to live.
//
// gatewayFor fell through to the live stack whenever the environment was not
// the literal "SANDBOX". While the platform is SANDBOX the live stack is not
// deployed at all, so that call failed at the socket and the operator console
// answered 502 on Business applications while every other page worked. The
// admin UI always sends the environment, which is exactly why nobody saw it.
func TestGatewayForRequest_UnqualifiedFollowsPlatformMode(t *testing.T) {
	live := &stubGateway{name: "live"}
	sandbox := &stubGateway{name: "sandbox"}

	for _, tc := range []struct {
		name, mode, environment, want string
	}{
		{"no environment, platform SANDBOX", "SANDBOX", "", "sandbox"},
		{"no environment, platform LIVE", "LIVE", "", "live"},
		{"explicit SANDBOX wins", "LIVE", "SANDBOX", "sandbox"},
		{"explicit LIVE wins", "SANDBOX", "LIVE", "live"},
		{"whitespace counts as unqualified", "SANDBOX", "   ", "sandbox"},
	} {
		h := NewMerchantApplicationHandler(live, sandbox, nil, "", stubPlatform{mode: tc.mode})
		got := h.gatewayForRequest(context.Background(), tc.environment).(*stubGateway).name
		if got != tc.want {
			t.Errorf("%s: routed to %s, want %s", tc.name, got, tc.want)
		}
	}
}

// An unreadable platform mode must not route an operator at the live stack.
func TestGatewayForRequest_UnreadableModeFailsToSandbox(t *testing.T) {
	live := &stubGateway{name: "live"}
	sandbox := &stubGateway{name: "sandbox"}
	h := NewMerchantApplicationHandler(live, sandbox, nil, "", nil) // no platform reader
	if got := h.gatewayForRequest(context.Background(), "").(*stubGateway).name; got != "sandbox" {
		t.Fatalf("routed to %s with no platform reader, want sandbox", got)
	}
}

func (s *stubGateway) ApproveApplicationRaw(context.Context, string, string) (json.RawMessage, int, error) {
	return json.RawMessage(`{}`), 200, nil
}
func (s *stubGateway) RejectApplicationRaw(context.Context, string, string, string, string) (json.RawMessage, int, error) {
	return json.RawMessage(`{}`), 200, nil
}
func (s *stubGateway) StartApplicationReviewRaw(context.Context, string, string) (json.RawMessage, int, error) {
	return json.RawMessage(`{}`), 200, nil
}
func (s *stubGateway) BusinessStateRaw(context.Context, string) (json.RawMessage, int, error) {
	return json.RawMessage(`{}`), 404, nil
}
func (s *stubGateway) RequestApplicationInformationRaw(context.Context, string, string, string) (json.RawMessage, int, error) {
	return json.RawMessage(`{}`), 404, nil
}
func (s *stubGateway) LinkApplicationRaw(context.Context, string, string, string, string, string) (json.RawMessage, int, error) {
	return json.RawMessage(`{}`), 200, nil
}
func (s *stubGateway) ReissueActivationRaw(context.Context, string) (json.RawMessage, int, error) {
	return json.RawMessage(`{}`), 200, nil
}
func (s *stubGateway) LinkCandidatesRaw(context.Context, string, string) (json.RawMessage, int, error) {
	return json.RawMessage(`{}`), 200, nil
}
func (s *stubGateway) ApplicationBusinessStateRaw(context.Context, string) (json.RawMessage, int, error) {
	return json.RawMessage(`{}`), 200, nil
}
