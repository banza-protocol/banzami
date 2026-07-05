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
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
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

// 14. unapproved compose service not targetable (adapter allowlist + default die)
/core-api-staging\|api-gateway-staging\|developer-api\|public-api-staging\)/.test(adapter) && /\*\)\s*die .*allowlist/.test(adapter)
  ? pass(14, 'deploy adapter enforces the allowlist and rejects unapproved services') : fail(14, 'adapter must reject unapproved services');

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

if (failures) { console.log(`\n✗ RT04E rollout safety: ${failures} check(s) failed`); process.exit(1); }
console.log('\n✓ RT04E rollout safety: all 16 checks pass');
