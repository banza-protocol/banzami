package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/banzami/banzami/services/common/obs"
	"net/url"
	"time"
)

// GatewayClient calls the api-gateway INTERNAL merchant-application endpoints
// (the gateway is the sole writer of handle/credential/activation tables). The
// shared secret is sent as X-Internal-Key.
type GatewayClient struct {
	baseURL     string
	internalKey string
	httpClient  *http.Client
}

func NewGatewayClient(baseURL, internalKey string) *GatewayClient {
	return &GatewayClient{
		baseURL:     baseURL,
		internalKey: internalKey,
		httpClient:  &http.Client{Timeout: 25 * time.Second, Transport: obs.NewPropagationTransport(nil)},
	}
}

// ApprovalResult mirrors the gateway response. ActivationToken is the raw token
// used to build the email link; it is never persisted or returned to the admin UI.
type ApprovalResult struct {
	ApplicationID   string `json:"application_id"`
	MerchantID      string `json:"merchant_id"`
	BusinessName    string `json:"business_name"`
	Email           string `json:"email"`
	Handle          string `json:"handle"`
	Environment     string `json:"environment"`
	ActivationToken string `json:"activation_token"`
	ApiKeyPrefix    string `json:"api_key_prefix"`
	// AlreadyApproved: a repeated approval changed nothing; no new link exists.
	AlreadyApproved bool `json:"already_approved"`
}

type RejectionResult struct {
	ApplicationID   string `json:"application_id"`
	BusinessName    string `json:"business_name"`
	Email           string `json:"email"`
	MerchantMessage string `json:"merchant_message"`
}

func (c *GatewayClient) do(ctx context.Context, method, path string, body, out any) (int, error) {
	var r io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return 0, err
		}
		r = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, r)
	if err != nil {
		return 0, err
	}
	req.Header.Set("X-Internal-Key", c.internalKey)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return resp.StatusCode, fmt.Errorf("gateway returned %d", resp.StatusCode)
	}
	if out != nil && len(raw) > 0 {
		if err := json.Unmarshal(raw, out); err != nil {
			return resp.StatusCode, err
		}
	}
	return resp.StatusCode, nil
}

// ReverseProof asks the gateway (which owns transaction proofs) to flip a
// transaction's public proof to REVERSED — e.g. after a dispute resolved
// WON_BY_CONSUMER. Idempotent on the gateway; a no-op when no proof exists yet.
func (c *GatewayClient) ReverseProof(ctx context.Context, transactionID, environment string) error {
	_, err := c.do(ctx, http.MethodPost, "/internal/v1/proofs/reverse",
		map[string]string{"transaction_id": transactionID, "environment": environment}, nil)
	return err
}

// ListApplicationsRaw / GetApplicationRaw forward the gateway JSON verbatim to
// the admin UI (no secrets in these payloads).
func (c *GatewayClient) ListApplicationsRaw(ctx context.Context, status, environment string) (json.RawMessage, int, error) {
	q := "?status=" + status + "&environment=" + environment
	var raw json.RawMessage
	code, err := c.do(ctx, http.MethodGet, "/internal/v1/merchant-applications"+q, nil, &raw)
	return raw, code, err
}

func (c *GatewayClient) GetApplicationRaw(ctx context.Context, id string) (json.RawMessage, int, error) {
	var raw json.RawMessage
	code, err := c.do(ctx, http.MethodGet, "/internal/v1/merchant-applications/"+id, nil, &raw)
	return raw, code, err
}

func (c *GatewayClient) ApproveApplication(ctx context.Context, id, reviewedBy string) (ApprovalResult, int, error) {
	var out ApprovalResult
	code, err := c.do(ctx, http.MethodPost, "/internal/v1/merchant-applications/"+id+"/approve",
		map[string]string{"reviewed_by": reviewedBy}, &out)
	return out, code, err
}

func (c *GatewayClient) RejectApplication(ctx context.Context, id, reviewedBy, adminNotes, merchantMessage string) (RejectionResult, int, error) {
	var out RejectionResult
	code, err := c.do(ctx, http.MethodPost, "/internal/v1/merchant-applications/"+id+"/reject",
		map[string]string{"reviewed_by": reviewedBy, "admin_notes": adminNotes, "merchant_message": merchantMessage}, &out)
	return out, code, err
}

// Application lifecycle — raw passthrough, so the operator UI sees the
// gateway's precise refusal (DOCUMENTS_REQUIRED, LINK_REQUIRED,
// HANDLE_OWNED_BY_BUSINESS …) instead of a generic failure.

func (c *GatewayClient) ApproveApplicationRaw(ctx context.Context, id, reviewedBy string) (json.RawMessage, int, error) {
	return c.doRaw(ctx, http.MethodPost, "/internal/v1/merchant-applications/"+id+"/approve",
		map[string]string{"reviewed_by": reviewedBy})
}

func (c *GatewayClient) RejectApplicationRaw(ctx context.Context, id, reviewedBy, adminNotes, merchantMessage string) (json.RawMessage, int, error) {
	return c.doRaw(ctx, http.MethodPost, "/internal/v1/merchant-applications/"+id+"/reject",
		map[string]string{"reviewed_by": reviewedBy, "admin_notes": adminNotes, "merchant_message": merchantMessage})
}

func (c *GatewayClient) StartApplicationReviewRaw(ctx context.Context, id, reviewedBy string) (json.RawMessage, int, error) {
	return c.doRaw(ctx, http.MethodPost, "/internal/v1/merchant-applications/"+id+"/start-review",
		map[string]string{"reviewed_by": reviewedBy})
}

func (c *GatewayClient) RequestApplicationInformationRaw(ctx context.Context, id, reviewedBy, message string) (json.RawMessage, int, error) {
	return c.doRaw(ctx, http.MethodPost, "/internal/v1/merchant-applications/"+id+"/request-information",
		map[string]string{"reviewed_by": reviewedBy, "message": message})
}

func (c *GatewayClient) LinkApplicationRaw(ctx context.Context, id, merchantID, confirmationHandle, reviewedBy, reason string) (json.RawMessage, int, error) {
	return c.doRaw(ctx, http.MethodPost, "/internal/v1/merchant-applications/"+id+"/link-existing",
		map[string]string{"merchant_id": merchantID, "confirmation_handle": confirmationHandle,
			"reviewed_by": reviewedBy, "reason": reason})
}

func (c *GatewayClient) ReissueActivationRaw(ctx context.Context, id string) (json.RawMessage, int, error) {
	return c.doRaw(ctx, http.MethodPost, "/internal/v1/merchant-applications/"+id+"/reissue-activation", nil)
}

func (c *GatewayClient) LinkCandidatesRaw(ctx context.Context, id, handle string) (json.RawMessage, int, error) {
	return c.doRaw(ctx, http.MethodGet, "/internal/v1/merchant-applications/"+id+"/link-candidates?handle="+url.QueryEscape(handle), nil)
}

func (c *GatewayClient) BusinessStateRaw(ctx context.Context, merchantID string) (json.RawMessage, int, error) {
	return c.doRaw(ctx, http.MethodGet, "/internal/v1/businesses/"+merchantID+"/state", nil)
}

func (c *GatewayClient) ApplicationBusinessStateRaw(ctx context.Context, id string) (json.RawMessage, int, error) {
	return c.doRaw(ctx, http.MethodGet, "/internal/v1/merchant-applications/"+id+"/business-state", nil)
}

// -------------------------------------------------------------------------
// KYB documents (Track 3) — passthrough. doRaw forwards the gateway body AND
// status verbatim (including 503 STORAGE_NOT_CONFIGURED) so the admin UI can
// react. Read URLs are forwarded to the UI but never logged here.
// -------------------------------------------------------------------------

func (c *GatewayClient) doRaw(ctx context.Context, method, path string, body any) (json.RawMessage, int, error) {
	var r io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, 0, err
		}
		r = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, r)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("X-Internal-Key", c.internalKey)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	return json.RawMessage(raw), resp.StatusCode, nil
}

func (c *GatewayClient) ListApplicationDocumentsRaw(ctx context.Context, id string) (json.RawMessage, int, error) {
	return c.doRaw(ctx, http.MethodGet, "/internal/v1/merchant-applications/"+id+"/documents", nil)
}

func (c *GatewayClient) CreateDocumentReadURLRaw(ctx context.Context, id, documentID string) (json.RawMessage, int, error) {
	return c.doRaw(ctx, http.MethodPost, "/internal/v1/merchant-applications/"+id+"/documents/"+documentID+"/read-url", nil)
}

func (c *GatewayClient) AcceptDocumentRaw(ctx context.Context, id, documentID, reviewedBy string) (json.RawMessage, int, error) {
	return c.doRaw(ctx, http.MethodPost, "/internal/v1/merchant-applications/"+id+"/documents/"+documentID+"/accept",
		map[string]string{"reviewed_by": reviewedBy})
}

func (c *GatewayClient) RejectDocumentRaw(ctx context.Context, id, documentID, reviewedBy, reason string) (json.RawMessage, int, error) {
	return c.doRaw(ctx, http.MethodPost, "/internal/v1/merchant-applications/"+id+"/documents/"+documentID+"/reject",
		map[string]string{"reviewed_by": reviewedBy, "reason": reason})
}

// ── Merchant KYB documents (post-approval) — admin review ───────────────────

// NotificationSummaryRaw returns the operator review-queue counts from the
// gateway (live or staging, per the chosen client).
func (c *GatewayClient) NotificationSummaryRaw(ctx context.Context) (json.RawMessage, int, error) {
	return c.doRaw(ctx, http.MethodGet, "/internal/v1/notifications/summary", nil)
}

func (c *GatewayClient) ListMerchantKybDocumentsRaw(ctx context.Context, status, limit string) (json.RawMessage, int, error) {
	q := url.Values{}
	if status != "" {
		q.Set("status", status)
	}
	if limit != "" {
		q.Set("limit", limit)
	}
	path := "/internal/v1/merchant-kyb/documents"
	if e := q.Encode(); e != "" {
		path += "?" + e
	}
	return c.doRaw(ctx, http.MethodGet, path, nil)
}

func (c *GatewayClient) ApproveMerchantKybDocumentRaw(ctx context.Context, documentID, actor, validUntil, notes string) (json.RawMessage, int, error) {
	return c.doRaw(ctx, http.MethodPost, "/internal/v1/merchant-kyb/documents/"+documentID+"/approve",
		map[string]string{"actor": actor, "valid_until": validUntil, "notes": notes})
}

func (c *GatewayClient) RejectMerchantKybDocumentRaw(ctx context.Context, documentID, actor, reason, notes string) (json.RawMessage, int, error) {
	return c.doRaw(ctx, http.MethodPost, "/internal/v1/merchant-kyb/documents/"+documentID+"/reject",
		map[string]string{"actor": actor, "rejection_reason": reason, "notes": notes})
}

func (c *GatewayClient) ListMerchantKybMerchantsRaw(ctx context.Context, limit string) (json.RawMessage, int, error) {
	path := "/internal/v1/merchant-kyb/merchants"
	if limit != "" {
		path += "?limit=" + limit
	}
	return c.doRaw(ctx, http.MethodGet, path, nil)
}

func (c *GatewayClient) MerchantKybMerchantDocumentsRaw(ctx context.Context, merchantID string) (json.RawMessage, int, error) {
	return c.doRaw(ctx, http.MethodGet, "/internal/v1/merchant-kyb/merchants/"+merchantID+"/documents", nil)
}

func (c *GatewayClient) MerchantKybContextRaw(ctx context.Context, merchantID string) (json.RawMessage, int, error) {
	return c.doRaw(ctx, http.MethodGet, "/internal/v1/merchant-kyb/merchants/"+merchantID+"/context", nil)
}

func (c *GatewayClient) MerchantKybTimelineRaw(ctx context.Context, merchantID string) (json.RawMessage, int, error) {
	return c.doRaw(ctx, http.MethodGet, "/internal/v1/merchant-kyb/merchants/"+merchantID+"/timeline", nil)
}

func (c *GatewayClient) MerchantKybReadURLRaw(ctx context.Context, documentID string) (json.RawMessage, int, error) {
	return c.doRaw(ctx, http.MethodPost, "/internal/v1/merchant-kyb/documents/"+documentID+"/read-url", nil)
}
