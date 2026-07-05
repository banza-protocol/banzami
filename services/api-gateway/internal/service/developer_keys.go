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
	WorkspaceID string   `json:"workspace_id"`  // internal: tenant enforcement only, never exposed
	ProjectID   string   `json:"project_id"`    // internal: tenant enforcement only, never exposed
	ProjectSlug string   `json:"project_slug"`  // project-safe public identifier
	KeyStatus   string   `json:"key_status"`
	Scopes      []string `json:"scopes"`

	// Binding (ADR-047) — the Project's resolved SANDBOX payee. Bound=false means
	// the Project has no payee authority (payments must be refused). The ids are
	// OPAQUE and INTERNAL — used only to derive the payee for Core, NEVER exposed
	// on any payer-facing response.
	Bound           bool   `json:"bound"`
	MerchantID      string `json:"merchant_id"`
	WalletID        string `json:"wallet_id"`
	WalletAccountID string `json:"wallet_account_id"`
}

// ErrDeveloperKeyInvalid is returned when the Developer API definitively rejects
// a key (403) — an authentication failure. ErrAuthorizationUnavailable is
// returned when the authority itself could not be reached or answered usably
// (timeout, network, 5xx, config/credential problem, malformed body) — a
// dependency failure that must NOT be reported as an invalid key (RT04 §1).
var (
	ErrDeveloperKeyInvalid       = errors.New("developer key invalid")
	ErrAuthorizationUnavailable  = errors.New("developer authorization unavailable")
)

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

// Authorize verifies a raw key and returns its resolved context. It distinguishes
// a definitive key rejection (403 → ErrDeveloperKeyInvalid) from an authority
// dependency failure (network/timeout/5xx/config/malformed →
// ErrAuthorizationUnavailable). Errors carry no internal detail.
func (c *DeveloperKeyClient) Authorize(ctx context.Context, rawKey string) (*DeveloperKeyContext, error) {
	body, _ := json.Marshal(map[string]string{"api_key": rawKey})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/internal/v1/keys/authorize", bytes.NewReader(body))
	if err != nil {
		return nil, ErrAuthorizationUnavailable
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Key", c.internalKey)
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, ErrAuthorizationUnavailable // timeout / DNS / connection refused
	}
	defer resp.Body.Close()
	switch {
	case resp.StatusCode == http.StatusOK:
		// fall through to decode
	case resp.StatusCode == http.StatusForbidden:
		return nil, ErrDeveloperKeyInvalid // authority definitively rejected the key
	default:
		// 5xx, 401 (internal-credential problem), 400, etc. — the authority could
		// not usably answer; treat as unavailable, not an invalid key.
		return nil, ErrAuthorizationUnavailable
	}
	var out DeveloperKeyContext
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, ErrAuthorizationUnavailable // malformed introspection body
	}
	return &out, nil
}
