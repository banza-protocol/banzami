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

// 24. pre-mutation compose attestation exists + is invoked before checkpoint+migration
{
  const a = runner.search(/bash "\$ATTEST"/);           // the INVOCATION, not the path def
  const c = runner.search(/bash "\$CHECKPOINT"/);
  const m = runner.search(/bash tools\/migrate-and-verify\.sh/);
  (existsSync(resolve(ROOT, 'infra/deployment/rt04e-sandbox-attest.sh')) && a >= 0 && c >= 0 && m >= 0 && a < c && c < m)
    ? pass(24, 'compose attestation runs before checkpoint before migration') : fail(24, 'attestation must precede checkpoint + migration');
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

  // prohibited service present in either projection
  const rProhib = run(compose({ ...fullGood, 'core-api': `banzami/core-api:rt04e-${REV}` }));
  rProhib.code === 1 ? pass(49, 'parser: prohibited service present in projection FAILS (exit 1)') : fail(49, 'prohibited service must fail');

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

  const leaks = [rFull, rLatest, rInterp, rWrongRepo, rBase, rBaseGw, rProhib].some(r => /banzami\/[a-z-]+:/.test(r.out));
  !leaks ? pass(54, 'parser never emits an image reference value (PASS/FAIL categories only)') : fail(54, 'parser must not print image reference values');
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

if (failures) { console.log(`\n✗ RT04E rollout safety: ${failures} check(s) failed`); process.exit(1); }
console.log('\n✓ RT04E rollout safety: all checks pass (16 static + behavioural/continuity 17–61)');
