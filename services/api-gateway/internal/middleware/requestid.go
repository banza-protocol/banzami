package middleware

import (
	"context"

	"github.com/banzami/banzami/services/common/obs"
)

// GetRequestID returns the per-service request id. The id is now produced by the
// shared obs.Correlation middleware (the single source for correlation_id +
// request_id); this thin accessor is kept so callers (apierror, handlers) are
// unchanged.
func GetRequestID(ctx context.Context) string {
	return obs.RequestID(ctx)
}
