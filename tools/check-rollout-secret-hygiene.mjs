#!/usr/bin/env node
/**
 * check-rollout-secret-hygiene.mjs — RT04E secure-rollout static gate.
 *
 * Fails (exit 1) if any migration/payee-credential leakage pattern is present in
 * the tracked repository. It enforces the RT04E trust boundary at rest:
 *
 *   A. no literal BANZAMI_MIGRATE_URL value (a connection string) in any repo file;
 *   B. BANZAMI_MIGRATE_URL is never referenced by an application runtime compose
 *      service (it must never live in Docker Compose runtime env);
 *   C. the rollout runner takes the credential via protected stdin, never argv;
 *   D. the rollout runner never traces (set -x) or prints the credential;
 *   E. CORE_PAYEE_VALIDATION_KEY is never referenced by Gateway / frontend / SDK /
 *      DOA / BanzAI code or compose (Core + Developer API only);
 *   F. payment release is never enabled by default (no PAYMENT_CAPABILITY_RELEASED=true).
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
let failures = 0;
const fail = m => { console.error(`  ✗ ${m}`); failures++; };
const pass = m => console.log(`  ✓ ${m}`);

const tracked = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' })
  .split('\n').filter(Boolean);
const textFiles = tracked.filter(f =>
  !/\.(png|jpg|jpeg|gif|ico|pdf|woff2?|ttf|zip|gz|lock)$/i.test(f));
const read = f => { try { return readFileSync(resolve(ROOT, f), 'utf8'); } catch { return ''; } };

// ── A. No literal migration URL anywhere ─────────────────────────────────────
{
  const re = /BANZAMI_MIGRATE_URL\s*[:=]\s*['"]?[a-zA-Z][a-zA-Z0-9+.-]*:\/\//;
  const hits = textFiles.filter(f => re.test(read(f)));
  hits.length ? fail(`A: literal BANZAMI_MIGRATE_URL connection string found in: ${hits.join(', ')}`)
              : pass('A: no literal BANZAMI_MIGRATE_URL connection string in the repo');
}

// ── B. Migration credential never in an application runtime compose service ───
{
  const composes = textFiles.filter(f => /docker-compose[^/]*\.ya?ml$|compose[^/]*\.ya?ml$/i.test(f));
  const hits = composes.filter(f => /BANZAMI_MIGRATE_URL/.test(read(f)));
  hits.length ? fail(`B: BANZAMI_MIGRATE_URL referenced by a compose file (runtime env leak): ${hits.join(', ')}`)
              : pass(`B: no compose file references BANZAMI_MIGRATE_URL (${composes.length} scanned)`);
}

// ── C. Runner intakes via stdin, never argv ──────────────────────────────────
{
  if (!existsSync(resolve(ROOT, RUNNER))) fail(`C: rollout runner ${RUNNER} missing`);
  else {
    const s = read(RUNNER);
    const stdinIntake = /IFS=\s*read\s+-rs\s+BANZAMI_MIGRATE_URL/.test(s);
    const refusesArgv = /must NOT be passed as an argument/.test(s) && /\[\s*"\$#"\s*-eq\s*0\s*\]/.test(s);
    const argvIntake = /BANZAMI_MIGRATE_URL\s*=\s*"?\$[1-9]/.test(s); // credential from a positional
    (stdinIntake && refusesArgv && !argvIntake)
      ? pass('C: runner reads the credential via protected stdin and refuses argv')
      : fail('C: runner must read the credential via stdin (read -rs) and refuse positional args');
  }
}

// ── D. Runner never traces or prints the credential ──────────────────────────
{
  const s = read(RUNNER);
  const tracesOn = /^\s*set\s+-[a-z]*x/m.test(s);                       // set -x / set -euxo
  const disablesTrace = /set\s+\+x/.test(s);
  const printsSecret = /(echo|printf)[^\n]*\$\{?BANZAMI_MIGRATE_URL\}?/.test(s);
  (!tracesOn && disablesTrace && !printsSecret)
    ? pass('D: runner disables tracing and never prints the credential')
    : fail('D: runner must set +x, never set -x, and never echo/printf the credential');
}

// ── E. Payee-validation key never referenced by Gateway/frontend/SDK/DOA/BanzAI ─
{
  const forbiddenDirs = ['services/api-gateway/', 'apps/', 'sdk/', 'plugins/'];
  const hits = textFiles.filter(f =>
    forbiddenDirs.some(d => f.startsWith(d)) && /CORE_PAYEE_VALIDATION_KEY/.test(read(f)));
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

if (failures) {
  console.log(`\n✗ rollout secret hygiene: ${failures} violation(s)`);
  process.exit(1);
}
console.log('\n✓ rollout secret hygiene: clean');
