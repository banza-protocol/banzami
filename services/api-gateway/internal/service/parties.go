package service

import (
	"context"
	"net/url"
	"strings"
)

// ResolvedParty is a @banza handle resolved to the ledger account that receives
// its funds (ADR-029). The available_account_id is gateway-internal — used to set
// a settlement's beneficiary / fee destination; it is never exposed to apps.
type ResolvedParty struct {
	Handle             string `json:"handle"`
	OwnerType          string `json:"owner_type"`
	OwnerID            string `json:"owner_id"`
	AvailableAccountID string `json:"available_account_id"`
	Currency           string `json:"currency"`
}

type PartyResolver interface {
	Resolve(ctx context.Context, handle, currency string) (*ResolvedParty, error)
}

type CoreApiPartyResolver struct{ client *CoreApiClient }

func NewCoreApiPartyResolver(c *CoreApiClient) *CoreApiPartyResolver {
	return &CoreApiPartyResolver{client: c}
}

func (s *CoreApiPartyResolver) Resolve(ctx context.Context, handle, currency string) (*ResolvedParty, error) {
	h := strings.TrimPrefix(strings.TrimSpace(handle), "@")
	q := url.Values{}
	q.Set("currency", currency)
	var r ResolvedParty
	if err := s.client.get(ctx, "/internal/v1/parties/resolve/"+url.PathEscape(h)+"?"+q.Encode(), &r); err != nil {
		return nil, err
	}
	return &r, nil
}
