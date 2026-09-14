#!/usr/bin/env node
/**
 * Retire the ACTIVE synthetic test Businesses that no live Project owns —
 * through Core's own Project retirement, one at a time, and prove nothing else
 * moved.
 *
 * The class is structural (tools/lib/sandbox-businesses.mjs): SANDBOX_SYNTHETIC,
 * a sandbox_businesses row, owning Project ARCHIVED / DELETING / DELETED, no
 * ACTIVE binding from an ACTIVE Project, no ACTIVE key, not declared canonical.
 * They were left by harnesses that cleaned up by archiving before
 * SANDBOX-DELETE-001 made Delete the lifecycle.
 *
 * This runner holds no financial authority of its own. For each candidate it
 *   1. re-reads the candidate's evidence and re-checks every eligibility
 *      invariant at that moment — a candidate that fails one is SKIPPED and
 *      recorded, never forced;
 *   2. calls POST /internal/v1/sandbox/projects/retire for the owning Project,
 *      retire_business true, over Core's loopback (the operator path) — Core
 *      retires its payers, cancels open sessions and links, closes the
 *      Business's value through balanced postings, suspends it and ends its
 *      webhooks;
 *   3. uses pass id `synthetic-batch-<business>`, so a repeated call posts
 *      nothing new, and a rerun selects nothing already retired.
 *
 * Around the batch it snapshots everything that must NOT change (canonical and
 * other tenants' resources) and verifies the ledger.
 *
 *   node tools/ops/retire-archived-synthetic-businesses.mjs            # read-only candidate set
 *   node tools/ops/retire-archived-synthetic-businesses.mjs --apply
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assuranceDir } from '../e2e/lib/assurance-output.mjs';
import { businessEvidenceSql, canonicalSets, classifyBusiness, readSandbox, retirementEligibility, uuid } from '../lib/sandbox-businesses.mjs';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const REMOTE = process.env.BANZAMI_REMOTE ?? 'root@217.160.9.248';
const APPLY = process.argv.includes('--apply');
const canon = canonicalSets(readFileSync(join(ROOT, 'ops/canonical-resources.yaml'), 'utf8'));
const OUT = assuranceDir('synthetic-business-retirement');
mkdirSync(OUT, { recursive: true });
const stamp = Date.now();

const evidence = (ids) => JSON.parse(readSandbox(businessEvidenceSql({ ids })) || '[]');

/** Everything outside the candidate set, hashed: it must be identical after. */
function snapshot(candidateIds, ownerProjects) {
  const m = candidateIds.length ? candidateIds.map((i) => `'${uuid(i)}'`).join(',') : 'NULL';
  const p = ownerProjects.length ? ownerProjects.map((i) => `'${uuid(i)}'`).join(',') : 'NULL';
  const sql = `
SELECT json_build_object(
  'taken_at', now(),
  'postings', (SELECT count(*) FROM ledger_postings),
  'entries', (SELECT count(*) FROM ledger_entries),
  'other_merchants', (SELECT md5(coalesce(string_agg(id::text || status, ',' ORDER BY id), '')) FROM merchants WHERE id NOT IN (${m})),
  'other_merchant_balances', (SELECT md5(coalesce(string_agg(w.merchant_id::text || ':' || (SELECT coalesce(sum(CASE e.entry_type WHEN 'CREDIT' THEN e.amount_minor ELSE -e.amount_minor END), 0) FROM ledger_entries e WHERE e.account_id = w.available_account_id), ',' ORDER BY w.merchant_id), '')) FROM wallets w WHERE w.merchant_id NOT IN (${m})),
  'dev_projects', (SELECT md5(coalesce(string_agg(id::text || status, ',' ORDER BY id), '')) FROM developer.dev_projects),
  'dev_workspaces', (SELECT md5(coalesce(string_agg(id::text || status, ',' ORDER BY id), '')) FROM developer.dev_workspaces),
  'dev_keys', (SELECT md5(coalesce(string_agg(id::text || status, ',' ORDER BY id), '')) FROM developer.dev_api_keys),
  'bindings', (SELECT md5(coalesce(string_agg(id::text || state, ',' ORDER BY id), '')) FROM developer.dev_project_sandbox_binding),
  'other_payers', (SELECT md5(coalesce(string_agg(consumer_id::text || coalesce(retired_at::text, '-'), ',' ORDER BY consumer_id), '')) FROM sandbox_test_payers WHERE project_id NOT IN (${p})),
  'other_consumers', (SELECT md5(coalesce(string_agg(id::text || status, ',' ORDER BY id), '')) FROM consumers WHERE id NOT IN (SELECT consumer_id FROM sandbox_test_payers WHERE project_id IN (${p}))),
  'other_webhooks', (SELECT md5(coalesce(string_agg(id::text || active, ',' ORDER BY id), '')) FROM webhook_endpoints WHERE merchant_id NOT IN (${m})),
  'other_sessions', (SELECT md5(coalesce(string_agg(id::text || status, ',' ORDER BY id), '')) FROM payment_sessions WHERE merchant_id NOT IN (${m})),
  'other_links', (SELECT md5(coalesce(string_agg(id::text || status, ',' ORDER BY id), '')) FROM payment_links WHERE merchant_id NOT IN (${m})),
  'canonical_identities', (SELECT md5(coalesce(string_agg(email || status, ',' ORDER BY email), '')) FROM account_identity.identity_users)
)::text`;
  return JSON.parse(readSandbox(sql));
}

/** One call of Core's retirement, over Core's loopback. Returns {status, body}. */
function coreRetire(projectId, businessId) {
  const body = JSON.stringify({ project_id: uuid(projectId), requested_by: 'retire-archived-synthetic-businesses', pass_id: `synthetic-batch-${uuid(businessId)}`, retire_business: true });
  const cmd = "CORE=$(docker ps --format '{{.Names}}' | grep core-api-staging | head -1); "
    + "docker exec -i \"$CORE\" curl -s -w '\\n%{http_code}' -X POST -H 'Content-Type: application/json' --data @- http://localhost:8081/internal/v1/sandbox/projects/retire";
  const out = execFileSync('ssh', ['-o', 'BatchMode=yes', REMOTE, cmd], { input: body, encoding: 'utf8', timeout: 120000 }).trim().split('\n');
  const status = Number(out.pop());
  let parsed = null; try { parsed = JSON.parse(out.join('\n')); } catch { /* error body */ }
  return { status, body: parsed };
}

// ── discovery ────────────────────────────────────────────────────────────────
const all = evidence();
const classes = all.map((r) => ({ r, c: classifyBusiness(r, canon), e: retirementEligibility(r, canon) }));
const candidates = classes.filter((x) => x.e.eligible);
const skipped = classes.filter((x) => x.c.class === 'SYNTHETIC_RETIREABLE' && !x.e.eligible);
const unclassified = classes.filter((x) => x.c.class === 'UNCLASSIFIED');
const record = (x) => ({
  business_id: x.r.business_id, name: x.r.name, created_at: x.r.created_at, status: x.r.status,
  project_id: x.r.owner_project_id, workspace_id: x.r.owner_workspace_id, project_status: x.r.owner_project_status,
  value_minor: Number(x.r.value_minor), live_binding: x.r.live_binding, active_keys: Number(x.r.active_keys),
  active_webhooks: Number(x.r.active_webhooks), unretired_payers: Number(x.r.unretired_payers),
  classification: x.c.class, reason: x.c.reason, eligible: x.e.eligible, failures: x.e.failures,
});

console.log(`synthetic Business retirement — ${new Date().toISOString()} — ${APPLY ? 'APPLY' : 'read-only'}\n`);
console.log(`  active Businesses                 ${all.length}`);
console.log(`  canonical                         ${classes.filter((x) => x.c.class === 'CANONICAL').length}`);
console.log(`  synthetic retireable              ${classes.filter((x) => x.c.class === 'SYNTHETIC_RETIREABLE').length}`);
console.log(`  eligible candidates               ${candidates.length}`);
console.log(`  skipped (failed an invariant)     ${skipped.length}`);
console.log(`  unclassified                      ${unclassified.length}`);
const sum = (k) => candidates.reduce((n, x) => n + Number(x.r[k]), 0);
console.log(`  candidate value (minor)           ${sum('value_minor')}`);
console.log(`  candidate active webhooks         ${sum('active_webhooks')}`);
console.log(`  candidate unretired payers        ${sum('unretired_payers')}`);
console.log(`  candidate live bindings / keys    ${candidates.filter((x) => x.r.live_binding).length} / ${sum('active_keys')}`);
for (const x of unclassified) console.log(`  ! unclassified: ${x.r.name} — ${x.c.reason}`);
for (const x of skipped) console.log(`  ! skipped: ${x.r.name} — ${x.e.failures.join('; ')}`);

const discovery = join(OUT, `candidates-${stamp}.json`);
writeFileSync(discovery, `${JSON.stringify({ taken_at: new Date().toISOString(), candidates: candidates.map(record), skipped: skipped.map(record), unclassified: unclassified.map(record) }, null, 2)}\n`);
console.log(`\ncandidate set: ${discovery}`);
if (!APPLY) { console.log('read-only — nothing changed. Re-run with --apply.'); process.exit(unclassified.length ? 1 : 0); }

// ── apply ────────────────────────────────────────────────────────────────────
const ids = candidates.map((x) => x.r.business_id);
const projects = [...new Set(candidates.map((x) => x.r.owner_project_id))];
const before = snapshot(ids, projects);
const results = [];
for (const [i, x] of candidates.entries()) {
  const [fresh] = evidence([x.r.business_id]);
  if (!fresh) { results.push({ business_id: x.r.business_id, outcome: 'ALREADY_INACTIVE' }); continue; }
  const e = retirementEligibility(fresh, canon);
  if (!e.eligible) { results.push({ business_id: x.r.business_id, outcome: 'SKIPPED', failures: e.failures }); console.log(`  ! skipped at retirement: ${fresh.name} — ${e.failures.join('; ')}`); continue; }
  const { status, body } = coreRetire(fresh.owner_project_id, fresh.business_id);
  const ok = status === 200 && body?.business_retired === true && body?.business?.merchant_id === fresh.business_id;
  results.push({ business_id: fresh.business_id, project_id: fresh.owner_project_id, value_before: Number(fresh.value_minor), outcome: ok ? 'RETIRED' : 'FAILED', status, retired_minor: body?.retired_minor ?? null, sessions: body?.business?.sessions_cancelled, links: body?.business?.links_cancelled });
  if (!ok) console.log(`  ✗ ${fresh.name}: HTTP ${status} ${JSON.stringify(body).slice(0, 160)}`);
  if ((i + 1) % 25 === 0) console.log(`  … ${i + 1}/${candidates.length}`);
}
const after = snapshot(ids, projects);

const changed = Object.keys(before).filter((k) => !['taken_at', 'postings', 'entries'].includes(k) && before[k] !== after[k]);
const t0 = before.taken_at;
const ledger = JSON.parse(readSandbox(`SELECT json_build_object(
  'batch_postings', (SELECT count(*) FROM ledger_postings WHERE created_at >= '${t0}' AND idempotency_key LIKE 'sandbox-retire:delete:%:synthetic-batch-%'),
  'other_postings', (SELECT count(*) FROM ledger_postings WHERE created_at >= '${t0}' AND idempotency_key NOT LIKE 'sandbox-retire:delete:%:synthetic-batch-%'),
  'unbalanced_since', (SELECT count(*) FROM (SELECT e.posting_id FROM ledger_entries e JOIN ledger_postings p ON p.id = e.posting_id WHERE p.created_at >= '${t0}'
                        GROUP BY e.posting_id HAVING sum(CASE e.entry_type WHEN 'DEBIT' THEN e.amount_minor ELSE -e.amount_minor END) <> 0) u),
  'duplicate_keys', (SELECT count(*) FROM (SELECT idempotency_key FROM ledger_postings WHERE idempotency_key LIKE 'sandbox-retire:%' GROUP BY 1 HAVING count(*) > 1) d),
  'still_active', (SELECT count(*) FROM merchants WHERE id IN (${ids.length ? ids.map((i) => `'${i}'`).join(',') : 'NULL'}) AND status = 'ACTIVE'),
  'value_left', (SELECT coalesce(sum(abs((SELECT coalesce(sum(CASE e.entry_type WHEN 'CREDIT' THEN e.amount_minor ELSE -e.amount_minor END), 0) FROM ledger_entries e WHERE e.account_id = a.account_id))), 0)
                  FROM (SELECT available_account_id AS account_id FROM wallets WHERE merchant_id IN (${ids.length ? ids.map((i) => `'${i}'`).join(',') : 'NULL'})
                        UNION SELECT reserved_account_id FROM wallets WHERE merchant_id IN (${ids.length ? ids.map((i) => `'${i}'`).join(',') : 'NULL'})
                        UNION SELECT account_id FROM wallet_accounts WHERE merchant_id IN (${ids.length ? ids.map((i) => `'${i}'`).join(',') : 'NULL'})) a)
)::text`));

const retired = results.filter((r) => r.outcome === 'RETIRED').length;
const failed = results.filter((r) => r.outcome === 'FAILED').length;
const skippedAtApply = results.filter((r) => r.outcome === 'SKIPPED').length;
console.log(`\n  retired ${retired}, failed ${failed}, skipped at retirement ${skippedAtApply}, already inactive ${results.filter((r) => r.outcome === 'ALREADY_INACTIVE').length}`);
console.log(`  batch postings ${ledger.batch_postings}, other postings in the window ${ledger.other_postings}, unbalanced ${ledger.unbalanced_since}, duplicate retirement keys ${ledger.duplicate_keys}`);
console.log(`  candidates still ACTIVE ${ledger.still_active}, value left on them ${ledger.value_left}`);
console.log(`  outside the candidate set, changed: ${changed.length ? changed.join(', ') : 'nothing'}`);
const file = join(OUT, `apply-${stamp}.json`);
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, `${JSON.stringify({ before, after, changed, ledger, results }, null, 2)}\n`);
console.log(`\nBATCH_CANONICAL_RESOURCE_CHANGES=${changed.length}`);
console.log(`BATCH_UNBALANCED_FINANCIAL_CLEANUP=${ledger.unbalanced_since}`);
console.log(`PRE_MILESTONE_SYNTHETIC_BUSINESSES_ACTIVE=${ledger.still_active}`);
console.log(`evidence: ${file}`);
process.exit(failed === 0 && changed.length === 0 && Number(ledger.unbalanced_since) === 0 && Number(ledger.still_active) === 0 ? 0 : 1);
