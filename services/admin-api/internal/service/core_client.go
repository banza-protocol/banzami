// Package service provides a CoreAdminClient for calling the Rust core-api
// from the admin-api service. All financial operations are delegated to the
// Rust core — the admin service orchestrates but never writes financial data directly.
package service

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"

	"github.com/banzami/banzami/services/common/obs"
	"strings"
	"time"
)

// CoreAdminClient is a thin HTTP client wrapping the Rust core-api.
type CoreAdminClient struct {
	baseURL    string
	httpClient *http.Client
}

func NewCoreAdminClient(baseURL string) *CoreAdminClient {
	return &CoreAdminClient{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout:   30 * time.Second,
			Transport: obs.NewPropagationTransport(nil),
		},
	}
}

// WithInternalKey makes every request carry Core's service credential
// (CORE_INTERNAL_KEY). Core refuses an /internal request without it.
func (c *CoreAdminClient) WithInternalKey(key string) *CoreAdminClient {
	c.httpClient.Transport = coreKeyTransport{key: key, base: c.httpClient.Transport}
	return c
}

// coreKeyTransport attaches Core's service credential (X-Internal-Key,
// CORE_INTERNAL_KEY) to every request this client sends. Core authenticates
// every /internal route, so a request without it is refused; a request that
// already carries a dedicated key (a narrower credential for one route group)
// keeps it. The value is never logged.
type coreKeyTransport struct {
	key  string
	base http.RoundTripper
}

func (t coreKeyTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	if t.key != "" && r.Header.Get("X-Internal-Key") == "" {
		r = r.Clone(r.Context())
		r.Header.Set("X-Internal-Key", t.key)
	}
	base := t.base
	if base == nil {
		base = http.DefaultTransport
	}
	return base.RoundTrip(r)
}

// ---------------------------------------------------------------------------
// Compliance
// ---------------------------------------------------------------------------

func (c *CoreAdminClient) GetMerchantCompliance(ctx context.Context, merchantID string) (map[string]any, error) {
	var out map[string]any
	return out, c.get(ctx, "/internal/v1/compliance/merchants/"+merchantID, &out)
}

func (c *CoreAdminClient) ApproveMerchant(ctx context.Context, merchantID string) (map[string]any, error) {
	var out map[string]any
	return out, c.post(ctx, "/internal/v1/compliance/merchants/"+merchantID+"/approve", nil, &out)
}

func (c *CoreAdminClient) RejectMerchant(ctx context.Context, merchantID, notes string) (map[string]any, error) {
	var out map[string]any
	return out, c.post(ctx, "/internal/v1/compliance/merchants/"+merchantID+"/reject",
		map[string]string{"notes": notes}, &out)
}

func (c *CoreAdminClient) SuspendMerchant(ctx context.Context, merchantID, notes string) (map[string]any, error) {
	var out map[string]any
	return out, c.post(ctx, "/internal/v1/compliance/merchants/"+merchantID+"/suspend",
		map[string]string{"notes": notes}, &out)
}

func (c *CoreAdminClient) FlagMerchantAML(ctx context.Context, merchantID, notes string) (map[string]any, error) {
	var out map[string]any
	return out, c.post(ctx, "/internal/v1/compliance/merchants/"+merchantID+"/flag-aml",
		map[string]string{"notes": notes}, &out)
}

// ---------------------------------------------------------------------------
// Settlements
// ---------------------------------------------------------------------------

func (c *CoreAdminClient) CreateSettlementBatch(ctx context.Context, body map[string]any) (map[string]any, error) {
	var out map[string]any
	return out, c.post(ctx, "/internal/v1/settlements", body, &out)
}

func (c *CoreAdminClient) GetSettlement(ctx context.Context, id string) (map[string]any, error) {
	var out map[string]any
	return out, c.get(ctx, "/internal/v1/settlements/"+id, &out)
}

func (c *CoreAdminClient) ListSettlements(ctx context.Context, merchantID string) (map[string]any, error) {
	var out map[string]any
	return out, c.get(ctx, "/internal/v1/settlements?merchant_id="+merchantID, &out)
}

func (c *CoreAdminClient) ListAllSettlements(ctx context.Context, status string) (map[string]any, error) {
	var out map[string]any
	url := "/internal/v1/settlements/all"
	if status != "" {
		url += "?status=" + status
	}
	return out, c.get(ctx, url, &out)
}

func (c *CoreAdminClient) SubmitSettlement(ctx context.Context, id string) (map[string]any, error) {
	var out map[string]any
	return out, c.post(ctx, "/internal/v1/settlements/"+id+"/submit", nil, &out)
}

func (c *CoreAdminClient) ConfirmSettlement(ctx context.Context, id string) (map[string]any, error) {
	var out map[string]any
	return out, c.post(ctx, "/internal/v1/settlements/"+id+"/confirm", nil, &out)
}

func (c *CoreAdminClient) FailSettlement(ctx context.Context, id, reason string) (map[string]any, error) {
	var out map[string]any
	return out, c.post(ctx, "/internal/v1/settlements/"+id+"/fail",
		map[string]string{"reason": reason}, &out)
}

// ---------------------------------------------------------------------------
// Payouts (admin-side lifecycle management)
// ---------------------------------------------------------------------------

func (c *CoreAdminClient) GetPayout(ctx context.Context, id string) (map[string]any, error) {
	var out map[string]any
	return out, c.get(ctx, "/internal/v1/payouts/"+id, &out)
}

func (c *CoreAdminClient) ListPayouts(ctx context.Context, merchantID string) (map[string]any, error) {
	var out map[string]any
	return out, c.get(ctx, "/internal/v1/payouts?merchant_id="+merchantID, &out)
}

func (c *CoreAdminClient) ListAllPayouts(ctx context.Context, status string) (map[string]any, error) {
	var out map[string]any
	url := "/internal/v1/payouts/all"
	if status != "" {
		url += "?status=" + status
	}
	return out, c.get(ctx, url, &out)
}

func (c *CoreAdminClient) ProcessPayout(ctx context.Context, id string) (map[string]any, error) {
	var out map[string]any
	return out, c.post(ctx, "/internal/v1/payouts/"+id+"/process", nil, &out)
}

func (c *CoreAdminClient) MarkPayoutSent(ctx context.Context, id string) (map[string]any, error) {
	var out map[string]any
	return out, c.post(ctx, "/internal/v1/payouts/"+id+"/sent", nil, &out)
}

func (c *CoreAdminClient) ConfirmPayout(ctx context.Context, id string) (map[string]any, error) {
	var out map[string]any
	return out, c.post(ctx, "/internal/v1/payouts/"+id+"/confirm", nil, &out)
}

func (c *CoreAdminClient) FailPayout(ctx context.Context, id, reason string) (map[string]any, error) {
	var out map[string]any
	return out, c.post(ctx, "/internal/v1/payouts/"+id+"/fail",
		map[string]string{"reason": reason}, &out)
}

func (c *CoreAdminClient) MarkPayoutReturned(ctx context.Context, id string) (map[string]any, error) {
	var out map[string]any
	return out, c.post(ctx, "/internal/v1/payouts/"+id+"/returned", nil, &out)
}

// ---------------------------------------------------------------------------
// Risk / freeze / audit log
// ---------------------------------------------------------------------------

func (c *CoreAdminClient) FreezeAccount(ctx context.Context, entityType, entityID, reason, frozenBy string) (map[string]any, error) {
	var out map[string]any
	return out, c.post(ctx, "/internal/v1/admin/freeze", map[string]any{
		"entity_type": entityType,
		"entity_id":   entityID,
		"reason":      reason,
		"frozen_by":   frozenBy,
	}, &out)
}

func (c *CoreAdminClient) UnfreezeAccount(ctx context.Context, entityType, entityID, reason, liftedBy string) (map[string]any, error) {
	var out map[string]any
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete,
		c.baseURL+"/internal/v1/admin/freeze/"+entityType+"/"+entityID, nil)
	if err != nil {
		return nil, fmt.Errorf("core-api request: %w", err)
	}
	data, _ := json.Marshal(map[string]string{"reason": reason, "lifted_by": liftedBy})
	req.Body = io.NopCloser(bytes.NewReader(data))
	req.Header.Set("Content-Type", "application/json")
	return out, c.do(req, &out)
}

func (c *CoreAdminClient) ListRiskFlags(ctx context.Context, resolved bool) ([]map[string]any, error) {
	path := "/internal/v1/admin/risk-flags"
	if resolved {
		path += "?resolved=true"
	}
	var out []map[string]any
	return out, c.get(ctx, path, &out)
}

// ResolveRiskFlag resolves a risk flag with an outcome (APPROVED/REJECTED),
// recording who resolved it for the audit trail (RSK-002).
func (c *CoreAdminClient) ResolveRiskFlag(ctx context.Context, id, resolution, resolvedBy string) (map[string]any, error) {
	var out map[string]any
	return out, c.post(ctx, "/internal/v1/admin/risk-flags/"+id+"/resolve", map[string]any{
		"resolution":  resolution,
		"resolved_by": resolvedBy,
	}, &out)
}

func (c *CoreAdminClient) QueryAuditLog(ctx context.Context, subject, actor, action string, limit int) ([]map[string]any, error) {
	path := fmt.Sprintf("/internal/v1/admin/audit-log?limit=%d", limit)
	if subject != "" {
		path += "&subject=" + subject
	}
	if actor != "" {
		path += "&actor=" + actor
	}
	if action != "" {
		path += "&action=" + action
	}
	var out []map[string]any
	return out, c.get(ctx, path, &out)
}

// ---------------------------------------------------------------------------
// Acquiring reconciliation
// ---------------------------------------------------------------------------

func (c *CoreAdminClient) RunAcquiringReconciliation(ctx context.Context, date string) (map[string]any, error) {
	path := "/internal/v1/admin/acquiring-recon"
	if date != "" {
		path += "?date=" + date
	}
	var out map[string]any
	return out, c.post(ctx, path, nil, &out)
}

func (c *CoreAdminClient) ListAcquiringReconciliationRuns(ctx context.Context) ([]map[string]any, error) {
	var out []map[string]any
	return out, c.get(ctx, "/internal/v1/admin/acquiring-recon", &out)
}

func (c *CoreAdminClient) GetAcquiringReconciliationRun(ctx context.Context, runID string) (map[string]any, error) {
	var out map[string]any
	return out, c.get(ctx, "/internal/v1/admin/acquiring-recon/"+runID, &out)
}

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

func (c *CoreAdminClient) RunReconciliation(ctx context.Context, body map[string]any) (map[string]any, error) {
	var out map[string]any
	return out, c.post(ctx, "/internal/v1/reconciliation/run", body, &out)
}

func (c *CoreAdminClient) GetReconciliationRun(ctx context.Context, runID string) (map[string]any, error) {
	var out map[string]any
	return out, c.get(ctx, "/internal/v1/reconciliation/runs/"+runID, &out)
}

// ---------------------------------------------------------------------------
// Merchants
// ---------------------------------------------------------------------------

func (c *CoreAdminClient) ListMerchants(ctx context.Context, search string) ([]map[string]any, error) {
	path := "/internal/v1/merchants"
	if search != "" {
		path += "?search=" + search
	}
	var out []map[string]any
	return out, c.get(ctx, path, &out)
}

func (c *CoreAdminClient) GetMerchant(ctx context.Context, id string) (map[string]any, error) {
	var out map[string]any
	return out, c.get(ctx, "/internal/v1/merchants/"+id, &out)
}

func (c *CoreAdminClient) SetMerchantVerified(ctx context.Context, id string, verified bool) (map[string]any, error) {
	var out map[string]any
	return out, c.patch(ctx, "/internal/v1/merchants/"+id+"/verified",
		map[string]any{"verified": verified}, &out)
}

// SetMerchantBusinessAccountType re-tags a Business Account's operator type
// (ADR-028) — e.g. mark @doa APPLICATION. Core validates the value.
func (c *CoreAdminClient) SetMerchantBusinessAccountType(ctx context.Context, id, accountType string) (map[string]any, error) {
	var out map[string]any
	return out, c.patch(ctx, "/internal/v1/merchants/"+id+"/business-account-type",
		map[string]any{"business_account_type": accountType}, &out)
}

// AssignMerchantPricingProfile puts a Business Account on a pricing profile.
//
// This is the operator's commercial decision about one customer, and it is the
// only thing that decides what that customer is charged: the pricing model
// resolves exactly one rule from (assigned profile, operation), and a merchant
// with no profile resolves nothing at all. Core validates the code, refuses a
// disabled profile, and refuses any LIVE profile outright.
func (c *CoreAdminClient) AssignMerchantPricingProfile(ctx context.Context, id, profileCode string) (map[string]any, error) {
	var out map[string]any
	return out, c.put(ctx, "/internal/v1/merchants/"+id+"/pricing-profile",
		map[string]any{"profile_code": profileCode}, &out)
}

func (c *CoreAdminClient) DeleteMerchant(ctx context.Context, id string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, c.baseURL+"/internal/v1/merchants/"+id, nil)
	if err != nil {
		return fmt.Errorf("core-api request: %w", err)
	}
	return c.do(req, nil)
}

func (c *CoreAdminClient) CreateMerchant(ctx context.Context, name, email string) (map[string]any, error) {
	var out map[string]any
	return out, c.post(ctx, "/internal/v1/merchants",
		map[string]string{"name": name, "email": email}, &out)
}

func (c *CoreAdminClient) CreateApiKey(ctx context.Context, merchantID, keyName, environment string) (map[string]any, error) {
	var out map[string]any
	return out, c.post(ctx, "/internal/v1/merchants/"+merchantID+"/api-keys",
		map[string]string{"name": keyName, "environment": environment}, &out)
}

func (c *CoreAdminClient) CreateWallet(ctx context.Context, merchantID, currency string) (map[string]any, error) {
	var out map[string]any
	return out, c.post(ctx, "/internal/v1/wallets",
		map[string]string{"merchant_id": merchantID, "currency": currency}, &out)
}

func (c *CoreAdminClient) GetWallet(ctx context.Context, merchantID, currency string) (map[string]any, error) {
	var out map[string]any
	return out, c.get(ctx, "/internal/v1/wallets?merchant_id="+merchantID+"&currency="+currency, &out)
}

// ListWalletAccounts returns the segregated accounts of a wallet (ADR-042),
// read-only for operator visibility (BANZADMIN).
func (c *CoreAdminClient) ListWalletAccounts(ctx context.Context, walletID string) (map[string]any, error) {
	var out map[string]any
	return out, c.get(ctx, "/internal/v1/wallets/"+walletID+"/accounts", &out)
}

// AdminCreditWallet posts one operator credit per idempotencyKey: core turns
// the key into the posting's unique ledger key, answers a replay with the
// original result, and refuses the same key for different economics (409).
func (c *CoreAdminClient) AdminCreditWallet(ctx context.Context, walletID string, amountMinor int64, currency, reason, idempotencyKey string) (map[string]any, error) {
	var out map[string]any
	return out, c.post(ctx, "/internal/v1/wallets/"+walletID+"/admin-credit",
		map[string]any{"amount_minor": amountMinor, "currency": currency, "reason": reason, "idempotency_key": idempotencyKey}, &out)
}

func (c *CoreAdminClient) CreateTransaction(ctx context.Context, body map[string]any) (map[string]any, error) {
	var out map[string]any
	return out, c.post(ctx, "/internal/v1/transactions", body, &out)
}

func (c *CoreAdminClient) AuthorizeTransaction(ctx context.Context, txID string) (map[string]any, error) {
	var out map[string]any
	return out, c.post(ctx, "/internal/v1/transactions/"+txID+"/authorize", nil, &out)
}

func (c *CoreAdminClient) CaptureTransaction(ctx context.Context, txID string) (map[string]any, error) {
	var out map[string]any
	return out, c.post(ctx, "/internal/v1/transactions/"+txID+"/capture", nil, &out)
}

// ---------------------------------------------------------------------------
// Consumers
// ---------------------------------------------------------------------------

func (c *CoreAdminClient) ListConsumers(ctx context.Context, handle string) (map[string]any, error) {
	path := "/internal/v1/consumers"
	if handle != "" {
		path += "?handle=" + handle
	}
	var out map[string]any
	return out, c.get(ctx, path, &out)
}

func (c *CoreAdminClient) GetConsumer(ctx context.Context, id string) (map[string]any, error) {
	var out map[string]any
	return out, c.get(ctx, "/internal/v1/consumers/"+id, &out)
}

// SetConsumerBadge assigns or removes a verification badge on a consumer.
// badge must be "CONSUMER", "MERCHANT", or "" to clear.
func (c *CoreAdminClient) SuspendConsumer(ctx context.Context, id, notes string) (map[string]any, error) {
	var out map[string]any
	body := map[string]any{"notes": nil}
	if notes != "" {
		body["notes"] = notes
	}
	return out, c.post(ctx, "/internal/v1/consumers/"+id+"/suspend", body, &out)
}

func (c *CoreAdminClient) SetConsumerBadge(ctx context.Context, id, badge string) (map[string]any, error) {
	var badgeVal any
	if badge != "" {
		badgeVal = badge
	}
	var out map[string]any
	return out, c.patch(ctx, "/internal/v1/consumers/"+id+"/badge",
		map[string]any{"badge": badgeVal}, &out)
}

// ---------------------------------------------------------------------------
// Disputes
// ---------------------------------------------------------------------------

func (c *CoreAdminClient) ListDisputes(ctx context.Context, merchantID, consumerID, status string, limit int) (map[string]any, error) {
	path := fmt.Sprintf("/internal/v1/disputes?limit=%d", limit)
	if merchantID != "" {
		path += "&merchant_id=" + merchantID
	}
	if consumerID != "" {
		path += "&consumer_id=" + consumerID
	}
	if status != "" {
		path += "&status=" + status
	}
	var out map[string]any
	return out, c.get(ctx, path, &out)
}

func (c *CoreAdminClient) GetDispute(ctx context.Context, id string) (map[string]any, error) {
	var out map[string]any
	return out, c.get(ctx, "/internal/v1/disputes/"+id, &out)
}

func (c *CoreAdminClient) ResolveDispute(ctx context.Context, id, outcome, notes, resolvedBy string) (map[string]any, error) {
	var out map[string]any
	return out, c.post(ctx, "/internal/v1/disputes/"+id+"/resolve", map[string]any{
		"outcome":          outcome,
		"resolution_notes": notes,
		"resolved_by":      resolvedBy,
	}, &out)
}

// ---------------------------------------------------------------------------
// Pricing rules (Banzami ADR-021) — operator-only admin write path. The core
// resolves every fee; this client only forwards references + operator policy.
// ---------------------------------------------------------------------------

// ListPricingRules forwards the (already-validated) query string verbatim.
func (c *CoreAdminClient) ListPricingRules(ctx context.Context, query string) (map[string]any, error) {
	path := "/internal/v1/pricing-rules"
	if query != "" {
		path += "?" + query
	}
	var out map[string]any
	return out, c.get(ctx, path, &out)
}

func (c *CoreAdminClient) GetPricingRule(ctx context.Context, id string) (map[string]any, error) {
	var out map[string]any
	return out, c.get(ctx, "/internal/v1/pricing-rules/"+id, &out)
}

func (c *CoreAdminClient) GetPricingRuleVersions(ctx context.Context, id string) (map[string]any, error) {
	var out map[string]any
	return out, c.get(ctx, "/internal/v1/pricing-rules/"+id+"/versions", &out)
}

func (c *CoreAdminClient) CreatePricingRule(ctx context.Context, body any) (map[string]any, error) {
	var out map[string]any
	return out, c.post(ctx, "/internal/v1/pricing-rules", body, &out)
}

func (c *CoreAdminClient) UpdatePricingRule(ctx context.Context, id string, body any) (map[string]any, error) {
	var out map[string]any
	return out, c.patch(ctx, "/internal/v1/pricing-rules/"+id, body, &out)
}

func (c *CoreAdminClient) DisablePricingRule(ctx context.Context, id string) (map[string]any, error) {
	var out map[string]any
	return out, c.post(ctx, "/internal/v1/pricing-rules/"+id+"/disable", nil, &out)
}

func (c *CoreAdminClient) EnablePricingRule(ctx context.Context, id string) (map[string]any, error) {
	var out map[string]any
	return out, c.post(ctx, "/internal/v1/pricing-rules/"+id+"/enable", nil, &out)
}

func (c *CoreAdminClient) DuplicatePricingRule(ctx context.Context, id string, body any) (map[string]any, error) {
	var out map[string]any
	return out, c.post(ctx, "/internal/v1/pricing-rules/"+id+"/duplicate", body, &out)
}

// ---------------------------------------------------------------------------
// Operator Fees + Application Settlements (Banzami ADR-021) — read/audit.
// Operator fees are immutable; settlements may be cancelled/failed when their
// state permits (the core enforces the lifecycle).
// ---------------------------------------------------------------------------

// Pricing catalogs (pricing-profiles / fee-policies). `resource` is one of the
// two fixed path segments; never caller-derived.
func (c *CoreAdminClient) ListCatalog(ctx context.Context, resource, query string) (map[string]any, error) {
	path := "/internal/v1/" + resource
	if query != "" {
		path += "?" + query
	}
	var out map[string]any
	return out, c.get(ctx, path, &out)
}

func (c *CoreAdminClient) GetCatalog(ctx context.Context, resource, id string) (map[string]any, error) {
	var out map[string]any
	return out, c.get(ctx, "/internal/v1/"+resource+"/"+id, &out)
}

func (c *CoreAdminClient) CreateCatalog(ctx context.Context, resource string, body any) (map[string]any, error) {
	var out map[string]any
	return out, c.post(ctx, "/internal/v1/"+resource, body, &out)
}

func (c *CoreAdminClient) UpdateCatalog(ctx context.Context, resource, id string, body any) (map[string]any, error) {
	var out map[string]any
	return out, c.patch(ctx, "/internal/v1/"+resource+"/"+id, body, &out)
}

func (c *CoreAdminClient) SetCatalogEnabled(ctx context.Context, resource, id string, enabled bool) (map[string]any, error) {
	action := "disable"
	if enabled {
		action = "enable"
	}
	var out map[string]any
	return out, c.post(ctx, "/internal/v1/"+resource+"/"+id+"/"+action, nil, &out)
}

func (c *CoreAdminClient) GetFinanceDashboard(ctx context.Context, query string) (map[string]any, error) {
	path := "/internal/v1/finance/dashboard"
	if query != "" {
		path += "?" + query
	}
	var out map[string]any
	return out, c.get(ctx, path, &out)
}

func (c *CoreAdminClient) ListOperatorFees(ctx context.Context, query string) (map[string]any, error) {
	path := "/internal/v1/operator-fees"
	if query != "" {
		path += "?" + query
	}
	var out map[string]any
	return out, c.get(ctx, path, &out)
}

func (c *CoreAdminClient) GetOperatorFee(ctx context.Context, id string) (map[string]any, error) {
	var out map[string]any
	return out, c.get(ctx, "/internal/v1/operator-fees/"+id, &out)
}

func (c *CoreAdminClient) ListApplicationSettlements(ctx context.Context, query string) (map[string]any, error) {
	path := "/internal/v1/application-settlements"
	if query != "" {
		path += "?" + query
	}
	var out map[string]any
	return out, c.get(ctx, path, &out)
}

func (c *CoreAdminClient) GetApplicationSettlement(ctx context.Context, id string) (map[string]any, error) {
	var out map[string]any
	return out, c.get(ctx, "/internal/v1/application-settlements/"+id, &out)
}

func (c *CoreAdminClient) CancelApplicationSettlement(ctx context.Context, id string) (map[string]any, error) {
	var out map[string]any
	return out, c.post(ctx, "/internal/v1/application-settlements/"+id+"/cancel", nil, &out)
}

func (c *CoreAdminClient) FailApplicationSettlement(ctx context.Context, id string, body any) (map[string]any, error) {
	var out map[string]any
	return out, c.post(ctx, "/internal/v1/application-settlements/"+id+"/fail", body, &out)
}

// ---------------------------------------------------------------------------
// Low-level HTTP helpers
// ---------------------------------------------------------------------------

var ErrNotFound = errors.New("not found")

// CoreError preserves the HTTP status code and the `{error:{code,message}}`
// payload returned by core-api, so the admin-api can forward them verbatim
// rather than collapsing every functional 4xx into a generic 500.
type CoreError struct {
	Status  int
	Code    string
	Message string
	// Raw is the original response body (for diagnostics); never altered.
	Raw []byte
}

func (e *CoreError) Error() string {
	return fmt.Sprintf("core-api %d %s: %s", e.Status, e.Code, e.Message)
}

// Is keeps existing `errors.Is(err, service.ErrNotFound)` checks working for
// 404s, so handlers that render a custom not-found message are unaffected.
func (e *CoreError) Is(target error) bool {
	return target == ErrNotFound && e.Status == http.StatusNotFound
}

// parseCoreError builds a CoreError from a >=400 response, extracting the
// standard `{error:{code,message}}` envelope when present (both core-api and
// admin-api use it) and falling back to sane defaults otherwise.
func parseCoreError(status int, raw []byte) *CoreError {
	ce := &CoreError{Status: status, Raw: raw}
	var env struct {
		Error struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if json.Unmarshal(raw, &env) == nil {
		ce.Code = env.Error.Code
		ce.Message = env.Error.Message
	}
	if ce.Code == "" {
		ce.Code = defaultErrorCode(status)
	}
	if ce.Message == "" {
		if msg := strings.TrimSpace(string(raw)); msg != "" {
			ce.Message = msg
		} else {
			ce.Message = http.StatusText(status)
		}
	}
	return ce
}

func defaultErrorCode(status int) string {
	switch status {
	case http.StatusBadRequest:
		return "BAD_REQUEST"
	case http.StatusUnauthorized:
		return "UNAUTHORIZED"
	case http.StatusForbidden:
		return "FORBIDDEN"
	case http.StatusNotFound:
		return "NOT_FOUND"
	case http.StatusConflict:
		return "CONFLICT"
	case http.StatusUnprocessableEntity:
		return "UNPROCESSABLE_ENTITY"
	case http.StatusTooManyRequests:
		return "RATE_LIMITED"
	default:
		if status >= 500 {
			return "UPSTREAM_ERROR"
		}
		return "ERROR"
	}
}

func (c *CoreAdminClient) post(ctx context.Context, path string, body any, out any) error {
	var bodyReader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("core-api marshal: %w", err)
		}
		bodyReader = bytes.NewReader(data)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+path, bodyReader)
	if err != nil {
		return fmt.Errorf("core-api request: %w", err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	return c.do(req, out)
}

func (c *CoreAdminClient) patch(ctx context.Context, path string, body any, out any) error {
	var bodyReader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("core-api marshal: %w", err)
		}
		bodyReader = bytes.NewReader(data)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPatch, c.baseURL+path, bodyReader)
	if err != nil {
		return fmt.Errorf("core-api request: %w", err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	return c.do(req, out)
}

func (c *CoreAdminClient) put(ctx context.Context, path string, body any, out any) error {
	var bodyReader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("core-api marshal: %w", err)
		}
		bodyReader = bytes.NewReader(data)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPut, c.baseURL+path, bodyReader)
	if err != nil {
		return fmt.Errorf("core-api request: %w", err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	return c.do(req, out)
}

func (c *CoreAdminClient) get(ctx context.Context, path string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+path, nil)
	if err != nil {
		return fmt.Errorf("core-api request: %w", err)
	}
	return c.do(req, out)
}

func (c *CoreAdminClient) do(req *http.Request, out any) error {
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("core-api transport: %w", err)
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)

	// Preserve the core's HTTP status + error payload verbatim instead of
	// masking every 4xx as a 500. A 404 still satisfies errors.Is(.., ErrNotFound)
	// (see CoreError.Is) so existing handlers keep their custom not-found copy.
	if resp.StatusCode >= 400 {
		return parseCoreError(resp.StatusCode, raw)
	}

	if out != nil {
		if err := json.Unmarshal(raw, out); err != nil {
			return fmt.Errorf("core-api decode: %w", err)
		}
	}
	return nil
}
