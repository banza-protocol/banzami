package middleware

import (
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"
)

// RA-044: an idempotency key identifies one logical request. Before the
// fingerprint existed, the cached response was replayed for ANY payload, so
// reusing a key with a different amount returned the original session with 201
// and the caller believed the new amount had been accepted.

func TestFingerprint_SameRequestMatches(t *testing.T) {
	a := requestFingerprint([]byte(`{"amount_minor":150000,"currency":"AOA"}`))
	b := requestFingerprint([]byte(`{"amount_minor":150000,"currency":"AOA"}`))
	if a != b {
		t.Fatal("an identical request must fingerprint identically, or every replay becomes a false conflict")
	}
}

// The defect itself: a changed value must be a different request.
func TestFingerprint_ChangedAmountDiffers(t *testing.T) {
	a := requestFingerprint([]byte(`{"amount_minor":150000,"currency":"AOA"}`))
	b := requestFingerprint([]byte(`{"amount_minor":999999,"currency":"AOA"}`))
	if a == b {
		t.Fatal("a different amount must fingerprint differently — this is exactly RA-044")
	}
}

// Formatting is not semantics: key order and whitespace must not manufacture
// conflicts for callers whose JSON serialiser differs from ours.
func TestFingerprint_KeyOrderAndWhitespaceIrrelevant(t *testing.T) {
	a := requestFingerprint([]byte(`{"amount_minor":150000,"currency":"AOA"}`))
	b := requestFingerprint([]byte("{\n  \"currency\" : \"AOA\",\n  \"amount_minor\" : 150000\n}"))
	if a != b {
		t.Fatal("key order and whitespace must not change the fingerprint")
	}
}

// An explicitly empty optional field is equivalent to omitting it.
func TestFingerprint_EmptyStringEqualsOmitted(t *testing.T) {
	a := requestFingerprint([]byte(`{"amount_minor":150000}`))
	b := requestFingerprint([]byte(`{"amount_minor":150000,"purpose":""}`))
	c := requestFingerprint([]byte(`{"amount_minor":150000,"purpose":null}`))
	if a != b || a != c {
		t.Fatal(`an explicitly empty or null optional field must equal omitting it`)
	}
}

// The documented limitation, asserted so it stays deliberate rather than drifting
// into an accident: transport-level canonicalisation cannot know an endpoint's
// SEMANTIC default, so omitted and explicit-default differ. That direction is the
// safe one — a false conflict refuses the request; a missed conflict would return
// the wrong resource.
func TestFingerprint_SemanticDefaultIsNotKnown(t *testing.T) {
	omitted := requestFingerprint([]byte(`{"amount_minor":150000}`))
	explicit := requestFingerprint([]byte(`{"amount_minor":150000,"purpose":"GENERIC"}`))
	if omitted == explicit {
		t.Fatal("unexpected: the middleware would have to know per-endpoint defaults to equate these")
	}
}

func TestFingerprint_NonJSONBodyStillFingerprints(t *testing.T) {
	a := requestFingerprint([]byte(`not json`))
	b := requestFingerprint([]byte(`not json`))
	c := requestFingerprint([]byte(`different`))
	if a != b || a == c {
		t.Fatal("a non-JSON body must fingerprint deterministically by content")
	}
}

func TestFingerprint_EmptyBodyIsStable(t *testing.T) {
	if requestFingerprint(nil) != requestFingerprint([]byte("")) {
		t.Fatal("an absent body must fingerprint stably")
	}
}

// Nested changes must be visible: a shallow comparison would miss them.
func TestFingerprint_NestedChangeDiffers(t *testing.T) {
	a := requestFingerprint([]byte(`{"metadata":{"order":"A1"}}`))
	b := requestFingerprint([]byte(`{"metadata":{"order":"A2"}}`))
	if a == b {
		t.Fatal("a nested value change must alter the fingerprint")
	}
}

// A pending acknowledgement is not cached: the same key reaches the handler
// again and gets the real outcome once it exists.
func TestIdempotency_APendingResponseIsNotReplayed(t *testing.T) {
	addr := os.Getenv("REDIS_TEST_ADDR")
	if addr == "" {
		t.Skip("REDIS_TEST_ADDR not set — skipping the Redis-backed idempotency test")
	}
	rdb := redis.NewClient(&redis.Options{Addr: addr, DB: 15})
	defer rdb.Close()
	calls := 0
	h := Idempotency(rdb)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls++
		if calls == 1 {
			w.Header().Set(IdempotencyOutcomeHeader, IdempotencyOutcomePending)
			w.WriteHeader(http.StatusAccepted)
			_, _ = w.Write([]byte(`{"status":"PENDING"}`))
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"PAID"}`))
	}))
	key := "pending-" + strconv.FormatInt(time.Now().UnixNano(), 10)
	send := func() *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, "/v1/sandbox/test-payers/p/payments", strings.NewReader(`{"a":1}`))
		req.Header.Set("Idempotency-Key", key)
		req = req.WithContext(ContextWithDeveloperPrincipal(req.Context(), &DeveloperPrincipal{KeyID: "k1", ProjectID: "p"}))
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec
	}
	if r := send(); r.Code != http.StatusAccepted {
		t.Fatalf("first: %d", r.Code)
	}
	second := send()
	third := send()
	if second.Code != http.StatusOK || third.Code != http.StatusOK || third.Header().Get("Idempotency-Replayed") != "true" || calls != 2 {
		t.Fatalf("second=%d third=%d replayed=%q calls=%d", second.Code, third.Code, third.Header().Get("Idempotency-Replayed"), calls)
	}
}
