package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	chimiddleware "github.com/go-chi/chi/v5/middleware"

	apimiddleware "github.com/banzami/banzami/services/public-api/internal/middleware"
	"github.com/banzami/banzami/services/public-api/internal/service"
)

// ---------------------------------------------------------------------------
// Test double
// ---------------------------------------------------------------------------

type fakeActivityFetcher struct {
	page *service.ActivityPage
	err  error
	// captured call params
	lastConsumerID      string
	lastLimit           int
	lastCursor          string
	lastTypeFilter      string
	lastDirectionFilter string
}

func (f *fakeActivityFetcher) GetActivity(
	_ context.Context,
	consumerID string,
	limit int,
	cursor, typeFilter, directionFilter string,
) (*service.ActivityPage, error) {
	f.lastConsumerID = consumerID
	f.lastLimit = limit
	f.lastCursor = cursor
	f.lastTypeFilter = typeFilter
	f.lastDirectionFilter = directionFilter
	return f.page, f.err
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func activityRequest(path string, consumerID string) *http.Request {
	r := httptest.NewRequest(http.MethodGet, path, nil)
	ctx := context.WithValue(r.Context(), chimiddleware.RequestIDKey, "req-test-activity")
	ctx = apimiddleware.InjectConsumer(ctx, &apimiddleware.Consumer{ID: consumerID, Scopes: []string{}})
	return r.WithContext(ctx)
}

func str(s string) *string { return &s }

func activityItem(
	activityID, itemType, direction, currency, status string,
	amountMinor int64,
	counterpartyHandle *string,
	note *string,
	transferID *string,
	fundingID *string,
) service.ActivityItem {
	now := time.Now().UTC()
	return service.ActivityItem{
		ActivityID:         activityID,
		Type:               itemType,
		Direction:          direction,
		AmountMinor:        amountMinor,
		Currency:           currency,
		Status:             status,
		CreatedAt:          now,
		CompletedAt:        &now,
		CounterpartyHandle: counterpartyHandle,
		Note:               note,
		TransferID:         transferID,
		FundingID:          fundingID,
	}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// 1. Outgoing transfer appears with correct direction and type.
func TestActivity_OutgoingTransfer(t *testing.T) {
	item := activityItem("tid-1", "P2P_SENT", "OUTGOING", "AOA", "COMPLETED", 200000,
		str("@ana"), str("almoço"), str("tid-1"), nil)
	fake := &fakeActivityFetcher{page: &service.ActivityPage{Items: []service.ActivityItem{item}, HasMore: false}}
	h := newActivityHandlerWithFakes(fake)

	w := httptest.NewRecorder()
	h.Activity(w, activityRequest("/v1/me/activity", "consumer-1"))

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var resp service.ActivityPage
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatal(err)
	}
	if len(resp.Items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(resp.Items))
	}
	got := resp.Items[0]
	if got.Type != "P2P_SENT" {
		t.Errorf("expected P2P_SENT, got %s", got.Type)
	}
	if got.Direction != "OUTGOING" {
		t.Errorf("expected OUTGOING, got %s", got.Direction)
	}
	if got.AmountMinor != 200000 {
		t.Errorf("expected 200000, got %d", got.AmountMinor)
	}
	if got.CounterpartyHandle == nil || *got.CounterpartyHandle != "@ana" {
		t.Errorf("expected @ana counterparty")
	}
}

// 2. Incoming transfer appears with correct direction and counterparty.
func TestActivity_IncomingTransfer(t *testing.T) {
	item := activityItem("tid-2", "P2P_RECEIVED", "INCOMING", "AOA", "COMPLETED", 500000,
		str("@joao"), nil, str("tid-2"), nil)
	fake := &fakeActivityFetcher{page: &service.ActivityPage{Items: []service.ActivityItem{item}}}
	h := newActivityHandlerWithFakes(fake)

	w := httptest.NewRecorder()
	h.Activity(w, activityRequest("/v1/me/activity", "consumer-2"))

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var resp service.ActivityPage
	_ = json.NewDecoder(w.Body).Decode(&resp)
	got := resp.Items[0]
	if got.Type != "P2P_RECEIVED" {
		t.Errorf("expected P2P_RECEIVED, got %s", got.Type)
	}
	if got.Direction != "INCOMING" {
		t.Errorf("expected INCOMING, got %s", got.Direction)
	}
	if got.CounterpartyHandle == nil || *got.CounterpartyHandle != "@joao" {
		t.Errorf("expected @joao, got %v", got.CounterpartyHandle)
	}
	if got.TransferID == nil || *got.TransferID != "tid-2" {
		t.Errorf("expected transfer_id tid-2")
	}
}

// 3. Wallet funding appears with correct type and direction.
func TestActivity_WalletFunding(t *testing.T) {
	item := activityItem("dep-1", "WALLET_FUNDED", "INCOMING", "AOA", "COMPLETED", 1000000,
		nil, nil, nil, str("dep-1"))
	fake := &fakeActivityFetcher{page: &service.ActivityPage{Items: []service.ActivityItem{item}}}
	h := newActivityHandlerWithFakes(fake)

	w := httptest.NewRecorder()
	h.Activity(w, activityRequest("/v1/me/activity", "consumer-3"))

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var resp service.ActivityPage
	_ = json.NewDecoder(w.Body).Decode(&resp)
	got := resp.Items[0]
	if got.Type != "WALLET_FUNDED" {
		t.Errorf("expected WALLET_FUNDED, got %s", got.Type)
	}
	if got.Direction != "INCOMING" {
		t.Errorf("expected INCOMING, got %s", got.Direction)
	}
	if got.FundingID == nil || *got.FundingID != "dep-1" {
		t.Errorf("expected funding_id dep-1")
	}
}

// 4. Requires authentication — 401 if no JWT.
func TestActivity_Unauthenticated(t *testing.T) {
	h := newActivityHandlerWithFakes(&fakeActivityFetcher{page: &service.ActivityPage{}})
	r := httptest.NewRequest(http.MethodGet, "/v1/me/activity", nil)
	w := httptest.NewRecorder()
	h.Activity(w, r)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
}

// 5. Invalid limit param returns 400.
func TestActivity_InvalidLimit(t *testing.T) {
	h := newActivityHandlerWithFakes(&fakeActivityFetcher{page: &service.ActivityPage{}})
	w := httptest.NewRecorder()
	h.Activity(w, activityRequest("/v1/me/activity?limit=9999", "consumer-1"))
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

// 6. Non-integer limit returns 400.
func TestActivity_NonIntegerLimit(t *testing.T) {
	h := newActivityHandlerWithFakes(&fakeActivityFetcher{page: &service.ActivityPage{}})
	w := httptest.NewRecorder()
	h.Activity(w, activityRequest("/v1/me/activity?limit=banana", "consumer-1"))
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

// 7. Cursor is forwarded to the core client unchanged.
func TestActivity_CursorPassthrough(t *testing.T) {
	fake := &fakeActivityFetcher{page: &service.ActivityPage{}}
	h := newActivityHandlerWithFakes(fake)
	cursor := "dGVzdC1jdXJzb3I"
	w := httptest.NewRecorder()
	h.Activity(w, activityRequest("/v1/me/activity?cursor="+cursor, "consumer-1"))
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	if fake.lastCursor != cursor {
		t.Errorf("expected cursor %q forwarded, got %q", cursor, fake.lastCursor)
	}
}

// 8. has_more and next_cursor are present when more pages exist.
func TestActivity_HasMoreAndNextCursor(t *testing.T) {
	cursor := "bmV4dC1wYWdl"
	page := &service.ActivityPage{
		Items:      []service.ActivityItem{activityItem("tid-3", "P2P_SENT", "OUTGOING", "AOA", "COMPLETED", 100, str("@x"), nil, str("tid-3"), nil)},
		NextCursor: &cursor,
		HasMore:    true,
	}
	fake := &fakeActivityFetcher{page: page}
	h := newActivityHandlerWithFakes(fake)

	w := httptest.NewRecorder()
	h.Activity(w, activityRequest("/v1/me/activity", "consumer-1"))

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var resp service.ActivityPage
	_ = json.NewDecoder(w.Body).Decode(&resp)
	if !resp.HasMore {
		t.Error("expected has_more = true")
	}
	if resp.NextCursor == nil || *resp.NextCursor != cursor {
		t.Errorf("expected next_cursor %q, got %v", cursor, resp.NextCursor)
	}
}

// 9. Empty activity returns 200 with empty items array.
func TestActivity_EmptyFeed(t *testing.T) {
	fake := &fakeActivityFetcher{page: &service.ActivityPage{Items: []service.ActivityItem{}}}
	h := newActivityHandlerWithFakes(fake)

	w := httptest.NewRecorder()
	h.Activity(w, activityRequest("/v1/me/activity", "consumer-new"))

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var resp service.ActivityPage
	_ = json.NewDecoder(w.Body).Decode(&resp)
	if resp.Items == nil {
		t.Error("items must be an array, not null")
	}
}

// 10. Type filter is forwarded to the core client.
func TestActivity_TypeFilterPassthrough(t *testing.T) {
	fake := &fakeActivityFetcher{page: &service.ActivityPage{}}
	h := newActivityHandlerWithFakes(fake)
	w := httptest.NewRecorder()
	h.Activity(w, activityRequest("/v1/me/activity?type=P2P_SENT", "consumer-1"))
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	if fake.lastTypeFilter != "P2P_SENT" {
		t.Errorf("expected type filter P2P_SENT, got %q", fake.lastTypeFilter)
	}
}

// 11. Direction filter is forwarded to the core client.
func TestActivity_DirectionFilterPassthrough(t *testing.T) {
	fake := &fakeActivityFetcher{page: &service.ActivityPage{}}
	h := newActivityHandlerWithFakes(fake)
	w := httptest.NewRecorder()
	h.Activity(w, activityRequest("/v1/me/activity?direction=INCOMING", "consumer-1"))
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	if fake.lastDirectionFilter != "INCOMING" {
		t.Errorf("expected direction filter INCOMING, got %q", fake.lastDirectionFilter)
	}
}

// 12. Note/memo is preserved in the activity item.
func TestActivity_NotePreserved(t *testing.T) {
	note := "jantar de aniversário"
	item := activityItem("tid-4", "P2P_SENT", "OUTGOING", "AOA", "COMPLETED", 300000,
		str("@maria"), str(note), str("tid-4"), nil)
	fake := &fakeActivityFetcher{page: &service.ActivityPage{Items: []service.ActivityItem{item}}}
	h := newActivityHandlerWithFakes(fake)

	w := httptest.NewRecorder()
	h.Activity(w, activityRequest("/v1/me/activity", "consumer-1"))

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var resp service.ActivityPage
	_ = json.NewDecoder(w.Body).Decode(&resp)
	got := resp.Items[0]
	if got.Note == nil || *got.Note != note {
		t.Errorf("expected note %q, got %v", note, got.Note)
	}
}
