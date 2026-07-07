#!/usr/bin/env node
// Banzami Environment Blueprint — static validator for the attested service-image lab.
// Asserts the four-service allowlist, immutable/attested build contract, non-deploying
// inspection, secret-freedom and fail-closed cleanup — without building anything.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SL = resolve(ROOT, 'service-lab');
let failed = 0;
const pass = (n, m) => console.log(`  ✓ [${n}] ${m}`);
const fail = (n, m) => { console.error(`  ✗ [${n}] ${m}`); failed++; };
const read = p => readFileSync(p, 'utf8');
const orch = read(resolve(SL, 'scripts', 'service-image-lab.sh'));
const eviv = read(resolve(SL, 'scripts', 'validate-service-evidence.mjs'));

const FOUR = ['core-api-staging', 'api-gateway-staging', 'developer-api', 'public-api-staging'];
const FORBIDDEN = ['admin-api', 'admin-api-staging', 'website', 'banza-docs', 'banzai'];

// 1. exact four-service allowlist; no forbidden service
{
  const all = FOUR.every(s => orch.includes(s)) && FOUR.every(s => eviv.includes(s));
  const noForbidden = !FORBIDDEN.some(s => new RegExp(`ALLOWLIST[\\s\\S]*"${s}\\|`).test(orch));
  const enforced = /allow_ok "\$name" \|\| die "service .* not in approved allowlist"/.test(orch);
  (all && noForbidden && enforced) ? pass(1, 'exactly the four approved services allowlisted and enforced; no forbidden service') : fail(1, `allowlist (all=${all} noForbidden=${noForbidden} enforced=${enforced})`);
}
// 2. attested build: docker-container builder, SBOM + provenance, revision + service + run labels
{
  const ok = /--driver docker-container/.test(orch) && /--sbom=true/.test(orch) && /--provenance=mode=max/.test(orch)
    && /org\.opencontainers\.image\.revision=\$SOURCE_REVISION/.test(orch) && /\$LABEL\.service=\$name/.test(orch) && /\$LABEL\.run=\$RUNID/.test(orch);
  ok ? pass(2, 'attested build: docker-container builder, real SBOM + provenance, revision/service/run labels') : fail(2, 'attested build contract incomplete');
}
// 3. immutability: no :latest base accepted; run-scoped non-deployment tag; clean tree + full SHA
{
  const noLatest = /uses a mutable :latest base/.test(orch);
  const runTag = /svc_tag\(\) \{ echo "\$\{RUNID\}-\$1:local"/.test(orch);
  const clean = /worktree not clean/.test(orch); const sha = /revision not full SHA/.test(orch);
  (noLatest && runTag && clean && sha) ? pass(3, 'immutability: rejects :latest base, run-scoped non-deployment tag, clean tree + full SHA') : fail(3, `immutability (noLatest=${noLatest} runTag=${runTag} clean=${clean} sha=${sha})`);
}
// 4. no registry login/push, no source bundle, no secret build-arg
{
  const ok = !/docker login/.test(orch) && !/--push/.test(orch) && !/--build-arg .*(PASSWORD|SECRET|_URL=|TOKEN)/.test(orch);
  ok ? pass(4, 'no registry login/push, no secret build-arg') : fail(4, 'registry/secret build input present');
}
// 5. non-deploying inspection: network none, read-only, no secret/source mount, entrypoint overridden
{
  const ok = /docker run --rm --network none --read-only --tmpfs \/tmp --entrypoint sh/.test(orch)
    && /no_secret_env_or_label/.test(orch) && /history_no_credentials/.test(orch) && /service_binary_present/.test(orch)
    && /no_real_binding/.test(orch) && /no_migration_state/.test(orch)
    && !/-v .*secret/.test(orch);
  ok ? pass(5, 'inspection: network-none, read-only, entrypoint-overridden, secret/binding/migration-state checks, no secret mount') : fail(5, 'inspection contract incomplete');
}
// 6. evidence validator: allowlist + SBOM + provenance + revision/service linkage + immutable digest + secret-free
{
  const ok = /service_in_approved_allowlist/.test(eviv) && /sbom_present/.test(eviv) && /provenance_present/.test(eviv)
    && /revision_label_matches/.test(eviv) && /service_identity_label_matches/.test(eviv) && /image_immutable_digest/.test(eviv)
    && /sbom_no_secret/.test(eviv) && /provenance_no_secret/.test(eviv) && /provenance_records_immutable_materials/.test(eviv);
  ok ? pass(6, 'evidence validator: allowlist + SBOM + provenance + revision/service linkage + immutable digest + secret-free') : fail(6, 'evidence validator incomplete');
}
// 7. fail-closed cleanup: no global prune, guarded artroot, per-run builder/image removal, env cleared
{
  const ok = !/system prune|image prune|builder prune|volume prune|network prune/.test(orch)
    && /safe_rm_root/.test(orch) && /buildx rm "\$BUILDER"/.test(orch) && /^unset DOCKER_DEFAULT_PLATFORM/m.test(orch);
  ok ? pass(7, 'fail-closed cleanup: no global prune, guarded artroot, per-run builder/image removal, env cleared') : fail(7, 'cleanup not fail-closed');
}
// 8. no credential literal
{
  const CRED = /(postgres(ql)?|mysql):\/\/[^/\s"']+:[A-Za-z0-9]{6,}@|-----BEGIN [A-Z ]*PRIVATE KEY-----/i;
  (CRED.test(orch) || CRED.test(eviv)) ? fail(8, 'credential literal present') : pass(8, 'no credential literal in service-lab source');
}

console.log('');
if (failed) { console.error(`check-blueprint-service-images: ${failed} check(s) FAILED`); process.exit(1); }
console.log('check-blueprint-service-images: all checks passed');
