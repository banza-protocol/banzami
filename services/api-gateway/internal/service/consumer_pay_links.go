package service

import (
	"context"
	"errors"
	"time"
)

var ErrConsumerPayLinkNotFound = errors.New("consumer pay link not found")

type ConsumerPayLink struct {
	ID                  string     `json:"id"`
	LinkCode            string     `json:"link_code"`
	ReceiverConsumerID  string     `json:"receiver_consumer_id"`
	ReceiverHandle      string     `json:"receiver_handle"`
	ReceiverDisplayName *string    `json:"receiver_display_name"`
	AmountMinor         *int64     `json:"amount_minor"`
	Note                *string    `json:"note"`
	Currency            string     `json:"currency"`
	Locked              bool       `json:"locked"`
	Status              string     `json:"status"`
	ExpiresAt           *time.Time `json:"expires_at"`
	CreatedAt           time.Time  `json:"created_at"`
	PaidAt              *time.Time `json:"paid_at"`
}

type ConsumerPayLinkService interface {
	GetByCode(ctx context.Context, code string) (*ConsumerPayLink, error)
}

type CoreApiConsumerPayLinkService struct {
	client *CoreApiClient
}

func NewCoreApiConsumerPayLinkService(client *CoreApiClient) *CoreApiConsumerPayLinkService {
	return &CoreApiConsumerPayLinkService{client: client}
}

func (s *CoreApiConsumerPayLinkService) GetByCode(ctx context.Context, code string) (*ConsumerPayLink, error) {
	var link ConsumerPayLink
	if err := s.client.get(ctx, "/internal/v1/consumer-pay-links/by-code/"+code, &link); err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrConsumerPayLinkNotFound
		}
		return nil, err
	}
	return &link, nil
}
