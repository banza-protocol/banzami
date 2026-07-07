#!/usr/bin/env node
/**
 * check-blueprint.mjs — static validators for the Banzami Environment Blueprint.
 *
 * Proves at source level (no Docker, DB, network or secrets): shared-blueprint
 * derivation, Live structural-validity-but-unprovisioned, Sandbox↔Live isolation,
 * no host-published Postgres port, no secret literals (hardened scan), read-only
 * file secret interface, immutable digest-pinned migration-runner image, SQLx CLI
 * compatibility from repository state, and the autonomous migration-controller
 * fail-closed precondition contract (unit-tested by sourcing the script).
 *
 * Usage: node infra/blueprint/validators/check-blueprint.mjs  (make check-blueprint)
 */
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
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
const readF = p => readFileSync(resolve(BP, p), 'utf8');

const base = readJSON('base/blueprint.contract.json');
const sandbox = readJSON('profiles/sandbox/profile.json');
const live = readJSON('profiles/live/profile.json');
const runnerContract = readJSON('base/contracts/migration-runner.contract.json');
const secretContract = readJSON('base/contracts/secret-interface.contract.json');
const sqlxContract = readJSON('base/contracts/sqlx-compat.contract.json');
const ISO = base.isolation_keys;
const dockerfile = readF('migration-runner/Dockerfile');
const digestsLock = readF('migration-runner/digests.lock');
const CTRL = resolve(BP, 'migration-controller/rt04e-autonomous-migration-controller.sh');

// ── shared tracked-secret scanner (hardened) ─────────────────────────────────
const SCAN = [
  { name: 'credentialed-url', re: /(postgres(ql)?|mysql|mongodb|redis):[/][/][^/\s"']+:[^@\s"']+@/i },
  { name: 'private-key', re: /-----BEGIN[A-Z ]+PRIVATE KEY-----/ },
  // value must START with an alphanumeric (so a path like "/run/secrets/…" — a
  // reference, not a secret value — is not flagged), then be a long token.
  { name: 'password-assignment', re: /\b(password|passwd|pwd)\s*[:=]\s*["']?[A-Za-z0-9][A-Za-z0-9+/=]{9,}/i },
  { name: 'secret-env', re: /\b(SECRET|TOKEN|API[_-]?KEY|PRIVATE[_-]?KEY|ACCESS[_-]?KEY|PGPASSWORD|PASSWORD)[A-Z0-9_]*\s*[:=]\s*["']?[A-Za-z0-9][A-Za-z0-9+/=]{11,}/i },
];
const scanText = t => SCAN.filter(p => p.re.test(t)).map(p => p.name);
// ONLY this narrow path is exempt (synthetic detection fixtures); everything else is scanned.
const EXEMPT = ['validators/fixtures'];
const isExempt = rel => EXEMPT.some(e => rel === e || rel.startsWith(e + '/'));
const walk = d => readdirSync(d, { withFileTypes: true }).flatMap(e => {
  const p = join(d, e.name);
  return e.isDirectory() ? walk(p) : [p];
});

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
// 5. No host-published Postgres port in either profile
(sandbox.database.host_published_port === null && live.database.host_published_port === null)
  ? pass(5, 'no host-published Postgres port in either profile') : fail(5, 'Postgres must not publish a host port');

// 6. No secret literal in ANY tracked Blueprint file (validators/fixtures/ exempt only)
{
  const offenders = walk(BP)
    .filter(p => !isExempt(relative(BP, p)))
    .map(p => [relative(BP, p), scanText(readFileSync(p, 'utf8'))])
    .filter(([, hits]) => hits.length);
  offenders.length === 0 ? pass(6, 'no secret literal in any scanned Blueprint file (only validators/fixtures exempt)') : fail(6, `secret-like literal in ${offenders.length} file(s): ${offenders.map(o => o[0]).join(', ')}`);
}
// 7. Secrets via read-only file only; no env injection
(sandbox.secret_interface.env_injection === false && live.secret_interface.env_injection === false
  && secretContract.interface.env_injection === false && secretContract.interface.type === 'read-only-file')
  ? pass(7, 'secrets injected via read-only file only; env injection disabled') : fail(7, 'secret interface must be read-only file, no env injection');

// 8. Migration runner enforces the read-only secret-file contract
{
  const entry = readF('migration-runner/entrypoint.sh');
  const fileOnly = /\/run\/secrets\/rt04e_migration_url/.test(entry)
    && /DATABASE_URL must NOT be provided via environment/.test(entry)
    && /no command-line arguments permitted/.test(entry);
  (runnerContract.entrypoint_secret_contract.credential_source === 'read-only mounted file only' && fileOnly)
    ? pass(8, 'migration runner reads the credential only from a read-only mounted file (no env/argv)') : fail(8, 'migration runner must enforce the read-only file secret contract');
}
// 9. Migration runner forbids mutable tags (profiles + contract)
(runnerContract.image.mutable_tags_allowed === false && sandbox.migration_runner.mutable_tags_allowed === false
  && live.migration_runner.mutable_tags_allowed === false)
  ? pass(9, 'migration runner forbids mutable tags in contract and both profiles') : fail(9, 'migration runner must forbid mutable tags');

// 10-13. Autonomous migration-controller precondition contract (sourced unit tests)
{
  const amc = (line) => { try { execSync(`bash -c '. "${CTRL}"; ${line}'`, { stdio: 'pipe' }); return 0; } catch (e) { return e.status ?? 1; } };
  const REV = 'a'.repeat(40);
  (amc('amc_target_ok banzami_staging') === 0 && amc('amc_target_ok banzami_live') !== 0 && amc('amc_target_ok prod') !== 0)
    ? pass(10, 'controller accepts only banzami_staging; rejects non-Sandbox targets') : fail(10, 'controller must reject non-Sandbox targets');
  (amc(`amc_valid_rev ${REV}`) === 0 && amc('amc_valid_rev a1b2c3d') !== 0 && amc('amc_valid_rev main') !== 0 && amc('amc_valid_rev') !== 0)
    ? pass(12, 'controller requires a full 40-hex pinned revision; rejects abbreviated/symbolic/missing') : fail(12, 'controller must require a pinned full-SHA revision');

  const dir = resolve(tmpdir(), `bp-authrec-${process.pid}`); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const DIG = 'deadbeef'.repeat(8);
  const now = Math.floor(Date.now() / 1000);
  const mk = (name, over = {}) => {
    const f = { state: 'issued', source_revision: REV, target: 'banzami_staging', migration_directory_digest: DIG, issued_epoch: String(now - 60), expires_epoch: String(now + 600), ...over };
    const p = join(dir, name);
    writeFileSync(p, Object.entries(f).map(([k, v]) => `${k}=${v}`).join('\n') + '\n', { mode: 0o600 });
    return p;
  };
  const V = (p) => amc(`amc_authrecord_valid "${p}" ${REV} banzami_staging ${DIG} ${now}`);
  const credWord = 'has-a-' + 'secret' + '-token';   // triggers the controller's credential grep, no URL literal
  const checks = [
    V(mk('ok.record')) === 0,
    V(mk('exp.record', { expires_epoch: String(now - 10) })) === 44,
    V(mk('future.record', { issued_epoch: String(now + 300) })) === 46,
    V(mk('rev.record', { source_revision: 'b'.repeat(40) })) === 43,
    V(mk('tgt.record', { target: 'banzami_live' })) === 43,
    V(mk('dig.record', { migration_directory_digest: 'f'.repeat(64) })) === 43,
    V(mk('con.record', { state: 'consumed' })) === 42,
    V(mk('cred.record', { record_id: credWord })) === 41,
  ];
  rmSync(dir, { recursive: true, force: true });
  checks.every(Boolean) ? pass(11, 'authorisation record: valid issued PASSES; expired/future/wrong-binding/consumed/credential-like FAIL closed') : fail(11, 'authorisation-record validation incorrect');

  let code = 0; try { execSync(`bash "${CTRL}"`, { stdio: 'pipe' }); } catch (e) { code = e.status ?? 1; }
  code === 40 ? pass(13, 'autonomous controller is hard-DISABLED / non-deploying when executed (exit 40)') : fail(13, 'controller must be disabled/non-deploying in this increment');
}

// 14. Immutable digest identity — Dockerfile FROM refs digest-pinned; no latest/placeholder; agree with lock
{
  const PLACEHOLDER = /\b(UNRESOLVED|TODO|TBD|PLACEHOLDER)\b|<digest>/;
  const DIGEST = /@sha256:[0-9a-f]{64}\b/;
  const args = {};
  for (const m of dockerfile.matchAll(/^ARG\s+(RUST_BUILDER|RUNTIME_BASE)=(\S+)/gm)) args[m[1]] = m[2];
  const lock = {};
  for (const line of digestsLock.split('\n')) {
    const m = line.match(/^(rust_builder|runtime_base)\s+(\S+)\s+(sha256:[0-9a-f]{64})\s*$/);
    if (m) lock[m[1] === 'rust_builder' ? 'RUST_BUILDER' : 'RUNTIME_BASE'] = { ref: m[2], digest: m[3] };
  }
  const noLatest = !/:latest\b/.test(dockerfile) && !/:latest\b/.test(digestsLock);
  const noPlaceholder = !PLACEHOLDER.test(dockerfile) && !PLACEHOLDER.test(digestsLock);
  const bothPinned = ['RUST_BUILDER', 'RUNTIME_BASE'].every(k => args[k] && DIGEST.test(args[k]));
  const agree = ['RUST_BUILDER', 'RUNTIME_BASE'].every(k => {
    if (!args[k] || !lock[k]) return false;
    const dfDigest = (args[k].match(/@(sha256:[0-9a-f]{64})/) || [])[1];
    const dfTag = args[k].split('@')[0];
    return dfDigest === lock[k].digest && dfTag === lock[k].ref;
  });
  (noLatest && noPlaceholder && bothPinned && agree)
    ? pass(14, 'base images pinned by immutable sha256 digest; no latest/placeholder; Dockerfile agrees with digests.lock') : fail(14, 'digest pinning invalid (tag-only/malformed/placeholder/latest/lock-mismatch)');
}
// 15. SQLx CLI compatibility proven from repository state (core/Cargo.lock authoritative)
{
  const lockText = readFileSync(resolve(ROOT, 'core/Cargo.lock'), 'utf8');
  const m = lockText.match(/name = "sqlx"\nversion = "([0-9]+\.[0-9]+\.[0-9]+)"/);
  const projectSqlx = m ? m[1] : null;
  const argM = dockerfile.match(/ARG\s+SQLX_CLI_VERSION=([0-9]+\.[0-9]+\.[0-9]+)/);
  const dfCli = argM ? argM[1] : null;
  const lockCli = (digestsLock.match(/^sqlx_cli\s+([0-9]+\.[0-9]+\.[0-9]+)/m) || [])[1];
  const all = [projectSqlx, sqlxContract.project_sqlx_version, sqlxContract.migration_runner_sqlx_cli_version, dfCli, lockCli];
  const consistent = projectSqlx && all.every(v => v === projectSqlx);
  consistent
    ? pass(15, `SQLx CLI compatibility proven from repository state (locked sqlx == sqlx-cli == ${projectSqlx})`) : fail(15, `SQLx CLI compatibility not proven: lock=${projectSqlx} contract=${sqlxContract.project_sqlx_version}/${sqlxContract.migration_runner_sqlx_cli_version} dockerfile=${dfCli} digestslock=${lockCli}`);
}
// 16. Hardened secret-scanner catches every category (synthetic fixtures) + whole-tree clean
{
  const fx = resolve(BP, 'validators/fixtures');
  const cat = f => scanText(readFileSync(join(fx, f), 'utf8'));
  const catches = cat('bad-credentialed-url.sample').includes('credentialed-url')
    && cat('bad-pem.sample').includes('private-key')
    && cat('bad-password-assignment.sample').includes('password-assignment')
    && cat('bad-secret-env.sample').includes('secret-env');
  // credential-shaped values are assembled at runtime (never a literal in this source,
  // so the whole-tree scan of this validator file stays clean).
  const url = 'postgres' + '://u:p@h/db';
  const pgpw = 'PGPASS' + 'WORD=abcdefghij0123';
  const inProfile = scanText(`{"database":{"url":"${url}"}}`).length > 0;
  const inController = scanText(`${pgpw} psql ...`).length > 0;
  // a credential inside a NON-exempt validators path (not fixtures/) would be flagged
  const nonExemptCaught = !isExempt('validators/check-blueprint.mjs') && scanText(`x = "${url}"`).length > 0;
  (catches && inProfile && inController && nonExemptCaught)
    ? pass(16, 'hardened scanner catches credentialed-url/PEM/password/secret-env (fixtures) incl. profile/controller/non-exempt-validators paths') : fail(16, 'secret scanner does not catch all categories');
}
// 17. Controller fixedness + expanded fail-closed validators (service set, image, provenance, lock, secret-file)
{
  const amc = (line, env = {}) => { try { execSync(`bash -c '. "${CTRL}"; ${line}'`, { stdio: 'pipe', env: { ...process.env, ...env } }); return 0; } catch (e) { return e.status ?? 1; } };
  const src = readFileSync(CTRL, 'utf8');
  // target/revision/paths/project/secret are FIXED constants, not read from env
  const fixed = /AMC_TARGET="banzami_staging"/.test(src) && !/AMC_TARGET="\$\{/.test(src)
    && !/AMC_(SOURCE_ROOT|MIGRATIONS_REL|SECRET_FILE|COMPOSE_PROJECT|SERVICES)="\$\{/.test(src);
  const serviceSet = amc('amc_service_set_ok "core-api-staging api-gateway-staging developer-api public-api-staging"') === 0
    && amc('amc_service_set_ok "core-api-staging admin-api-staging"') !== 0;
  const imageImm = amc('amc_image_ref_immutable "banzami/x@sha256:' + 'a'.repeat(64) + '"') === 0
    && amc('amc_image_ref_immutable "banzami/x:latest"') !== 0
    && amc('amc_image_ref_immutable "banzami/x:1.0"') !== 0;
  const provenance = amc('amc_provenance_ok valid') === 0 && amc('amc_provenance_ok invalid') !== 0;
  const lock = (() => { const l = resolve(tmpdir(), `bp-lock-${process.pid}`); rmSync(l, { force: true }); const absent = amc(`amc_no_concurrent_lock "${l}"`); writeFileSync(l, 'x'); const present = amc(`amc_no_concurrent_lock "${l}"`); rmSync(l, { force: true }); return absent === 0 && present !== 0; })();
  const secretFile = (() => {
    const d = resolve(tmpdir(), `bp-sf-${process.pid}`); rmSync(d, { recursive: true, force: true }); mkdirSync(d, { recursive: true });
    const good = join(d, 'good'); writeFileSync(good, 'x', { mode: 0o600 });
    const okGood = amc(`amc_secret_file_contract_ok "${good}"`) === 0;
    const missing = amc(`amc_secret_file_contract_ok "${join(d, 'nope')}"`) !== 0;
    let sym = join(d, 'sym'); try { execSync(`ln -s "${good}" "${sym}"`); } catch { /* ignore */ }
    const symBad = amc(`amc_secret_file_contract_ok "${sym}"`) !== 0;
    rmSync(d, { recursive: true, force: true }); return okGood && missing && symBad;
  })();
  (fixed && serviceSet && imageImm && provenance && lock && secretFile)
    ? pass(17, 'controller: fixed non-env target/paths/project; rejects wrong service set, mutable image, invalid provenance, concurrent lock, unsafe secret file') : fail(17, 'controller fixedness / expanded fail-closed validators incorrect');
}

if (failures) { console.log(`\n✗ Blueprint validation: ${failures} check(s) failed`); process.exit(1); }
console.log('\n✓ Blueprint validation: all checks pass (1–17)');
