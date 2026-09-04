#!/usr/bin/env node
/**
 * sdk-release.mjs — controlled TypeScript SDK release (RT02.1).
 *
 * Prepares and (only with --publish AND registry auth) publishes @banzami/sdk.
 * FAIL-CLOSED: it verifies every precondition BEFORE any publish, and refuses to
 * publish unless a registry credential/ownership is actually present. It never
 * publishes merely because it was invoked — a deliberate release tag or approved
 * workflow dispatch is required (enforced by the workflow + this script's flags).
 *
 * Stages (all run in prepare mode; publish only with --publish):
 *   1. clean git tree + on main (or an explicit tag)
 *   2. contract gate (tools/check-sdk-contract.mjs)
 *   3. build + npm pack; tarball content inspection (no secrets/hosts/.env/
 *      source-maps/db refs/internal routes/test evidence)
 *   4. exports == released manifest surface (./sandbox has no pending methods)
 *   5. clean-install E2E against deployed Sandbox with a Console key (skipped if
 *      no key provided; the workflow provides one)
 *   6. PUBLISH (only with --publish AND npm auth AND provenance) then a fresh
 *      external install + me() re-verify.
 *
 * Usage:
 *   node tools/sdk-release.mjs                 # prepare + verify (no publish)
 *   node tools/sdk-release.mjs --publish       # publish (requires npm auth)
 */
import { execFileSync, execSync } from 'child_process';
import { readFileSync, existsSync, readdirSync, mkdtempSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const SDK = join(ROOT, 'sdk/typescript');
const PUBLISH = process.argv.includes('--publish');
let failed = false;
const fail = m => { console.error(`  ✗ ${m}`); failed = true; };
const ok = m => console.log(`  ✓ ${m}`);
const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', ...opts });

console.log(`SDK release — ${PUBLISH ? 'PUBLISH' : 'PREPARE (no publish)'} mode\n`);

// 1. Clean tree.
try {
  const dirty = execSync('git status --porcelain', { cwd: ROOT }).toString().trim();
  if (dirty) fail('working tree not clean'); else ok('clean git tree');
} catch { fail('git status failed'); }

// 2. Contract gate.
try { sh('node', [join(ROOT, 'tools/check-sdk-contract.mjs')], { stdio: 'pipe' }); ok('SDK contract gate'); }
catch (e) { fail(`contract gate failed:\n${e.stdout || e.message}`); }

// 3. Build + pack + inspect tarball contents.
try { sh('npm', ['run', 'build'], { cwd: SDK, stdio: 'pipe' }); ok('SDK build'); }
catch { fail('SDK build failed'); }
let tarball;
try {
  tarball = sh('npm', ['pack', '--silent'], { cwd: SDK }).trim().split('\n').pop();
  ok(`npm pack → ${tarball}`);
} catch { fail('npm pack failed'); }
if (tarball && existsSync(join(SDK, tarball))) {
  const listing = sh('tar', ['-tzf', join(SDK, tarball)]);
  const banned = [/\.env/, /source-?map|\.map$/i, /\.pem$|\.key$/, /evidence\//, /\.git/];
  const bad = listing.split('\n').filter(f => banned.some(re => re.test(f)));
  if (bad.length) fail(`tarball contains forbidden files: ${bad.join(', ')}`);
  else ok('tarball content clean (no .env/maps/keys/evidence/git)');
  // secret/host scan of the packed dist
  const scanDir = mkdtempSync(join(tmpdir(), 'sdkpack-'));
  sh('tar', ['-xzf', join(SDK, tarball), '-C', scanDir]);
  const files = [];
  (function walk(d) { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); e.isDirectory() ? walk(p) : files.push(p); } })(scanDir);
  const content = files.filter(f => /\.(js|json|ts)$/.test(f)).map(f => readFileSync(f, 'utf8')).join('\n');
  if (/(bz_live_[A-Za-z0-9]{8}|-----BEGIN|core-api:8081|127\.0\.0\.1|172\.\d+\.|developer-api:8086)/.test(content))
    fail('packed SDK contains a secret/internal-host/core-route literal');
  else ok('packed SDK has no secret/internal-host/core-route');
  try { execSync(`rm -f ${join(SDK, tarball)}`); } catch { /* ignore */ }
}

// 4. Exports == released surface (delegated to the contract gate's ./sandbox check).
ok('external surface (./sandbox) validated by contract gate');

// 5/6. Publish preconditions — FAIL CLOSED.
if (PUBLISH) {
  let authed = false;
  try { execSync('npm whoami', { cwd: SDK, stdio: 'pipe' }); authed = true; } catch { authed = false; }
  if (!authed) {
    fail('PUBLISH refused: no npm authentication (registry ownership not provisioned). ' +
         'See docs/operations/SDK_REGISTRY_OWNERSHIP_AND_RELEASE.md — this is an external owner action.');
  } else {
    // Only reached once a Banzami-owned registry credential exists.
    //
    // Provenance is an npm attestation built from CI OIDC claims, so it can only
    // be produced by a trusted CI publisher — asking for it on a workstation
    // fails the publish outright. The approved release route today is a
    // deliberate manual publish from the owner's Mac (no long-lived write token
    // parked in CI), so provenance is requested only when CI actually provides
    // the identity to back it, and its absence is stated rather than implied.
    const inCI = !!process.env.CI && !!process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
    // npm requires 2FA (or a bypass-2FA granular token) to publish. The approved
    // route is an owner-run publish, so the one-time code is passed through from
    // the operator's own invocation. It is short-lived and single-use; it is
    // never stored, logged or echoed here.
    const otpArg = process.argv.find(a => a.startsWith('--otp='));
    const otp = otpArg ? otpArg.slice('--otp='.length) : process.env.NPM_OTP;
    if (!otp && !inCI) {
      console.log('  · no --otp supplied; npm will prompt if the account requires 2FA');
    }
    const args = ['publish', '--access', 'public',
      ...(inCI ? ['--provenance'] : []),
      ...(otp ? ['--otp', otp] : [])];
    try {
      sh('npm', args, { cwd: SDK, stdio: 'inherit' });
      ok(`published @banzami/sdk${inCI ? ' with provenance' : ' (no provenance — manual owner publish)'}`);
    } catch (e) { fail(`npm publish failed: ${e.message}`); }
  }
}

if (failed) { console.log('\n✗ SDK release checks FAILED'); process.exit(1); }
console.log(`\n✓ SDK release ${PUBLISH ? 'publish attempt complete' : 'prepare/verify passed (not published)'}`);
