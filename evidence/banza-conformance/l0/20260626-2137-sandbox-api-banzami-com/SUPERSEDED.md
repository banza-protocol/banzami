# SUPERSEDED

This L0 run targeted `sandbox-api.banzami.com` while the operator endpoints
(`/health` + `/.well-known/banza/operator.json`) were temporarily co-hosted on the
sandbox gateway.

**Superseded by the dedicated operator-host run:**
`../20260626-2246-sandbox-operator-banzami-com/` — target
`https://sandbox-operator.banzami.com` (5/5 PASS, Level 0).

The operator identity now lives on its own host (`sandbox-operator.banzami.com`,
no hybrid). This run is kept for history only.
