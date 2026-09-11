package server

// PUBLIC_PROOF_REFERENCE_NORMALIZATION_PATHS = 0, INVALID_REFERENCE_DB_LOOKUPS = 0.
//
// Drives the production public verification route (mountPublicProofVerify —
// both limiters, the handler, the ProofService) with every non-canonical
// spelling of a real reference, exactly as a client sends it on the wire, and
// counts database connection attempts. The pool refuses every connection and
// counts it, so this needs no database: an alias that reached the lookup would
// show up as a count and a 500, not as a 404.
//
// The canonical reference is the control: it MUST reach the database, which is
// what proves the probe is live.

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

func proofRoute(t *testing.T) (http.Handler, *atomic.Int64) {
	t.Helper()
	var dials atomic.Int64
	cfg, err := pgxpool.ParseConfig("postgres://probe@127.0.0.1:1/probe")
	if err != nil {
		t.Fatal(err)
	}
	cfg.MinConns = 0
	cfg.BeforeConnect = func(context.Context, *pgx.ConnConfig) error {
		dials.Add(1)
		return errors.New("no database in this test: a lookup was attempted")
	}
	pool, err := pgxpool.NewWithConfig(context.Background(), cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	// Unreachable Redis: both limiters fail open, as they do in production when
	// Redis is degraded, so the request reaches the handler.
	rdb := redis.NewClient(&redis.Options{Addr: "127.0.0.1:1", MaxRetries: -1, DialerRetries: 1, DialerRetryTimeout: time.Millisecond})
	t.Cleanup(func() { _ = rdb.Close() })

	r := chi.NewRouter()
	svc := service.NewProofService(pool, "k", "op-hmac-v1", "banzami", "banza", "https://banzami.com/r/")
	mountPublicProofVerify(r, rdb, svc, "salt")
	return r, &dials
}

// get sends path exactly as given — already percent-encoded, as it would appear
// on the wire.
func get(h http.Handler, path string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, "/v1/public/proofs/"+path, nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	return w
}

func TestPublicProofRoute_CanonicalReachesTheLookup(t *testing.T) {
	h, dials := proofRoute(t)
	for _, ref := range []string{"BZM-7K2M-9QXR-4TWZ-H3YJ-QY5R-BYN0", "BZM-5EED-0A11"} {
		before := dials.Load()
		w := get(h, ref)
		if dials.Load() == before {
			t.Fatalf("%s: the canonical reference never reached the lookup; the probe is not live", ref)
		}
		if w.Code != http.StatusInternalServerError {
			t.Fatalf("%s: with the database refused the lookup must fail as an error, got %d", ref, w.Code)
		}
	}
}

func TestPublicProofRoute_NoAliasReachesTheLookup(t *testing.T) {
	h, dials := proofRoute(t)
	const c = "BZM-7K2M-9QXR-4TWZ-H3YJ-QY5R-BYN0"
	const l = "BZM-5EED-0A11"
	esc := url.PathEscape
	aliases := map[string]string{
		// the reproduced defect
		"O for 0": c[:len(c)-1] + "O",
		// look-alikes
		"I": c[:len(c)-1] + "I", "L": c[:len(c)-1] + "L", "U": c[:len(c)-1] + "U",
		"Greek omicron": esc(c[:len(c)-1] + "\u039F"), "Cyrillic O": esc(c[:len(c)-1] + "\u041E"),
		"fullwidth 0": esc(c[:len(c)-1] + "\uFF10"), "math bold 0": esc(c[:len(c)-1] + "\U0001D7CE"),
		// case
		"lower": strings.ToLower(c), "Bzm": "Bzm" + c[3:], "one lower": c[:len(c)-2] + "n0",
		// hyphens
		"no hyphens": strings.ReplaceAll(c, "-", ""), "underscore": strings.ReplaceAll(c, "-", "_"),
		"en dash": esc(strings.ReplaceAll(c, "-", "\u2013")), "em dash": esc(strings.ReplaceAll(c, "-", "\u2014")),
		"nb hyphen": esc(strings.ReplaceAll(c, "-", "\u2011")), "minus": esc(strings.ReplaceAll(c, "-", "\u2212")),
		// whitespace — the gateway used to trim these and answer with the proof
		"trailing space": c + "%20", "leading space": "%20" + c, "tab": c + "%09", "newline": c + "%0A",
		"crlf": c + "%0D%0A", "nbsp": c + "%C2%A0", "zwsp": c + "%E2%80%8B", "zwnj": c + "%E2%80%8C",
		"zwj": c + "%E2%80%8D", "bom": "%EF%BB%BF" + c,
		// encoding is one layer, never repeated
		"encoded O": c[:len(c)-1] + "%4F", "double-encoded 0": c[:len(c)-1] + "%2530",
		// an escaped canonical character is another spelling of the URL, not the reference
		"encoded 0": c[:len(c)-1] + "%30", "encoded hyphen": strings.ReplaceAll(c, "-", "%2D"),
		"encoded B":     "%42" + c[1:],
		"encoded query": c + "%3Fx%3D1",
		// structure
		"23 symbols": c[:len(c)-1], "25 symbols": c + "0", "seven groups": c + "-0000",
		"duplicate prefix": "BZM-" + c, "suffix": c + "X",
		// legacy is exact too
		"legacy lower": strings.ToLower(l), "legacy padded": l + "%20", "legacy O": l[:len(l)-1] + "O",
	}
	for name, path := range aliases {
		before := dials.Load()
		w := get(h, path)
		if n := dials.Load() - before; n != 0 {
			t.Errorf("%s (%s): reached the database (%d connection attempts)", name, path, n)
		}
		if w.Code != http.StatusNotFound || !strings.Contains(w.Body.String(), `"exists":false`) {
			t.Errorf("%s (%s): got %d %s, want the non-disclosing 404", name, path, w.Code, w.Body.String())
		}
	}
}
