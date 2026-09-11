package middleware

// Dual-credential authentication for the canonical payment routes (ADR-047 /
// RT04B §5). The public payment surface is SINGULAR — one mount per resource —
// and accepts EITHER a merchant JWT OR a Console developer key. The two are kept
// strictly separate:
//
//   * the credential TYPE is decided explicitly, up front (isDeveloperKeyAttempt);
//   * a developer-key attempt is resolved ONLY by the developer-key authority and
//     sets a DeveloperPrincipal — it can never fall back to JWT verification;
//   * a JWT is resolved ONLY by verifyJWT and sets a merchant Principal — it can
//     never fall back to developer-key introspection;
//   * on failure, each path returns its own fail-closed error and stops.
//
// Downstream handlers branch on which principal is present (GetDeveloperPrincipal
// vs GetPrincipal). This is how one route serves both credential types without a
// duplicate `/v1/dev/*` surface and without silent cross-credential fallback.

import (
	"context"
	"log/slog"
	"net/http"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/config"
)

// DualAuth authenticates a request as EITHER a merchant JWT or a developer key,
// with no fallback between the two. devClient may be nil (developer-key auth
// disabled) — in that case a developer-key attempt fails closed with 401 and a
// JWT still works.
func DualAuth(cfg *config.Config, devClient devKeyAuthorizer) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Developer-key path — explicit, no fallback to JWT.
			if isDeveloperKeyAttempt(r) {
				if devClient == nil {
					apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "a valid Sandbox API key is required")
					return
				}
				p, ok := resolveDeveloperPrincipal(w, r, devClient)
				if !ok {
					return // resolveDeveloperPrincipal wrote the fail-closed response
				}
				ctx := context.WithValue(r.Context(), devPrincipalKey{}, p)
				next.ServeHTTP(w, r.WithContext(ctx))
				return
			}

			// Merchant-JWT path — explicit, no fallback to developer-key.
			raw, err := extractBearer(r)
			if err != nil {
				apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", err.Error())
				return
			}
			principal, err := verifyJWT(raw, cfg.JWTSecret)
			if err != nil {
				slog.WarnContext(r.Context(), "auth.invalid_token", "path", LoggedPath(r.URL.Path), "reason", err.Error())
				apierror.Respond(w, r, http.StatusUnauthorized, "INVALID_TOKEN", "token is invalid or expired")
				return
			}
			// This surface is for a Business (merchant JWT) or a Project (key).
			// A consumer token is signed with the same secret and verifies here
			// with no merchant id; handlers that asked "is there a merchant?"
			// then skipped their ownership checks — a consumer token listed and
			// cancelled another merchant's payment links on the deployed Sandbox.
			// Refused at the door, whatever the handler remembers to check.
			if principal.MerchantID == "" {
				slog.WarnContext(r.Context(), "auth.non_merchant_principal_on_merchant_surface",
					"path", LoggedPath(r.URL.Path), "has_customer_id", principal.CustomerID != "")
				apierror.Respond(w, r, http.StatusForbidden, "FORBIDDEN",
					"merchant credentials or a project key are required")
				return
			}
			ctx := context.WithValue(r.Context(), principalKey{}, principal)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
