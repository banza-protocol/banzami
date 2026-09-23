#!/usr/bin/env node
/**
 * check-runtime-route-registration.mjs — the INVERSE of the api_surface check.
 *
 * `check-assurance-manifest` proves *declared ⊆ mounted*: every route a
 * capability claims is really there. It has no opposite, and the gap is not
 * theoretical — CAP-COLLECT-001 said `api_surface: none (frozen)` and
 * `status: blocked` while Collections ran live with ten mounted gateway routes,
 * four applied migrations and real rows, and `make check-assurance` passed.
 *
 * This proves *mounted ⊆ declared*: every externally reachable route is either
 * claimed by exactly one capability or explicitly classified in the manifest's
 * `unclassified_routes` ledger. A route that is neither is
 * RUNTIME_EXTERNALLY_REACHABLE_BUT_UNREGISTERED — live, with no owner, no
 * journey, no contract and no deprecation path.
 *
 * Adoption is deliberately gradual, because a gate that fails on day one across
 * a hundred routes is a gate someone switches off:
 *
 *   normal CI      the ledger MUST NOT GROW, and a NEW unregistered route fails
 *   Phase B →      the ledger is classified down
 *   --golden       the ledger must be EMPTY
 *
 * Routes are read from the routers, not probed, so this runs in CI with no
 * Sandbox and no credential.
 *
 * Usage:
 *   node tools/check-runtime-route-registration.mjs
 *   node tools/check-runtime-route-registration.mjs --golden
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseManifest, parseMountedRoutes } from './assurance-manifest-lib.mjs';

/** The ledger is a flat list of {route, class, reason, owning_milestone}. */
function parseLedger(text) {
  const out = [];
  let cur = null;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (/^\s*#/.test(line) || !line.trim()) continue;
    const start = line.match(/^  - route:\s*"(.+)"$/);
    if (start) { cur = { route: start[1] }; out.push(cur); continue; }
    const kv = line.match(/^    ([a-z_]+):\s*"?(.*?)"?$/);
    if (kv && cur) cur[kv[1]] = kv[2];
  }
  return out;
}

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const GOLDEN = process.argv.includes('--golden');
let failures = 0;
const fail = (m) => { console.error(`  ✗ ${m}`); failures += 1; };
const pass = (m) => console.log(`  ✓ ${m}`);

// Every Go router that serves an externally reachable surface.
const ROUTERS = {
  gateway: 'services/api-gateway/internal/server/server.go',
  'public-api': 'services/public-api/internal/server/server.go',
  'admin-api': 'services/admin-api/internal/server/server.go',
  'developer-api': 'services/developer-api/internal/developer/handlers.go',
};

// Not externally reachable product surface:
//   /internal/** — mounted behind a service key; 404 from the public edge
//   liveness/readiness/metrics — operational, and every service has them
const NOT_PRODUCT = (p) => p.startsWith('/internal/') || ['/health', '/readyz', '/metrics'].includes(p);

/** The ledger's permitted classes. `pending-classification` must reach 0. */
const CLASSES = new Set([
  'internal', 'health-ops', 'debug-guarded', 'deprecated', 'non-product',
  'operator-surface', 'pending-classification',
]);

const manifest = parseManifest(ROOT);
const caps = manifest.capabilities ?? [];

// ── What the runtime exposes ────────────────────────────────────────────────
const mounted = [];
for (const [svc, rel] of Object.entries(ROUTERS)) {
  const routes = parseMountedRoutes(readFileSync(join(ROOT, rel), 'utf-8'));
  if (routes.length === 0) { fail(`${svc}: parsed zero routes — the parser or the router moved`); continue; }
  for (const r of routes) if (!NOT_PRODUCT(r.path)) mounted.push({ svc, key: `${r.method} ${r.path}` });
}
const reachable = [...new Set(mounted.map((m) => m.key))];

// ── What the manifest claims ────────────────────────────────────────────────
// An api_surface entry may carry a verb; a bare path claims every verb on it.
const claimedExact = new Set();
const claimedPath = new Set();
for (const c of caps) {
  for (const entry of c.api_surface ?? []) {
    const m = String(entry).match(/(?:^|\s)(GET|POST|PUT|PATCH|DELETE)?\s*(\/[A-Za-z0-9{}\/_.-]+)/);
    if (!m) continue;
    const path = m[2].replace(/\{[^}]+\}/g, '{p}').replace(/(.)\/$/, '$1');
    if (m[1]) claimedExact.add(`${m[1]} ${path}`); else claimedPath.add(path);
  }
}
const isClaimed = (key) => claimedExact.has(key) || claimedPath.has(key.split(' ')[1]);

// ── What the ledger excuses ─────────────────────────────────────────────────
const LEDGER_PATH = 'quality/validation/unclassified-routes.yaml';
const ledger = parseLedger(readFileSync(join(ROOT, LEDGER_PATH), 'utf-8'));
// A baseline that can only shrink. The number is committed so CI can compare
// against it; raising it is a deliberate, reviewable edit rather than drift.
const BASELINE = 338;
const excused = new Map();
for (const e of ledger) {
  if (!e.route) { fail('an unclassified_routes entry has no route'); continue; }
  if (!CLASSES.has(e.class)) fail(`${e.route}: class "${e.class}" is not one of ${[...CLASSES].join(', ')}`);
  if (!e.reason || String(e.reason).length < 15) fail(`${e.route}: no real reason recorded`);
  excused.set(e.route, e);
}

// ── The three verdicts ──────────────────────────────────────────────────────
const unregistered = reachable.filter((k) => !isClaimed(k) && !excused.has(k));
if (unregistered.length) {
  fail(`RUNTIME_EXTERNALLY_REACHABLE_BUT_UNREGISTERED: ${unregistered.length} route(s)`);
  for (const k of unregistered.slice(0, 25)) console.error(`      ${k}`);
  if (unregistered.length > 25) console.error(`      … and ${unregistered.length - 25} more`);
  console.error('      → claim each in a capability\'s api_surface, or add it to');
  console.error('        unclassified_routes with a class and a reason.');
} else {
  pass(`every externally reachable route is claimed or classified (${reachable.length} route(s))`);
}

// A ledger entry for a route that is no longer mounted is stale bookkeeping.
const stale = [...excused.keys()].filter((k) => !reachable.includes(k));
if (stale.length) fail(`${stale.length} ledger entr(ies) name a route that is no longer mounted: ${stale.slice(0, 5).join(', ')}`);
else pass('no stale ledger entries');

const pending = ledger.filter((e) => e.class === 'pending-classification');
console.log(`\n  unclassified_routes ledger: ${ledger.length} entr(ies), ${pending.length} pending classification`);

// UNCLASSIFIED_ROUTE_COUNT_MUST_NOT_INCREASE. Classifying a route is progress;
// adding one is the drift this exists to stop.
if (ledger.length > BASELINE) {
  fail(`the ledger GREW: ${ledger.length} entries against a baseline of ${BASELINE}. ` +
       `Claim the new route in a capability instead, or justify raising BASELINE in this file.`);
} else if (ledger.length < BASELINE) {
  pass(`the ledger shrank: ${ledger.length} against a baseline of ${BASELINE} — lower BASELINE to lock the gain in`);
} else {
  pass(`the ledger has not grown (${ledger.length} = baseline)`);
}

if (GOLDEN && pending.length) {
  fail(`--golden requires UNCLASSIFIED_ROUTES=0; ${pending.length} still pending`);
}

if (failures) {
  console.error(`\n✗ RUNTIME_ROUTE_CAPABILITY_DRIFT_TRACKED=FAIL (${failures})`);
  process.exit(1);
}
console.log('\n✓ RUNTIME_ROUTE_CAPABILITY_DRIFT_TRACKED=PASS');
console.log(`✓ NEW_EXTERNALLY_REACHABLE_UNREGISTERED_ROUTE=0`);
if (GOLDEN) console.log('✓ UNCLASSIFIED_ROUTES=0');
