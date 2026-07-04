#!/usr/bin/env node
/**
 * generate-assurance-doc.mjs
 *
 * Generates docs/quality/BANZAMI_OPERATOR_ASSURANCE.md from the canonical
 * manifest (quality/operator-assurance-manifest.yaml). Never edit the
 * generated document by hand — the manifest is authoritative.
 *
 * Usage:
 *   node tools/generate-assurance-doc.mjs            # write the doc
 *   node tools/generate-assurance-doc.mjs --stdout   # print (used by checker)
 */

import { writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { parseManifest, MANIFEST_PATH } from './assurance-manifest-lib.mjs';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const OUT = join(ROOT, 'docs/quality/BANZAMI_OPERATOR_ASSURANCE.md');

const { meta, capabilities } = parseManifest(ROOT);

const counts = {};
for (const c of capabilities) counts[c.status] = (counts[c.status] || 0) + 1;

const lines = [];
const P = s => lines.push(s);

P('<!-- GENERATED FILE — DO NOT EDIT. -->');
P(`<!-- Source of truth: ${MANIFEST_PATH} · regenerate: node tools/generate-assurance-doc.mjs -->`);
P('');
P('# Banzami Operator Assurance');
P('');
P('> **This document is generated.** The canonical, machine-readable source of');
P(`> truth is [\`${MANIFEST_PATH}\`](../../${MANIFEST_PATH}).`);
P('> Capability status must never be edited here or duplicated elsewhere.');
P('');
P(`Programme: **${meta.programme || 'n/a'}** · manifest updated: ${meta.updated || 'n/a'}`);
P('');
P('## Status summary');
P('');
P('| Status | Count |');
P('|---|---|');
for (const [k, v] of Object.entries(counts).sort()) P(`| ${k} | ${v} |`);
P(`| **total** | **${capabilities.length}** |`);
P('');
P('## Capabilities');
P('');
P('| ID | Name | Owner | Surface | Disposition | Sandbox | Live | Gate | Status |');
P('|---|---|---|---|---|---|---|---|---|');
for (const c of capabilities) {
  P(`| ${c.id} | ${c.name} | ${c.owner} | ${c.surface || '—'} | **${c.disposition || '—'}** | ${c.environments.sandbox ? '✅' : '—'} | ${c.environments.live ? '⚠️ yes' : '🔒 no'} | ${c.deployment_gate} | ${c.status} |`);
}
P('');
P('## External-Sandbox disposition summary');
P('');
const byDisp = {};
for (const c of capabilities) byDisp[c.disposition || 'unset'] = (byDisp[c.disposition || 'unset'] || 0) + 1;
P('| Disposition | Count |');
P('|---|---|');
for (const [k, v] of Object.entries(byDisp).sort()) P(`| ${k} | ${v} |`);
const pubReleased = capabilities.filter(c => c.surface === 'public' && c.disposition === 'released').length;
const pubTotal = capabilities.filter(c => c.surface === 'public').length;
P('');
P(`Public surfaces released: **${pubReleased}/${pubTotal}**. Full external launch requires ${pubTotal}/${pubTotal}.`);
P('');
P('## Detail');
P('');
for (const c of capabilities) {
  P(`### ${c.id} — ${c.name}`);
  P('');
  P(`- **Owner:** ${c.owner}`);
  P(`- **Public status:** ${c.public_status} · **Sandbox:** ${c.environments.sandbox} · **Live:** ${c.environments.live}`);
  P(`- **Authority:** ${c.authority} — ${c.authority_ref}`);
  P(`- **Threat category:** ${c.threat_category}`);
  P(`- **Implementation:** ${c.implementation.join(', ') || '—'}`);
  P(`- **API/UI surface:** ${c.api_surface.join(', ') || '—'}`);
  P(`- **Deployment gate:** ${c.deployment_gate}`);
  P(`- **Tests:** unit [${c.tests.unit.join(', ')}] · integration [${c.tests.integration.join(', ')}] · e2e_sandbox [${c.tests.e2e_sandbox.join(', ')}] · negative/security [${c.tests.negative_security.join(', ')}]`);
  P(`- **Evidence:** ${c.evidence.join(', ') || '—'}`);
  P(`- **Cleanup disposition:** ${c.cleanup_disposition}`);
  P(`- **External surface:** ${c.surface || '—'} · **Disposition:** **${c.disposition || '—'}**${(c.reference_path === 'true' || c.reference_path === true) ? ' · reference-path' : ''}`);
  P(`- **Launch scope:** ${c.launch_scope || 'sandbox'}`);
  P(`- **Status:** **${c.status}**`);
  P('');
}
P('---');
P('');
P('Registration rule: every new material capability MUST be added to the');
P('manifest with tests, gate and evidence before release.');
P('Enforced by `tools/check-assurance-manifest.mjs` (`make check-assurance`).');

const out = lines.join('\n') + '\n';
if (process.argv.includes('--stdout')) {
  process.stdout.write(out);
} else {
  writeFileSync(OUT, out);
  console.log(`Generated ${OUT} (${capabilities.length} capabilities)`);
}
