#!/usr/bin/env node
// Banzami Environment Blueprint — static validator for the gated same-VM execution adapter.
// Asserts (without contacting any VM): no embedded VM target/secret/credential in source;
// plan-by-default with an explicit --apply + per-execution authorisation gate; manifest-only
// deletion with no prune / no unscoped deletion; fail-closed target handling; runtime-only
// target; approved-services-only deployment.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VMX = resolve(ROOT, 'vm-execution');
let failed = 0;
const pass = (n, m) => console.log(`  ✓ [${n}] ${m}`);
const fail = (n, m) => { console.error(`  ✗ [${n}] ${m}`); failed++; };

// gather every tracked source file under vm-execution/
function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}
const files = walk(VMX);
const src = Object.fromEntries(files.map(f => [f, readFileSync(f, 'utf8')]));
const exec = readFileSync(resolve(VMX, 'vm-execute.sh'), 'utf8');
const classify = readFileSync(resolve(VMX, 'lib', 'classify.sh'), 'utf8');
const all = Object.values(src).join('\n');

// 1. no embedded VM target / secret / credential anywhere in source (fixtures included)
{
  const ipv4 = /\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\b/;
  const privKey = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;
  const credUrl = /(postgres(ql)?|mysql|redis|https?):\/\/[^/\s"']*:[^@/\s"']+@/i;
  const sshLiteral = /ssh\s+([^"'\s]+@[^"'\s]+|-\S+\s+[^"'$\s]+@)/; // ssh to a literal user@host
  const offenders = [];
  for (const [f, c] of Object.entries(src)) {
    if (ipv4.test(c)) offenders.push(`${f}: ipv4 literal`);
    if (privKey.test(c)) offenders.push(`${f}: private key`);
    if (credUrl.test(c)) offenders.push(`${f}: credentialed url`);
    if (sshLiteral.test(c)) offenders.push(`${f}: ssh to literal host`);
  }
  offenders.length === 0 ? pass(1, 'no VM IP / hostname / SSH key / credentialed URL / literal ssh target in source') : fail(1, offenders.join('; '));
}
// 2. runtime-only target: BZVM_SSH_TARGET is read, never assigned a literal value
{
  const readsEnv = /\$\{BZVM_SSH_TARGET:?-?\}|"\$BZVM_SSH_TARGET"/.test(exec);
  const noAssign = !/BZVM_SSH_TARGET=\S/.test(all);
  const remoteUsesVar = /ssh [^\n]*"\$BZVM_SSH_TARGET"/.test(exec);
  (readsEnv && noAssign && remoteUsesVar) ? pass(2, 'VM target read from runtime env only (BZVM_SSH_TARGET); never assigned/committed') : fail(2, `target handling (reads=${readsEnv} noAssign=${noAssign} viaVar=${remoteUsesVar})`);
}
// 3. plan-by-default; apply requires explicit flag + per-execution authorisation file
{
  const planDefault = /^MODE=plan$/m.test(exec);
  const applyFlag = /--apply\)\s*MODE=apply/.test(exec);
  const guard = /guard_apply\(\)/.test(exec)
    && /\[ "\$MODE" = apply \] \|\| die/.test(exec)
    && /BZVM_AUTH_FILE/.test(exec)
    && /BZVM_APPLY=yes/.test(exec)
    && /BZVM_APPLY_SCOPE=/.test(exec);
  const everyApplyGuarded = (exec.match(/guard_apply /g) || []).length >= 4;
  (planDefault && applyFlag && guard && everyApplyGuarded) ? pass(3, 'plan-by-default; apply requires --apply flag AND a scoped per-execution authorisation file') : fail(3, `apply gate (default=${planDefault} flag=${applyFlag} guard=${guard} guarded=${everyApplyGuarded})`);
}
// 4. fail-closed: set -euo pipefail; target required before any remote/transfer
{
  const strict = /set -euo pipefail/.test(exec);
  const targetGuard = /require_target\(\)/.test(exec) && /VM target not supplied/.test(exec);
  const remoteRequires = /remote\(\)\s*\{\s*require_target;/.test(exec) && /xfer\(\)\s*\{\s*require_target;/.test(exec);
  (strict && targetGuard && remoteRequires) ? pass(4, 'fail-closed: strict mode; remote/transfer require a runtime target before any VM contact') : fail(4, `fail-closed (strict=${strict} targetGuard=${targetGuard} remoteReq=${remoteRequires})`);
}
// 5. manifest-only deletion; NO prune, NO unscoped deletion
{
  const noPrune = !/docker (system|image|volume|network|builder) prune/.test(all);
  const noUnscoped = !/docker rm[^\n]*\$\(/.test(all) && !/rm -rf \/(\s|"|$)/.test(all) && !/docker compose[^\n]* down/.test(exec);
  // deletion executes scoped per-id commands only, from the plan
  const scoped = /docker rm -f '\$id'/.test(exec) && /docker volume rm '\$id'/.test(exec) && /docker network rm '\$id'/.test(exec) && /docker image rm -f '\$id'/.test(exec);
  const planGuard = /RESET PLAN CONTAINS AN UNSCOPED OR PRUNE OPERATION/.test(exec) && /grep -Eiq 'prune\|system/.test(exec);
  (noPrune && noUnscoped && scoped && planGuard) ? pass(5, 'manifest-scoped deletion only; no prune, no unscoped/global deletion; plan re-scrubbed for prune') : fail(5, `deletion safety (noPrune=${noPrune} noUnscoped=${noUnscoped} scoped=${scoped} planGuard=${planGuard})`);
}
// 6. classifier is fail-closed: IN only on positive banza affiliation; plan filters IN
{
  const inOnAffiliation = /hay ~ \/banza\/.*IN/.test(classify);
  const excludesRest = /EXCLUDED\\tUNRELATED/.test(classify) && /EXCLUDED\\tAMBIGUOUS/.test(classify);
  const planFiltersIn = /\$4=="IN"/.test(classify);
  const sanitised = /summarise\(\)/.test(classify) && /counts only/i.test(classify);
  (inOnAffiliation && excludesRest && planFiltersIn && sanitised) ? pass(6, 'classifier: teardown scope requires positive banza affiliation; unrelated/ambiguous excluded; sanitised summary') : fail(6, `classifier (aff=${inOnAffiliation} exc=${excludesRest} filter=${planFiltersIn} san=${sanitised})`);
}
// 7. approved-services-only deployment; forbidden services never deployed by the VM path
{
  const approved = /APPROVED="core-api-staging api-gateway-staging developer-api public-api-staging"/.test(exec);
  const reusesMergedDeploy = /sandbox-ops\/scripts\/sandbox-deploy\.sh" apply/.test(exec);
  // Unchanged by Banzami ADR-052: the payer surface is authorised in the Sandbox
  // deploy set, not in a VM-execution apply. Same reasoning as the release
  // package — one topology's authorisation is not every topology's.
  const noForbidden = !/(admin-api|dashboard|checkout-frontend|pay-frontend|banza-docs|banzai)[^\n]*apply/i.test(exec);
  (approved && reusesMergedDeploy && noForbidden) ? pass(7, 'deployment restricted to the four approved services via the merged provenance-first deploy adapter') : fail(7, `deploy scope (approved=${approved} reuse=${reusesMergedDeploy} noForbidden=${noForbidden})`);
}

// 8. remote wiring: source tree materialised + revision-verified; VM-local release state
//    materialised; non-destructive dry-run reuses the merged rehearsal harness; and the
//    irreversible reset is gated on a proven dry-run (safe order).
{
  const materialise = /git clone -q '\$rroot\/source\.bundle' '\$rroot\/source'/.test(exec)
    && /checkout -q '\$SOURCE_REVISION'/.test(exec);
  const revVerify = /git -C '\$rroot\/source' rev-parse HEAD/.test(exec) && /VM SOURCE TREE REVISION MISMATCH/.test(exec);
  const releaseState = /banzami-blueprint-release\/current\.run/.test(exec) && /RELEASE_ROOT=%s/.test(exec) && /VM RELEASE STATE INCOMPLETE/.test(exec);
  const dryRun = /cmd_vm_dry_run\(\)/.test(exec)
    && /reh="infra\/blueprint\/sandbox-ops\/scripts\/sandbox-operational-rehearsal\.sh"/.test(exec)
    && /bash '\$reh' run/.test(exec)
    && /bash '\$reh' verify/.test(exec) && /bash '\$reh' clean/.test(exec) && /bash '\$reh' residue/.test(exec)
    && /VM DRY-RUN REBUILD FAILED/.test(exec);
  const resetGatedOnDryRun = /test -f '\$BZVM_REMOTE_ROOT\/tmp\/dry-run\.ok'/.test(exec)
    && /VM DRY-RUN NOT PROVEN BEFORE RESET/.test(exec);
  // dry-run marker is written only AFTER verify+residue pass (source order check)
  const markerAfterProof = exec.indexOf("dry-run.ok'") > exec.indexOf('VM DRY-RUN VERIFY FAILED');
  (materialise && revVerify && releaseState && dryRun && resetGatedOnDryRun && markerAfterProof)
    ? pass(8, 'remote wiring: source materialised + revision-verified; VM release state built; non-destructive dry-run precedes and gates the irreversible reset')
    : fail(8, `remote wiring (mat=${materialise} rev=${revVerify} state=${releaseState} dry=${dryRun} gate=${resetGatedOnDryRun} order=${markerAfterProof})`);
}

console.log('');
if (failed) { console.error(`check-vm-execution-adapter: ${failed} check(s) FAILED`); process.exit(1); }
console.log('check-vm-execution-adapter: all checks passed');
