package service

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
)

// CollectionService is the gateway-side surface for BANZA Collections (ADR-036)
// and PaymentIntent (ADR-014). It is a thin pass-through to the Rust core, which
// owns persistence, lifecycle, invariants and event emission. The gateway's job
// is auth + ownership/environment scoping: merchant_id and environment are always
// derived from the merchant principal (never trusted from the client) and injected
// here. The core returns 404 on any cross-tenant/cross-environment access.
type CollectionService interface {
	Create(ctx context.Context, merchantID, environment string, body map[string]any) (int, json.RawMessage, error)
	Get(ctx context.Context, merchantID, environment, id string) (int, json.RawMessage, error)
	List(ctx context.Context, merchantID, environment, rawQuery string) (int, json.RawMessage, error)
	Update(ctx context.Context, merchantID, environment, id string, body map[string]any) (int, json.RawMessage, error)
	Close(ctx context.Context, merchantID, environment, id string) (int, json.RawMessage, error)
	Cancel(ctx context.Context, merchantID, environment, id string) (int, json.RawMessage, error)
	CreateShare(ctx context.Context, merchantID, environment, id string, body map[string]any) (int, json.RawMessage, error)
	ListShares(ctx context.Context, merchantID, environment, id, rawQuery string) (int, json.RawMessage, error)
	Events(ctx context.Context, merchantID, environment, id string) (int, json.RawMessage, error)
	SurfaceShare(ctx context.Context, merchantID, environment, shareID string, body map[string]any) (int, json.RawMessage, error)
}

type CoreApiCollectionService struct {
	client *CoreApiClient
}

func NewCoreApiCollectionService(client *CoreApiClient) *CoreApiCollectionService {
	return &CoreApiCollectionService{client: client}
}

// scopeQuery builds the merchant_id+environment query the core's scoped GET
// endpoints require, preserving any caller pagination params.
func scopeQuery(merchantID, environment, rawQuery string) string {
	q, _ := url.ParseQuery(rawQuery)
	q.Set("merchant_id", merchantID)
	q.Set("environment", environment)
	return q.Encode()
}

func injectScope(merchantID, environment string, body map[string]any) map[string]any {
	if body == nil {
		body = map[string]any{}
	}
	body["merchant_id"] = merchantID
	body["environment"] = environment
	return body
}

func (s *CoreApiCollectionService) Create(ctx context.Context, merchantID, environment string, body map[string]any) (int, json.RawMessage, error) {
	b := injectScope(merchantID, environment, body)
	b["operator_id"] = "banzami"
	b["creator"] = merchantID
	b["owner"] = merchantID
	return s.client.requestRaw(ctx, "POST", "/internal/v1/collections", b)
}

func (s *CoreApiCollectionService) Get(ctx context.Context, merchantID, environment, id string) (int, json.RawMessage, error) {
	path := fmt.Sprintf("/internal/v1/collections/%s?%s", url.PathEscape(id), scopeQuery(merchantID, environment, ""))
	return s.client.requestRaw(ctx, "GET", path, nil)
}

func (s *CoreApiCollectionService) List(ctx context.Context, merchantID, environment, rawQuery string) (int, json.RawMessage, error) {
	path := "/internal/v1/collections?" + scopeQuery(merchantID, environment, rawQuery)
	return s.client.requestRaw(ctx, "GET", path, nil)
}

func (s *CoreApiCollectionService) Update(ctx context.Context, merchantID, environment, id string, body map[string]any) (int, json.RawMessage, error) {
	path := "/internal/v1/collections/" + url.PathEscape(id)
	return s.client.requestRaw(ctx, "PATCH", path, injectScope(merchantID, environment, body))
}

func (s *CoreApiCollectionService) Close(ctx context.Context, merchantID, environment, id string) (int, json.RawMessage, error) {
	path := fmt.Sprintf("/internal/v1/collections/%s/close", url.PathEscape(id))
	return s.client.requestRaw(ctx, "POST", path, injectScope(merchantID, environment, nil))
}

func (s *CoreApiCollectionService) Cancel(ctx context.Context, merchantID, environment, id string) (int, json.RawMessage, error) {
	path := fmt.Sprintf("/internal/v1/collections/%s/cancel", url.PathEscape(id))
	return s.client.requestRaw(ctx, "POST", path, injectScope(merchantID, environment, nil))
}

func (s *CoreApiCollectionService) CreateShare(ctx context.Context, merchantID, environment, id string, body map[string]any) (int, json.RawMessage, error) {
	path := fmt.Sprintf("/internal/v1/collections/%s/shares", url.PathEscape(id))
	return s.client.requestRaw(ctx, "POST", path, injectScope(merchantID, environment, body))
}

func (s *CoreApiCollectionService) ListShares(ctx context.Context, merchantID, environment, id, rawQuery string) (int, json.RawMessage, error) {
	path := fmt.Sprintf("/internal/v1/collections/%s/shares?%s", url.PathEscape(id), scopeQuery(merchantID, environment, rawQuery))
	return s.client.requestRaw(ctx, "GET", path, nil)
}

func (s *CoreApiCollectionService) Events(ctx context.Context, merchantID, environment, id string) (int, json.RawMessage, error) {
	path := fmt.Sprintf("/internal/v1/collections/%s/events?%s", url.PathEscape(id), scopeQuery(merchantID, environment, ""))
	return s.client.requestRaw(ctx, "GET", path, nil)
}

func (s *CoreApiCollectionService) SurfaceShare(ctx context.Context, merchantID, environment, shareID string, body map[string]any) (int, json.RawMessage, error) {
	path := fmt.Sprintf("/internal/v1/collection-shares/%s/surface", url.PathEscape(shareID))
	return s.client.requestRaw(ctx, "POST", path, injectScope(merchantID, environment, body))
}
