package handler

import (
	"encoding/json"
	"net/http"
)

// Split Sessions — SUPERSEDED by Collections (BANZA ADR-036).
//
// The legacy /v1/splits* routes are retired. The gateway answers the entire
// route family at the EDGE and NEVER proxies to Core, so no upstream 502/500 and
// no missing-table error can ever surface for these paths. The body is
// byte-compatible with the Core 410 (same code + message), so Split Sessions is
// consistently quarantined across both layers. It references Collections by name
// only — it invents no replacement route, redirect or contract.

// SplitsSuperseded handles every legacy /v1/splits* request (all methods, nested
// and malformed paths) with a deliberate 410 Gone. It has no dependencies and no
// Core client — it cannot reach Core, a database, or any implementation detail.
func SplitsSuperseded() http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.WriteHeader(http.StatusGone)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"error": map[string]string{
				"code":    "SPLIT_SESSIONS_SUPERSEDED",
				"message": "Split Sessions foi substituído por Collections.",
			},
		})
	}
}
