#!/usr/bin/env node
// Banzami Increment 2D — derived-executor SBOM + provenance + identity-linkage validator.
// Parses the derived image's OCI layout and proves its own attestation and immutable
// identity linkage. Emits only sanitised PASS/FAIL lines.
// Usage: validate-derived-evidence.mjs <derived-oci-dir> <source-sha> <parent-digest> <migrations-digest> <derived-tag>

import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const [oci, sha, parentDigest, migDigest] = process.argv.slice(2);
let failed = 0;
const pass = n => console.log(`  ✓ EVIDENCE ${n.padEnd(36)} PASS`);
const fail = (n, m) => { console.error(`  ✗ EVIDENCE ${n.padEnd(36)} FAIL${m ? ' — ' + m : ''}`); failed++; };
const blob = d => JSON.parse(readFileSync(join(oci, 'blobs', d.split(':')[0], d.split(':')[1]), 'utf8'));
const top = JSON.parse(readFileSync(resolve(oci, 'index.json'), 'utf8'));

// walk to image manifest(s) + attestation manifest(s)
let mans = [];
const visit = d => { const mt = d.mediaType || '';
  if (mt.includes('image.index')) blob(d.digest).manifests.forEach(visit);
  else if (mt.includes('image.manifest')) mans.push(d); };
top.manifests.forEach(visit);
const att = mans.filter(m => (m.annotations || {})['vnd.docker.reference.type'] === 'attestation-manifest');
const img = mans.filter(m => (m.annotations || {})['vnd.docker.reference.type'] !== 'attestation-manifest');

img.length ? pass('derived_image_manifest_present') : fail('derived_image_manifest_present');
att.length ? pass('derived_attestation_manifest_present') : fail('derived_attestation_manifest_present');

// derived image config labels = own identity linkage
let labels = {};
try { const cfg = blob(blob(img[0].digest).config.digest); labels = (cfg.config && cfg.config.Labels) || {}; } catch { /* */ }
labels['org.opencontainers.image.revision'] === sha ? pass('label_source_revision_matches') : fail('label_source_revision_matches');
labels['com.banzami.blueprint.migration-identity.parent-digest'] === parentDigest ? pass('label_parent_digest_matches') : fail('label_parent_digest_matches', 'parent digest mismatch/tag-only');
labels['com.banzami.blueprint.migration-identity.migrations-digest'] === migDigest ? pass('label_embedded_migration_digest_matches') : fail('label_embedded_migration_digest_matches');
/^sha256:[0-9a-f]{64}$/.test(parentDigest || '') ? pass('parent_digest_is_immutable_content_digest') : fail('parent_digest_is_immutable_content_digest');
(labels['com.banzami.blueprint.migration-identity.dockerfile-digest'] || '').length === 64 ? pass('label_dockerfile_material_present') : fail('label_dockerfile_material_present');

// gather in-toto predicates
const preds = [];
for (const a of att) { let m; try { m = blob(a.digest); } catch { continue; }
  for (const l of m.layers || []) if ((l.mediaType || '').includes('in-toto')) {
    const t = (l.annotations || {})['in-toto.io/predicate-type'] || '';
    try { preds.push({ t, s: blob(l.digest) }); } catch { /* */ } } }
const sbom = preds.filter(p => /spdx/i.test(p.t));
const prov = preds.filter(p => /provenance|slsa/i.test(p.t));
const SECRET = /(postgres(ql)?|mysql):\/\/[^/\s"]+:[^@\s"]+@|-----BEGIN [A-Z ]*PRIVATE KEY|POSTGRES_PASSWORD=\S|DATABASE_URL=[A-Za-z]/i;

if (!sbom.length) fail('derived_sbom_present', 'no SPDX'); else {
  pass('derived_sbom_present');
  const doc = sbom.map(p => p.s.predicate).find(Boolean) || {};
  const serial = JSON.stringify(sbom.map(p => p.s));
  (doc.spdxVersion || doc.SPDXID) && Array.isArray(doc.packages) && doc.packages.length ? pass('derived_sbom_valid_spdx') : fail('derived_sbom_valid_spdx');
  SECRET.test(serial) ? fail('derived_sbom_no_secret') : pass('derived_sbom_no_secret');
}
if (!prov.length) fail('derived_provenance_present', 'no SLSA'); else {
  pass('derived_provenance_present');
  const serial = JSON.stringify(prov.map(p => p.s));
  const pred = prov.map(p => p.s.predicate).find(Boolean) || {};
  (pred.buildType || pred.builder || pred.buildDefinition || pred.runDetails) ? pass('derived_provenance_valid') : fail('derived_provenance_valid');
  serial.includes(sha) ? pass('derived_provenance_contains_revision') : fail('derived_provenance_contains_revision');
  serial.includes(parentDigest) ? pass('derived_provenance_links_parent_digest') : fail('derived_provenance_links_parent_digest');
  SECRET.test(serial) ? fail('derived_provenance_no_secret') : pass('derived_provenance_no_secret');
}

console.log('');
if (failed) { console.error(`validate-derived-evidence: ${failed} FAILED`); process.exit(1); }
console.log('validate-derived-evidence: all derived-evidence checks passed');
