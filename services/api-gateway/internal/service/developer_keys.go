package service

// Developer key introspection client (ADR-046). The Gateway delegates external
// developer-key verification to developer-api (the single key authority); it
// holds no key material. The raw key is forwarded over the internal network
// only and never logged.

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"
)

// DeveloperKeyContext is the resolved authorization context of a verified
// external developer key. No raw secret is present.
type DeveloperKeyContext struct {
	KeyID       string   `json:"key_id"`
	Environment string   `json:"environment"`
	WorkspaceID string   `json:"workspace_id"`
	ProjectID   string   `json:"project_id"`
	Scopes      []string `json:"scopes"`
}

// ErrDeveloperKeyInvalid is returned for any unverified/forbidden key.
var ErrDeveloperKeyInvalid = errors.New("developer key invalid")

// DeveloperKeyClient calls developer-api's internal introspection endpoint.
type DeveloperKeyClient struct {
	baseURL     string
	internalKey string
	http        *http.Client
}

// NewDeveloperKeyClient returns nil when unconfigured (feature disabled).
func NewDeveloperKeyClient(baseURL, internalKey string) *DeveloperKeyClient {
	if baseURL == "" || internalKey == "" {
		return nil
	}
	return &DeveloperKeyClient{
		baseURL:     baseURL,
		internalKey: internalKey,
		http:        &http.Client{Timeout: 5 * time.Second},
	}
}

// Authorize verifies a raw key and returns its resolved context. It returns
// ErrDeveloperKeyInvalid for any non-2xx (neutral — no internal detail).
func (c *DeveloperKeyClient) Authorize(ctx context.Context, rawKey string) (*DeveloperKeyContext, error) {
	body, _ := json.Marshal(map[string]string{"api_key": rawKey})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/internal/v1/keys/authorize", bytes.NewReader(body))
	if err != nil {
		return nil, ErrDeveloperKeyInvalid
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Key", c.internalKey)
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, ErrDeveloperKeyInvalid
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, ErrDeveloperKeyInvalid
	}
	var out DeveloperKeyContext
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, ErrDeveloperKeyInvalid
	}
	return &out, nil
}
