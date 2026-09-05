#!/usr/bin/env node
// Banzami Environment Blueprint — static validator for the verified Sandbox release package.
// Asserts the four-service allowlist, immutable/attested/secret-free build+manifest contract,
// verifiable source bundle, checksum set, and fail-closed cleanup — without building anything.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SB = resolve(ROOT, 'sandbox-ops');
let failed = 0;
const pass = (n, m) => console.log(`  ✓ [${n}] ${m}`);
const fail = (n, m) => { console.error(`  ✗ [${n}] ${m}`); failed++; };
const read = p => readFileSync(p, 'utf8');
const rp = read(resolve(SB, 'scripts', 'sandbox-release-package.sh'));
const exe = read(resolve(SB, 'scripts', 'operational-entrypoint.sh'));
const FOUR = ['core-api-staging', 'api-gateway-staging', 'developer-api', 'public-api-staging'];
// Unchanged by Banzami ADR-052. pay-frontend is authorised in the SANDBOX
// DEPLOY SET, which is a different topology from a release package: a package
// carries provenance-verified service images for the gated apply, and the
// hosted payer surface is built from source on the Sandbox server instead.
// Authorising a surface in one topology must not authorise it in every other.
const FORBIDDEN = ['admin-api', 'website', 'checkout', 'dashboard', 'pay-frontend', 'banzai', 'banza-docs'];

// 1. exactly the four approved services; forbidden services excluded + rejected
{
  const all = FOUR.every(s => rp.includes(s));
  const noForbidden = !FORBIDDEN.some(s => new RegExp(`SERVICES=\\([\\s\\S]*"${s}\\|`).test(rp));
  const rejects = /no_forbidden_service/.test(rp);
  (all && noForbidden && rejects) ? pass(1, 'exactly the four approved services; forbidden services excluded and rejected in verify') : fail(1, `allowlist (all=${all} noForbidden=${noForbidden} rejects=${rejects})`);
}
// 2. verified immutable source transfer (git bundle create + verify) bound to full SHA
{
  const bundle = /git bundle create "\$RELEASE_ROOT\/source\.bundle" HEAD/.test(rp) && /git bundle verify/.test(rp);
  const sha = /revision not full SHA/.test(rp) && /revision_bound_full_sha/.test(rp);
  (bundle && sha) ? pass(2, 'verified git-bundle source transfer, bound to the full 40-char revision') : fail(2, 'source-transfer contract incomplete');
}
// 3. attested images: runner handoff + oci-layout executor + 4 services, SBOM + provenance
{
  const runner = /\$RUNNER_LAB" build/.test(rp) && /\$RUNNER_LAB" verify/.test(rp);
  const exec = /base-runner=oci-layout:\/\/\$RUNNER_OCI@\$PARENT_DIGEST/.test(rp);
  const attest = /--sbom=true/.test(rp) && /--provenance=mode=max/.test(rp);
  (runner && exec && attest) ? pass(3, 'attested runner handoff + oci-layout operational executor + 4 services, real SBOM + provenance') : fail(3, 'attested build contract incomplete');
}
// 4. manifest binds every immutable identity
{
  const b = /source_revision=/.test(rp) && /executor\.image_digest=/.test(rp) && /executor\.parent_runner_digest=/.test(rp)
    && /executor\.migrations_digest=/.test(rp) && /service\.\$name\.image_digest=/.test(rp) && /service\.\$name\.dockerfile_digest=/.test(rp);
  b ? pass(4, 'manifest binds source revision, service + executor image digests, dockerfile + parent + migration digests') : fail(4, 'manifest bindings incomplete');
}
// 5. verify enforces digest-match, checksum-match, no mutable/placeholder, secret-free
{
  const ok = /digest_matches_manifest/.test(rp) && /checksums_match/.test(rp) && /no_mutable_or_placeholder/.test(rp) && /secret_free/.test(rp) && /sbom_provenance_valid/.test(rp);
  ok ? pass(5, 'verify enforces per-image digest match, checksum match, no mutable/placeholder, SBOM/provenance, secret-free') : fail(5, 'verify contract incomplete');
}
// 6. operational executor entrypoint: banzami_staging-only, internal host, no legacy path, file-only
{
  const target = /\[ "\$_db" = banzami_staging \]/.test(exe) && /\[ "\$_host" = postgres \]/.test(exe);
  const rejects = /banzami_live\*\|\*production\*\|\*prod\*\|\*live\*/.test(exe);
  const lock = /pg_try_advisory_lock/.test(exe) && /LOCK_FIFO/.test(exe);
  const fileOnly = /SECRET_FILE="\/run\/secrets\/rt04e_migration_url"/.test(exe) && /DATABASE_URL must NOT be provided via environment/.test(exe);
  const noLegacy = !/rt04e-secure-rollout|rt04e-migration-checkpoint/.test(exe);
  (target && rejects && lock && fileOnly && noLegacy) ? pass(6, 'operational executor: banzami_staging + internal host only, forbidden-env rejection, advisory lock, file-only secret, no legacy path') : fail(6, `executor (target=${target} reject=${rejects} lock=${lock} file=${fileOnly} noLegacy=${noLegacy})`);
}
// 7. fail-closed cleanup + no credential literal + no VM contact
{
  const noPrune = !/system prune|image prune|builder prune|volume prune|network prune/.test(rp);
  const guarded = /safe_rm_root/.test(rp);
  const noVm = !/217\.160\.9\.248|ssh /.test(rp) && !/217\.160\.9\.248|ssh /.test(exe);
  const CRED = /(postgres(ql)?|mysql):\/\/[^/\s"']+:[A-Za-z0-9]{6,}@|-----BEGIN [A-Z ]*PRIVATE KEY-----/i;
  (noPrune && guarded && noVm && !CRED.test(rp) && !CRED.test(exe)) ? pass(7, 'fail-closed cleanup, no VM contact, no credential literal') : fail(7, 'cleanup/secret/VM contract incomplete');
}

console.log('');
if (failed) { console.error(`check-sandbox-release-package: ${failed} check(s) FAILED`); process.exit(1); }
console.log('check-sandbox-release-package: all checks passed');
