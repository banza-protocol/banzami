package developer

import (
	"bytes"
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"
)

// The API Explorer (ADR-060 §7): a Console user runs a published Developer API
// operation against the Sandbox without ever holding a key in the browser.
//
// For each request developer-api mints a key that
//   - is scoped to that ONE operation's scope,
//   - expires 60 seconds after it is minted (AuthorizeKey refuses it after),
//   - is never listed, rotated or revoked through the Console (purpose EXPLORER),
// calls the gateway with it exactly as an integration would, revokes it, and
// returns the answer. The raw key never leaves this function. The gateway logs
// the request against the Project like any other, and the Console's API logs
// mark it as the Explorer's.
//
// What it may run is explorer_operations.json, generated from the published
// OpenAPI (tools/docs/build-explorer-allowlist.mjs): a route the contract does
// not publish to a project key cannot be reached from here.

//go:embed explorer_operations.json
var explorerOperationsJSON []byte

// PurposeExplorer marks the API Explorer's per-request key.
const PurposeExplorer = "EXPLORER"

// ExplorerKeyTTL is how long an Explorer key can authenticate.
const ExplorerKeyTTL = 60 * time.Second

// Explorer request limits.
const (
	ExplorerRequestsPerMinute = 30
	explorerMaxBody           = 64 << 10
	explorerMaxResponse       = 512 << 10
)

var (
	ErrExplorerUnavailable     = errors.New("the API Explorer is not available")
	ErrExplorerUnknown         = errors.New("the API Explorer does not run this operation")
	ErrExplorerRateLimited     = errors.New("too many API Explorer requests")
	ErrExplorerInvalidRequest  = errors.New("invalid API Explorer request")
	errExplorerUpstreamFailure = errors.New("the Sandbox API did not answer")
)

type ExplorerParam struct {
	Name    string `json:"name"`
	Example string `json:"example,omitempty"`
	Type    string `json:"type,omitempty"`
}

// ExplorerOperation is one runnable operation, as generated from the OpenAPI.
type ExplorerOperation struct {
	OperationID         string          `json:"operation_id"`
	Tag                 string          `json:"tag"`
	Summary             string          `json:"summary"`
	Method              string          `json:"method"`
	Path                string          `json:"path"`
	Scope               string          `json:"scope"`
	PathParams          []ExplorerParam `json:"path_params"`
	QueryParams         []ExplorerParam `json:"query_params"`
	Idempotency         bool            `json:"idempotency"`
	IdempotencyRequired bool            `json:"idempotency_required"`
	Body                bool            `json:"body"`
	ExampleBody         json.RawMessage `json:"example_body"`
}

type explorerCatalogue struct {
	SpecVersion string              `json:"spec_version"`
	Operations  []ExplorerOperation `json:"operations"`
}

var (
	explorerOnce sync.Once
	explorerCat  explorerCatalogue
	explorerByID map[string]ExplorerOperation
)

func explorerOperations() (explorerCatalogue, map[string]ExplorerOperation) {
	explorerOnce.Do(func() {
		_ = json.Unmarshal(explorerOperationsJSON, &explorerCat)
		explorerByID = make(map[string]ExplorerOperation, len(explorerCat.Operations))
		for _, op := range explorerCat.Operations {
			explorerByID[op.OperationID] = op
		}
	})
	return explorerCat, explorerByID
}

// ExplorerRequest is what the Console sends: an operation and its inputs.
type ExplorerRequest struct {
	OperationID    string            `json:"operation_id"`
	PathParams     map[string]string `json:"path_params"`
	Query          map[string]string `json:"query"`
	Body           json.RawMessage   `json:"body"`
	IdempotencyKey string            `json:"idempotency_key"`
}

// ExplorerResponse is the gateway's answer, with nothing of the key in it.
type ExplorerResponse struct {
	OperationID    string            `json:"operation_id"`
	Method         string            `json:"method"`
	Path           string            `json:"path"`
	Status         int               `json:"status"`
	RequestID      string            `json:"request_id"`
	LatencyMS      int64             `json:"latency_ms"`
	IdempotencyKey string            `json:"idempotency_key,omitempty"`
	Headers        map[string]string `json:"headers"`
	Body           json.RawMessage   `json:"body,omitempty"`
	Text           string            `json:"text,omitempty"`
	// Redacted names fields the Explorer does not show (a webhook signing
	// secret is revealed once on the Webhooks screen, not in a response panel).
	Redacted []string `json:"redacted,omitempty"`
}

type explorerBroker struct {
	baseURL string
	client  *http.Client
	now     func() time.Time
	mu      sync.Mutex
	window  map[string][]time.Time // project → request times in the last minute
}

// SetExplorer enables the API Explorer against the gateway at baseURL. Sandbox
// only: on any other environment it stays off.
func (s *Service) SetExplorer(baseURL string, client *http.Client) {
	if !s.sandboxEnv || strings.TrimSpace(baseURL) == "" {
		return
	}
	if client == nil {
		client = &http.Client{Timeout: 20 * time.Second}
	}
	// A redirect is answered, never followed: following one would send the
	// minted key to a path the allowlist did not name.
	c := *client
	c.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	s.explorer = &explorerBroker{baseURL: strings.TrimRight(baseURL, "/"), client: &c, now: time.Now, window: map[string][]time.Time{}}
}

// ExplorerOperations lists what the Explorer can run for a member of the Project.
func (s *Service) ExplorerOperations(ctx context.Context, actor, projectID string) (string, []ExplorerOperation, error) {
	if _, _, err := s.projectAuthz(ctx, actor, projectID); err != nil {
		return "", nil, err
	}
	if s.explorer == nil {
		return "", nil, ErrExplorerUnavailable
	}
	cat, _ := explorerOperations()
	return cat.SpecVersion, cat.Operations, nil
}

var explorerPathValue = regexp.MustCompile(`^[A-Za-z0-9_\-.@:]{1,128}$`)

// RunExplorerRequest runs one operation for the Project with a 60-second key.
func (s *Service) RunExplorerRequest(ctx context.Context, actor, projectID string, in ExplorerRequest) (*ExplorerResponse, error) {
	p, role, err := s.projectAuthz(ctx, actor, projectID)
	if err != nil {
		return nil, err
	}
	if !canBuild(role) {
		return nil, ErrForbidden
	}
	b := s.explorer
	if b == nil || s.apiKeyPepper == "" {
		return nil, ErrExplorerUnavailable
	}
	_, ops := explorerOperations()
	op, ok := ops[in.OperationID]
	if !ok {
		return nil, ErrExplorerUnknown
	}

	// Build the request from the operation's own shape: every placeholder
	// filled with a plain identifier, only declared query parameters, a body
	// only where the operation takes one.
	path := op.Path
	for _, pp := range op.PathParams {
		v := strings.TrimSpace(in.PathParams[pp.Name])
		// "." and ".." pass the character class but are path segments of their
		// own: the gateway would clean /v1/x/.. into another route.
		if !explorerPathValue.MatchString(v) || strings.Trim(v, ".") == "" {
			return nil, ErrExplorerInvalidRequest
		}
		path = strings.Replace(path, "{"+pp.Name+"}", url.PathEscape(v), 1)
	}
	q := url.Values{}
	for name, v := range in.Query {
		declared := false
		for _, qp := range op.QueryParams {
			if qp.Name == name {
				declared = true
			}
		}
		if !declared || len(v) > 256 {
			return nil, ErrExplorerInvalidRequest
		}
		if v != "" {
			q.Set(name, v)
		}
	}
	var body []byte
	if len(bytes.TrimSpace(in.Body)) > 0 && string(bytes.TrimSpace(in.Body)) != "null" {
		if !op.Body || len(in.Body) > explorerMaxBody {
			return nil, ErrExplorerInvalidRequest
		}
		var obj map[string]any
		if json.Unmarshal(in.Body, &obj) != nil {
			return nil, ErrExplorerInvalidRequest
		}
		body = in.Body
	}
	idem := strings.TrimSpace(in.IdempotencyKey)
	if len(idem) > 128 {
		return nil, ErrExplorerInvalidRequest
	}
	if op.Idempotency && idem == "" && (op.IdempotencyRequired || op.Method == http.MethodPost) {
		idem = "explorer_" + newRandomID()
	}
	if !op.Idempotency {
		idem = ""
	}

	if !b.admit(p.ID) {
		return nil, ErrExplorerRateLimited
	}

	raw, prefix, err := newAPIKey(KindSecret)
	if err != nil {
		return nil, ErrExplorerUnavailable
	}
	exp := b.now().Add(ExplorerKeyTTL)
	key, err := s.store.CreateAPIKey(ctx, APIKeyInsert{
		ProjectID: p.ID, Environment: EnvSandbox, Kind: KindSecret, Name: "API Explorer · " + op.OperationID,
		KeyPrefix: prefix, KeyHash: hashKey(raw, s.apiKeyPepper), HashVersion: 1,
		Scopes: []string{op.Scope}, CreatedBy: actor, Purpose: PurposeExplorer, ExpiresAt: &exp,
	})
	if errors.Is(err, ErrDeleting) {
		return nil, ErrNotFound // the project is gone
	}
	if err != nil {
		return nil, ErrExplorerUnavailable
	}
	// Revoked as soon as the answer is in, on a context the caller cannot cancel.
	defer func() {
		rctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = s.store.RevokeAPIKey(rctx, key.ID)
	}()

	target := b.baseURL + path
	if len(q) > 0 {
		target += "?" + q.Encode()
	}
	req, err := http.NewRequestWithContext(ctx, op.Method, target, bytes.NewReader(body))
	if err != nil {
		return nil, ErrExplorerInvalidRequest
	}
	req.Header.Set("Authorization", "Bearer "+raw)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "banzami-api-explorer/1")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if idem != "" {
		req.Header.Set("Idempotency-Key", idem)
	}
	started := b.now()
	resp, err := b.client.Do(req)
	if err != nil {
		return nil, errExplorerUpstreamFailure
	}
	defer resp.Body.Close()
	payload, _ := io.ReadAll(io.LimitReader(resp.Body, explorerMaxResponse))

	out := &ExplorerResponse{
		OperationID: op.OperationID, Method: op.Method, Path: path, Status: resp.StatusCode,
		RequestID: resp.Header.Get("X-Request-ID"), LatencyMS: b.now().Sub(started).Milliseconds(),
		IdempotencyKey: idem, Headers: map[string]string{},
	}
	for _, h := range []string{"X-Request-ID", "Idempotent-Replayed", "Retry-After", "Content-Type", "X-RateLimit-Remaining"} {
		if v := resp.Header.Get(h); v != "" {
			out.Headers[h] = v
		}
	}
	var parsed any
	if json.Unmarshal(payload, &parsed) == nil {
		out.Redacted = redactExplorerSecrets(parsed, "")
		out.Body, _ = json.Marshal(parsed)
	} else {
		out.Text = string(payload)
	}
	// The key's own text can never be in an answer; if it were, it goes no further.
	if bytes.Contains(out.Body, []byte(raw)) || strings.Contains(out.Text, raw) {
		return nil, ErrExplorerUnavailable
	}
	return out, nil
}

// redactExplorerSecrets hides signing secrets in place and names where.
func redactExplorerSecrets(v any, at string) []string {
	var hidden []string
	switch t := v.(type) {
	case map[string]any:
		for k, child := range t {
			where := k
			if at != "" {
				where = at + "." + k
			}
			if k == "secret" || k == "signing_secret" {
				if s, ok := child.(string); ok && s != "" {
					t[k] = "hidden by the API Explorer — reveal it once in Console → Webhooks"
					hidden = append(hidden, where)
					continue
				}
			}
			hidden = append(hidden, redactExplorerSecrets(child, where)...)
		}
	case []any:
		for _, child := range t {
			hidden = append(hidden, redactExplorerSecrets(child, at+"[]")...)
		}
	}
	return hidden
}

// admit applies the per-Project request budget.
func (b *explorerBroker) admit(projectID string) bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	now := b.now()
	recent := b.window[projectID][:0]
	for _, t := range b.window[projectID] {
		if now.Sub(t) < time.Minute {
			recent = append(recent, t)
		}
	}
	if len(recent) >= ExplorerRequestsPerMinute {
		b.window[projectID] = recent
		return false
	}
	b.window[projectID] = append(recent, now)
	return true
}
