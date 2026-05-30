package handler

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/banza-protocol/banzami/services/api-gateway/internal/config"
)

// Liveness handles GET /health.
// Returns 200 as long as the process is running.
// No dependency checks — a failing dependency should not cause liveness to fail.
func Liveness(w http.ResponseWriter, r *http.Request) {
	respond(w, http.StatusOK, map[string]any{
		"status":    "ok",
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	})
}

// Readiness returns a HandlerFunc for GET /readyz.
// Returns 200 when all critical dependencies are reachable, 503 otherwise.
// Dependency checks are added as the infrastructure layer matures.
func Readiness(cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		checks := map[string]string{
			// TODO: replace stubs with real connection probes once the DB and
			// Redis clients are injected into the server.
			"database": checkStub(cfg.DatabaseURL != ""),
			"redis":    checkStub(cfg.RedisURL != ""),
		}

		status := http.StatusOK
		overall := "ok"
		for _, v := range checks {
			if v != "ok" {
				status = http.StatusServiceUnavailable
				overall = "degraded"
				break
			}
		}

		respond(w, status, map[string]any{
			"status":      overall,
			"environment": cfg.Environment,
			"checks":      checks,
			"timestamp":   time.Now().UTC().Format(time.RFC3339),
		})
	}
}

func checkStub(configured bool) string {
	if configured {
		return "ok"
	}
	return "not_configured"
}

func respond(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
