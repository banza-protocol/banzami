# sandbox-operator

Minimal, stateless **BANZA L0 (Protocol Sandbox)** operator runtime for the
Banzami reference operator. Its only purpose is to satisfy the BANZA L0
pre-certification checks so that `sandbox-api.banzami.com` is a valid L0 *candidate*.

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

## Public exposure at `sandbox-api.banzami.com` (LIVE)

The operator host is **`sandbox-api.banzami.com`** (the legacy `.org` sandbox
domain was retired). This service runs inside the Banzami stack (`banzami_net`,
deployable via `./deploy.sh sandbox-operator`) and is exposed publicly by nginx.

**Routing decision (live).** On `sandbox-api.banzami.com`, two exact-match
locations are served by this operator; everything else stays on the sandbox /
staging gateway:

```nginx
# served by sandbox-operator:8085
location = /.well-known/banza/operator.json { proxy_pass http://sandbox-operator:8085; ... }
location = /health                          { proxy_pass http://sandbox-operator:8085/health; ... }
# everything else → api-gateway-staging (sandbox API)
location / { proxy_pass http://api-gateway-staging:8080; ... }
```

**Why `/health` is the operator's (not the gateway's):** `sandbox-api.banzami.com`
is the official Banzami sandbox **operator** host for BANZA L0 conformance, and
L0 `HEALTH-002` requires `/health` to declare `simulated=true` /
`production_allowed=false`. So both `/health` and the manifest must come from
`sandbox-operator`. The operator `/health` is a strict superset of the gateway's
(it still returns `status: ok`), so liveness monitoring is unaffected; the sandbox
gateway continues to serve every other path.

Verified live: `/health` → 200 (with sandbox invariants), `/.well-known/banza/operator.json`
→ 200 (`operator_url: https://sandbox-api.banzami.com`), other paths → gateway.
L0 conformance: 5/5 PASS (see `evidence/banza-conformance/l0/`).

## Configuration

| Env | Default | Description |
|---|---|---|
| `SANDBOX_OPERATOR_PORT` | `8085` | Listen port |
