#!/usr/bin/env node
// Banzami Environment Blueprint — static validator for the Increment 2B build lab.
//
// Reproducible, no-Docker static gate over the build-lab source: it asserts the
// immutable-build, attestation, non-migrating-inspection, secret-hygiene and
// fail-closed-cleanup properties WITHOUT building anything. The real build,
// attestation and inspection are proven by runner-build-lab.sh execution.

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BL = resolve(ROOT, 'build-lab');
let failed = 0;
const pass = (n, m) => console.log(`  ✓ [${n}] ${m}`);
const fail = (n, m) => { console.error(`  ✗ [${n}] ${m}`); failed++; };
const read = p => readFileSync(p, 'utf8');

const orch = read(resolve(BL, 'scripts', 'runner-build-lab.sh'));
const eviv = read(resolve(BL, 'scripts', 'validate-evidence.mjs'));

// 1. builds via a docker-container BuildKit builder (attestation-capable)
/--driver docker-container/.test(orch) ? pass(1, 'uses docker-container BuildKit builder (attestation-capable)') : fail(1, 'no docker-container builder');

// 2. real SBOM + provenance attestations requested
(/--sbom=true/.test(orch) && /--provenance=mode=max/.test(orch)) ? pass(2, 'requests real SBOM + max provenance attestations') : fail(2, 'attestations not requested');

// 3. no silent downgrade: capability check HOLDs on missing buildx/attestation
(/HOLD — LOCAL BUILDX ATTESTATION SUPPORT NOT AVAILABLE/.test(orch) && /HOLD — LOCAL DOCKER RUNTIME NOT AVAILABLE/.test(orch)) ? pass(3, 'fail-closed capability HOLDs present') : fail(3, 'missing HOLD conditions');

// 4. immutable build contract: clean worktree, full SHA, digest-pinned bases, sqlx cross-check
{
  const clean = /git status --porcelain.*refusing build|worktree not clean/.test(orch);
  const fullsha = /-eq 40 .*full 40-char SHA|not a full 40-char SHA/.test(orch);
  const digest = /@sha256:\*\).*:.*die "rust_builder|not digest-pinned/.test(orch);
  const sqlx = /!= locked sqlx/.test(orch);
  (clean && fullsha && digest && sqlx) ? pass(4, 'immutable build contract enforced (clean tree, full SHA, digest bases, sqlx cross-check)') : fail(4, `build contract incomplete (clean=${clean} sha=${fullsha} digest=${digest} sqlx=${sqlx})`);
}

// 5. no registry login / credentials in the build
(!/docker login/.test(orch) && !/--push/.test(orch)) ? pass(5, 'no registry login and no push') : fail(5, 'registry login or push present');

// 6. OCI output to a temp root outside the repo, tagged with the run identity
(/type=oci,tar=false,dest=\$OCI_DIR,name=\$IMAGE_TAG/.test(orch) && /IMAGE_TAG="\$\{RUNID\}:local"/.test(orch)) ? pass(6, 'OCI artefact to temp root, tag carries run identity') : fail(6, 'OCI output/tag not run-scoped');

// 7. non-migrating inspection: network none, read-only, entrypoint overridden, no secret mount
{
  const netnone = /docker run --rm --network none --read-only/.test(orch);
  const noEntry = /--entrypoint sh/.test(orch);
  const noMigrate = !/sqlx migrate|migrate run/.test(orch);
  const noSecretMount = !/-v .*secret|--mount.*secret|\/run\/secrets/.test(orch);
  (netnone && noEntry && noMigrate && noSecretMount) ? pass(7, 'inspection is network-none, read-only, entrypoint-overridden, no secret mount, non-migrating') : fail(7, `inspection controls incomplete (net=${netnone} entry=${noEntry} nomig=${noMigrate} nosecret=${noSecretMount})`);
}

// 8. fail-closed cleanup: no global prune; guarded artroot; per-run builder/image/container removal
{
  const noPrune = !/system prune|image prune|builder prune|volume prune|network prune/.test(orch);
  const guarded = /safe_rm_artroot/.test(orch) && /refusing artroot removal/.test(orch);
  const scoped = /buildx rm "\$BUILDER"/.test(orch) && /image rm -f "\$IMAGE_TAG"/.test(orch) && /label=\$LABEL\.runid=\$RUNID/.test(orch);
  (noPrune && guarded && scoped) ? pass(8, 'cleanup fail-closed: no global prune, guarded artroot, per-run builder/image/container removal') : fail(8, `cleanup incomplete (noPrune=${noPrune} guarded=${guarded} scoped=${scoped})`);
}

// 9. uncontrolled env overrides cleared (fail-closed authority)
(/^unset /m.test(orch) && /BZRUNNER_BUILDER BZRUNNER_ARTROOT BZRUNNER_TAG/.test(orch)) ? pass(9, 'uncontrolled env overrides cleared') : fail(9, 'env overrides not cleared');

// 10. no credential literal in build-lab source
{
  const CRED = /(postgres(ql)?|mysql):\/\/[^/\s"']+:[^@\s"']+@|-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(password|secret|token)\b[^\n:=]{0,12}[:=]\s*['"][A-Za-z0-9+/=]{10,}/i;
  (!CRED.test(orch) && !CRED.test(eviv)) ? pass(10, 'no credential literal in build-lab source') : fail(10, 'credential-like literal present');
}

// 11. evidence validator checks both SBOM and provenance for secrets + required content
{
  const sbom = /sbom_valid_spdx_document/.test(eviv) && /sbom_has_sqlx_evidence/.test(eviv) && /sbom_no_secret/.test(eviv);
  const prov = /provenance_contains_full_revision/.test(eviv) && /provenance_agrees_base_digests/.test(eviv) && /provenance_no_secret/.test(eviv);
  (sbom && prov) ? pass(11, 'evidence validator asserts SBOM + provenance content and secret-freedom') : fail(11, 'evidence validator incomplete');
}

console.log('');
if (failed) { console.error(`check-blueprint-runner-build: ${failed} check(s) FAILED`); process.exit(1); }
console.log('check-blueprint-runner-build: all checks passed');
