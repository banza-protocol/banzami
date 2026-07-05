#!/usr/bin/env node
/**
 * check-rollout-secret-hygiene.mjs — RT04E secure-rollout static gate.
 *
 * Enforces the RT04E trust boundary across the COMPLETE rollout chain at rest:
 *   the runner, tools/migrate-and-verify.sh, deploy.sh, and the tracked compose.
 * Fails (exit 1) on any leakage/boundary violation.
 *
 * Runner + repo (A–F):
 *   A no literal BANZAMI_MIGRATE_URL connection string anywhere;
 *   B BANZAMI_MIGRATE_URL never in a compose file;
 *   C runner takes the credential via protected stdin, never argv;
 *   D runner never traces (set -x) or prints the credential;
 *   E CORE_PAYEE_VALIDATION_KEY never referenced by Gateway/frontend/SDK/plugin;
 *   F payment release never enabled by default.
 * Chain audit (G–K, §2):
 *   G no chain script enables tracing (set -x / bash -x / BASH_XTRACEFD / -o xtrace);
 *   H no chain script echoes an UNREDACTED credential to output;
 *   I runner acquires an exclusive lock and fails closed on contention (§4);
 *   J runner pins an approved revision, rejects dirty worktree, never git pull/fetch (§5);
 *   K runner discards the migrate output and writes no temp file holding the credential (§2.8).
 * Compose runtime-secret boundary (L–N, §6):
 *   L CORE_PAYEE_VALIDATION_KEY absent from Gateway + browser-frontend service blocks;
 *   M BANZAMI_MIGRATE_URL absent from every compose service block (never a runtime service);
 *   N CORE_API_URL absent from browser-frontend service blocks.
 *
 * Usage: node tools/check-rollout-secret-hygiene.mjs   (make check-rollout-secret-hygiene)
 */
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const SELF = 'tools/check-rollout-secret-hygiene.mjs';
const RUNNER = 'infra/deployment/rt04e-secure-rollout.sh';
const CHAIN = [RUNNER, 'tools/migrate-and-verify.sh', 'deploy.sh'];
let failures = 0;
const fail = m => { console.error(`  ✗ ${m}`); failures++; };
const pass = m => console.log(`  ✓ ${m}`);

const tracked = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
const textFiles = tracked.filter(f => !/\.(png|jpg|jpeg|gif|ico|pdf|woff2?|ttf|zip|gz|lock)$/i.test(f));
const read = f => { try { return readFileSync(resolve(ROOT, f), 'utf8'); } catch { return ''; } };
const composes = textFiles.filter(f => /docker-compose[^/]*\.ya?ml$|compose[^/]*\.ya?ml$/i.test(f));

// Split a compose file into { serviceName -> blockText } (2-space service keys).
function composeServices(text) {
  const lines = text.split('\n');
  const out = {}; let inServices = false, cur = null, buf = [];
  const flush = () => { if (cur) out[cur] = buf.join('\n'); cur = null; buf = []; };
  for (const ln of lines) {
    if (/^services:\s*$/.test(ln)) { inServices = true; continue; }
    if (!inServices) continue;
    if (/^\S/.test(ln)) { flush(); inServices = /^services:/.test(ln); continue; } // left services:
    const m = ln.match(/^  ([A-Za-z0-9._-]+):\s*$/);
    if (m) { flush(); cur = m[1]; continue; }
    if (cur) buf.push(ln);
  }
  flush();
  return out;
}
const isFrontend = n => /frontend|website|checkout|pay-|dashboard|console|docs/.test(n);
const isGateway = n => /gateway/.test(n);

// ── A. No literal migration URL anywhere ─────────────────────────────────────
{
  const re = /BANZAMI_MIGRATE_URL\s*[:=]\s*['"]?[a-zA-Z][a-zA-Z0-9+.-]*:\/\//;
  const hits = textFiles.filter(f => re.test(read(f)));
  hits.length ? fail(`A: literal BANZAMI_MIGRATE_URL connection string in: ${hits.join(', ')}`)
              : pass('A: no literal BANZAMI_MIGRATE_URL connection string in the repo');
}
// ── B. Migration credential never in a compose file ──────────────────────────
{
  const hits = composes.filter(f => /BANZAMI_MIGRATE_URL/.test(read(f)));
  hits.length ? fail(`B: BANZAMI_MIGRATE_URL referenced by compose: ${hits.join(', ')}`)
              : pass(`B: no compose file references BANZAMI_MIGRATE_URL (${composes.length} scanned)`);
}
// ── C. Runner intakes via stdin, never argv ──────────────────────────────────
{
  const s = read(RUNNER);
  const stdinIntake = /IFS=\s*read\s+-rs\s+BANZAMI_MIGRATE_URL/.test(s);
  const refusesArgv = /must NOT be passed as an argument/.test(s) && /\[\s*"\$#"\s*-eq\s*0\s*\]/.test(s);
  const argvIntake = /BANZAMI_MIGRATE_URL\s*=\s*"?\$[1-9]/.test(s);
  (existsSync(resolve(ROOT, RUNNER)) && stdinIntake && refusesArgv && !argvIntake)
    ? pass('C: runner reads the credential via protected stdin and refuses argv')
    : fail('C: runner must read the credential via stdin (read -rs) and refuse positional args');
}
// ── D. Runner never traces or prints the credential ──────────────────────────
{
  const s = read(RUNNER);
  const tracesOn = /^\s*set\s+-[a-z]*x(\s|$)/m.test(s);
  const disablesTrace = /set\s+\+x/.test(s);
  const printsSecret = /(^|[^|])\b(echo|printf)\b[^|\n]*\$\{?BANZAMI_MIGRATE_URL\}?/.test(s);
  (!tracesOn && disablesTrace && !printsSecret)
    ? pass('D: runner disables tracing and never prints the credential')
    : fail('D: runner must set +x, never set -x, and never echo/printf the credential');
}
// ── E. Payee-validation key never on Gateway/frontend/SDK/plugin code ────────
{
  const dirs = ['services/api-gateway/', 'apps/', 'sdk/', 'plugins/'];
  const hits = textFiles.filter(f => dirs.some(d => f.startsWith(d)) && /CORE_PAYEE_VALIDATION_KEY/.test(read(f)));
  hits.length ? fail(`E: CORE_PAYEE_VALIDATION_KEY referenced outside Core/Developer-API: ${hits.join(', ')}`)
              : pass('E: CORE_PAYEE_VALIDATION_KEY absent from Gateway/frontend/SDK/plugin surfaces');
}
// ── F. Payment release never enabled by default ──────────────────────────────
{
  const re = /PAYMENT_CAPABILITY_RELEASED\s*[:=]\s*['"]?true\b/i;
  const hits = textFiles.filter(f => f !== SELF && re.test(read(f)));
  hits.length ? fail(`F: PAYMENT_CAPABILITY_RELEASED defaulted true in: ${hits.join(', ')}`)
              : pass('F: payment release is not enabled by default anywhere');
}
// ── G. No tracing anywhere in the chain ──────────────────────────────────────
{
  const bad = CHAIN.filter(f => /(^|[^+])\bset\s+-[a-z]*x(\s|$)|bash\s+-x|BASH_XTRACEFD|set\s+-o\s+xtrace/m.test(read(f)));
  bad.length ? fail(`G: tracing enabled in chain script(s): ${bad.join(', ')}`)
             : pass('G: no chain script enables tracing (runner + migrate-and-verify + deploy.sh)');
}
// ── H. No chain script echoes an UNREDACTED credential ───────────────────────
{
  const offenders = [];
  for (const f of CHAIN) {
    for (const ln of read(f).split('\n')) {
      if (!/\b(echo|printf)\b/.test(ln)) continue;
      if (!/\$\{?(DATABASE_URL|BANZAMI_MIGRATE_URL)\}?/.test(ln)) continue;
      // allow a redaction pipeline (piped to sed, or masking ***)
      if (/\|\s*sed/.test(ln) || /\*\*\*/.test(ln)) continue;
      offenders.push(`${f}: ${ln.trim().slice(0, 80)}`);
    }
  }
  offenders.length ? fail(`H: unredacted credential echo in chain: ${offenders.join(' | ')}`)
                   : pass('H: no chain script echoes an unredacted credential (redaction pipelines only)');
}
// ── I. Runner exclusive lock, fail closed ────────────────────────────────────
{
  const s = read(RUNNER);
  (/exec\s+9>/.test(s) && /flock\s+-n\s+9/.test(s) && /another rollout is already in progress/.test(s))
    ? pass('I: runner acquires an exclusive lock (flock) and fails closed on contention')
    : fail('I: runner must acquire an exclusive flock and fail closed on contention');
}
// ── J. Runner pins the revision, rejects dirty, never pulls ──────────────────
{
  const s = read(RUNNER);
  const pins = /RT04E_RELEASE_REV/.test(s) && /git rev-parse HEAD/.test(s) && /git status --porcelain/.test(s);
  const pulls = /git\s+(pull|fetch)\b/.test(s);
  (pins && !pulls)
    ? pass('J: runner pins RT04E_RELEASE_REV, rejects a dirty worktree, and never git pull/fetch')
    : fail('J: runner must pin an approved revision, reject dirty worktree, and never git pull/fetch');
}
// ── K. Runner discards migrate output; no temp file holds the credential ─────
{
  const s = read(RUNNER);
  const i = s.indexOf('bash tools/migrate-and-verify.sh');   // the invocation, not the comment
  const after = i >= 0 ? s.slice(i, i + 160) : '';
  const discards = />\s*\/dev\/null/.test(after);        // migrate output → /dev/null
  const tempWithCred = /migrate[^\n]*>\s*\/tmp\//i.test(s) || /rt04e-migrate\.\$/.test(s);
  (discards && !tempWithCred)
    ? pass('K: runner discards migrate output to /dev/null and writes no temp file holding the credential')
    : fail('K: runner must discard migrate output to /dev/null and never write a temp file with the credential');
}
// ── L. CORE_PAYEE_VALIDATION_KEY absent from Gateway + frontend compose blocks ─
// ── M. BANZAMI_MIGRATE_URL absent from EVERY compose service block ────────────
// ── N. CORE_API_URL absent from browser-frontend compose blocks ──────────────
{
  const Lbad = [], Mbad = [], Nbad = [];
  for (const f of composes) {
    const svcs = composeServices(read(f));
    for (const [name, block] of Object.entries(svcs)) {
      if (/BANZAMI_MIGRATE_URL/.test(block)) Mbad.push(`${f}:${name}`);
      if ((isGateway(name) || isFrontend(name)) && /CORE_PAYEE_VALIDATION_KEY/.test(block)) Lbad.push(`${f}:${name}`);
      if (isFrontend(name) && /CORE_API_URL/.test(block)) Nbad.push(`${f}:${name}`);
    }
  }
  Lbad.length ? fail(`L: CORE_PAYEE_VALIDATION_KEY on Gateway/frontend service(s): ${Lbad.join(', ')}`)
              : pass('L: CORE_PAYEE_VALIDATION_KEY absent from Gateway + browser-frontend compose blocks');
  Mbad.length ? fail(`M: BANZAMI_MIGRATE_URL on runtime service(s): ${Mbad.join(', ')}`)
              : pass('M: BANZAMI_MIGRATE_URL absent from every compose service block');
  Nbad.length ? fail(`N: CORE_API_URL on browser-frontend service(s): ${Nbad.join(', ')}`)
              : pass('N: CORE_API_URL absent from browser-frontend compose blocks');
}

if (failures) {
  console.log(`\n✗ rollout secret hygiene: ${failures} violation(s)`);
  process.exit(1);
}
console.log('\n✓ rollout secret hygiene: clean (chain + compose boundary)');
