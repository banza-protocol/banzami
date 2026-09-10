# Business onboarding — evidence at runtime 6d62acc0492a

Deployed Sandbox, every service at `6d62acc0492a`; website source identical to git
(256 files). CI run 34490777366: success.

| Proof | Result |
|---|---|
| Developer Project → new / existing Business (`project-onboarding-e2e.json`) | 21/21 |
| Console Configuração financeira in a browser (`console-onboarding-ui-e2e.json`) | 15/15 |
| Business App session (`business-app-session-e2e.json`) | 22/22 |
| Public candidature (`candidatura-e2e.json`) | 24/27 — the 3 failures are `503 STORAGE_NOT_CONFIGURED` (no KYB storage credentials on the Sandbox) |
| `tests/phase0/business-tenant-isolation.sh` | 21/0, `BUSINESS_CROSS_TENANT_DISCLOSURE=0` |
| `tests/phase0/project-readiness-probe.sh` (Doa-Sandbox) | 12/0 — only blocker `FEE_DESTINATION_TYPE_NOT_ALLOWED` (operator classification) |
| `tests/phase0/developer-platform-e2e.sh` (incl. F0-DP-011) | 24 pass, 0 fail, 0 simulated, 0 blocked |
| `tools/assurance/sandbox-financial-assurance.sql` | every defect counter 0; 482 postings balanced |
| Schema manifest (0120–0123) | satisfied |
