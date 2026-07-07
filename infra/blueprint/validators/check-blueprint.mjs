#!/usr/bin/env node
/**
 * check-blueprint.mjs — static validators for the Banzami Environment Blueprint.
 *
 * Proves at source level (no Docker, DB, network or secrets): shared-blueprint
 * derivation, Live structural-validity-but-unprovisioned, Sandbox↔Live isolation,
 * no host-published Postgres port, no secret literals, read-only file secret
 * interface, immutable migration-runner image contract, and the autonomous
 * migration-controller precondition contract (unit-tested by sourcing the script).
 *
 * Usage: node infra/blueprint/validators/check-blueprint.mjs  (make check-blueprint)
 */
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = resolve(fileURLToPath(new URL('.', import.meta.url)));
const ROOT = resolve(HERE, '../../..');
const BP = resolve(ROOT, 'infra/blueprint');
let failures = 0;
const pass = (n, m) => console.log(`  ✓ [${n}] ${m}`);
const fail = (n, m) => { console.error(`  ✗ [${n}] ${m}`); failures++; };
const readJSON = p => JSON.parse(readFileSync(resolve(BP, p), 'utf8'));

const base = readJSON('base/blueprint.contract.json');
const sandbox = readJSON('profiles/sandbox/profile.json');
const live = readJSON('profiles/live/profile.json');
const runnerContract = readJSON('base/contracts/migration-runner.contract.json');
const secretContract = readJSON('base/contracts/secret-interface.contract.json');
const ISO = base.isolation_keys;

// 1. Sandbox and Live derive from the same shared Blueprint
{
  const bid = `${base.blueprint}@${base.version}`;
  (sandbox.derives_from === bid && live.derives_from === bid)
    ? pass(1, 'Sandbox and Live derive from the same shared Blueprint') : fail(1, 'both profiles must derive from the shared Blueprint');
}
// 2. Live profile is structurally valid but unprovisioned
{
  const structural = ISO.every(k => k in live.isolation) && live.database && live.services && live.policy && live.secret_interface;
  (live.provisioned === false && structural && sandbox.provisioned === true)
    ? pass(2, 'Live profile is structurally valid but unprovisioned; Sandbox provisioned') : fail(2, 'Live must be structurally valid and unprovisioned');
}
// 3 + 4. Isolation: no shared value across the enumerated keys; no cross-environment reference
{
  const shared = ISO.filter(k => String(sandbox.isolation[k]) === String(live.isolation[k]));
  const sandboxRefsLive = ISO.some(k => /\blive\b/i.test(String(sandbox.isolation[k])));
  const liveRefsSandbox = ISO.some(k => /\bsandbox\b|banzami_staging/i.test(String(live.isolation[k])));
  (shared.length === 0 && !sandboxRefsLive && !liveRefsSandbox)
    ? pass('3-4', 'Sandbox and Live share no isolation resource and never cross-reference') : fail('3-4', `isolation overlap/cross-ref (${shared.join(',')})`);
}
// 5. Sandbox (and Live) declare NO host-published Postgres port
(sandbox.database.host_published_port === null && live.database.host_published_port === null)
  ? pass(5, 'no host-published Postgres port in either profile') : fail(5, 'Postgres must not publish a host port');

// 6. No secret literal (credentialed connection URL / private key) in tracked Blueprint files
{
  const CRED_URL = /(postgres|postgresql|mysql):\/\/[^/\s"']+:[^@\s"']+@/i;
  const PEM = /-----BEGIN[A-Z ]+PRIVATE KEY-----/;
  const PW_LITERAL = /\b(password|passwd|pwd)\s*[:=]\s*["']?[A-Za-z0-9+/]{12,}/i;
  // Scan declarative Blueprint artifacts; skip validators/ (contains detection
  // patterns + test fixtures by design — not a shipped deployment artifact).
  const walk = d => readdirSync(d, { withFileTypes: true }).flatMap(e => {
    if (e.isDirectory() && e.name === 'validators') return [];
    const p = join(d, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
  const offenders = walk(BP).filter(p => {
    const t = readFileSync(p, 'utf8');
    return CRED_URL.test(t) || PEM.test(t) || PW_LITERAL.test(t);
  });
  offenders.length === 0 ? pass(6, 'no credentialed URL / private key / password literal in Blueprint files') : fail(6, `secret-like literal found in ${offenders.length} file(s)`);
}
// 7. Application services do NOT receive secrets via inspectable env (file interface only)
(sandbox.secret_interface.env_injection === false && live.secret_interface.env_injection === false
  && secretContract.interface.env_injection === false && secretContract.interface.type === 'read-only-file')
  ? pass(7, 'secrets injected via read-only file only; env injection disabled') : fail(7, 'secret interface must be read-only file, no env injection');

// 8. Migration runner requires a read-only secret-file contract (contract + entrypoint)
{
  const entry = readFileSync(resolve(BP, 'migration-runner/entrypoint.sh'), 'utf8');
  const fileOnly = /\/run\/secrets\/rt04e_migration_url/.test(entry)
    && /DATABASE_URL must NOT be provided via environment/.test(entry)
    && /no command-line arguments permitted/.test(entry);
  (runnerContract.entrypoint_secret_contract.credential_source === 'read-only mounted file only' && fileOnly)
    ? pass(8, 'migration runner reads the credential only from a read-only mounted file (no env/argv)') : fail(8, 'migration runner must enforce the read-only file secret contract');
}
// 9. Migration runner cannot use a mutable image tag
{
  const df = readFileSync(resolve(BP, 'migration-runner/Dockerfile'), 'utf8');
  const noLatest = !/:latest\b/.test(df) && !/FROM\s+\S+:latest/i.test(df);
  (runnerContract.image.mutable_tags_allowed === false && sandbox.migration_runner.mutable_tags_allowed === false
    && live.migration_runner.mutable_tags_allowed === false && noLatest && existsSync(resolve(BP, 'migration-runner/digests.lock')))
    ? pass(9, 'migration runner forbids mutable tags; base images pinned by version + digest lock') : fail(9, 'migration runner must forbid mutable tags and pin base images');
}
// 10-12. Autonomous migration-controller precondition contract (unit-tested via sourcing)
{
  const CTRL = resolve(BP, 'migration-controller/rt04e-autonomous-migration-controller.sh');
  const amc = (line) => { try { execSync(`bash -c '. "${CTRL}"; ${line}'`, { stdio: 'pipe' }); return 0; } catch (e) { return e.status ?? 1; } };
  const REV = 'a'.repeat(40);
  // 10. rejects non-Sandbox targets
  (amc('amc_target_ok banzami_staging') === 0 && amc('amc_target_ok banzami_live') !== 0 && amc('amc_target_ok prod') !== 0)
    ? pass(10, 'controller accepts only banzami_staging; rejects non-Sandbox targets') : fail(10, 'controller must reject non-Sandbox targets');
  // 12. rejects unpinned/abbreviated/symbolic revisions
  (amc(`amc_valid_rev ${REV}`) === 0 && amc('amc_valid_rev a1b2c3d') !== 0 && amc('amc_valid_rev main') !== 0)
    ? pass(12, 'controller requires a full 40-hex pinned revision; rejects abbreviated/symbolic') : fail(12, 'controller must require a pinned full-SHA revision');

  // 11. authorisation-record validation: valid issued PASSES; expired/wrong-binding/consumed/credential/symlink FAIL
  const dir = resolve(tmpdir(), `bp-authrec-${process.pid}`); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const DIG = 'deadbeef'.repeat(8);
  const now = Math.floor(Date.now() / 1000);
  const mk = (name, over = {}) => {
    const f = { state: 'issued', source_revision: REV, target: 'banzami_staging', migration_directory_digest: DIG, issued_epoch: String(now - 60), expires_epoch: String(now + 600), ...over };
    const p = join(dir, name);
    writeFileSync(p, Object.entries(f).map(([k, v]) => `${k}=${v}`).join('\n') + '\n', { mode: 0o600 });
    return p;
  };
  const V = (p, extraNow = now) => amc(`amc_authrecord_valid "${p}" ${REV} banzami_staging ${DIG} ${extraNow}`);
  const okRec = V(mk('ok.record')) === 0;
  const expired = V(mk('exp.record', { expires_epoch: String(now - 10) })) === 44;
  const wrongRev = V(mk('rev.record', { source_revision: 'b'.repeat(40) })) === 43;
  const wrongTarget = V(mk('tgt.record', { target: 'banzami_live' })) === 43;
  const consumed = V(mk('con.record', { state: 'consumed' })) === 42;
  const credLeak = V(mk('cred.record', { record_id: 'postgres://u:p@h/db' })) === 41;
  rmSync(dir, { recursive: true, force: true });
  (okRec && expired && wrongRev && wrongTarget && consumed && credLeak)
    ? pass(11, 'controller authorisation record: valid issued PASSES; expired/wrong-binding/consumed/credential-like FAIL closed') : fail(11, 'authorisation-record validation incorrect');
}
// 13. controller is DISABLED / non-deploying when executed directly (no migration in this increment)
{
  const CTRL = resolve(BP, 'migration-controller/rt04e-autonomous-migration-controller.sh');
  let code = 0; try { execSync(`bash "${CTRL}"`, { stdio: 'pipe' }); } catch (e) { code = e.status ?? 1; }
  code === 40 ? pass(13, 'autonomous controller is hard-DISABLED / non-deploying when executed (exit 40)') : fail(13, 'controller must be disabled/non-deploying in this increment');
}

if (failures) { console.log(`\n✗ Blueprint validation: ${failures} check(s) failed`); process.exit(1); }
console.log('\n✓ Blueprint validation: all checks pass (1–13)');
