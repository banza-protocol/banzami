package validation

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"sort"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Provenance answers, permanently, the question a historical Validation Run
// must never leave open: *what exactly was this evaluated against?*
//
// A run whose provenance is missing is unattributable, and an unattributable
// result is worse than a known-stale one — the same principle
// tools/check-deploy-parity.mjs states as VALIDATION_DEPLOY_REVISION_UNKNOWN.
//
// THE MANDATORY SET IS DELIBERATELY SMALL. It is exactly the components whose
// state the PREPARATION decision consulted:
//
//	admin-api            computed the preflight and decided READY or BLOCKED
//	api-gateway          the product surface a GOLDEN run is prepared against
//	database-schema      the ledger and actor state the budget/actor checks measured
//	validation-registry  the actor, suite and profile definitions in force
//
// Core, public-api, webhook-sink and app-frontend are NOT in it. They matter at
// EXECUTION, which Phase C does not perform, and none of them reports a build
// revision today — recording "unknown" for them would be exactly the silent
// omission this file exists to prevent. Phase D extends the set when a runner
// exists that actually exercises them; the mechanism is already proven here.
const (
	ComponentAdminAPI = "admin-api"
	ComponentGateway  = "api-gateway"
	ComponentSchema   = "database-schema"
	ComponentRegistry = "validation-registry"
)

// MandatoryComponents must all resolve before a run may reach READY.
func MandatoryComponents() []string {
	return []string{ComponentAdminAPI, ComponentGateway, ComponentSchema, ComponentRegistry}
}

// ProvenanceRow is one component's contemporaneous identity.
//
// Revision is the DEPLOYED revision, never the repository's HEAD. Source says
// where it was read from, so a reader can judge how much to trust it without
// having to re-derive it.
type ProvenanceRow struct {
	Component string            `json:"component"`
	Revision  string            `json:"revision"`
	Detail    map[string]string `json:"detail,omitempty"`
}

// ProvenanceCollector reads each mandatory component's contemporaneous identity.
//
// Every read is free and read-only: an environment variable the process was
// started with, one SELECT, one compiled-in constant, and one GET to a /health
// endpoint. Nothing here authenticates, writes, sends or spends.
type ProvenanceCollector struct {
	pool       *pgxpool.Pool
	gatewayURL string
	client     *http.Client
	env        func(string) string
}

func NewProvenanceCollector(pool *pgxpool.Pool, gatewayURL string) *ProvenanceCollector {
	return &ProvenanceCollector{
		pool:       pool,
		gatewayURL: gatewayURL,
		client:     &http.Client{Timeout: 5 * time.Second},
		env:        os.Getenv,
	}
}

// Collect returns one row per mandatory component, and an error naming every
// component it could not resolve.
//
// It NEVER substitutes a placeholder. No empty string, no "unknown", no repo
// HEAD standing in for a deployed revision: a component that cannot say what it
// is must make the preparation fail, not quietly weaken the evidence.
func (c *ProvenanceCollector) Collect(ctx context.Context) ([]ProvenanceRow, error) {
	rows := make([]ProvenanceRow, 0, 4)
	missing := []string{}

	add := func(name, rev string, detail map[string]string) {
		if rev == "" || rev == "unknown" {
			missing = append(missing, name)
			return
		}
		rows = append(rows, ProvenanceRow{Component: name, Revision: rev, Detail: detail})
	}

	// 1. This process, by the mechanism the gateway already established:
	//    remote-native-build.sh --build-arg BUILD_COMMIT -> ENV -> os.Getenv.
	add(ComponentAdminAPI, c.env("BANZAMI_BUILD_COMMIT"),
		map[string]string{"source": "BANZAMI_BUILD_COMMIT"})

	// 2. The gateway, over its own /health. A GET that spends nothing.
	if rev, err := c.gatewayRevision(ctx); err != nil {
		missing = append(missing, ComponentGateway+" ("+err.Error()+")")
	} else {
		add(ComponentGateway, rev, map[string]string{"source": "GET /health .build"})
	}

	// 3. The schema the budget and actor checks were measured against.
	if c.pool != nil {
		var head int
		if err := c.pool.QueryRow(ctx,
			`SELECT coalesce(max(version), 0) FROM _sqlx_migrations WHERE success`).Scan(&head); err != nil {
			missing = append(missing, ComponentSchema+" ("+err.Error()+")")
		} else if head == 0 {
			missing = append(missing, ComponentSchema+" (no successful migration)")
		} else {
			add(ComponentSchema, fmt.Sprintf("%04d", head),
				map[string]string{"source": "_sqlx_migrations"})
		}
	} else {
		missing = append(missing, ComponentSchema+" (no database)")
	}

	// 4. The definitions in force, compiled into this binary.
	add(ComponentRegistry, RegistryDigest,
		map[string]string{"source": "compiled-in registry"})

	sort.Slice(rows, func(i, j int) bool { return rows[i].Component < rows[j].Component })

	if len(missing) > 0 {
		sort.Strings(missing)
		return rows, fmt.Errorf("provenance unavailable for: %v", missing)
	}
	return rows, nil
}

// gatewayRevision reads the deployed gateway's own statement of what it is.
func (c *ProvenanceCollector) gatewayRevision(ctx context.Context) (string, error) {
	if c.gatewayURL == "" {
		return "", fmt.Errorf("no gateway URL configured")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.gatewayURL+"/health", nil)
	if err != nil {
		return "", err
	}
	res, err := c.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("unreachable")
	}
	defer func() { _ = res.Body.Close() }()
	if res.StatusCode != http.StatusOK {
		return "", fmt.Errorf("health returned %d", res.StatusCode)
	}
	var body struct {
		Build string `json:"build"`
	}
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		return "", fmt.Errorf("health is not JSON")
	}
	if body.Build == "" || body.Build == "unknown" {
		return "", fmt.Errorf("reports no build revision")
	}
	return body.Build, nil
}
