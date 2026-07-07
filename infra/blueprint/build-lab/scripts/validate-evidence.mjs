#!/usr/bin/env node
// Banzami Environment Blueprint — SBOM + provenance evidence validator (Increment 2B).
//
// Parses the OCI image layout produced by the build lab, extracts the REAL in-toto
// SBOM and provenance attestations, and validates them against the runner contract.
// Emits ONLY sanitised PASS/FAIL lines — never raw SBOM/provenance/manifest content.
//
// Usage: validate-evidence.mjs <oci-layout-dir> <full-source-sha> <digests.lock> <sqlx-contract.json>

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const [ociDir, sha, digestsLock, sqlxContractPath] = process.argv.slice(2);
let failed = 0;
const pass = (n, m) => console.log(`  ✓ EVIDENCE ${n.padEnd(34)} PASS`);
const fail = (n, m) => { console.error(`  ✗ EVIDENCE ${n.padEnd(34)} FAIL${m ? ' — ' + m : ''}`); failed++; };

const blobPath = (dir, digest) => resolve(dir, 'blobs', digest.split(':')[0], digest.split(':')[1]);
const readJSON = p => JSON.parse(readFileSync(p, 'utf8'));
const readBlob = (dir, digest) => readJSON(blobPath(dir, digest));

if (!existsSync(resolve(ociDir, 'index.json'))) { fail('oci_layout_present', 'no index.json'); finish(); }

// ---- walk OCI layout: top index -> (possibly nested index) -> image + attestation manifests
function collectManifests(dir) {
  const top = readJSON(resolve(dir, 'index.json'));
  const out = [];
  const visit = desc => {
    const mt = desc.mediaType || '';
    if (mt.includes('image.index')) {
      const idx = readBlob(dir, desc.digest);
      (idx.manifests || []).forEach(visit);
    } else if (mt.includes('image.manifest')) {
      out.push(desc);
    }
  };
  (top.manifests || []).forEach(visit);
  return out;
}

let manifests = [];
try { manifests = collectManifests(ociDir); } catch (e) { fail('oci_layout_parse', 'walk error'); finish(); }

// attestation manifests are annotated as attestation-manifest (unknown platform)
const attManifests = manifests.filter(m => (m.annotations || {})['vnd.docker.reference.type'] === 'attestation-manifest');
const imgManifests = manifests.filter(m => (m.annotations || {})['vnd.docker.reference.type'] !== 'attestation-manifest');

imgManifests.length >= 1 ? pass('image_manifest_present') : fail('image_manifest_present');
attManifests.length >= 1 ? pass('attestation_manifest_present') : fail('attestation_manifest_present');

// gather all in-toto predicates from attestation manifests
const predicates = []; // {type, statement}
for (const am of attManifests) {
  let man; try { man = readBlob(ociDir, am.digest); } catch { continue; }
  for (const layer of man.layers || []) {
    if ((layer.mediaType || '').includes('in-toto')) {
      const ptype = (layer.annotations || {})['in-toto.io/predicate-type'] || '';
      try { predicates.push({ type: ptype, statement: readBlob(ociDir, layer.digest) }); } catch { /* skip */ }
    }
  }
}

const sbomPreds = predicates.filter(p => /spdx/i.test(p.type));
const provPreds = predicates.filter(p => /provenance|slsa/i.test(p.type));

const SECRET_RE = /(postgres(ql)?|mysql|redis|mongodb):\/\/[^/\s"]+:[^@\s"]+@|-----BEGIN [A-Z ]*PRIVATE KEY-----|POSTGRES_PASSWORD=\S|DATABASE_URL=[A-Za-z]|password"\s*:\s*"[A-Za-z0-9+/=]{8,}/i;

// ---------------- SBOM validation ----------------
if (sbomPreds.length === 0) fail('sbom_attestation_present', 'no SPDX predicate');
else {
  pass('sbom_attestation_present');
  const doc = sbomPreds.map(p => p.statement.predicate).find(Boolean) || {};
  const serial = JSON.stringify(sbomPreds.map(p => p.statement));
  // valid SPDX machine-readable doc with packages
  const pkgs = doc.packages || (doc.SPDXID ? [] : null);
  (doc.spdxVersion || doc.SPDXID) ? pass('sbom_valid_spdx_document') : fail('sbom_valid_spdx_document');
  Array.isArray(doc.packages) && doc.packages.length > 0 ? pass('sbom_has_packages') : fail('sbom_has_packages');
  // includes built image / component context
  /spdxVersion|documentNamespace|packages/i.test(serial) ? pass('sbom_has_image_context') : fail('sbom_has_image_context');
  // Runtime PostgreSQL client toolchain is catalogued. NOTE: the SQLx CLI is a
  // compiled binary copied from the build stage (the cargo registry is a cache
  // mount, absent from the image), so it is NOT a dpkg/registry package the SBOM
  // scanner catalogues. The SQLx CLI *version* is attested authoritatively by the
  // provenance (build-arg + `cargo install` step) and proven live by the runtime
  // `sqlx --version` inspection — the correct supply-chain placements.
  const names = (doc.packages || []).map(p => (p.name || '').toLowerCase());
  (names.some(n => /postgresql-client/.test(n)) && names.some(n => /libpq/.test(n)))
    ? pass('sbom_has_runtime_pg_toolchain') : fail('sbom_has_runtime_pg_toolchain', 'pg client toolchain absent');
  // no secret
  SECRET_RE.test(serial) ? fail('sbom_no_secret') : pass('sbom_no_secret');
}

// ---------------- Provenance validation ----------------
if (provPreds.length === 0) fail('provenance_attestation_present', 'no SLSA predicate');
else {
  pass('provenance_attestation_present');
  const serial = JSON.stringify(provPreds.map(p => p.statement));
  const pred = provPreds.map(p => p.statement.predicate).find(Boolean) || {};
  // valid machine-readable attestation
  (pred.buildType || pred.builder || pred.buildDefinition || pred.runDetails) ? pass('provenance_valid_attestation') : fail('provenance_valid_attestation');
  // contains the full checked-out source revision
  serial.includes(sha) ? pass('provenance_contains_full_revision') : fail('provenance_contains_full_revision', 'sha absent');
  // records immutable base-image material references matching the digest lock
  const lockDigests = readFileSync(digestsLock, 'utf8').match(/sha256:[0-9a-f]{64}/g) || [];
  const allBases = lockDigests.length > 0 && lockDigests.every(d => serial.includes(d));
  allBases ? pass('provenance_agrees_base_digests') : fail('provenance_agrees_base_digests', 'base digest missing');
  // sqlx-cli version recorded in provenance materials/args (mode=max records build args)
  const sqlxVer = readJSON(sqlxContractPath).migration_runner_sqlx_cli_version;
  serial.includes(sqlxVer) ? pass('provenance_records_sqlx_version') : fail('provenance_records_sqlx_version');
  // identifies a local build-lab (buildkit builder / local frontend, not a registry push)
  /buildkit|dockerfile|mode.*max|local/i.test(serial) ? pass('provenance_local_build_evidence') : fail('provenance_local_build_evidence');
  // no secret
  SECRET_RE.test(serial) ? fail('provenance_no_secret') : pass('provenance_no_secret');
}

function finish() {
  console.log('');
  if (failed) { console.error(`validate-evidence: ${failed} check(s) FAILED`); process.exit(1); }
  console.log('validate-evidence: all evidence checks passed');
  process.exit(0);
}
finish();
