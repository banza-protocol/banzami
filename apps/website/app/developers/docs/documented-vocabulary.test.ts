/**
 * Documented request values must be values the operator actually accepts.
 *
 * The public quickstart taught `"purpose": "PAGAMENTO"` — a Portuguese word that
 * was never in the operator's vocabulary. Core answers 400 "invalid purpose", so
 * the very first call a developer copied from the documentation failed, in every
 * language, in the OpenAPI spec, in the Postman collection and in all three SDK
 * examples. It was found by running the published SDK against the deployed
 * Sandbox, which is the only place a wrong-but-plausible constant shows up.
 *
 * The lists below are read from the Rust routes rather than restated here, so a
 * new purpose is available to the docs the moment core accepts it — and a
 * documented one that core drops fails here rather than in a developer's
 * terminal.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(process.cwd(), '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/** Pull `const PURPOSES: &[&str] = &[ ... ];` out of a Rust route. */
function purposesFrom(rustPath: string): string[] {
  const src = read(rustPath);
  const m = src.match(/const PURPOSES: &\[&str\] = &\[([\s\S]*?)\];/);
  if (!m) throw new Error(`PURPOSES not found in ${rustPath}`);
  return [...m[1].matchAll(/"([A-Z_]+)"/g)].map((x) => x[1]);
}

const SESSION_PURPOSES = purposesFrom('core/api/src/routes/payment_sessions.rs');
const ACCOUNT_PURPOSES = purposesFrom('core/api/src/routes/wallet_accounts.rs');

/** Every public developer surface that carries example request bodies. */
const SURFACES = [
  'apps/website/app/developers/docs/content-pt.tsx',
  'apps/website/app/developers/docs/content-en.tsx',
  'apps/website/app/developers/docs/reference.tsx',
  'apps/website/public/developers/openapi/banzami-sandbox.openapi.json',
  'apps/website/public/developers/postman/banzami-sandbox.postman_collection.json',
  'docs/developer/openapi/banzami-sandbox.openapi.json',
  'docs/developer/postman/banzami-sandbox.postman_collection.json',
  ...readdirSync(join(ROOT, 'apps/website/public/developers/examples/sdk-preview'))
    .map((f) => `apps/website/public/developers/examples/sdk-preview/${f}`),
  ...readdirSync(join(ROOT, 'docs/developer/examples/fixtures'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => `docs/developer/examples/fixtures/${f}`),
];

describe('documented request values are values the operator accepts', () => {
  it.each(SURFACES)('%s names no purpose core would reject', (file) => {
    const src = read(file);
    // Match `purpose: 'X'`, `"purpose": "X"`, `'purpose' => 'X'` — the shapes
    // these files actually use — and ignore prose.
    const named = [...src.matchAll(/["']?purpose["']?\s*(?::|=>)\s*["']([A-Za-z_]+)["']/g)]
      .map((m) => m[1])
      .filter((v) => v === v.toUpperCase());          // constants, not variable names
    const allowed = new Set([...SESSION_PURPOSES, ...ACCOUNT_PURPOSES]);
    for (const value of named) {
      expect(allowed.has(value), `${file} documents purpose "${value}", which core rejects`).toBe(true);
    }
  });

  it('the word that caused this test appears in no developer surface', () => {
    for (const file of SURFACES) {
      expect(read(file).includes('PAGAMENTO'), `${file} still teaches PAGAMENTO`).toBe(false);
    }
  });

  it('the reference lists the real vocabulary rather than one example', () => {
    const ref = read('apps/website/app/developers/docs/reference.tsx');
    for (const p of SESSION_PURPOSES) expect(ref, `reference omits session purpose ${p}`).toContain(p);
    for (const p of ACCOUNT_PURPOSES.filter((x) => x !== 'PRIMARY')) {
      expect(ref, `reference omits account purpose ${p}`).toContain(p);
    }
  });
});
