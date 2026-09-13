#!/usr/bin/env node
/**
 * Writes docs/quality/developer-documentation-claims.json — the claim-by-claim
 * ledger behind docs/quality/DEVELOPER_DOCUMENTATION_AUDIT.md.
 *
 * Every claim the documentation makes (tools/docs/claims.mjs) is recorded with
 * the class of evidence that holds it true and where that evidence is. The
 * classes, strongest first:
 *
 *   GATE     an automated check in CI fails if the claim becomes false
 *   RUNTIME  observed against the deployed Sandbox by a named harness
 *   SOURCE   read against the named source file(s) during the audit
 *   POLICY   guidance to the reader, not a statement about the product
 *   HISTORY  a dated statement about the past, checked against git history
 *
 * The ledger is keyed by a hash of each claim's text. Rewriting a sentence
 * produces a claim the ledger does not know, and tools/check-docs-claims-ledger.mjs
 * fails with UNCLASSIFIED_CLAIMS until it has been audited again. Run this
 * writer only after reading what changed: it classifies by the audit's rules
 * below, and a rule that no longer fits a rewritten claim is how a false
 * sentence would get a green mark.
 *
 *   node tools/docs/audit-claims.mjs --write
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractClaims } from './claims.mjs';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const WRITE = process.argv.includes('--write');

const CODES = JSON.parse(readFileSync(join(ROOT, 'apps/website/app/developers/docs/error-catalogue.json'), 'utf8')).errors.map((e) => e.code);
const CODE_RE = new RegExp(`\\b(?:${CODES.join('|')})\\b`);

const GATES = [
  { re: CODE_RE, class: 'GATE', evidence: 'tools/check-docs-error-catalogue.mjs (codes derived from the gateway and core, route by route)' },
  { re: /\b(?:GET|POST|DELETE|PATCH)\s+\/v1\/|\/v1\/[a-z-]+/, class: 'GATE', evidence: 'tools/check-openapi-route-drift.mjs + tools/check-docs-drift.mjs (reachable routes = OpenAPI = reference)' },
  { re: /\b(?:create|get|list|rotate|resolve)[A-Z]\w+\b|constructEvent|paymentSessionInterface|npm install|dart pub add/, class: 'GATE', evidence: 'tools/check-docs-code-examples.mjs (compiled against @banzami/sdk from npm) + tools/check-docs-drift.mjs (registry)' },
  { re: /\b(?:payment_session|payment_link|refund|application_settlement)\.[a-z]+\b/, class: 'GATE', evidence: 'tools/check-webhook-event-catalogue.mjs (emitted ↔ documented, both languages)' },
  { re: /\b[a-z_]+:(?:read|write|create)\b/, class: 'SOURCE', evidence: 'services/developer-api/internal/developer (AllowedScopes); scope enforcement in services/api-gateway/internal/handler/*authority*' },
];

const POLICY = /^(Nunca|Never|Use |Rode |Rotate |Revogue|Revoke|Guarde|Store|Verifique|Verify|Não repita|Do not|Don't|Trate |Treat |Uma chave por|One key per|Se a aplicação|If the application|O sítio certo|The right place|Envie o|Send the|Guardar o|Keep the|Uma conta por campanha|One account per campaign|Nunca duplicar|Never duplicate|Ao pedir ajuda|When you ask|Quando pedir|Suspeita de fuga|Suspected leak)/;

const PAGE_EVIDENCE = {
  // RUNTIME only once tools/e2e/docs/quickstart-e2e.mjs completes all twelve
  // steps; until then the claims are held by source and the cold reader.
  GetStarted: { class: 'SOURCE', evidence: 'services/developer-api/internal/developer (financial onboarding, keys); services/api-gateway (payment sessions); tools/e2e/docs/cold-reader.mjs 12/12 on the deployed pages' },
  Sdk: { class: 'SOURCE', evidence: 'sdk/typescript/src/client.ts (request(): Idempotency-Key per POST, retries 429/502/503/504), sdk/dart-client/lib/src/client.dart, apps/website/public/developers/artifacts/sdk-first-manifest.json' },
  Console: { class: 'SOURCE', evidence: 'services/developer-api/internal/developer/{handlers.go,service.go,store_pg.go,financial_onboarding.go}; services/api-gateway/internal/service/postgres_webhooks.go (fan-out to active endpoints, 5 attempts)' },
  Concepts: { class: 'SOURCE', evidence: 'services/api-gateway/internal/middleware/developer_auth.go (bz_live_ refused); services/api-gateway/internal/middleware/idempotency.go; core/types/src/money.rs (minor units); services/developer-api/internal/developer/store.go (30-day logs)' },
  Payments: { class: 'SOURCE', evidence: 'services/api-gateway/internal/handler/{payment_sessions.go (safeDTO, STATIC_QR/DYNAMIC_QR, refund_source), payment_authz.go (rejectClientPayeeFields, authorizeDeveloperSubAccount), payment_links.go}; core/api/src/routes/payment_sessions.rs (one session per purpose + reference); sdk/typescript/src/client.ts (createPaymentLink types in 0.13.0)' },
  Webhooks: { class: 'SOURCE', evidence: 'services/api-gateway/internal/service/postgres_webhooks.go (5 attempts, 1m/5m/30m/2h, fan-out to active endpoints); sdk/typescript/src/webhooks.ts (tolerance 300 s); tools/check-docs-dx.mjs (WEBHOOK_GUIDE_* truths)' },
  Events: { class: 'GATE', evidence: 'tools/check-webhook-event-catalogue.mjs (every documented field is written by its emitter)' },
  Refunds: { class: 'SOURCE', evidence: 'core/api/src/routes/{refunds.rs (SUCCEEDED, refund.completed), restitution.rs (idempotency conflict on amount/currency, REVERSED on full reversal)}; services/api-gateway/internal/handler/refunds.go' },
  Settlements: { class: 'SOURCE', evidence: 'core/api/src/routes/application_settlements.rs (gross = available balance, fee destination, errors); core/app-settlement/src/domain.rs; services/api-gateway/internal/handler/application_settlements.go; apps/website/app/developers/transacoes/page.tsx (no settlement list)' },
  Receipts: { class: 'SOURCE', evidence: 'services/api-gateway/internal/service/proof.go; apps/website/lib/proof-ref.ts (SECURE_V1 alphabet, legacy 8-symbol refs); core/api/src/routes/restitution.rs (REVERSED)' },
  Transfers: { class: 'SOURCE', evidence: 'core/api/src/routes/wallet_account_transfers.rs; services/api-gateway/internal/handler/{wallet_account_transfers.go,wallet_accounts.go}' },
  Errors: { class: 'GATE', evidence: 'tools/check-docs-error-catalogue.mjs (codes, statuses, required fields); services/developer-api (Console codes)' },
  GoingLive: { class: 'SOURCE', evidence: 'apps/website/app/developers/go-live/page.tsx (no Live application, no migration); services/api-gateway/internal/middleware/developer_auth.go (bz_live_ refused)' },
  Troubleshooting: { class: 'GATE', evidence: 'tools/check-docs-dx.mjs (every code in the error catalogue, every guide a page) + the sources of each linked guide' },
  Support: { class: 'SOURCE', evidence: 'apps/website/app/developers/suporte/page.tsx (developers@banzami.com, no ticket system); SECURITY.md (security@banzami.com)' },
  'Endpoint-spec': { class: 'GATE', evidence: 'tools/check-docs-api-reference.mjs (scope, body, query and path parameters, SDK method, events against the gateway)' },
  'Events-spec': { class: 'GATE', evidence: 'tools/check-webhook-event-catalogue.mjs (fields against core emitters)' },
  'Symptoms-spec': { class: 'GATE', evidence: 'tools/check-docs-dx.mjs (codes and guides) + the error catalogue gate' },
  'Errors-spec': { class: 'GATE', evidence: 'tools/check-docs-error-catalogue.mjs' },
  Guides: { class: 'SOURCE', evidence: 'services/api-gateway/internal/service/{postgres_webhooks.go,proof.go}; services/api-gateway/internal/handler/{payment_authz.go,wallet_account_transfers.go,refunds.go}; core/api/src/routes/{refunds.rs,wallet_account_transfers.rs,payment_sessions.rs}; sdk/typescript/src/webhooks.ts (tolerance 300 s)' },
  Doa: { class: 'SOURCE', evidence: 'tools/e2e/docs/doa-tutorial-e2e.mjs contract (13/13 on the deployed page) and ~/doa packages/core/{payments,settlements,receipts}; core/api/src/routes/application_settlements.rs (fee destination, pricing)' },
  Reference: { class: 'SOURCE', evidence: 'services/api-gateway/internal/middleware/{developer_auth.go,idempotency.go}; services/developer-api/internal/developer/store.go (RequestLogRetentionDays = 30); tools/lib/error-surface.mjs route derivation' },
  'Reference-spec': { class: 'SOURCE', evidence: 'services/api-gateway/internal/handler (per-route emissions, derived by tools/lib/error-surface.mjs routeCodes) and core/api/src/routes' },
  Testing: { class: 'SOURCE', evidence: 'core/api/src/routes/payment_sessions.rs (amount 0 → BAD_REQUEST, omitted → open amount); services/api-gateway/internal/middleware/idempotency.go; services/public-api/internal/handler/auth.go (Sandbox registration grant 1 000 000 minor units); services/api-gateway/internal/service/postgres_webhooks.go' },
  Trust: { class: 'SOURCE', evidence: 'services/developer-api/internal/developer/service.go (RotateAPIKey revokes predecessor; AuthorizeKey refuses bz_live_); tools/check-openapi-route-drift.mjs' },
  Artifacts: { class: 'GATE', evidence: 'apps/website/app/developers/docs/p2a-artifacts.test.ts (artifact files, paths and OpenAPI allow-list)' },
  Changelog: { class: 'HISTORY', evidence: 'git log (e.g. 39bd5f78 2026-09-10, 3409574f 2026-09-11, 3628e75b 2026-09-12, bfa7f2a1 and b13a6e2a 2026-09-13)' },
  Glossary: { class: 'POLICY', evidence: 'definitions; terms checked by glossary.test.tsx' },
};

export function classify(claim) {
  for (const g of GATES) if (g.re.test(claim.text)) return { class: g.class, evidence: g.evidence };
  if (POLICY.test(claim.text)) return { class: 'POLICY', evidence: 'reader guidance' };
  const p = PAGE_EVIDENCE[claim.page];
  return p ? { class: p.class, evidence: p.evidence } : null;
}

if (process.argv[1]?.endsWith('audit-claims.mjs')) {
  const claims = extractClaims(ROOT);
  const ledger = {};
  const unclassified = [];
  for (const c of claims) {
    const k = classify(c);
    if (!k) { unclassified.push(c.id); continue; }
    ledger[c.id] = { page: c.page, kind: c.kind, class: k.class, evidence: k.evidence, text: c.text.slice(0, 160) };
  }
  const counts = {};
  for (const v of Object.values(ledger)) counts[v.class] = (counts[v.class] ?? 0) + 1;
  console.log(`${claims.length} claim(s): ${JSON.stringify(counts)}; unclassified ${unclassified.length}`);
  if (WRITE) {
    writeFileSync(join(ROOT, 'docs/quality/developer-documentation-claims.json'), `${JSON.stringify({ audited: '2026-09-13', claims: ledger }, null, 1)}\n`);
    console.log('wrote docs/quality/developer-documentation-claims.json');
  }
}
