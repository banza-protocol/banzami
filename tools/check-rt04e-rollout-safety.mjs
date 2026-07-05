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

// ── Phase-5 behavioural / continuity checks (17–41) ──────────────────────────
const lib = read('infra/deployment/rt04e-sandbox-lib.sh');
const attest = read('infra/deployment/rt04e-sandbox-attest.sh');
const parser = read('tools/rt04e-attest-parser.mjs');
const PARSER_PATH = resolve(ROOT, 'tools/rt04e-attest-parser.mjs');

// 17. IMMUTABLE release tag only — adapter tags rt04e_release_ref; no latest/adr021-staging
/rt04e-%s/.test(lib) && /rt04e_release_ref/.test(adapter) && !/:latest\b|:adr021-staging\b/.test(adapter.replace(/#.*$/gm, ''))
  ? pass(17, 'adapter tags only the immutable rt04e-<rev> reference (no latest/adr021-staging)') : fail(17, 'adapter must use only the immutable release tag');

// 18. public-api builds its own repo + RT04E override is required by deploy + attest
/public-api-staging\)\s*echo "banzami\/public-api"/.test(lib) && /RT04E_OVERRIDE:\?/.test(adapter) && /RT04E_OVERRIDE:\?/.test(attest)
  ? pass(18, 'public-api builds banzami/public-api; RT04E override required by deploy + attest') : fail(18, 'override must be required; public-api builds its own repo');

// 19. rollback re-points the EXACT declared ref (not a generic :rollback tag)
(!/:rollback\b/.test(rollback) && /docker tag "\$cid" "\$declared"/.test(rollback))
  ? pass(19, 'rollback re-points the exact declared reference (no generic tag)') : fail(19, 'rollback must re-point the declared reference, not a generic tag');

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

// 25. attestation is SEMANTIC (docker compose config → constrained parser), not grep/awk
/docker compose\b[\s\S]{0,80}config[\s\S]{0,60}--no-interpolate/.test(attest)
  && /--format json/.test(attest) && /node "\$PARSER"/.test(attest)
  && !/\bgrep -E .*image\b|\bawk\b[\s\S]{0,40}image/.test(attest)
  ? pass(25, 'attestation uses semantic `docker compose config` piped to the constrained parser (no grep/awk on images)')
  : fail(25, 'attestation must be semantic (compose config → parser), never grep/awk on compose text');

// 26. success requires BOTH provenance and health
/\[\s*"\$prov_ok"\s*!=\s*1\s*\]\s*\|\|\s*\[\s*"\$health_ok"\s*!=\s*1\s*\]/.test(runner)
  ? pass(26, 'success requires running-image revision label AND local health') : fail(26, 'success must require provenance AND health');

// 27. immutable release ref + prune-proof prestate tag are defined in the shared lib
/rt04e_release_ref\b[\s\S]{0,120}rt04e-%s/.test(lib) && /rt04e_prestate_tag\b[\s\S]{0,120}rt04e-prestate-/.test(lib)
  ? pass(27, 'lib defines immutable rt04e-<rev> release ref + retained rt04e-prestate tag') : fail(27, 'lib must define immutable ref + retained prestate tag');

// 28. isolation flags (--no-build --pull never --force-recreate --no-deps) are the ONLY up mode
{
  const flagsOk = /RT04E_UP_FLAGS=.*--no-build.*--pull never.*--force-recreate.*--no-deps/.test(lib);
  const adapterUses = /\$RT04E_UP_FLAGS "\$SVC"/.test(adapter) && !/\bup -d\b(?![^\n]*RT04E_UP_FLAGS)/.test(adapter);
  const rollbackUses = /\$RT04E_UP_FLAGS "\$s"/.test(rollback);
  const noOrphans = !/--remove-orphans/.test(adapter + rollback);
  (flagsOk && adapterUses && rollbackUses && noOrphans)
    ? pass(28, 'replacement uses only --no-build/--pull never/--force-recreate/--no-deps, single service, no --remove-orphans')
    : fail(28, 'replacement must use the full isolation flag set on a single service, no orphans removal');
}

// 29. RT04E performs NO image/container prune or rmi anywhere in the chain (prune-proof rollback)
{
  const stripComments = s => s.split('\n').map(l => l.replace(/(^|\s)#.*$/, '')).join('\n');
  const chain = stripComments(adapter + '\n' + rollback + '\n' + attest + '\n' + runner + '\n' + lib);
  /\b(docker image prune|docker container prune|docker system prune|docker volume prune|docker rmi|docker image rm)\b/.test(chain)
    ? fail(29, 'RT04E must never prune/rmi — pre-state rollback images must be retained')
    : pass(29, 'no prune/rmi anywhere in the RT04E chain (retained pre-state images)');
}

// 30. capture pins the pre-state image id under the retained prestate tag; restore verifies both pin and result
{
  const captures = /rt04e_prestate_tag[\s\S]{0,300}docker tag "\$cid" "\$ptag"/.test(rollback);
  const verifiesPin = /\[\s*"\$pin"\s*=\s*"\$cid"\s*\]/.test(rollback);
  const verifiesResult = /\[\s*"\$now"\s*=\s*"\$cid"\s*\]/.test(rollback);
  const noRawName = !/banzami\/\$\{?s\}?:/.test(rollback); // never a service-name-derived repo/tag
  (captures && verifiesPin && verifiesResult && noRawName)
    ? pass(30, 'capture pins pre-state id to retained tag; restore verifies pin==captured and restored==captured')
    : fail(30, 'rollback must pin + verify pre-state image id via retained tag (no raw service-name tag)');
}

// 31. runner generates the override root-owned OUTSIDE the repo and removes it on completion
{
  const outsideRepo = /mktemp .*(TMPDIR|\/run)[\s\S]{0,80}rt04e-override/.test(runner) || /mktemp[\s\S]{0,80}rt04e-override/.test(runner);
  const chmod = /chmod 0?600 "\$RT04E_OVERRIDE"/.test(runner);
  const cleaned = /_cleanup_override/.test(runner) && /trap [\s\S]{0,40}_cleanup_override/.test(runner);
  const literalSub = /sed .*\{\{RT04E_RELEASE_REV\}\}/.test(runner) && !/\beval\s+["'$]/.test(runner);
  (outsideRepo && chmod && cleaned && literalSub)
    ? pass(31, 'runner generates the override outside the repo (0600), literal sed substitution, trap-cleaned')
    : fail(31, 'override must be generated outside the repo, 0600, literal substitution, trap-cleaned');
}

// 32. attestation verifies Compose supports the required safe flags BEFORE mutating (fail closed)
/config --help[\s\S]{0,200}(--no-interpolate|--format)/.test(attest) && /up --help[\s\S]{0,200}--no-build/.test(attest)
  ? pass(32, 'attestation verifies compose config + up safe-flag support before any mutation') : fail(32, 'attestation must verify compose safe-flag support first (fail closed)');

// 33–40. deterministic parser fixtures — feed crafted JSON via stdin, no docker/db/secret
{
  const REV = 'a1b2c3d';
  const compose = (imgs) => JSON.stringify({ services: Object.fromEntries(Object.entries(imgs).map(([k, v]) => [k, { image: v }])) });
  const good = {
    'core-api-staging': `banzami/core-api:rt04e-${REV}`,
    'api-gateway-staging': `banzami/api-gateway:rt04e-${REV}`,
    'developer-api': `banzami/developer-api:rt04e-${REV}`,
    'public-api-staging': `banzami/public-api:rt04e-${REV}`,
  };
  const runParser = (input, env = {}) => {
    try {
      const out = execSync(`node "${PARSER_PATH}"`, { input, stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, RT04E_RELEASE_REV: REV, ...env } });
      return { code: 0, out: out.toString() };
    } catch (e) { return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }; }
  };

  const rGood = runParser(compose(good));
  rGood.code === 0 ? pass(33, 'parser: four literal immutable references PASS (exit 0)') : fail(33, 'valid immutable fixture must pass');

  const rLatest = runParser(compose({ ...good, 'core-api-staging': 'banzami/core-api:latest' }));
  rLatest.code === 1 ? pass(34, 'parser: mutable `latest` tag FAILS (exit 1)') : fail(34, 'mutable latest tag must fail');

  const rInterp = runParser(compose({ ...good, 'public-api-staging': 'banzami/public-api:rt04e-${REV}' }));
  rInterp.code === 1 ? pass(35, 'parser: unresolved ${…} interpolation marker FAILS (exit 1)') : fail(35, 'interpolation marker must fail');

  const rWrongRepo = runParser(compose({ ...good, 'public-api-staging': `banzami/core-api:rt04e-${REV}` }));
  rWrongRepo.code === 1 ? pass(36, 'parser: wrong image repo (public-api→core-api) FAILS (exit 1)') : fail(36, 'wrong repo must fail');

  const noDev = { ...good }; delete noDev['developer-api'];
  const rMissing = runParser(compose(noDev));
  rMissing.code === 1 ? pass(37, 'parser: missing approved service FAILS (exit 1)') : fail(37, 'missing service must fail');

  const rBadJson = runParser('this is not json');
  rBadJson.code === 2 ? pass(38, 'parser: unexpected/non-JSON input FAILS closed (exit 2)') : fail(38, 'non-JSON input must exit 2');

  const rBadShape = runParser(JSON.stringify({ notservices: {} }));
  rBadShape.code === 2 ? pass(39, 'parser: unexpected JSON shape (no services) FAILS closed (exit 2)') : fail(39, 'unexpected shape must exit 2');

  // parser must NEVER emit an image value (no `banzami/…:…` string) on PASS or FAIL
  const leaks = [rGood, rLatest, rInterp, rWrongRepo].some(r => /banzami\/[a-z-]+:/.test(r.out));
  !leaks ? pass(40, 'parser never emits an image reference value (PASS/FAIL categories only)') : fail(40, 'parser must not print image reference values');
}

// 41. parser reads stdin only and never writes the input to disk / retains full config
/readFileSync\(0,/.test(parser) && /raw = null/.test(parser) && /doc = null/.test(parser)
  && !/writeFileSync|createWriteStream|appendFileSync/.test(parser)
  ? pass(41, 'parser reads stdin only, releases the config, and never writes it to disk') : fail(41, 'parser must not persist the compose config');

if (failures) { console.log(`\n✗ RT04E rollout safety: ${failures} check(s) failed`); process.exit(1); }
console.log('\n✓ RT04E rollout safety: all checks pass (16 static + behavioural/continuity 17–41)');
