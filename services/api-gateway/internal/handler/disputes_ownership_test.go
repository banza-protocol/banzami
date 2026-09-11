package handler_test

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/banzami/banzami/services/api-gateway/internal/handler"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// A dispute belongs to one Business. None of the dispute handlers read the
// principal: any merchant listed every tenant's disputes, read any dispute and
// its evidence, added evidence to it, and opened a dispute on any captured
// transaction.

type disputeSpy struct {
	d           *service.Dispute
	listedFor   []string
	opened      []service.OpenDisputeRequest
	evidenceFor []string
}

func (s *disputeSpy) Open(_ context.Context, req service.OpenDisputeRequest) (*service.Dispute, error) {
	s.opened = append(s.opened, req)
	return s.d, nil
}
func (s *disputeSpy) Get(context.Context, string) (*service.Dispute, error) { return s.d, nil }
func (s *disputeSpy) List(_ context.Context, merchantID, _, _ string, _ int) (*service.DisputePage, error) {
	s.listedFor = append(s.listedFor, merchantID)
	return &service.DisputePage{}, nil
}
func (s *disputeSpy) SubmitEvidence(_ context.Context, req service.SubmitEvidenceRequest) (*service.DisputeEvidence, error) {
	s.evidenceFor = append(s.evidenceFor, req.DisputeID)
	return &service.DisputeEvidence{}, nil
}
func (s *disputeSpy) ListEvidence(_ context.Context, id string) (*service.DisputeEvidencePage, error) {
	s.evidenceFor = append(s.evidenceFor, id)
	return &service.DisputeEvidencePage{}, nil
}

func ownedDispute() *disputeSpy {
	return &disputeSpy{d: &service.Dispute{ID: linkID, MerchantID: ownerID, AmountMinor: 5000}}
}

func TestDisputes_AnotherMerchantSeesAndTouchesNothing(t *testing.T) {
	spy := ownedDispute()
	h := handler.NewDisputeHandler(spy)

	w := httptest.NewRecorder()
	h.Get(w, withRouteID(withMerchant(httptest.NewRequest(http.MethodGet, "/", nil), attackerID), linkID))
	if w.Code != http.StatusNotFound || strings.Contains(w.Body.String(), ownerID) {
		t.Fatalf("another merchant read the dispute: %d %s", w.Code, w.Body.String())
	}
	w = httptest.NewRecorder()
	h.ListEvidence(w, withRouteID(withMerchant(httptest.NewRequest(http.MethodGet, "/", nil), attackerID), linkID))
	if w.Code != http.StatusNotFound {
		t.Fatalf("another merchant listed the evidence: %d", w.Code)
	}
	w = httptest.NewRecorder()
	h.SubmitEvidence(w, withRouteID(withMerchant(httptest.NewRequest(http.MethodPost, "/",
		strings.NewReader(`{"submitted_by":"x","party":"MERCHANT","description":"d"}`)), attackerID), linkID))
	if w.Code != http.StatusNotFound {
		t.Fatalf("another merchant added evidence: %d", w.Code)
	}
	if len(spy.evidenceFor) != 0 {
		t.Fatalf("evidence was read or written for another merchant: %v", spy.evidenceFor)
	}
}

func TestDisputes_ListIsTheCallersOwn(t *testing.T) {
	spy := ownedDispute()
	h := handler.NewDisputeHandler(spy)
	w := httptest.NewRecorder()
	h.List(w, withMerchant(httptest.NewRequest(http.MethodGet, "/v1/disputes?merchant_id="+ownerID, nil), attackerID))
	if w.Code != http.StatusForbidden || len(spy.listedFor) != 0 {
		t.Fatalf("listed another merchant's disputes: %d %v", w.Code, spy.listedFor)
	}
	w = httptest.NewRecorder()
	h.List(w, withMerchant(httptest.NewRequest(http.MethodGet, "/v1/disputes", nil), attackerID))
	if w.Code != http.StatusOK || len(spy.listedFor) != 1 || spy.listedFor[0] != attackerID {
		t.Fatalf("no filter must mean the caller's own, not every tenant's: %d %v", w.Code, spy.listedFor)
	}
}

func TestDisputes_OpenNamesTheCallerAndEvidenceSpeaksForTheMerchant(t *testing.T) {
	spy := ownedDispute()
	h := handler.NewDisputeHandler(spy)
	w := httptest.NewRecorder()
	h.Open(w, withMerchant(httptest.NewRequest(http.MethodPost, "/v1/disputes",
		strings.NewReader(`{"transaction_id":"t","consumer_id":"c","reason":"r"}`)), attackerID))
	if len(spy.opened) != 1 || spy.opened[0].MerchantID != attackerID {
		t.Fatalf("open must carry the calling merchant for core to check: %+v", spy.opened)
	}
	w = httptest.NewRecorder()
	h.SubmitEvidence(w, withRouteID(withMerchant(httptest.NewRequest(http.MethodPost, "/",
		strings.NewReader(`{"submitted_by":"x","party":"CONSUMER","description":"d"}`)), ownerID), linkID))
	if w.Code != http.StatusBadRequest {
		t.Fatalf("the merchant surface submitted evidence as the consumer: %d", w.Code)
	}
}

func TestDisputes_NoMerchantPrincipalIsRefused(t *testing.T) {
	spy := ownedDispute()
	h := handler.NewDisputeHandler(spy)
	w := httptest.NewRecorder()
	h.List(w, withConsumer(httptest.NewRequest(http.MethodGet, "/v1/disputes", nil)))
	if w.Code != http.StatusUnauthorized || len(spy.listedFor) != 0 {
		t.Fatalf("a consumer token listed disputes: %d", w.Code)
	}
}

// A1-05. A Business opening a dispute had to name a consumer_id, which core
// stored and sent back in dispute.* webhooks as if it were a fact. The dispute
// names no consumer now; a body without one is accepted and nothing the caller
// sends as consumer_id is forwarded.
func TestDisputes_OpenNeitherNeedsNorForwardsAConsumer(t *testing.T) {
	spy := ownedDispute()
	h := handler.NewDisputeHandler(spy)
	w := httptest.NewRecorder()
	h.Open(w, withMerchant(httptest.NewRequest(http.MethodPost, "/v1/disputes",
		strings.NewReader(`{"transaction_id":"t","reason":"r"}`)), ownerID))
	if w.Code != http.StatusCreated || len(spy.opened) != 1 {
		t.Fatalf("a dispute without a consumer_id was refused: %d %s", w.Code, w.Body.String())
	}
	w = httptest.NewRecorder()
	h.Open(w, withMerchant(httptest.NewRequest(http.MethodPost, "/v1/disputes",
		strings.NewReader(`{"transaction_id":"t","consumer_id":"someone-else","reason":"r"}`)), ownerID))
	if w.Code != http.StatusCreated || len(spy.opened) != 2 {
		t.Fatalf("a body still sending consumer_id was refused: %d", w.Code)
	}
	if got := fmt.Sprintf("%+v", spy.opened[1]); strings.Contains(got, "someone-else") {
		t.Fatalf("the asserted consumer was forwarded to core: %s", got)
	}
}
