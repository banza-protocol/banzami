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
const LIB_PATH = resolve(ROOT, 'infra/deployment/rt04e-sandbox-lib.sh');

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

// 24. attestation runs (preamble) before the mode dispatch; within migration-only, checkpoint precedes migration
{
  const attestCall = runner.search(/bash "\$ATTEST"/);          // the INVOCATION (preamble)
  const dispatch = runner.lastIndexOf('case "$MODE" in');       // the mode DISPATCH (end)
  const migStart = runner.indexOf('rt04e_run_migration_only()');
  const svcStart = runner.indexOf('rt04e_run_service_replacement_only()');
  const ck = migStart >= 0 ? runner.indexOf('bash "$CHECKPOINT"', migStart) : -1;
  const mv = migStart >= 0 ? runner.indexOf('migrate-and-verify.sh', migStart) : -1;
  const ok = existsSync(resolve(ROOT, 'infra/deployment/rt04e-sandbox-attest.sh'))
    && attestCall >= 0 && dispatch > attestCall
    && migStart >= 0 && svcStart > migStart
    && ck >= 0 && mv >= 0 && ck < mv && ck < svcStart && mv < svcStart;
  ok ? pass(24, 'attestation runs before mode dispatch; checkpoint precedes migration within migration-only')
     : fail(24, 'attestation must precede dispatch; checkpoint must precede migration in migration-only');
}

// 25. attestation is SEMANTIC (compose config via wrapper → constrained parser), not grep/awk
/config --no-interpolate --no-env-resolution --format json/.test(attest)
  && /rt04e_compose (base|full)/.test(attest) && /node "\$PARSER"/.test(attest)
  && !/\bgrep -E .*image\b|\bawk\b[\s\S]{0,40}image/.test(attest)
  ? pass(25, 'attestation uses semantic `docker compose config` (via the hermetic wrapper) piped to the parser (no grep/awk on images)')
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
  const adapterUses = /rt04e_compose full "\$RT04E_OVERRIDE" \$RT04E_UP_FLAGS "\$SVC"/.test(adapter);
  const rollbackUses = /rt04e_compose full "\$RT04E_OVERRIDE" \$RT04E_UP_FLAGS "\$s"/.test(rollback);
  const stripC = s => s.split('\n').map(l => l.replace(/(^|\s)#.*$/, '')).join('\n');
  const noOrphans = !/--remove-orphans/.test(stripC(adapter + '\n' + rollback + '\n' + lib + '\n' + attest));
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

// 32. attestation verifies Compose supports the required flags BEFORE mutating (fail closed),
//     including --no-env-resolution (confidentiality) and the up-side isolation flags.
/config --help[\s\S]{0,240}--no-env-resolution/.test(attest) && /up --help[\s\S]{0,200}--no-build/.test(attest)
  ? pass(32, 'attestation verifies compose config (incl --no-env-resolution) + up safe-flag support before any mutation') : fail(32, 'attestation must verify compose safe-flag support first (incl --no-env-resolution)');

// 33. Compose config attestation requires BOTH --no-interpolate AND --no-env-resolution
/--no-interpolate/.test(attest) && /--no-env-resolution/.test(attest)
  && /for flag in --no-interpolate --no-env-resolution --format/.test(attest)
  ? pass(33, 'attestation config command requires --no-interpolate AND --no-env-resolution (env confidentiality)')
  : fail(33, 'attestation must require both --no-interpolate and --no-env-resolution');

// 34. attestation runs BOTH projections (base-only + full) before mutation
/rt04e_compose base /.test(attest) && /rt04e_compose full /.test(attest)
  && /RT04E_PROJECTION=base/.test(attest) && /RT04E_PROJECTION=full/.test(attest)
  ? pass(34, 'attestation runs base-only AND full-composition projections (overlay-provenance proof)')
  : fail(34, 'attestation must run both base-only and full projections');

// 35. central hermetic Compose wrapper exists in the shared lib (fixed files/order/project/dir)
{
  const wrapper = /rt04e_compose\(\)\s*\{[\s\S]*?\n\}/.exec(lib)?.[0] || '';
  const fixedProject = /RT04E_PROJECT_NAME="rt04e-sandbox"/.test(lib) && /RT04E_PROJECT_DIR="\/srv\/banzami"/.test(lib);
  const fixedOrder = /-f docker-compose\.yml -f docker-compose\.sandbox-gateway\.yml -f "\$override"/.test(wrapper);
  const fixedProjFlags = /--project-name "\$RT04E_PROJECT_NAME"/.test(wrapper) && /--project-directory "\$RT04E_PROJECT_DIR"/.test(wrapper);
  const unsets = /unset \$RT04E_COMPOSE_ENV_VARS/.test(wrapper);
  (wrapper && fixedProject && fixedOrder && fixedProjFlags && unsets)
    ? pass(35, 'lib defines a hermetic Compose wrapper: fixed file order, fixed project name/dir, unsets COMPOSE_*')
    : fail(35, 'lib must define a hermetic Compose wrapper with fixed scope + COMPOSE_* unsetting');
}

// 36. wrapper rejects inherited COMPOSE_* controls (assert guards the required set)
{
  const need = ['COMPOSE_FILE', 'COMPOSE_PROJECT_NAME', 'COMPOSE_PROFILES', 'COMPOSE_PATH_SEPARATOR', 'COMPOSE_IGNORE_ORPHANS'];
  const listed = need.every(v => new RegExp(`\\b${v}\\b`).test(lib));
  const guarded = /rt04e_assert_clean_compose_env\(\)\s*\{[\s\S]*?printenv[\s\S]*?return 1/.test(lib)
    && /rt04e_compose\(\)[\s\S]{0,200}rt04e_assert_clean_compose_env \|\| return/.test(lib);
  const usedByRunnerAndAttest = /rt04e_assert_clean_compose_env/.test(runner) && /rt04e_assert_clean_compose_env/.test(attest);
  (listed && guarded && usedByRunnerAndAttest)
    ? pass(36, 'hermeticity guard rejects inherited COMPOSE_* (file/project/profiles/path-sep/orphans) in wrapper + runner + attest')
    : fail(36, 'COMPOSE_* rejection guard must cover the required set and gate the wrapper/runner/attest');
}

// 37. deploy + rollback go through the wrapper ONLY (no raw `docker compose` operation)
!/docker compose\b/.test(adapter) && !/docker compose\b/.test(rollback)
  && /rt04e_compose full /.test(adapter) && /rt04e_compose full /.test(rollback)
  ? pass(37, 'deploy + rollback invoke Compose only via the hermetic wrapper (no raw docker compose)')
  : fail(37, 'deploy/rollback must not bypass the hermetic Compose wrapper');

// 38. attest's only raw `docker compose` are non-mutating probes (version / --help); ops via wrapper
{
  const rawOps = (attest.match(/docker compose\b[^\n]*/g) || [])
    .filter(l => !/(version|config --help|up --help)/.test(l))
    .filter(l => !/\bdie\b|lacks|refusing|unavailable/.test(l)); // drop error-message strings
  rawOps.length === 0
    ? pass(38, 'attest uses raw `docker compose` only for version/--help probes; config runs via the wrapper')
    : fail(38, 'attest must not run raw docker compose operations outside the wrapper');
}

// 39. FULL canonical SHA required — lib validates exactly 40 hex; parser regex is 40-hex
/rt04e_valid_rev\(\)[\s\S]{0,140}"\$\{#1\}"\s*-eq\s*40/.test(lib) && /\^\[0-9a-f\]\{40\}\$/.test(parser)
  ? pass(39, 'release revision must be the full 40-hex canonical SHA (lib + parser)') : fail(39, 'RT04E_RELEASE_REV must be the full 40-hex SHA (no abbreviation)');

// 40. immutable tag derivation embeds the full validated SHA (rt04e-<rev>, rev validated 40-hex)
/rt04e_release_ref\(\)[\s\S]{0,120}rt04e_valid_rev "\$2" \|\| return 1[\s\S]{0,80}printf '%s:rt04e-%s'/.test(lib)
  && /rt04e_prestate_tag\(\)[\s\S]{0,120}rt04e_valid_rev "\$2" \|\| return 1/.test(lib)
  ? pass(40, 'immutable release + prestate tags embed the full validated canonical SHA (rev-guarded)') : fail(40, 'immutable tag must embed the full validated SHA');

// 41–52. deterministic parser fixtures — crafted JSON via stdin, no docker/db/secret
{
  const REV = 'a'.repeat(40);                                  // full 40-hex canonical SHA
  const SHORT = 'a1b2c3d';                                     // abbreviated (must be rejected)
  const compose = (imgs) => JSON.stringify({ services: Object.fromEntries(Object.entries(imgs).map(([k, v]) => [k, v === null ? {} : { image: v }])) });
  const fullGood = {
    'core-api-staging': `banzami/core-api:rt04e-${REV}`,
    'api-gateway-staging': `banzami/api-gateway:rt04e-${REV}`,
    'developer-api': `banzami/developer-api:rt04e-${REV}`,
    'public-api-staging': `banzami/public-api:rt04e-${REV}`,
  };
  const baseGood = { 'core-api-staging': null, 'developer-api': null, 'public-api-staging': null };
  const run = (input, env = {}) => {
    try {
      const out = execSync(`node "${PARSER_PATH}"`, { input, stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, RT04E_RELEASE_REV: REV, RT04E_PROJECTION: 'full', ...env } });
      return { code: 0, out: out.toString() };
    } catch (e) { return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }; }
  };

  // full projection
  const rFull = run(compose(fullGood));
  rFull.code === 0 ? pass(41, 'parser[full]: four literal immutable references PASS (exit 0)') : fail(41, 'valid full fixture must pass');

  const rLatest = run(compose({ ...fullGood, 'core-api-staging': 'banzami/core-api:latest' }));
  rLatest.code === 1 ? pass(42, 'parser[full]: mutable `latest` tag FAILS (exit 1)') : fail(42, 'mutable latest tag must fail');

  const rInterp = run(compose({ ...fullGood, 'public-api-staging': 'banzami/public-api:rt04e-${REV}' }));
  rInterp.code === 1 ? pass(43, 'parser[full]: unresolved ${…} interpolation marker FAILS (exit 1)') : fail(43, 'interpolation marker must fail');

  const rWrongRepo = run(compose({ ...fullGood, 'public-api-staging': `banzami/core-api:rt04e-${REV}` }));
  rWrongRepo.code === 1 ? pass(44, 'parser[full]: wrong image repo FAILS (exit 1)') : fail(44, 'wrong repo must fail');

  const noGw = { ...fullGood }; delete noGw['api-gateway-staging'];
  const rNoGw = run(compose(noGw));
  rNoGw.code === 1 ? pass(45, 'parser[full]: api-gateway-staging MISSING in full composition FAILS (exit 1)') : fail(45, 'missing gateway in full must fail');

  // base projection
  const rBase = run(compose(baseGood), { RT04E_PROJECTION: 'base' });
  rBase.code === 0 ? pass(46, 'parser[base]: base services present, gateway absent PASS (exit 0)') : fail(46, 'valid base fixture must pass');

  const rBaseGw = run(compose({ ...baseGood, 'api-gateway-staging': null }), { RT04E_PROJECTION: 'base' });
  rBaseGw.code === 1 ? pass(47, 'parser[base]: api-gateway-staging PRESENT in base FAILS (overlay-only) (exit 1)') : fail(47, 'gateway in base must fail');

  const baseNoDev = { ...baseGood }; delete baseNoDev['developer-api'];
  const rBaseNoDev = run(compose(baseNoDev), { RT04E_PROJECTION: 'base' });
  rBaseNoDev.code === 1 ? pass(48, 'parser[base]: missing base service FAILS (exit 1)') : fail(48, 'missing base service must fail');

  // TARGET-SCOPED prohibited handling ─────────────────────────────────────────
  // 49. a prohibited service that is RT04E-CONTROLLED (carries the immutable rt04e
  //     ref — i.e. introduced/selected/aliased via the override or overlay) FAILS.
  const rProhibCtl = run(compose({ ...fullGood, 'core-api': `banzami/core-api:rt04e-${REV}` }));
  rProhibCtl.code === 1 ? pass(49, 'parser[full]: prohibited service carrying an RT04E immutable ref (override-introduced) FAILS (exit 1)') : fail(49, 'RT04E-controlled prohibited service must fail');

  // 62. an UNRELATED prohibited-named service (server-owned admin, NON-rt04e image)
  //     may exist in the FULL model and does NOT fail — it is not selected/overridden.
  const rAdminFull = run(compose({ ...fullGood, 'admin-api-staging': 'someregistry/admin:2026-07' }));
  rAdminFull.code === 0 ? pass(62, 'parser[full]: unrelated admin-api-staging (non-rt04e image) is IGNORED (exit 0)') : fail(62, 'unrelated non-selected prohibited service must not fail');

  // 63. same unrelated service present in the BASE projection also does NOT fail.
  const rAdminBase = run(compose({ ...baseGood, 'admin-api-staging': 'someregistry/admin:2026-07' }), { RT04E_PROJECTION: 'base' });
  rAdminBase.code === 0 ? pass(63, 'parser[base]: unrelated admin-api-staging (non-rt04e image) is IGNORED (exit 0)') : fail(63, 'unrelated base service must not fail');

  // 64. a prohibited service ALIASED/substituted onto an RT04E immutable ref FAILS,
  //     even alongside the four valid approved services (override-injection attempt).
  const rAlias = run(compose({ ...fullGood, 'payments-live': `banzami/public-api:rt04e-${REV}` }));
  rAlias.code === 1 ? pass(64, 'parser[full]: prohibited (`*live*`) service aliased to an RT04E immutable ref FAILS (exit 1)') : fail(64, 'prohibited service aliased to an RT04E ref must fail');

  // revision identity
  const rShort = run(compose(fullGood), { RT04E_RELEASE_REV: SHORT });
  rShort.code === 2 ? pass(50, 'parser: abbreviated (short) SHA REJECTED closed (exit 2)') : fail(50, 'short SHA must be rejected');

  const rBranch = run(compose(fullGood), { RT04E_RELEASE_REV: 'main' });
  rBranch.code === 2 ? pass(51, 'parser: branch/symbolic ref REJECTED closed (exit 2)') : fail(51, 'branch name must be rejected');

  const rNoProj = run(compose(fullGood), { RT04E_PROJECTION: '' });
  rNoProj.code === 2 ? pass(52, 'parser: missing/invalid RT04E_PROJECTION REJECTED closed (exit 2)') : fail(52, 'missing projection must be rejected');

  // shape rejection + no leakage
  const rBadJson = run('this is not json');
  const rBadShape = run(JSON.stringify({ notservices: {} }));
  (rBadJson.code === 2 && rBadShape.code === 2)
    ? pass(53, 'parser: non-JSON + unexpected shape REJECTED closed (exit 2)') : fail(53, 'unexpected input must exit 2');

  const leaks = [rFull, rLatest, rInterp, rWrongRepo, rBase, rBaseGw, rProhibCtl, rAdminFull, rAlias].some(r => /banzami\/[a-z-]+:/.test(r.out));
  !leaks ? pass(54, 'parser never emits an image reference value (PASS/FAIL categories only)') : fail(54, 'parser must not print image reference values');
}

// 65–66. deterministic target-selection fixtures — source the lib, no docker/db/secret.
// A prohibited service can never be an RT04E deploy/rollback target nor pass the
// allowlist, while all four approved services are accepted.
{
  const clean = { ...process.env };
  for (const k of Object.keys(clean)) if (/^COMPOSE_/.test(k)) delete clean[k];
  const guardRefuses = (svc) => {
    // rt04e_refuse_bad returns 0 (refuse) for prohibited; rt04e_in_allow returns non-0.
    let refused = false, notAllowed = false;
    try { execSync(`bash -c '. "${LIB_PATH}"; rt04e_refuse_bad "${svc}"'`, { stdio: 'pipe', env: clean }); refused = true; } catch { refused = false; }
    try { execSync(`bash -c '. "${LIB_PATH}"; rt04e_in_allow "${svc}"'`, { stdio: 'pipe', env: clean }); notAllowed = false; } catch { notAllowed = true; }
    return refused && notAllowed;
  };
  const allows = (svc) => {
    let ok = false, notRefused = false;
    try { execSync(`bash -c '. "${LIB_PATH}"; rt04e_in_allow "${svc}"'`, { stdio: 'pipe', env: clean }); ok = true; } catch { ok = false; }
    try { execSync(`bash -c '. "${LIB_PATH}"; rt04e_refuse_bad "${svc}"'`, { stdio: 'pipe', env: clean }); notRefused = false; } catch { notRefused = true; }
    return ok && notRefused;
  };
  const prohibitedTargets = ['core-api', 'api-gateway', 'public-api', 'admin-api', 'admin-api-staging', 'payments-live', 'core-prod'];
  prohibitedTargets.every(guardRefuses)
    ? pass(65, 'target guard: every prohibited service is refused AND outside the allowlist (deploy/rollback target)') : fail(65, 'prohibited services must be refused as targets');
  ['core-api-staging', 'api-gateway-staging', 'developer-api', 'public-api-staging'].every(allows)
    ? pass(66, 'target guard: the four approved services are allowlisted and not refused') : fail(66, 'approved services must be accepted');
}

// 55. parser reads stdin only and never writes the input to disk / retains full config
/readFileSync\(0,/.test(parser) && /raw = null/.test(parser) && /doc = null/.test(parser)
  && !/writeFileSync|createWriteStream|appendFileSync/.test(parser)
  ? pass(55, 'parser reads stdin only, releases the config, and never writes it to disk') : fail(55, 'parser must not persist the compose config');

// 56–60. deterministic hermeticity fixtures — source the lib + call the guard (no docker)
{
  const cleanEnv = { ...process.env };
  for (const k of Object.keys(cleanEnv)) if (/^COMPOSE_/.test(k)) delete cleanEnv[k];
  const callGuard = (extra = {}) => {
    try {
      execSync(`bash -c '. "${LIB_PATH}"; rt04e_assert_clean_compose_env'`, { stdio: 'pipe', env: { ...cleanEnv, ...extra } });
      return 0;
    } catch (e) { return e.status ?? 1; }
  };
  callGuard() === 0 ? pass(56, 'hermeticity guard PASSES with a clean COMPOSE_* environment') : fail(56, 'clean env must pass the guard');
  callGuard({ COMPOSE_FILE: '/x/evil.yml' }) !== 0 ? pass(57, 'inherited COMPOSE_FILE REJECTED by the guard') : fail(57, 'COMPOSE_FILE must be rejected');
  callGuard({ COMPOSE_PROJECT_NAME: 'evil' }) !== 0 ? pass(58, 'inherited COMPOSE_PROJECT_NAME REJECTED by the guard') : fail(58, 'COMPOSE_PROJECT_NAME must be rejected');
  callGuard({ COMPOSE_PROFILES: 'debug' }) !== 0 ? pass(59, 'inherited COMPOSE_PROFILES REJECTED by the guard') : fail(59, 'COMPOSE_PROFILES must be rejected');
  callGuard({ COMPOSE_IGNORE_ORPHANS: '1' }) !== 0 ? pass(60, 'inherited COMPOSE_IGNORE_ORPHANS REJECTED by the guard') : fail(60, 'COMPOSE_IGNORE_ORPHANS must be rejected');

  // wrapper rejects a bad projection + a missing override BEFORE reaching docker
  const callWrap = (args, extra = {}) => {
    try {
      execSync(`bash -c '. "${LIB_PATH}"; rt04e_compose ${args}'`, { stdio: 'pipe', env: { ...cleanEnv, ...extra } });
      return 0;
    } catch (e) { return e.status ?? 1; }
  };
  const badProj = callWrap('bogus "" config');
  const missOverride = callWrap('full /nonexistent/override.yml config');
  (badProj === 6 && missOverride === 3)
    ? pass(61, 'wrapper rejects a bad projection (6) and a missing override (3) before any docker call')
    : fail(61, 'wrapper must fail closed on bad projection / missing override');
}

// ── Phase-6 staged execution boundary (67–86): migration-only vs service-replacement-only ──
const receipt = read('tools/rt04e-receipt.mjs');
const RECEIPT_PATH = resolve(ROOT, 'tools/rt04e-receipt.mjs');
const RUNNER_PATH = resolve(ROOT, 'infra/deployment/rt04e-secure-rollout.sh');
// migration-only function body (between its definition and the service-replacement function)
const migStart = runner.indexOf('rt04e_run_migration_only()');
const svcStart = runner.indexOf('rt04e_run_service_replacement_only()');
const preambleStart = runner.indexOf('COMMON PREAMBLE');
const migBody = migStart >= 0 && svcStart > migStart ? runner.slice(migStart, svcStart) : '';
const svcBody = svcStart >= 0 && preambleStart > svcStart ? runner.slice(svcStart, preambleStart) : '';

// 67–71. behavioural mode-gate — run the real runner; invalid/missing mode fails closed
//        BEFORE any git/docker/DB/credential step (mode gate precedes source-root gate).
{
  const runMode = (mode, args = '') => {
    const env = { ...process.env, BANZAMI_REPO_ROOT: '/nonexistent-rt04e-test' };
    if (mode === null) delete env.RT04E_EXECUTION_MODE; else env.RT04E_EXECUTION_MODE = mode;
    try { execSync(`bash "${RUNNER_PATH}" ${args} < /dev/null`, { stdio: 'pipe', timeout: 8000, env }); return 0; }
    catch (e) { return e.status ?? 1; }
  };
  runMode(null) === 20 ? pass(67, 'missing RT04E_EXECUTION_MODE fails closed (exit 20) before any sensitive step') : fail(67, 'missing mode must fail closed at the mode gate');
  runMode('') === 20 ? pass(68, 'empty RT04E_EXECUTION_MODE fails closed (exit 20)') : fail(68, 'empty mode must fail closed');
  (runMode('full') === 20 && runMode('all') === 20 && runMode('auto') === 20 && runMode('MIGRATION-ONLY') === 20)
    ? pass(69, 'invalid/legacy/aliased/uppercase modes (full/all/auto/MIGRATION-ONLY) fail closed (exit 20)') : fail(69, 'invalid/alias/legacy modes must fail closed');
  // a positional argument is rejected before the mode gate (argv guard, exit 2)
  runMode('migration-only', 'stray-arg') === 2 ? pass(70, 'positional mode/argument rejected (exit 2) — no argv mode selection') : fail(70, 'positional arguments must be rejected');
  // exactly the two modes are accepted keywords; no alias appears as a case LABEL (line-start)
  (/migration-only\|service-replacement-only\)/.test(runner) && !/^\s*(full|all|auto|continue|deploy)\)/m.test(runner))
    ? pass(71, 'only migration-only|service-replacement-only are accepted; no full/all/auto/continue/deploy case label') : fail(71, 'only the two explicit modes may be accepted');
}

// 72. migration-only has NO reachable path to capture/build/tag/replace/provenance/health/rollback
{
  const forbidden = /\$ROLLBACK" capture|\$DEPLOY_ADAPTER|docker build|docker compose|rt04e_compose |State\.Health|image\.revision"} '|prov_ok/;
  migBody && !forbidden.test(migBody)
    ? pass(72, 'migration-only body contains no rollback-capture/build/replace/provenance/health path') : fail(72, 'migration-only must never reach build/replace/provenance/health');
}

// 73. migration-only requires a direct TTY + the exact visible authorisation phrase
/require_tty/.test(migBody) && /confirm_phrase "AUTHORISE RT04E SANDBOX MIGRATION"/.test(migBody)
  ? pass(73, 'migration-only requires a TTY and the exact "AUTHORISE RT04E SANDBOX MIGRATION" phrase') : fail(73, 'migration-only must require TTY + exact migration phrase');

// 74. migration-only rejects a caller-provided DATABASE_URL (credential only via read -rs)
/\[ -z "\$\{DATABASE_URL:-\}" \]/.test(migBody)
  ? pass(74, 'migration-only rejects a caller-provided DATABASE_URL') : fail(74, 'migration-only must reject caller DATABASE_URL');

// 75. the protected read -rs credential prompt is CONFINED to migration-only
{
  const inMig = /read -rs BANZAMI_MIGRATE_URL/.test(migBody);
  const inSvc = /read -rs/.test(svcBody);
  const inPreamble = /read -rs/.test(runner.slice(preambleStart >= 0 ? preambleStart : 0));
  (inMig && !inSvc && !inPreamble) ? pass(75, 'protected read -rs credential prompt is confined to migration-only') : fail(75, 'read -rs must exist only in migration-only');
}

// 76. the migration receipt is written ONLY after migration + checksum + drift pass
{
  const mv = migBody.indexOf('migrate-and-verify.sh');
  const wr = migBody.indexOf('rt04e_write_migration_receipt "$head_after"');
  (mv >= 0 && wr >= 0 && mv < wr) ? pass(76, 'migration receipt is written only after migrate/checksum/drift succeed') : fail(76, 'receipt must be written only after migration success');
}

// 77. receipt writer is safe: fixed location, symlink-safe, atomic rename, 0600 root, no mismatched overwrite, SHA-bound
{
  const w = runner;
  const fixedLoc = /RECEIPT_DIR="\/root\/banzami-forensics\/rt04e-receipts"/.test(w);
  const shaBound = /rt04e-migration-receipt-\$RT04E_RELEASE_REV\.json/.test(w);
  const symlinkSafe = /\[ -L "\$final" \] && die/.test(w) && /\[ -L "\$RECEIPT_DIR" \] && die/.test(w);
  const atomic = /mktemp "\$RECEIPT_DIR\/\.receipt\.XXXXXX"/.test(w) && /mv -f "\$tmp" "\$final"/.test(w);
  const perms = /chmod 600 "\$final"/.test(w) && /chown root:root "\$tmp"/.test(w);
  const noOverwrite = /does not validate — refusing to overwrite/.test(w);
  const selfValidate = /node "\$RECEIPT_VALIDATOR" < "\$tmp"/.test(w);
  (fixedLoc && shaBound && symlinkSafe && atomic && perms && noOverwrite && selfValidate)
    ? pass(77, 'receipt writer: fixed SHA-bound location, symlink-safe, atomic 0600 root, no mismatched overwrite, self-validated') : fail(77, 'receipt writer must be fixed/symlink-safe/atomic/self-validated');
}

// 78–80. receipt validator fixtures — crafted JSON via stdin, no docker/db/secret
{
  const REV = '7'.repeat(39) + 'b'; // full 40-hex (arbitrary)
  const base = {
    receipt_version: 1, release_revision: REV, target_category: 'Sandbox', execution_mode: 'migration-only',
    checkpoint_status: 'PASS', backup_status: 'PASS', migration_access_status: 'PASS', migration_status: 'PASS',
    migration_level_before: 'recorded-forward-only', migration_level_after: '0100_dev_project_sandbox_binding',
    checksum_status: 'PASS', drift_status: 'PASS', created_utc: '2026-07-06T07:00:00Z',
  };
  const runV = (obj, env = {}) => {
    try { execSync(`node "${RECEIPT_PATH}"`, { input: JSON.stringify(obj), stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, RT04E_RELEASE_REV: REV, ...env } }); return { code: 0 }; }
    catch (e) { return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }; }
  };
  const rawV = (str, env = {}) => { try { execSync(`node "${RECEIPT_PATH}"`, { input: str, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, RT04E_RELEASE_REV: REV, ...env } }); return 0; } catch (e) { return e.status ?? 1; } };

  const okReceipt = runV(base).code === 0;
  const wrongRev = runV({ ...base, release_revision: 'a'.repeat(40) }).code === 1;
  const wrongTarget = runV({ ...base, target_category: 'Production' }).code === 1;
  const wrongMode = runV({ ...base, execution_mode: 'service-replacement-only' }).code === 1;
  const failedStatus = runV({ ...base, drift_status: 'FAIL' }).code === 1;
  const unknownField = runV({ ...base, extra: 'x' }).code === 1;
  (okReceipt && wrongRev && wrongTarget && wrongMode && failedStatus && unknownField)
    ? pass(78, 'validator: valid receipt PASSES; wrong-SHA/target/mode/failed-status/unknown-field FAIL (exit 1)') : fail(78, 'validator field/status checks incorrect');

  const shortSha = rawV(JSON.stringify(base), { RT04E_RELEASE_REV: 'a1b2c3d' });
  const badJson = rawV('not json');
  const notObject = rawV('[1,2,3]');
  (shortSha === 2 && badJson === 2 && notObject === 2)
    ? pass(79, 'validator: short SHA env, non-JSON, and non-object all fail closed (exit 2)') : fail(79, 'validator must exit 2 on short SHA / non-JSON / non-object');

  const secretish = runV({ ...base, migration_level_after: 'postgres://x' }).code === 1;
  const noLeak = !/postgres|:\/\//.test(runV({ ...base, migration_level_after: 'postgres://x' }).out || '');
  (secretish && noLeak) ? pass(80, 'validator: secret-like content rejected and never echoed') : fail(80, 'validator must reject + not echo secret-like content');
}

// 81. service-replacement-only NEVER runs migration/checkpoint/credential code
{
  const forbidden = /migrate-and-verify\.sh|\$CHECKPOINT|read -rs|BANZAMI_MIGRATE_URL=|rt04e_write_migration_receipt/;
  svcBody && !forbidden.test(svcBody)
    ? pass(81, 'service-replacement-only body contains no migration/checkpoint/credential code') : fail(81, 'service-replacement-only must never touch migration/checkpoint/credential');
}

// 82. service-replacement-only rejects a database credential marker before any operation
/\[ -z "\$\{DATABASE_URL:-\}" \][\s\S]{0,120}refusing/.test(svcBody) && /\[ -z "\$\{BANZAMI_MIGRATE_URL:-\}" \]/.test(svcBody)
  ? pass(82, 'service-replacement-only rejects DATABASE_URL and migration-credential markers') : fail(82, 'service-replacement-only must reject a DB credential marker');

// 83. service-replacement-only requires a VALID matching receipt via the constrained validator
/rt04e-migration-receipt-\$RT04E_RELEASE_REV\.json/.test(svcBody)
  && /node "\$RECEIPT_VALIDATOR" < "\$receipt"/.test(svcBody)
  && /\[ "\$owner" = root \]/.test(svcBody) && /\[ "\$mode" = 600 \]/.test(svcBody) && /\[ ! -L "\$receipt" \]/.test(svcBody)
  ? pass(83, 'service-replacement-only requires a release-bound, root-600, non-symlink, validator-passing receipt') : fail(83, 'service-replacement-only must gate on a valid canonical receipt');

// 84. service-replacement-only requires a TTY + the exact service-replacement phrase, capture before deploy
{
  const tty = /require_tty/.test(svcBody);
  const phrase = /confirm_phrase "AUTHORISE RT04E SANDBOX SERVICE REPLACEMENT"/.test(svcBody);
  const capIx = svcBody.indexOf('bash "$ROLLBACK" capture');
  const depIx = svcBody.indexOf('bash "$DEPLOY_ADAPTER"');   // the deploy INVOCATION, not the -f existence check
  const capBeforeDeploy = capIx >= 0 && depIx > capIx;
  (tty && phrase && capBeforeDeploy) ? pass(84, 'service-replacement-only requires TTY + exact replacement phrase; capture precedes deploy') : fail(84, 'service-replacement-only must require TTY + phrase and capture-before-deploy');
}

// 85. no legacy combined migration→deploy path: migration-only never deploys; the two modes are mutually exclusive
{
  const noDeployInMig = !/\$DEPLOY_ADAPTER/.test(migBody);
  const noMigrateInSvc = !/migrate-and-verify\.sh/.test(svcBody);
  const dispatchExclusive = /case "\$MODE" in[\s\S]{0,200}migration-only\)\s*rt04e_run_migration_only ;;[\s\S]{0,160}service-replacement-only\)\s*rt04e_run_service_replacement_only ;;/.test(runner);
  (noDeployInMig && noMigrateInSvc && dispatchExclusive)
    ? pass(85, 'no combined migration→deploy path; modes are mutually exclusive at dispatch') : fail(85, 'the legacy migration→deploy path must be unreachable');
}

// 86. receipt is audit evidence only — never a payment/financial-release approval
/quarantined|SEPARATE follow-on|NOT.*(payment|financial)|payment capability/i.test(runner)
  ? pass(86, 'runner keeps payment/financial capability quarantined (receipt is not a release approval)') : fail(86, 'runner must state financial capability stays quarantined');

if (failures) { console.log(`\n✗ RT04E rollout safety: ${failures} check(s) failed`); process.exit(1); }
console.log('\n✓ RT04E rollout safety: all checks pass (16 static + behavioural/continuity 17–86)');
