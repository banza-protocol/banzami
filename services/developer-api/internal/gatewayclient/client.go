// Package gatewayclient is the developer-api → Gateway boundary for Business
// onboarding. The Business application domain (validation, handle holds,
// documents, review, approval) lives in the Gateway, and the Developers Console
// reaches it through here — never by writing its tables. developer-api decides
// WHO may act for a Project; the Gateway decides WHAT an application is.
//
// Every call carries the Gateway's internal credential. Nothing returned here
// is forwarded to a browser as-is: the developer service shapes the answer.
package gatewayclient

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

// ErrUnavailable: the Gateway could not usably answer. Never a "no".
var ErrUnavailable = errors.New("business onboarding is unavailable")

// Refusal is a reasoned 4xx from the Gateway, carried to the developer with
// its code (e.g. HANDLE_TAKEN, LINK_CODE_INVALID, APPLICATION_IN_PROGRESS).
type Refusal struct {
	Status  int
	Code    string
	Message string
}

func (r *Refusal) Error() string { return fmt.Sprintf("%s: %s", r.Code, r.Message) }

type Client struct {
	baseURL     string
	internalKey string
	http        *http.Client
}

// New returns nil when unconfigured, so onboarding reports unavailable rather
// than pretending.
func New(baseURL, internalKey string) *Client {
	if baseURL == "" || internalKey == "" {
		return nil
	}
	return &Client{baseURL: baseURL, internalKey: internalKey, http: &http.Client{Timeout: 10 * time.Second}}
}

func (c *Client) do(ctx context.Context, method, path string, in, out any) error {
	var body io.Reader
	if in != nil {
		b, _ := json.Marshal(in)
		body = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, body)
	if err != nil {
		return ErrUnavailable
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Key", c.internalKey)
	resp, err := c.http.Do(req)
	if err != nil {
		return ErrUnavailable
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	switch {
	case resp.StatusCode >= 200 && resp.StatusCode < 300:
		if out != nil && len(raw) > 0 {
			if err := json.Unmarshal(raw, out); err != nil {
				return ErrUnavailable
			}
		}
		return nil
	case resp.StatusCode >= 400 && resp.StatusCode < 500 && resp.StatusCode != http.StatusUnauthorized:
		var e struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		}
		_ = json.Unmarshal(raw, &e)
		return &Refusal{Status: resp.StatusCode, Code: e.Code, Message: e.Message}
	default:
		// 5xx, and 401 (our own credential is wrong — not the developer's fault).
		return ErrUnavailable
	}
}

// Requirement is one issue from the Gateway's requirements policy.
type Requirement struct {
	Code   string `json:"code"`
	Kind   string `json:"kind"`
	Label  string `json:"label"`
	Reason string `json:"reason"`
}

// ProjectApplication is a Project's latest application, as the Gateway reports it.
type ProjectApplication struct {
	ApplicationID      string `json:"application_id"`
	Status             string `json:"status"`
	Origin             string `json:"origin"`
	RequestedHandle    string `json:"requested_handle"`
	InformationRequest string `json:"information_request,omitempty"`
	BusinessName       string `json:"business_name"`
	ProjectBinding     string `json:"project_binding,omitempty"`
	CreatedAt          string `json:"created_at"`
	Requirements       struct {
		PolicyVersion       string        `json:"policy_version"`
		CurrentlyDue        []Requirement `json:"currently_due"`
		PendingVerification []Requirement `json:"pending_verification"`
		Errors              []Requirement `json:"errors"`
		Accepted            []Requirement `json:"accepted"`
	} `json:"requirements"`
}

// LatestForProject returns nil, nil when the Project never applied.
func (c *Client) LatestForProject(ctx context.Context, projectID string) (*ProjectApplication, error) {
	var out ProjectApplication
	err := c.do(ctx, http.MethodGet, "/internal/v1/merchant-applications/for-project/"+url.PathEscape(projectID), nil, &out)
	var r *Refusal
	if errors.As(err, &r) && r.Status == http.StatusNotFound {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &out, nil
}

// ApplicationInput is what a Project's Financial Setup submits. The same fields
// the public form collects; the Project and the submitting user are added by
// the developer service, never by the browser.
type ApplicationInput struct {
	ProjectID           string `json:"project_id"`
	SubmittedByUserID   string `json:"submitted_by_user_id"`
	DesiredHandle       string `json:"desired_handle"`
	BusinessName        string `json:"business_name"`
	Category            string `json:"category"`
	Subcategory         string `json:"subcategory,omitempty"`
	Email               string `json:"email"`
	Phone               string `json:"phone"`
	Nif                 string `json:"nif"`
	Province            string `json:"province"`
	Municipality        string `json:"municipality"`
	City                string `json:"city,omitempty"`
	Address             string `json:"address"`
	AddressReference    string `json:"address_reference,omitempty"`
	LegalRepresentative string `json:"legal_representative"`
	RepresentativeRole  string `json:"representative_role"`
	RepresentativeEmail string `json:"representative_email,omitempty"`
	RepresentativePhone string `json:"representative_phone,omitempty"`
	BusinessActivity    string `json:"business_activity"`
	EstimatedVolume     string `json:"estimated_volume,omitempty"`
	TermsAccepted       bool   `json:"terms_accepted"`
	IdempotencyKey      string `json:"idempotency_key,omitempty"`
}

// SubmitForProject creates the Project's application and returns its id.
func (c *Client) SubmitForProject(ctx context.Context, in ApplicationInput) (string, error) {
	var out struct {
		ApplicationID string `json:"application_id"`
	}
	if err := c.do(ctx, http.MethodPost, "/internal/v1/merchant-applications/for-project", in, &out); err != nil {
		return "", err
	}
	return out.ApplicationID, nil
}

// LinkTarget is the Business a redeemed consent code names.
type LinkTarget struct {
	MerchantID      string `json:"merchant_id"`
	WalletID        string `json:"wallet_id"`
	WalletAccountID string `json:"wallet_account_id"`
	Handle          string `json:"handle"`
	BusinessName    string `json:"business_name"`
	KybStatus       string `json:"kyb_status"`
	Environment     string `json:"environment"`
}

// RedeemLinkCode spends a Business's consent code for a Project.
func (c *Client) RedeemLinkCode(ctx context.Context, code, projectID string) (*LinkTarget, error) {
	var out LinkTarget
	if err := c.do(ctx, http.MethodPost, "/internal/v1/business-link-codes/redeem",
		map[string]string{"code": code, "project_id": projectID}, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// BusinessIdentity is a Business's public identity as receipts, proofs and the
// payer's screens name it (the Gateway's business_public_identities): the name it
// presents and the @banza it owns (without "@"). Never its account name.
type BusinessIdentity struct {
	DisplayName string `json:"display_name"`
	Handle      string `json:"handle,omitempty"`
}

// BusinessPublicIdentity reads a Business's public identity from the Gateway.
func (c *Client) BusinessPublicIdentity(ctx context.Context, merchantID string) (*BusinessIdentity, error) {
	var out BusinessIdentity
	if err := c.do(ctx, http.MethodGet, "/internal/v1/businesses/"+url.PathEscape(merchantID)+"/public-identity", nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}
