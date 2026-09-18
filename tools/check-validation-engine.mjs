#!/usr/bin/env node
/**
 * check-validation-engine.mjs — ONE VALIDATION ENGINE, MULTIPLE CONTROL SURFACES.
 *
 * The architectural invariants from the owner's control-plane clarification,
 * enforced rather than described. Three failures this exists for:
 *
 *   a parallel validation product — a second runner, a second registry, a second
 *     portal. Two implementations of the same journey disagree exactly when it
 *     matters, and nobody can say which was right.
 *
 *   BANZADMIN becomes the engine — a run bound to an HTTP request or a browser
 *     tab dies when the tab closes, and its state lives nowhere. BANZADMIN
 *     starts, observes and controls; it does not execute.
 *
 *   an operational validation surface on the PUBLIC website — the Studio handles
 *     actor identities, internal routes, database state, deployed revisions,
 *     security findings, secret references, run controls and raw evidence. All
 *     of it belongs behind the administrative auth and RBAC boundary.
 *
 * Usage: node tools/check-validation-engine.mjs
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
let failures = 0;
const fail = (m) => { console.error(`  ✗ ${m}`); failures += 1; };
const pass = (m) => console.log(`  ✓ ${m}`);

const read = (p) => { try { return readFileSync(resolve(ROOT, p), 'utf8'); } catch { return ''; } };

/** Every file under `dir` matching `ext`, recursively, skipping vendored trees. */
function walk(dir, ext, acc = []) {
  const abs = resolve(ROOT, dir);
  if (!existsSync(abs)) return acc;
  for (const name of readdirSync(abs)) {
    if (name === 'node_modules' || name === '.next' || name === 'dist' || name === '.git') continue;
    const p = join(abs, name);
    if (statSync(p).isDirectory()) walk(join(dir, name), ext, acc);
    else if (ext.some((e) => name.endsWith(e))) acc.push(join(dir, name));
  }
  return acc;
}

console.log('Banzami Validation Studio — one engine, multiple control surfaces\n');

// ── 1. EXISTING_APPS_VALIDATION_STUDIO_PRESERVED ────────────────────────────
existsSync(resolve(ROOT, 'apps/validation-studio'))
  ? pass('apps/validation-studio is preserved')
  : fail('apps/validation-studio is gone — it is the execution-plane foundation');

// ── 2. PARALLEL_VALIDATION_PLATFORM=0 ───────────────────────────────────────
// Assembled rather than written literally so this file cannot match itself.
const FORBIDDEN_APPS = [
  ['apps/validation', 'lab'].join('-'),
  ['apps/validation', 'admin'].join('-'),
  ['apps/validation', 'portal'].join('-'),
  ['apps/validation', 'runner'].join('-'),
];
const parallel = FORBIDDEN_APPS.filter((d) => existsSync(resolve(ROOT, d)));
parallel.length
  ? fail(`parallel validation application(s): ${parallel.join(', ')}`)
  : pass('no parallel validation application');

// One capability registry. The unclassified-route ledger is its COMPLEMENT, not
// a second registry — it lists what is deliberately not a capability.
const REGISTRY = 'quality/operator-assurance-manifest.yaml';
existsSync(resolve(ROOT, REGISTRY))
  ? pass('one canonical capability registry')
  : fail(`${REGISTRY} is missing — capability truth has no home`);

// ── 3. BANZADMIN_AS_LONG_RUNNING_TEST_ENGINE=0 ──────────────────────────────
// BANZADMIN is Next.js + Go. Neither may reach for an execution runtime.
const ENGINE_SMELLS = [
  ['playwright', /from\s+['"]playwright|require\(['"]playwright|npx\s+playwright/],
  ['puppeteer', /from\s+['"]puppeteer|require\(['"]puppeteer/],
  ['a shell', /child_process|exec\.Command|os\/exec/],
  ['flutter', /\bflutter\s+(test|build|analyze)\b/],
  ['a package publish', /npm\s+publish|cargo\s+publish|pub\s+publish/],
];
let smells = 0;
for (const f of [...walk('apps/admin', ['.ts', '.tsx']), ...walk('services/admin-api', ['.go'])]) {
  if (/_test\.go$|\.test\.tsx?$/.test(f)) continue;       // tests may do as they like
  const src = read(f);
  for (const [what, re] of ENGINE_SMELLS) {
    if (re.test(src)) { fail(`BANZADMIN reaches for ${what}: ${f} — it must control the engine, not be it`); smells += 1; }
  }
}
if (!smells) pass('BANZADMIN launches no browser, shell, build or publish');

// ── 4. PUBLIC_WEBSITE_OPERATIONAL_VALIDATION_ACCESS=0 ───────────────────────
// The public site must expose no operational validation route.
const publicRoutes = walk('apps/website/app', ['page.tsx', 'route.ts'])
  .filter((f) => /\/validation|\/validation-studio|\/studio/.test(f));
publicRoutes.length
  ? fail(`the PUBLIC website exposes operational validation route(s): ${publicRoutes.join(', ')}`)
  : pass('the public website exposes no operational validation surface');

// A public page must not render actor identities or run controls either.
const LEAKS = [/@e2ec0[123]\b/, /@e2eb0[123]\b/, /unclassified_routes/, /PILOT_LIMIT_/];
let leaks = 0;
for (const f of walk('apps/website/app', ['.tsx', '.ts'])) {
  const src = read(f);
  for (const re of LEAKS) if (re.test(src)) { fail(`public website file leaks internal validation detail: ${f}`); leaks += 1; }
}
if (!leaks) pass('no Validation Actor identity or internal control leaks onto the public website');

// ── 5. MULTIPLE_CONTROL_SURFACES, one entry point ───────────────────────────
// Every control surface reaches the engine the same way. Until the engine
// exists this asserts the DOCUMENTED contract is present and singular, which is
// what stops a second one being invented in the meantime.
const ARCH = 'docs/validation/studio/23-architecture-control-and-execution.md';
const arch = read(ARCH);
if (!arch) fail(`${ARCH} is missing — the canonical architecture must be written down`);
else {
  const required = [
    ['the control/execution split', /CONTROL PLANE[\s\S]*EXECUTION PLANE/],
    ['the engine-is-not-BANZADMIN rule', /BANZADMIN_AS_LONG_RUNNING_TEST_ENGINE=0/],
    ['the public-website rule', /PUBLIC_WEBSITE_OPERATIONAL_VALIDATION_ACCESS=0/],
    ['the Live boundary', /REAL_LIVE_VALIDATION_CONTROL_EXPOSED = 0/],
    ['the control contract', /## 5\. Control contract/],
  ];
  const missing = required.filter(([, re]) => !re.test(arch)).map(([w]) => w);
  missing.length ? fail(`${ARCH} no longer states: ${missing.join('; ')}`)
                 : pass('the canonical architecture states every invariant it must');
}

if (failures) {
  console.error(`\n✗ ONE_VALIDATION_ENGINE=FAIL (${failures})`);
  process.exit(1);
}
console.log('\n✓ ONE_VALIDATION_ENGINE=PASS');
console.log('✓ PARALLEL_VALIDATION_PLATFORM=0');
console.log('✓ BANZADMIN_AS_LONG_RUNNING_TEST_ENGINE=0');
console.log('✓ PUBLIC_WEBSITE_OPERATIONAL_VALIDATION_ACCESS=0');
console.log('✓ EXISTING_APPS_VALIDATION_STUDIO_PRESERVED=PASS');
