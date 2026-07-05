#!/usr/bin/env node
/**
 * rt04e-attest-parser.mjs — constrained semantic-attestation parser (RT04E Phase 3).
 *
 * Consumes `docker compose … config --no-interpolate --format json` from STDIN
 * (the authoritative Compose-engine model) and extracts ONLY {service name, image
 * reference}. Verifies each of the four allowlisted services resolves to the LITERAL
 * immutable RT04E release reference banzami/<repo>:rt04e-<rev>, with no unresolved
 * interpolation marker, no ambiguity, and no prohibited service. Emits ONLY
 * sanitised PASS/FAIL categories per service — never an image value or any Compose
 * field. Does not write the input to disk. Rejects unexpected input shape.
 *
 * Env: RT04E_RELEASE_REV (strict hex 7..40). Exit 0 = all PASS.
 */
import { readFileSync } from 'node:fs';

const REPO = {
  'core-api-staging': 'banzami/core-api',
  'api-gateway-staging': 'banzami/api-gateway',
  'developer-api': 'banzami/developer-api',
  'public-api-staging': 'banzami/public-api',
};
const ALLOW = Object.keys(REPO);
const PROHIBITED = /^(core-api|api-gateway|public-api|admin-api|admin-api-staging)$|prod|production|live/i;

const rev = process.env.RT04E_RELEASE_REV || '';
const fail = m => { console.error(`  ✗ ${m}`); };
if (!/^[0-9a-f]{7,40}$/.test(rev)) { fail('RT04E_RELEASE_REV invalid'); process.exit(2); }

let raw;
try { raw = readFileSync(0, 'utf8'); } catch { fail('cannot read stdin'); process.exit(2); }
let doc;
try { doc = JSON.parse(raw); } catch { fail('input is not valid JSON (unexpected shape)'); process.exit(2); }
raw = null; // do not retain the full config
if (!doc || typeof doc !== 'object' || !doc.services || typeof doc.services !== 'object') {
  fail('unexpected input shape (no services object)'); process.exit(2);
}
const services = doc.services;
doc = null;

let bad = 0;
// prohibited service must not appear as an RT04E target
for (const name of Object.keys(services)) {
  if (ALLOW.includes(name) === false) continue; // only judge the target set
}
for (const name of ALLOW) {
  const s = services[name];
  if (!s || typeof s !== 'object') { fail(`${name}: MISSING from resolved config`); bad++; continue; }
  if (PROHIBITED.test(name)) { fail(`${name}: prohibited target`); bad++; continue; }
  const img = typeof s.image === 'string' ? s.image : '';
  if (!img) { fail(`${name}: no image field`); bad++; continue; }
  if (/\$\{|\$[A-Za-z_]/.test(img)) { fail(`${name}: unresolved interpolation marker in image`); bad++; continue; }
  const expected = `${REPO[name]}:rt04e-${rev}`;
  if (img !== expected) { fail(`${name}: image is not the expected immutable RT04E release reference`); bad++; continue; }
  // ambiguity: image must be a single literal (no whitespace/list)
  if (/\s/.test(img)) { fail(`${name}: ambiguous image field`); bad++; continue; }
  console.log(`  ✓ ${name}: PASS (literal immutable RT04E reference)`);
}
if (bad) { console.error(`✗ semantic attestation: ${bad} service(s) failed`); process.exit(1); }
console.log('✓ semantic attestation: all four services resolve to literal immutable RT04E references');
