package service

import (
	"context"
	"errors"
	"time"
)

var ErrMerchantProfileNotFound = errors.New("merchant profile not found")

type MerchantProfile struct {
	ID          string       `json:"id"`
	MerchantID  string       `json:"merchant_id"`
	Handle      string       `json:"handle"`
	DisplayName string       `json:"display_name"`
	Tagline     *string      `json:"tagline"`
	Description *string      `json:"description"`
	Category    *string      `json:"category"`
	LogoURL     *string      `json:"logo_url"`
	CoverURL    *string      `json:"cover_url"`
	Public      bool         `json:"public"`
	WalletID    *string      `json:"wallet_id"`
	SocialLinks []SocialLink `json:"social_links"`
	CreatedAt   time.Time    `json:"created_at"`
	UpdatedAt   time.Time    `json:"updated_at"`
}

type SocialLink struct {
	Platform string `json:"platform"`
	URL      string `json:"url"`
}

type MerchantProfileService interface {
	GetByHandle(ctx context.Context, handle string) (*MerchantProfile, error)
}

type CoreApiMerchantProfileService struct {
	client *CoreApiClient
}

func NewCoreApiMerchantProfileService(client *CoreApiClient) *CoreApiMerchantProfileService {
	return &CoreApiMerchantProfileService{client: client}
}

func (s *CoreApiMerchantProfileService) GetByHandle(ctx context.Context, handle string) (*MerchantProfile, error) {
	var profile MerchantProfile
	if err := s.client.get(ctx, "/internal/v1/merchant-profiles/by-handle/"+handle, &profile); err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrMerchantProfileNotFound
		}
		return nil, err
	}
	return &profile, nil
}
