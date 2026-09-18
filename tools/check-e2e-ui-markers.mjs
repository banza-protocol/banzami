#!/usr/bin/env node
/**
 * check-e2e-ui-markers — a negative assertion whose subject does not exist
 * proves nothing, and says PASS.
 *
 * Banzami Validation Studio (BANZAMI-SANDBOX-FULL-VALIDATION-001, Phase D).
 *
 * Twice in one session an E2E gate passed because the thing it looked for was
 * gone from the product:
 *
 *   proof 17  asserted no 'Carteira Banzami Business' text leaked into the
 *             Consumer tab. The product had renamed that string to 'Painel de
 *             negócio', so the isolation check could never fail again.
 *   proof 14  resolved a torn-down Receive Point slug through SQL that silently
 *             returned nothing, and then "proved" a QR for the empty slug fails
 *             closed — which it does, for the wrong reason.
 *
 * Both are the same defect: an assertion about a string the product no longer
 * renders. A positive gate turns red and gets investigated. A NEGATIVE one goes
 * quietly green forever.
 *
 * So every `*_MARKER` constant an app-web proof declares must still exist in the
 * Flutter source. The constant is the contract; this is the enforcement.
 *
 *   node tools/check-e2e-ui-markers.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROOFS = join(repo, 'tools/e2e/app-web/proofs');
const DART = join(repo, 'apps/mobile/lib');

let failures = 0, checked = 0;
const fail = (m) => { console.log(`  ✗ ${m}`); failures++; };
const pass = (m) => console.log(`  ✓ ${m}`);

/** Does this exact literal appear anywhere the app renders it? */
function inProduct(text) {
  try {
    execFileSync('grep', ['-rqF', text, DART], { stdio: 'ignore' });
    return true;
  } catch { return false; }
}

console.log('\nE2E UI markers — every asserted string still exists in the app\n');

if (!existsSync(PROOFS) || !existsSync(DART)) {
  console.log('  proofs or Flutter source not found; nothing to check\n');
  process.exit(0);
}

for (const f of readdirSync(PROOFS).filter((n) => n.endsWith('.mjs')).sort()) {
  const src = readFileSync(join(PROOFS, f), 'utf8');
  for (const m of src.matchAll(/^const\s+([A-Z0-9_]*MARKER)\s*=\s*'([^']+)'/gm)) {
    checked++;
    const [, name, text] = m;
    if (inProduct(text)) pass(`${f} · ${name} = "${text}"`);
    else fail(`${f} · ${name} = "${text}" — no longer rendered anywhere in apps/mobile/lib. ` +
              `Any negative assertion using it passes vacuously.`);
  }
}

if (checked === 0) {
  console.log('  no *_MARKER constants declared — this guard would pass vacuously itself');
  process.exit(1);
}
console.log(failures === 0
  ? `\n✓ E2E_UI_MARKERS_EXIST=PASS (${checked} marker(s))\n`
  : `\n✗ E2E_UI_MARKERS_EXIST=FAIL (${failures} of ${checked})\n`);
process.exit(failures === 0 ? 0 : 1);
