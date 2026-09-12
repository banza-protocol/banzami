#!/usr/bin/env node
/**
 * check-openapi-route-drift.mjs — the published OpenAPI document and the routes
 * a developer key can actually reach must be the same set.
 *
 * Two failures this exists for, and they are different failures:
 *
 *   documented but absent — an integrator writes the call, ships it, and gets a
 *     404 from a surface the operator published. The SDK route-drift test caught
 *     this once for /v1/public/pay, which the SDK called and nothing mounted.
 *
 *   reachable but undocumented — a route a developer key can call that no one
 *     decided to publish. It has no contract, no versioning promise and no
 *     deprecation path, and the first anyone hears of it is when an integrator
 *     depends on it.
 *
 * The reachable set is read from the Gateway router rather than probed, so this
 * runs in CI with no Sandbox and no key. It reads exactly the two groups that a
 * Console-issued Sandbox key authenticates against — the DeveloperKeyAuth group
 * and the ADR-047 DualAuth group — and nothing else: the merchant-JWT and
 * consumer surfaces are not part of the published contract and must not leak
 * into it by being counted here.
 *
 * Usage: node tools/check-openapi-route-drift.mjs
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const SERVER = resolve(ROOT, 'services/api-gateway/internal/server/server.go');
const SPEC = resolve(ROOT, 'docs/developer/openapi/banzami-sandbox.openapi.json');
const MIRROR = resolve(ROOT, 'apps/website/public/developers/openapi/banzami-sandbox.openapi.json');

const src = readFileSync(SERVER, 'utf8');
let failures = 0;
const fail = m => { console.error(`  ✗ ${m}`); failures++; };
const pass = m => console.log(`  ✓ ${m}`);

/** Index just past the `{` that opens the block whose header starts at `from`. */
function openBraceAfter(from) {
  const i = src.indexOf('{', from);
  return i === -1 ? -1 : i + 1;
}

/** The source of the balanced block starting at `open` (index just past `{`). */
function blockAt(open) {
  let depth = 1, i = open;
  while (i < src.length && depth > 0) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '"') { i++; while (i < src.length && src[i] !== '"') i += src[i] === '\\' ? 2 : 1; }
    else if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; }
    i++;
  }
  return { body: src.slice(open, i - 1), end: i };
}

/** Every method+path a chi block registers, with nested r.Route prefixes applied. */
function routesIn(body, prefix) {
  const out = [];
  const re = /r\.(?:With\([^)]*\)\.)?(Get|Post|Put|Patch|Delete)\(\s*"([^"]*)"|r\.Route\(\s*"([^"]*)"\s*,\s*func\s*\([^)]*\)\s*\{/g;
  let m;
  while ((m = re.exec(body))) {
    if (m[3] !== undefined) {
      // Nested route: recurse into its own balanced block and skip past it.
      const open = m.index + m[0].length;
      let depth = 1, i = open;
      while (i < body.length && depth > 0) {
        const c = body[i];
        if (c === '{') depth++;
        else if (c === '}') depth--;
        else if (c === '"') { i++; while (i < body.length && body[i] !== '"') i += body[i] === '\\' ? 2 : 1; }
        else if (c === '/' && body[i + 1] === '/') { while (i < body.length && body[i] !== '\n') i++; }
        i++;
      }
      out.push(...routesIn(body.slice(open, i - 1), prefix + m[3]));
      re.lastIndex = open + (i - 1 - open);
      continue;
    }
    const p = (prefix + m[2]).replace(/\/$/, '') || '/';
    out.push(`${m[1].toUpperCase()} ${p}`);
  }
  return out;
}

/** The block of the first `r.Group(func(r chi.Router) {` whose body uses `marker`. */
function groupUsing(marker) {
  const re = /r\.Group\(\s*func\s*\([^)]*\)\s*\{/g;
  let m;
  while ((m = re.exec(src))) {
    const { body } = blockAt(openBraceAfter(m.index));
    if (body.includes(marker)) return body;
  }
  return null;
}

const devKeyGroup = groupUsing('middleware.DeveloperKeyAuth(');
const dualGroup = groupUsing('middleware.DualAuth(');
if (!devKeyGroup) fail('no r.Group uses middleware.DeveloperKeyAuth — the developer-key surface could not be read');
if (!dualGroup) fail('no r.Group uses middleware.DualAuth — the ADR-047 payment surface could not be read');
if (failures) process.exit(1);

// The DeveloperKeyAuth group is mounted on the ROOT router and writes absolute
// paths; the DualAuth group lives inside r.Route("/v1", …) and writes relative ones.
const reachable = new Set([
  ...routesIn(devKeyGroup, ''),
  ...routesIn(dualGroup, '/v1'),
]);

const spec = JSON.parse(readFileSync(SPEC, 'utf8'));
const documented = new Set();
for (const [p, ops] of Object.entries(spec.paths)) {
  for (const method of Object.keys(ops)) {
    if (['get', 'post', 'put', 'patch', 'delete'].includes(method)) documented.add(`${method.toUpperCase()} ${p}`);
  }
}

// A route can also be RETIRED: still mounted so an old integration gets an
// explanation instead of a 404, but answering 410 to every credential. That is
// not part of the contract and must not be in the spec — so the exemption is
// earned from the source, not from a list here: the handler the route names must
// answer 410 ROUTE_RETIRED, and the docs must say so where an integrator reads.
const handlers = readFileSync(resolve(ROOT, 'services/api-gateway/internal/handler/payment_links.go'), 'utf8');
const docsRef = readFileSync(resolve(ROOT, 'apps/website/app/developers/docs/reference.tsx'), 'utf8');
const retiredHandlers = new Set();
for (const m of handlers.matchAll(/func \(h \*\w+\) (\w+)\(w http\.ResponseWriter, r \*http\.Request\) \{([\s\S]*?)\n\}/g)) {
  if (/http\.StatusGone,\s*"ROUTE_RETIRED"/.test(m[2])) retiredHandlers.add(m[1]);
}
const retired = new Set();
for (const m of src.matchAll(/r\.(Get|Post|Put|Patch|Delete)\(\s*"([^"]*)"\s*,\s*\w+\.(\w+)\)/g)) {
  if (retiredHandlers.has(m[3])) retired.add(m[3]);
}
const retiredRoutes = [...reachable].filter(r => {
  const path = r.split(' ')[1];
  const leaf = path.split('/').pop();
  return retiredHandlers.size > 0 && [...retired].some(h => h.toLowerCase() === leaf.replace(/-/g, '')) &&
    docsRef.includes(path) && /ROUTE_RETIRED/.test(docsRef);
});
for (const r of retiredRoutes) pass(`${r} is retired: 410 ROUTE_RETIRED, declared as retired in the docs, absent from the spec`);

const undocumented = [...reachable].filter(r => !documented.has(r) && !retiredRoutes.includes(r)).sort();
const absent = [...documented].filter(r => !reachable.has(r)).sort();

undocumented.length
  ? fail(`reachable with a developer key but not published:\n      ${undocumented.join('\n      ')}`)
  : pass(`every developer-key route is published (${reachable.size} operations)`);

absent.length
  ? fail(`published but not reachable — an integrator writing these gets a 404:\n      ${absent.join('\n      ')}`)
  : pass(`every published operation is mounted (${documented.size} operations)`);

// The website serves its own copy. A spec that is right in docs/ and stale on the
// site is the version integrators actually read.
readFileSync(SPEC, 'utf8') === readFileSync(MIRROR, 'utf8')
  ? pass('the published copy on the website is byte-identical to docs/')
  : fail('apps/website/public/developers/openapi/ has drifted from docs/developer/openapi/');

if (failures) { console.error('\n✗ OpenAPI route drift'); process.exit(1); }
console.log('\n✓ the published contract and the reachable surface are the same set');
