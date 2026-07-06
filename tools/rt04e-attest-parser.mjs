#!/usr/bin/env node
/**
 * rt04e-attest-parser.mjs — constrained semantic-attestation parser (RT04E).
 *
 * Consumes `docker compose … config --no-interpolate --no-env-resolution --format
 * json` from STDIN (the authoritative Compose-engine model) and extracts ONLY
 * {service name, image reference}. Emits ONLY sanitised PASS/FAIL categories per
 * service — never an image value, an env value, a host/URL/port or any Compose
 * field. Does not write the input to disk. Rejects unexpected input shape (exit 2).
 *
 * Two projections (RT04E_PROJECTION):
 *   base : approved base ONLY. Verifies the three base services exist, that
 *          api-gateway-staging does NOT exist (overlay-only proof), and that no
 *          prohibited service is selected. No image assertion (override not applied).
 *   full : base → gateway overlay → immutable override. Verifies all four services
 *          exist, api-gateway-staging is present, each resolves to the LITERAL
 *          immutable reference banzami/<repo>:rt04e-<full-sha>, with no unresolved
 *          interpolation marker, no ambiguity and no prohibited service.
 *
 * Env: RT04E_RELEASE_REV (full 40-hex sha), RT04E_PROJECTION (base|full). Exit 0 = PASS.
 */
import { readFileSync } from 'node:fs';

const REPO = {
  'core-api-staging': 'banzami/core-api',
  'api-gateway-staging': 'banzami/api-gateway',
  'developer-api': 'banzami/developer-api',
  'public-api-staging': 'banzami/public-api',
};
const BASE_SERVICES = ['core-api-staging', 'public-api-staging', 'developer-api'];
const OVERLAY_SERVICE = 'api-gateway-staging';
const ALLOW = Object.keys(REPO);
const PROHIBITED = /^(core-api|api-gateway|public-api|admin-api|admin-api-staging)$|prod|production|live/i;

const rev = process.env.RT04E_RELEASE_REV || '';
const projection = process.env.RT04E_PROJECTION || '';
const fail = m => { console.error(`  ✗ ${m}`); };

// FULL immutable canonical SHA only — exactly 40 lowercase hex. Rejects abbreviated
// revisions, branch names, tags and symbolic refs.
if (!/^[0-9a-f]{40}$/.test(rev)) { fail('RT04E_RELEASE_REV is not a full 40-hex canonical SHA'); process.exit(2); }
if (projection !== 'base' && projection !== 'full') { fail('RT04E_PROJECTION must be base|full'); process.exit(2); }

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
const names = Object.keys(services);

let bad = 0;

// No prohibited service may be selected in EITHER projection.
for (const name of names) {
  if (PROHIBITED.test(name)) { fail(`${name}: prohibited service present in projection`); bad++; }
}

if (projection === 'base') {
  // Base services must exist; the overlay service must be ABSENT (overlay-only proof).
  for (const name of BASE_SERVICES) {
    const s = services[name];
    if (!s || typeof s !== 'object') { fail(`${name}: MISSING from base projection`); bad++; }
  }
  if (Object.prototype.hasOwnProperty.call(services, OVERLAY_SERVICE)) {
    fail(`${OVERLAY_SERVICE}: present in base projection (must be overlay-only)`); bad++;
  }
  if (bad) { console.error(`✗ base projection: ${bad} failure(s)`); process.exit(1); }
  console.log('✓ base projection: base services present · gateway overlay-only · no prohibited service');
  process.exit(0);
}

// projection === 'full'
for (const name of ALLOW) {
  const s = services[name];
  if (!s || typeof s !== 'object') { fail(`${name}: MISSING from full composition`); bad++; continue; }
  const img = typeof s.image === 'string' ? s.image : '';
  if (!img) { fail(`${name}: no image field`); bad++; continue; }
  if (/\$\{|\$[A-Za-z_]/.test(img)) { fail(`${name}: unresolved interpolation marker in image`); bad++; continue; }
  if (/\s/.test(img)) { fail(`${name}: ambiguous image field`); bad++; continue; }
  const expected = `${REPO[name]}:rt04e-${rev}`;
  if (img !== expected) { fail(`${name}: image is not the expected immutable RT04E release reference`); bad++; continue; }
  console.log(`  ✓ ${name}: PASS (literal immutable RT04E reference)`);
}
if (bad) { console.error(`✗ full projection: ${bad} service(s) failed`); process.exit(1); }
console.log('✓ full projection: all four services resolve to literal immutable RT04E references');
