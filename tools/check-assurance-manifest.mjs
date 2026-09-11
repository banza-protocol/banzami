#!/usr/bin/env node
/**
 * check-assurance-manifest.mjs
 *
 * CI/release gate for the canonical assurance manifest
 * (quality/operator-assurance-manifest.yaml). Fails when:
 *
 *   1. the manifest is unparsable, has duplicate IDs, or invalid enum values;
 *   2. a capability claims Live support (environments.live: true) for a
 *      money-movement capability without explicit live-authorization evidence;
 *   3. a capability with deployment_gate: sandbox-e2e-required and status
 *      "verified" has no e2e_sandbox test IDs or no evidence artifacts;
 *   4. a public capability (public_status: public-*) has an empty api_surface
 *      or zero test IDs of any kind while claiming "verified";
 *   5. a deprecated/removed capability lacks a cleanup_disposition;
 *   6. environment flags are inconsistent (live: true while public_status is
 *      public-sandbox-only wording, or sandbox: false for public-sandbox);
 *   7. RELEASE MODE ONLY (--release): any capability is still in-audit or
 *      blocked, or any cleanup_disposition is obsolete-candidate;
 *   8. the generated doc is stale (docs/quality/BANZAMI_OPERATOR_ASSURANCE.md
 *      does not match regeneration output).
 *
 * Usage:
 *   node tools/check-assurance-manifest.mjs             # structural gate
 *   node tools/check-assurance-manifest.mjs --release   # launch-readiness gate
 *   make check-assurance / make check-assurance-release
 */

import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import {
  parseManifest, MANIFEST_PATH,
  VALID_STATUS, VALID_AUTHORITY, VALID_PUBLIC_STATUS, VALID_DISPOSITION, VALID_GATE,
  VALID_SURFACE, VALID_EXT_DISPOSITION,
  loadMountedRoutes, apiSurfaceViolations,
} from './assurance-manifest-lib.mjs';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
// Gate modes:
//   (default)          structural integrity only
//   --reference        reference-path readiness (reference_path capabilities released)
//   --sandbox-launch   FULL external Sandbox launch (every public surface released)
//   --release          alias of --sandbox-launch (the strict external gate)
const REFERENCE = process.argv.includes('--reference');
const SANDBOX_LAUNCH = process.argv.includes('--sandbox-launch') || process.argv.includes('--release');
const GENERATED_DOC = 'docs/quality/BANZAMI_OPERATOR_ASSURANCE.md';

let failures = 0;
const fail = m => { console.error(`  ✗ ${m}`); failures++; };
const pass = m => console.log(`  ✓ ${m}`);

let manifest;
try {
  manifest = parseManifest(ROOT);
} catch (e) {
  console.error(`✗ Cannot parse ${MANIFEST_PATH}: ${e.message}`);
  process.exit(1);
}
const caps = manifest.capabilities;
const MODE = SANDBOX_LAUNCH ? 'SANDBOX-LAUNCH' : REFERENCE ? 'REFERENCE' : 'structural';
console.log(`Assurance manifest: ${caps.length} capabilities (${MODE} mode)\n`);

// 1. Structural validity
const seen = new Set();
for (const c of caps) {
  const at = `${c.id} (line ${c._line})`;
  if (seen.has(c.id)) fail(`duplicate capability id: ${at}`);
  seen.add(c.id);
  if (!/^CAP-[A-Z]+-\d{3}$/.test(c.id)) fail(`invalid id format: ${at}`);
  if (!c.name) fail(`${at}: missing name`);
  if (!c.owner) fail(`${at}: missing owner`);
  if (!VALID_STATUS.includes(c.status)) fail(`${at}: invalid status "${c.status}"`);
  if (!VALID_AUTHORITY.includes(c.authority)) fail(`${at}: invalid authority "${c.authority}"`);
  if (!VALID_PUBLIC_STATUS.includes(c.public_status)) fail(`${at}: invalid public_status "${c.public_status}"`);
  if (!VALID_DISPOSITION.includes(c.cleanup_disposition)) fail(`${at}: invalid cleanup_disposition "${c.cleanup_disposition}"`);
  if (!VALID_GATE.includes(c.deployment_gate)) fail(`${at}: invalid deployment_gate "${c.deployment_gate}"`);
  if (!c.authority_ref) fail(`${at}: missing authority_ref (protocol authority or operator-extension authority)`);
  if (!c.threat_category) fail(`${at}: missing threat_category`);
  if (typeof c.environments.sandbox !== 'boolean' || typeof c.environments.live !== 'boolean')
    fail(`${at}: environments.sandbox/live must be explicit true|false`);
  if (c.implementation.length === 0 && c.status !== 'removed')
    fail(`${at}: missing implementation locations`);
  if (!VALID_SURFACE.includes(c.surface)) fail(`${at}: missing/invalid surface (${VALID_SURFACE.join('|')})`);
  if (!VALID_EXT_DISPOSITION.includes(c.disposition)) fail(`${at}: missing/invalid disposition (${VALID_EXT_DISPOSITION.join('|')})`);
}
if (failures === 0) pass('structural validity (incl. surface + disposition)');

// 1a. a declared API surface must be a route a public service actually mounts.
//
// This registry is the authoritative statement of what the operator can do, and
// three capabilities declared their surface as `/v1/business/...` long after that
// namespace was withdrawn and began answering 404. Nothing noticed, because every
// other check reads the manifest against itself: the one thing never compared was
// the manifest against the router.
//
// So the routers are parsed and each declared `/v1/...` path must be mounted
// EXACTLY by the service it belongs to (the gateway unless the entry names
// public-api). A prefix match used to be accepted, which let `/v1/qr` stand for
// QR payments (CAP-PAY-003) and `/v1/transfers` stand for a gateway route that
// SEC-015 unmounted (A4-02, A4-09). See apiSurfaceViolations.
{
  const routesByService = loadMountedRoutes(ROOT);
  const total = Object.values(routesByService).reduce((n, r) => n + r.length, 0);
  // If a router could not be parsed, say so instead of passing vacuously — an
  // empty mount set would silently approve every declaration in the file.
  if (routesByService.gateway.length < 20 || routesByService['public-api'].length < 10) {
    fail(`api_surface check is vacuous: parsed only ${routesByService.gateway.length} gateway / ${routesByService['public-api'].length} public-api routes`);
  } else {
    const before = failures;
    for (const v of apiSurfaceViolations(caps, routesByService)) fail(v);
    if (failures === before) pass(`api_surface routes are mounted exactly (${total} public routes parsed)`);
  }
}

// 1b. surface/disposition coherence
for (const c of caps) {
  // A public surface must not be quarantined/removed/internal_only (those mean
  // NOT externally reachable — the surface would then be internal/none).
  if (c.surface === 'public' && ['quarantined', 'removed', 'internal_only'].includes(c.disposition))
    fail(`${c.id}: surface=public but disposition=${c.disposition} — set surface=internal/none if it is not externally reachable`);
  // internal_only must not carry a public surface.
  if (c.disposition === 'internal_only' && c.surface === 'public')
    fail(`${c.id}: internal_only must not be surface=public`);
  // released must carry deployed E2E evidence with provenance.
  if (c.disposition === 'released') {
    if (c.tests.e2e_sandbox.length === 0 && c.deployment_gate === 'sandbox-e2e-required')
      fail(`${c.id}: released + sandbox-e2e-required but no e2e_sandbox test IDs`);
    if (c.evidence.length === 0) fail(`${c.id}: released but no evidence artifact`);
  }
}
if (failures === 0) pass('surface/disposition coherence');

// 2. Live authorization gate — Live money movement must carry explicit evidence
for (const c of caps) {
  if (c.environments.live === true && c.threat_category === 'financial-money-movement') {
    const hasAuth = c.evidence.some(e => /live-authorization/i.test(e));
    if (!hasAuth) fail(`${c.id}: claims live:true for money movement without a "live-authorization" evidence artifact`);
  }
  if (c.public_status === 'public-live' && c.environments.live !== true)
    fail(`${c.id}: public_status public-live but environments.live is false`);
}
if (failures === 0) pass('live-authorization gate');

// 3/4. Verified capabilities must carry their required tests + evidence
for (const c of caps) {
  if (c.status !== 'verified') continue;
  const at = c.id;
  if (c.deployment_gate === 'sandbox-e2e-required') {
    if (c.tests.e2e_sandbox.length === 0) fail(`${at}: verified + sandbox-e2e-required but no e2e_sandbox test IDs`);
    if (c.evidence.length === 0) fail(`${at}: verified but no evidence artifacts`);
  }
  if (c.public_status.startsWith('public')) {
    const total = Object.values(c.tests).reduce((n, l) => n + l.length, 0);
    if (total === 0) fail(`${at}: public capability verified with zero test IDs`);
    if (c.api_surface.length === 0 || c.api_surface[0] === 'none')
      fail(`${at}: public capability with no declared api_surface`);
    if (c.threat_category !== 'content' && c.tests.negative_security.length === 0)
      fail(`${at}: public non-content capability verified without negative/security test IDs`);
  }
}
if (failures === 0) pass('verified-capability test/evidence coverage');

// 5. Deprecated/removed need a disposition
for (const c of caps) {
  if ((c.status === 'deprecated' || c.status === 'removed') &&
      !['legacy-compat-justified', 'obsolete-candidate', 'removed'].includes(c.cleanup_disposition))
    fail(`${c.id}: ${c.status} without matching cleanup_disposition`);
}
if (failures === 0) pass('deprecation dispositions');

// 6. Environment consistency
for (const c of caps) {
  if (c.public_status === 'public-sandbox' && c.environments.sandbox !== true)
    fail(`${c.id}: public-sandbox but environments.sandbox is false`);
}
if (failures === 0) pass('environment consistency');

// 6b. launch_scope integrity: an excluded capability must not also advertise
//     itself as public sandbox/live surface (that would be a false claim).
for (const c of caps) {
  const scope = c.launch_scope || 'sandbox';
  if (scope !== 'sandbox' && scope !== 'excluded')
    fail(`${c.id}: invalid launch_scope "${scope}" (sandbox|excluded)`);
  if (scope === 'excluded' && (c.public_status === 'public-sandbox' || c.public_status === 'public-live'))
    fail(`${c.id}: launch_scope excluded but public_status ${c.public_status} — excluded items must not claim public surface`);
}
if (failures === 0) pass('launch-scope integrity');

// 7a. REFERENCE gate — the reference financial path must be released/verified.
if (REFERENCE) {
  const ref = caps.filter(c => c.reference_path === 'true' || c.reference_path === true);
  if (ref.length === 0) fail('REFERENCE: no capability marked reference_path: true');
  for (const c of ref) {
    if (c.disposition !== 'released') fail(`REFERENCE: ${c.id} is not released (disposition=${c.disposition})`);
    if (c.status !== 'verified') fail(`REFERENCE: ${c.id} status ${c.status} (want verified)`);
  }
  if (failures === 0) pass(`reference-path readiness (${ref.length} capabilities released+verified)`);
}

// 7b. SANDBOX-LAUNCH gate — the FULL external launch. FAILS unless every
//     public surface is released with deployed E2E. A public capability left
//     pending-e2e (or in-audit/blocked) HOLDS the launch. This gate must never
//     pass a broad external launch on real-DB/audit evidence alone.
if (SANDBOX_LAUNCH) {
  const publicCaps = caps.filter(c => c.surface === 'public');
  const holds = [];
  for (const c of publicCaps) {
    if (c.disposition !== 'released')
      holds.push(`${c.id} (${c.disposition}) — public surface not released`);
    if (c.status === 'in-audit' || c.status === 'blocked')
      holds.push(`${c.id} status=${c.status} — public surface must be verified`);
  }
  holds.forEach(h => fail(`SANDBOX-LAUNCH: ${h}`));
  const quarantined = caps.filter(c => c.disposition === 'quarantined');
  const internal = caps.filter(c => c.disposition === 'internal_only');
  console.log(`  · public released: ${publicCaps.filter(c => c.disposition === 'released').length}/${publicCaps.length}` +
    ` · quarantined: ${quarantined.length} · internal_only: ${internal.length}`);
  if (failures === 0) pass('FULL external Sandbox launch readiness (every public surface released)');
}

// 8. Generated doc freshness
if (existsSync(join(ROOT, GENERATED_DOC))) {
  const current = readFileSync(join(ROOT, GENERATED_DOC), 'utf-8');
  const regen = execFileSync('node', [join(ROOT, 'tools/generate-assurance-doc.mjs'), '--stdout'], { encoding: 'utf-8' });
  if (current.trim() !== regen.trim())
    fail(`${GENERATED_DOC} is stale — run: node tools/generate-assurance-doc.mjs`);
  else pass('generated assurance doc is fresh');
} else {
  fail(`${GENERATED_DOC} missing — run: node tools/generate-assurance-doc.mjs`);
}

console.log(failures ? `\n✗ Assurance manifest check FAILED (${failures})` : '\n✓ Assurance manifest check passed');
process.exit(failures ? 1 : 0);
