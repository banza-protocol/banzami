#!/usr/bin/env node
// Banzami Environment Blueprint — attested service-image evidence validator.
// Parses a service image's OCI layout and proves real SBOM + provenance, source-revision
// and service-identity linkage, and secret-freedom. Emits sanitised PASS/FAIL only.
// Usage: validate-service-evidence.mjs <oci-dir> <source-sha> <service-name>

import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const [oci, sha, service] = process.argv.slice(2);
const APPROVED = ['core-api-staging', 'api-gateway-staging', 'developer-api', 'public-api-staging'];
let failed = 0;
const pass = n => console.log(`  ✓ EVIDENCE ${n.padEnd(34)} PASS`);
const fail = (n, m) => { console.error(`  ✗ EVIDENCE ${n.padEnd(34)} FAIL${m ? ' — ' + m : ''}`); failed++; };
const blob = d => JSON.parse(readFileSync(join(oci, 'blobs', d.split(':')[0], d.split(':')[1]), 'utf8'));

APPROVED.includes(service) ? pass('service_in_approved_allowlist') : fail('service_in_approved_allowlist', service);

const top = JSON.parse(readFileSync(resolve(oci, 'index.json'), 'utf8'));
let mans = [];
const visit = d => { const mt = d.mediaType || '';
  if (mt.includes('image.index')) blob(d.digest).manifests.forEach(visit);
  else if (mt.includes('image.manifest')) mans.push(d); };
top.manifests.forEach(visit);
const att = mans.filter(m => (m.annotations || {})['vnd.docker.reference.type'] === 'attestation-manifest');
const img = mans.filter(m => (m.annotations || {})['vnd.docker.reference.type'] !== 'attestation-manifest');
img.length ? pass('image_manifest_present') : fail('image_manifest_present');
att.length ? pass('attestation_manifest_present') : fail('attestation_manifest_present');

// image is content-addressed (immutable digest) + revision label
img.length && /^sha256:[0-9a-f]{64}$/.test(img[0].digest) ? pass('image_immutable_digest') : fail('image_immutable_digest');
let labels = {};
try { labels = (blob(blob(img[0].digest).config.digest).config || {}).Labels || {}; } catch { /* */ }
labels['org.opencontainers.image.revision'] === sha ? pass('revision_label_matches') : fail('revision_label_matches');
labels['com.banzami.blueprint.service-lab.service'] === service ? pass('service_identity_label_matches') : fail('service_identity_label_matches');

// in-toto predicates
const preds = [];
for (const a of att) { let m; try { m = blob(a.digest); } catch { continue; }
  for (const l of m.layers || []) if ((l.mediaType || '').includes('in-toto')) {
    const t = (l.annotations || {})['in-toto.io/predicate-type'] || '';
    try { preds.push({ t, s: blob(l.digest) }); } catch { /* */ } } }
const sbom = preds.filter(p => /spdx/i.test(p.t));
const prov = preds.filter(p => /provenance|slsa/i.test(p.t));
const SECRET = /(postgres(ql)?|mysql):\/\/[^/\s"]+:[^@\s"]+@|-----BEGIN [A-Z ]*PRIVATE KEY|POSTGRES_PASSWORD=\S|DATABASE_URL=[A-Za-z]|217\.160\.9\.248/i;

if (!sbom.length) fail('sbom_present', 'no SPDX'); else {
  pass('sbom_present');
  const doc = sbom.map(p => p.s.predicate).find(Boolean) || {};
  const serial = JSON.stringify(sbom.map(p => p.s));
  (doc.spdxVersion || doc.SPDXID) && Array.isArray(doc.packages) && doc.packages.length ? pass('sbom_valid_spdx') : fail('sbom_valid_spdx');
  SECRET.test(serial) ? fail('sbom_no_secret') : pass('sbom_no_secret');
}
if (!prov.length) fail('provenance_present', 'no SLSA'); else {
  pass('provenance_present');
  const serial = JSON.stringify(prov.map(p => p.s));
  const pred = prov.map(p => p.s.predicate).find(Boolean) || {};
  (pred.buildType || pred.builder || pred.buildDefinition || pred.runDetails) ? pass('provenance_valid') : fail('provenance_valid');
  serial.includes(sha) ? pass('provenance_contains_revision') : fail('provenance_contains_revision');
  // provenance records immutable base-image materials (resolved digests)
  /sha256:[0-9a-f]{64}/.test(serial) ? pass('provenance_records_immutable_materials') : fail('provenance_records_immutable_materials');
  SECRET.test(serial) ? fail('provenance_no_secret') : pass('provenance_no_secret');
}

console.log('');
if (failed) { console.error(`validate-service-evidence[${service}]: ${failed} FAILED`); process.exit(1); }
console.log(`validate-service-evidence[${service}]: all checks passed`);
