# sandbox-operator

Minimal, stateless **BANZA L0 (Protocol Sandbox)** operator runtime for the
Banzami reference operator. Its only purpose is to satisfy the BANZA L0
pre-certification checks so that `sandbox-operator.banzami.com` is a valid L0 *candidate*.

## What it is

Two read-only endpoints, no state, no database, no money movement:

| Endpoint | Purpose |
|---|---|
| `GET /health` | Liveness + sandbox-safety invariants (HEALTH-001, HEALTH-002) |
| `GET /.well-known/banza/operator.json` | Operator manifest (MAN-001, MAN-002, MAN-003) |

## What it is NOT

- Not a production operator — `simulated=true`, `production_allowed=false` are hard-coded.
- No wallets, transfers, payment requests, settlement, or federation (L1+ — not implemented).
- No certificate, no keys, no BRL, no Key Manifest, no registry coupling.
- Being an L0 *candidate* is not certification. Production certification remains gated by M2/M3.

## Run locally

```bash
SANDBOX_OPERATOR_PORT=8085 go run ./cmd/sandbox-operator
curl -s http://localhost:8085/health
curl -s http://localhost:8085/.well-known/banza/operator.json
```

## L0 conformance (from the BANZA protocol repo)

```bash
python3 tools/banza-conformance/run.py \
  --url http://localhost:8085 \
  --level 0 \
  --output banzami-l0-report.json
```

Expected: HEALTH-001/002 and MAN-001/002/003 all PASS · Total 5 · Passed 5 ·
achieved level `0 — Protocol Sandbox`.

## Hosts — operator vs gateway (separated, LIVE)

**No hybrid host.** The operator identity and the sandbox API live on **separate**
hosts:

| Host | Serves | Backend |
|------|--------|---------|
| **`sandbox-operator.banzami.com`** | **only** `/health` + `/.well-known/banza/operator.json` (everything else → 404) | this service (`sandbox-operator:8085`) |
| `sandbox-api.banzami.com` | sandbox API/gateway (`/v1/...`, `/consumer/...`) | api-gateway-staging / public-api-staging |

This service runs inside the Banzami stack (`banzami_net`, deployable via
`./deploy.sh sandbox-operator`). The operator host's nginx server block proxies
the two endpoints to `sandbox-operator:8085` and returns `404` for anything else;
the gateway host no longer serves any operator endpoint.

`/health` belongs to the **operator** (BANZA L0 `HEALTH-002` requires it to declare
`simulated=true` / `production_allowed=false`), and the manifest declares
`operator_url: https://sandbox-operator.banzami.com`.

Verified live: `sandbox-operator.banzami.com/health` → 200 (sandbox invariants),
`/.well-known/banza/operator.json` → 200, any other path → 404; `sandbox-api`
serves the gateway and 404s the manifest. L0 conformance against
`sandbox-operator.banzami.com`: 5/5 PASS (see `evidence/banza-conformance/l0/`).

## Configuration

| Env | Default | Description |
|---|---|---|
| `SANDBOX_OPERATOR_PORT` | `8085` | Listen port |
