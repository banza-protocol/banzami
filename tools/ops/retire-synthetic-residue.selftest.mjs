#!/usr/bin/env node
/**
 * The residue scanner and the Business classifier, against a real migrated
 * database — the blind spot reproduced, then closed.
 *
 * Fixtures, inserted in one transaction and rolled back:
 *
 *   RESIDUE    `Sandbox · acc-scn-selftest-a`: synthetic, a sandbox_businesses row,
 *              owning Project ARCHIVED, binding DISABLED — the exact shape of the
 *              165 Businesses the scanner reported as 0 on 2026-09-14
 *   CANONICAL  `Sandbox · Selftest-Live`: approved, bound ACTIVE to an ACTIVE
 *              Project holding an ACTIVE key
 *   CURRENT    `Sandbox · current-dev`: synthetic, but its Project is ACTIVE and
 *              bound — a developer's test Business in use, never residue
 *   AMBIGUOUS  `Sandbox · archived-with-key`: synthetic, owning Project
 *              ARCHIVED, yet an ACTIVE key on it — not retired automatically
 *
 * Proven:
 *   · the scanner's selection before this fix (its name/e-mail shapes only)
 *     misses RESIDUE — the blind spot, reproduced on a database
 *   · the fixed selection selects RESIDUE and none of the other three
 *   · the classifier puts RESIDUE in SYNTHETIC_RETIREABLE, CANONICAL in CANONICAL
 *     only when declared with its live Project, and CURRENT / AMBIGUOUS / an
 *     undeclared approved Business / RESIDUE falsely declared in UNCLASSIFIED
 *   · only RESIDUE is eligible for automatic retirement
 *
 *   DATABASE_URL=postgres://…/migrated_db node tools/ops/retire-synthetic-residue.selftest.mjs
 */
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { businessEvidenceSql, classifyBusiness, retirementEligibility } from '../lib/sandbox-businesses.mjs';

const DB = process.env.DATABASE_URL;
if (!DB) { console.error('DATABASE_URL (a migrated database) is required — this selftest proves SQL, not a mock'); process.exit(2); }

const selection = (name) => execFileSync('bash', ['tools/ops/retire-synthetic-residue.sh', '--print-selection', name], { encoding: 'utf8' });
const M_SEL = selection('merchants');
const SB_SEL = selection('synthetic-businesses');
// The selection as it was before the structural predicate existed.
const LEGACY = M_SEL.replace(`((${SB_SEL}) OR `, '(');
if (LEGACY === M_SEL) { console.error('✗ could not derive the pre-fix selection from the scanner'); process.exit(1); }

const id = () => randomUUID();
const user = id();
const F = {
  residue: { ws: id(), p: id(), m: id(), name: 'Sandbox · acc-scn-selftest-a', project: 'acc-scn-selftest-a' },
  canonical: { ws: id(), p: id(), m: id(), name: 'Sandbox · Selftest-Live', project: 'Selftest-Live' },
  current: { ws: id(), p: id(), m: id(), name: 'Sandbox · current-dev', project: 'current-dev' },
  ambiguous: { ws: id(), p: id(), m: id(), name: 'Sandbox · archived-with-key', project: 'archived-with-key' },
};
const ws = (f, n) => `INSERT INTO developer.dev_workspaces (id, name, slug, created_by) VALUES ('${f.ws}', '${n}', '${n}-${f.ws.slice(0, 8)}', '${user}');`;
const project = (f, status) => `INSERT INTO developer.dev_projects (id, workspace_id, name, slug, status) VALUES ('${f.p}', '${f.ws}', '${f.project}', '${f.project}', '${status}');`;
const merchant = (f, kyb) => `INSERT INTO merchants (id, name, email) VALUES ('${f.m}', '${f.name}', 'sandbox+${f.m}@projects.banzami.test');
  INSERT INTO merchant_compliance (merchant_id, kyb_status) VALUES ('${f.m}', '${kyb}');`;
const owned = (f) => `INSERT INTO sandbox_businesses (merchant_id, project_id, use_case) VALUES ('${f.m}', '${f.p}', 'STANDARD');`;
const binding = (f, state) => `INSERT INTO developer.dev_project_sandbox_binding (project_id, environment, merchant_id, wallet_id, wallet_account_id, state, created_by_user_id)
  VALUES ('${f.p}', 'SANDBOX', '${f.m}', '${id()}', '${id()}', '${state}', '${user}');`;
const key = (f) => `INSERT INTO developer.dev_api_keys (project_id, environment, kind, name, key_prefix, key_hash, created_by)
  VALUES ('${f.p}', 'SANDBOX', 'SECRET', 'selftest', 'bz_test_sk_', 'selftest-${f.p}', '${user}');`;
const ids = Object.values(F).map((f) => `'${f.m}'`).join(',');

const sql = `BEGIN;
${ws(F.residue, 'selftest-residue')} ${project(F.residue, 'ARCHIVED')} ${merchant(F.residue, 'SANDBOX_SYNTHETIC')} ${owned(F.residue)} ${binding(F.residue, 'DISABLED')}
${ws(F.canonical, 'selftest-canonical')} ${project(F.canonical, 'ACTIVE')} ${merchant(F.canonical, 'APPROVED')} ${binding(F.canonical, 'ACTIVE')} ${key(F.canonical)}
${ws(F.current, 'selftest-current')} ${project(F.current, 'ACTIVE')} ${merchant(F.current, 'SANDBOX_SYNTHETIC')} ${owned(F.current)} ${binding(F.current, 'ACTIVE')}
${ws(F.ambiguous, 'selftest-ambiguous')} ${project(F.ambiguous, 'ARCHIVED')} ${merchant(F.ambiguous, 'SANDBOX_SYNTHETIC')} ${owned(F.ambiguous)} ${binding(F.ambiguous, 'DISABLED')} ${key(F.ambiguous)}
SELECT 'legacy:' || coalesce(string_agg(m.id::text, ','), '') FROM merchants m WHERE m.status = 'ACTIVE' AND m.id IN (${ids}) AND ${LEGACY};
SELECT 'fixed:' || coalesce(string_agg(m.id::text, ','), '') FROM merchants m WHERE m.status = 'ACTIVE' AND m.id IN (${ids}) AND ${M_SEL};
SELECT 'evidence:' || (${businessEvidenceSql({ ids: Object.values(F).map((f) => f.m) })});
ROLLBACK;`;

const out = execFileSync('psql', [DB, '-q', '-X', '-At', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8' });
const line = (tag) => out.split('\n').find((l) => l.startsWith(`${tag}:`))?.slice(tag.length + 1) ?? '';
const legacy = new Set(line('legacy').split(',').filter(Boolean));
const fixed = new Set(line('fixed').split(',').filter(Boolean));
const rows = Object.fromEntries(JSON.parse(line('evidence')).map((r) => [r.business_id, r]));

let failures = 0;
const check = (ok, msg) => { if (!ok) failures += 1; console.log(`  ${ok ? '✓' : '✗'} ${msg}`); };

console.log('residue scanner — against a migrated database\n');
check(!legacy.has(F.residue.m), 'before the fix, the scanner does NOT select `Sandbox · acc-scn-selftest-a` (blind spot reproduced)');
check(fixed.has(F.residue.m), 'with the fix, the scanner selects it');
check(!fixed.has(F.canonical.m), 'a live, keyed, approved Business is not selected');
check(!fixed.has(F.current.m), 'a synthetic Business bound to an ACTIVE Project is not selected');
check(!fixed.has(F.ambiguous.m), 'a synthetic Business with an ACTIVE key is not selected');

console.log('\nBusiness classifier\n');
const declared = { businesses: new Set([F.canonical.name]), projects: new Set([F.canonical.project]) };
const none = { businesses: new Set(), projects: new Set() };
const cls = (f, c = declared) => classifyBusiness(rows[f.m], c).class;
check(cls(F.residue) === 'SYNTHETIC_RETIREABLE', 'residue → SYNTHETIC_RETIREABLE');
check(cls(F.canonical) === 'CANONICAL', 'declared Business with its declared live Project → CANONICAL');
check(cls(F.canonical, none) === 'UNCLASSIFIED', 'the same Business, undeclared → UNCLASSIFIED');
check(cls(F.current) === 'UNCLASSIFIED', 'synthetic Business of an undeclared live Project → UNCLASSIFIED');
check(cls(F.ambiguous) === 'UNCLASSIFIED', 'synthetic, archived, but keyed → UNCLASSIFIED');
check(cls(F.residue, { businesses: new Set([F.residue.name]), projects: new Set([F.residue.project]) }) === 'UNCLASSIFIED',
  'residue declared canonical → still UNCLASSIFIED (a declaration cannot make residue canonical)');
const eligible = Object.values(F).filter((f) => retirementEligibility(rows[f.m], declared).eligible).map((f) => f.name);
check(eligible.length === 1 && eligible[0] === F.residue.name, `only the residue is eligible for automatic retirement (${eligible.join(', ')})`);

console.log(`\nSYNTHETIC_BUSINESS_SCANNER_COVERAGE=${failures === 0 ? 'PASS' : 'FAIL'}`);
console.log(`SYNTHETIC_BUSINESS_SCANNER_MUTATION_PROOF=${failures === 0 ? 'PASS' : 'FAIL'}`);
process.exit(failures === 0 ? 0 : 1);
