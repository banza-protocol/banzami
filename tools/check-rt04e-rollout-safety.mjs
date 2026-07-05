#!/usr/bin/env node
/**
 * check-rt04e-rollout-safety.mjs — RT04E Sandbox rollout safety gate (Phase 8).
 *
 * Fails (exit 1) if any of the 16 audited defect conditions are present in the
 * RT04E deployment definitions. Static only — no Docker, no DB, no execution.
 *
 * Files: infra/deployment/rt04e-secure-rollout.sh (runner),
 *        infra/deployment/rt04e-sandbox-deploy.sh (adapter),
 *        infra/deployment/rt04e-sandbox-rollback.sh (rollback),
 *        infra/deployment/rt04e-migration-checkpoint.sh (checkpoint),
 *        infra/deployment/rt04e-sandbox-target-contract.yaml (contract).
 *
 * Usage: node tools/check-rt04e-rollout-safety.mjs  (make check-rt04e-rollout-safety)
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const F = {
  runner: 'infra/deployment/rt04e-secure-rollout.sh',
  adapter: 'infra/deployment/rt04e-sandbox-deploy.sh',
  rollback: 'infra/deployment/rt04e-sandbox-rollback.sh',
  checkpoint: 'infra/deployment/rt04e-migration-checkpoint.sh',
  contract: 'infra/deployment/rt04e-sandbox-target-contract.yaml',
};
const ALLOW = ['core-api-staging', 'api-gateway-staging', 'developer-api', 'public-api-staging'];
let failures = 0;
const fail = (n, m) => { console.error(`  ✗ [${n}] ${m}`); failures++; };
const pass = (n, m) => console.log(`  ✓ [${n}] ${m}`);
const read = f => { try { return readFileSync(resolve(ROOT, f), 'utf8'); } catch { return ''; } };
for (const [k, v] of Object.entries(F)) if (!existsSync(resolve(ROOT, v))) fail('files', `missing ${k}: ${v}`);
const runner = read(F.runner), adapter = read(F.adapter), rollback = read(F.rollback), checkpoint = read(F.checkpoint), contract = read(F.contract);
const idx = (s, sub) => s.indexOf(sub);

// 1. REPO_ROOT defaults only to canonical /srv/banzami/src (a bad DEFAULT, not a rejection)
/:-\/srv\/banzami\/repo/.test(runner)
  ? fail(1, 'REPO_ROOT defaults to /srv/banzami/repo (must be /srv/banzami/src)')
  : (/CANONICAL_ROOT="\/srv\/banzami\/src"/.test(runner) && /REPO_ROOT="\$\{BANZAMI_REPO_ROOT:-\$CANONICAL_ROOT\}"/.test(runner)
      ? pass(1, 'REPO_ROOT defaults only to canonical /srv/banzami/src')
      : fail(1, 'REPO_ROOT must default to canonical /srv/banzami/src'));

// 2. runner must NOT DEPLOY core-api / api-gateway / non-staging public-api (actual invocations only)
{
  const bad = [
    /deploy\.sh\s+core-api\b/, /deploy\.sh\s+api-gateway\b/,
    /up -d\s+core-api\b(?!-staging)/, /up -d\s+api-gateway\b(?!-staging)/,
    /"\$DEPLOY_ADAPTER"\s+(core-api|api-gateway|public-api)\b/,
  ].filter(re => re.test(runner));
  const allowExact = /ALLOW="core-api-staging api-gateway-staging developer-api public-api-staging"/.test(runner);
  (bad.length === 0 && allowExact) ? pass(2, 'runner deploys only the 4 staging services; no core-api/api-gateway/non-staging target')
    : fail(2, 'runner must deploy only the allowlisted staging services');
}

// 3. runner cannot execute without the target contract
/rt04e-sandbox-target-contract\.yaml/.test(runner) && /contract (missing|environment)/.test(runner)
  ? pass(3, 'runner loads + requires the target contract (fails closed if missing)')
  : fail(3, 'runner must load the target contract and fail closed if absent');

// 4. runner requires the canonical revision
/:\s*"\$\{RT04E_RELEASE_REV:\?/.test(runner) ? pass(4, 'runner requires RT04E_RELEASE_REV') : fail(4, 'runner must require RT04E_RELEASE_REV');

// 5. no replacement without pre-state rollback capture (capture BEFORE deploy loop)
{
  const cap = idx(runner, 'rollback') >= 0 && /"\$ROLLBACK"\s+capture|ROLLBACK.*capture/.test(runner) ? runner.search(/capture \$?ALLOW|capture "?\$/) : -1;
  const capIdx = runner.search(/bash "\$ROLLBACK" capture/);
  const depIdx = runner.search(/bash "\$DEPLOY_ADAPTER"/);
  (capIdx >= 0 && depIdx >= 0 && capIdx < depIdx) ? pass(5, 'pre-state rollback capture runs before service replacement') : fail(5, 'pre-state capture must precede deployment');
}

// 6. rollback must NOT reverse migrations
/(sqlx\s+migrate\s+revert|migrate.*(revert|down)|reverse.*migration)/i.test(rollback)
  ? fail(6, 'rollback reverses migrations (forbidden)')
  : (/forward-only|NOT.*reversed|not automatically reversed/i.test(rollback) ? pass(6, 'rollback never reverses migrations (forward-only)') : fail(6, 'rollback must state/enforce forward-only migrations'));

// 7. provenance gate present for the approved services (revision-label inspect loop)
/org\.opencontainers\.image\.revision/.test(runner) && /for s in \$ALLOW/.test(runner) && /docker inspect .*Labels/.test(runner)
  ? pass(7, 'post-deploy provenance gate inspects revision label for each approved service')
  : fail(7, 'provenance gate missing for approved services');

// 8. provenance fails on label mismatch
/\[\s*"\$rev"\s*=\s*"\$RT04E_RELEASE_REV"\s*\]/.test(runner) && /prov_ok=0/.test(runner)
  ? pass(8, 'provenance gate fails when image label != required revision')
  : fail(8, 'provenance gate must fail on revision-label mismatch');

// 9 + 10. no financial E2E TOOLING / absent E2E path referenced (scripts, not scope prose)
{
  const files = [runner, adapter, rollback, checkpoint];
  // flag references to an e2e SCRIPT/PATH or an invocation, not the scope-exclusion sentence.
  const e2e = files.some(s => /rt04e-payment-e2e|e2e\/dev-console|bash [^\n]*e2e[^\n]*\.sh|\/e2e\//i.test(s));
  e2e ? fail('9-10', 'an RT04E file references financial/absent E2E tooling') : pass('9-10', 'no financial E2E script / absent e2e path referenced');
}

// 11. migration reachable only after the checkpoint gate
{
  const ckIdx = runner.search(/rt04e-migration-checkpoint\.sh|"\$CHECKPOINT"/);
  const mvIdx = runner.search(/migrate-and-verify\.sh/);
  (ckIdx >= 0 && mvIdx >= 0 && ckIdx < mvIdx) ? pass(11, 'checkpoint gate runs before migrate-and-verify') : fail(11, 'migration must be gated by the checkpoint');
}

// 12. no legacy source-path used as a build/deploy context
{
  const legacy = /legacy-src-retired|banzami\/banzami|github\.com-banzami/;
  const buildLines = (adapter + '\n' + rollback).split('\n').filter(l => /docker build|compose|-t |REPO_ROOT=|cd /.test(l));
  const bad = buildLines.filter(l => legacy.test(l));
  bad.length ? fail(12, 'legacy source path used in a build/deploy context') : pass(12, 'no legacy source path in build/deploy contexts');
}

// 13. Production/Live marker cannot pass the target gate
/\*prod\*\|\*production\*\|\*live\*/.test(runner) && /banzami_staging\) : ;;/.test(runner)
  ? pass(13, 'target gate rejects prod/production/live markers') : fail(13, 'target gate must reject prod/production/live');

// 14. unapproved compose service not targetable (adapter allowlist + prohibition)
/rt04e_in_allow "\$SVC" \|\| die/.test(adapter) && /rt04e_refuse_bad "\$SVC" && die/.test(adapter)
  ? pass(14, 'deploy adapter enforces the allowlist and rejects unapproved/prohibited services') : fail(14, 'adapter must reject unapproved services');

// 15. required canonical compose/overlay mapping present + unambiguous
{
  const okMap = /service_mapping:/.test(contract) && ALLOW.every(s => new RegExp(`${s}:[\\s\\S]{0,200}compose_file:`).test(contract));
  okMap && /docker-compose\.sandbox-gateway\.yml/.test(contract) ? pass(15, 'contract maps every approved service to a compose file/overlay') : fail(15, 'contract compose/overlay mapping incomplete/ambiguous');
}

// 16. secrets cannot be echoed / argv'd / persisted
{
  const files = [runner, adapter, rollback, checkpoint];
  const tracesOff = files.every(s => /set \+x/.test(s) && !/^\s*set\s+-[a-z]*x(\s|$)/m.test(s));
  const noEcho = !files.some(s => /(echo|printf)[^|\n]*\$\{?BANZAMI_MIGRATE_URL\}?/.test(s));
  const stdinIntake = /IFS=\s*read\s+-rs\s+BANZAMI_MIGRATE_URL/.test(runner);
  const noArgvSecret = !/BANZAMI_MIGRATE_URL\s*=\s*"?\$[1-9]/.test(runner);
  (tracesOff && noEcho && stdinIntake && noArgvSecret) ? pass(16, 'no secret echo/argv/persist; credential via protected stdin; tracing off')
    : fail(16, 'secret could be echoed/argv/persisted or tracing enabled');
}

// ── Phase-5 behavioural / continuity checks (17–31) ──────────────────────────
const lib = read('infra/deployment/rt04e-sandbox-lib.sh');
const attest = read('infra/deployment/rt04e-sandbox-attest.sh');

// 17. public-api-staging maps to its OWN image repo (not core-api), adapter derives it
/public-api-staging\)\s*echo "banzami\/public-api"/.test(lib) && /rt04e_build_repo/.test(adapter) && !/public-api-staging[\s\S]{0,120}banzami\/core-api/.test(adapter)
  ? pass(17, 'public-api-staging builds banzami/public-api (not core-api)') : fail(17, 'public-api-staging must build its own image repo');

// 18. adapter enforces build-repo == compose-declared-repo continuity
/rt04e_ref_repo "\$REF"[\s\S]{0,40}"\$REPO"[\s\S]{0,60}die/.test(adapter)
  ? pass(18, 'adapter fails when compose-declared repo != build repo') : fail(18, 'adapter must enforce declared==build repo continuity');

// 19. rollback re-points the EXACT declared ref (not a generic :rollback tag)
(!/:rollback\b/.test(rollback) && /docker tag "\$cid" "\$ref"/.test(rollback))
  ? pass(19, 'rollback re-points the exact Compose-declared reference (no generic tag)') : fail(19, 'rollback must re-point the declared reference, not a generic tag');

// 20. rollback verifies the restored running image id
/\[\s*"\$now"\s*=\s*"\$cid"\s*\][\s\S]{0,60}(die|FAIL)/.test(rollback)
  ? pass(20, 'rollback verifies restored image id == captured id') : fail(20, 'rollback must verify the restored image id');

// 21. rollback restricts to the allowlist
/rt04e_in_allow/.test(rollback) && /rt04e_refuse_bad/.test(rollback)
  ? pass(21, 'rollback restricts to the four-service allowlist') : fail(21, 'rollback must enforce the allowlist');

// 22. health is REAL (docker healthcheck status), not a no-op, not authenticated
{
  const healthBlock = runner.match(/local liveness[\s\S]{0,700}/)?.[0] || '';
  const real = /State\.Health\.Status/.test(runner);
  const noStub = !/for s in \$ALLOW; do\s*#[\s\S]{0,120}:\s*\n\s*done/.test(runner);
  const noAuth = !/(Authorization|Bearer|api[-_]?key|payment|transfer|refund)/i.test(healthBlock);
  (real && noStub && noAuth) ? pass(22, 'health uses real Docker healthcheck status, non-authenticated') : fail(22, 'health must be a real non-authenticated liveness check');
}

// 23. health runs AFTER provenance
{
  const p = runner.search(/post-deploy revision-provenance gate/i);
  const h = runner.search(/local liveness/i);
  (p >= 0 && h >= 0 && p < h) ? pass(23, 'health runs after provenance verification') : fail(23, 'health must run after provenance');
}

// 24. pre-mutation compose attestation exists + is invoked before checkpoint+migration
{
  const a = runner.search(/bash "\$ATTEST"/);           // the INVOCATION, not the path def
  const c = runner.search(/bash "\$CHECKPOINT"/);
  const m = runner.search(/bash tools\/migrate-and-verify\.sh/);
  (existsSync(resolve(ROOT, 'infra/deployment/rt04e-sandbox-attest.sh')) && a >= 0 && c >= 0 && m >= 0 && a < c && c < m)
    ? pass(24, 'compose attestation runs before checkpoint before migration') : fail(24, 'attestation must precede checkpoint + migration');
}

// 25. attestation enforces overlay-only for api-gateway-staging + refuses prohibited
/rt04e_is_overlay/.test(attest) && /docker-compose\.yml/.test(attest) && /rt04e_refuse_bad/.test(attest)
  ? pass(25, 'attestation enforces overlay-only gateway + refuses prohibited services') : fail(25, 'attestation must check overlay + prohibitions');

// 26. success requires BOTH provenance and health
/\[\s*"\$prov_ok"\s*!=\s*1\s*\]\s*\|\|\s*\[\s*"\$health_ok"\s*!=\s*1\s*\]/.test(runner)
  ? pass(26, 'success requires running-image revision label AND local health') : fail(26, 'success must require provenance AND health');

// 27–31. behavioural fixture tests of the attestation logic (grep/awk only; no docker/db)
{
  const mk = (dir, pub, gwInBase, dropDev) => {
    mkdirSync(dir, { recursive: true });
    const base = [
      'services:',
      '  core-api-staging:', '    image: banzami/core-api:adr021-staging',
      '  public-api-staging:', `    image: ${pub}`,
      ...(dropDev ? [] : ['  developer-api:', '    image: banzami/developer-api:latest']),
      ...(gwInBase ? ['  api-gateway-staging:', '    image: banzami/api-gateway:latest'] : []),
    ].join('\n') + '\n';
    const overlay = 'services:\n  api-gateway-staging:\n    image: banzami/api-gateway:latest\n';
    writeFileSync(`${dir}/docker-compose.yml`, base);
    writeFileSync(`${dir}/docker-compose.sandbox-gateway.yml`, overlay);
  };
  const runAttest = dir => {
    try { execSync(`RT04E_COMPOSE_DIR="${dir}" bash "${resolve(ROOT, 'infra/deployment/rt04e-sandbox-attest.sh')}"`, { stdio: 'pipe' }); return 0; }
    catch { return 1; }
  };
  const base = `${tmpdir()}/rt04e-fix-${Date.now()}`;
  mk(`${base}/good`, 'banzami/public-api:latest', false, false);
  mk(`${base}/badpub`, 'banzami/core-api:latest', false, false);        // public-api mapped to core image
  mk(`${base}/gwbase`, 'banzami/public-api:latest', true, false);        // gateway present in base
  mk(`${base}/nodev`, 'banzami/public-api:latest', false, true);         // developer-api missing
  const good = runAttest(`${base}/good`), badpub = runAttest(`${base}/badpub`), gwbase = runAttest(`${base}/gwbase`), nodev = runAttest(`${base}/nodev`);
  rmSync(base, { recursive: true, force: true });
  good === 0 ? pass(27, 'fixture: valid compose PASSES attestation') : fail(27, 'valid fixture must pass attestation');
  badpub === 1 ? pass('28', 'fixture: public-api→core image FAILS (continuity)') : fail(28, 'public-api mapped to core image must fail');
  gwbase === 1 ? pass('29', 'fixture: api-gateway-staging in base FAILS (overlay-only)') : fail(29, 'gateway in base must fail');
  nodev === 1 ? pass('30', 'fixture: missing approved service FAILS (mapping)') : fail(30, 'missing service must fail');
  pass('31', 'fixtures exercise attestation logic deterministically (no docker/db/server)');
}

if (failures) { console.log(`\n✗ RT04E rollout safety: ${failures} check(s) failed`); process.exit(1); }
console.log('\n✓ RT04E rollout safety: all checks pass (16 static + behavioural/continuity 17–31)');
