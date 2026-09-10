# Runbook — closing Business onboarding on the Sandbox (owner steps)

Version: 1.0
Scope: the deployed Sandbox. Financial LIVE remains NOT READY / FAIL-CLOSED.
Decision record: [ADR-059](../adr/ADR-059-one-business-identity-one-kyb-authority.md), [ADR-058](../adr/ADR-058-business-application-lifecycle.md), [ADR-057](../adr/ADR-057-project-financial-readiness.md).

Everything below is a step only the owner can take — a provider account, an
operator login with MFA, an institution's legal documents, a registry publish.
Each step names what the engineering side does next. Never paste a code, key
or password into a chat, a log or a commit.

## 1. KYB document storage (Cloudflare R2)

The Sandbox Gateway has never had document storage: every upload answers
`503 STORAGE_NOT_CONFIGURED`, so no application can carry the documents an
approval requires. Follow [KYB_R2_SETUP.md](../ops/KYB_R2_SETUP.md) §C–E for the
bucket `banzami-kyb-sandbox` (private, CORS for `https://banzami.com` and
`https://developers.banzami.com` — the Console's Configuração financeira uploads
too), then
§F.1: write the three files into the stack's secret directory on
`217.160.9.248`:

```
/opt/banzami-blueprint/tmp/banzami-blueprint-sandbox/root-20260708184104-1708617-23807/evidence/
  kyb_storage_endpoint            https://<ACCOUNT_ID>.r2.cloudflarestorage.com
  kyb_storage_access_key_id       <access key id>
  kyb_storage_secret_access_key   <secret access key>
```

Next (engineering): `./deploy.sh api-gateway-staging`; the Gateway logs
`[Track 3] KYB document storage configured`; re-run
`node tools/e2e/business/candidatura-e2e.mjs` (the four storage checks close).

## 2. Publish `@banzami/sdk` 0.12.0

From a terminal on the owner's Mac (npm's browser sign-in needs it):

```
cd ~/banzami && node tools/sdk-release.mjs --publish
```

Next (engineering): verify `npm view @banzami/sdk@0.12.0`, bump DOA's three
`package.json` references, `npm install`, test, push the prepared DOA branch.

## 3. BANZADMIN (admin.banzami.com, operator login with MFA)

**a. A fresh Business, end to end, from each surface.** Candidaturas → a
synthetic application submitted after step 1 (one from the public form, origin
*Candidatura pública*; one from a Console Project, origin *Projeto de
developer*) → *Iniciar análise* → check the two documents → *Aprovar (nova
conta)*. In the Sandbox the activation link is shown; open it, set a PIN. The
Project's application also binds the Project — its Configuração financeira then
shows the Business. Next (engineering): re-run the Business App session and
Console E2Es against the approved Businesses.

**b. @doa — nothing to do.** Under ADR-059 an existing Business keeps its KYB
decision; no Business resubmits, @doa included. The Doa-Sandbox Project is
already bound (sealed, ADR-055) to **@doa · 255afb6c…**, whose KYB is APPROVED
and whose badge now agrees with it; the Console's Configuração financeira shows
that Business. The old auto-approved application `0d6b88a7` stays as history.

**c. Classification (ADR-028).** Preços → *Classificar uma Business Account* →
search `@doa` → pick **@doa · Sandbox · Doa-Sandbox · …255afb6c** (not the
account named "Doa", which owns no handle) → `APPLICATION` → type
`APPLICATION` → reason, e.g. *"Doa-Sandbox is an application Project that
receives operator-governed application settlement fees. Classification
required by the canonical application settlement policy."* Next (engineering):
`PROJECT_ID=84b0e8e6-fbda-417e-a537-19ad8574827a EXPECT_READY=true EXPECT_BLOCKERS= bash tests/phase0/project-readiness-probe.sh`.

**d. Fixture applications.** Reject the synthetic E2E applications from the
public-form harness (handles `e2e_desktop_*`, `e2e_mobile_*`, `api_*`) so their
handle holds are released. (The Project and Console harnesses reject their own
applications when they finish.)

**e. (Recommended)** Suspend the retired account **"Doa" (a779d287…)** — it owns
no handle, no login and no ledger entries, and its name invites mistakes.

## 4. Then, and only then

Engineering deploys the final SHA, proves parity, updates and deploys DOA, and
executes the preserved DOA settlement exactly once.
