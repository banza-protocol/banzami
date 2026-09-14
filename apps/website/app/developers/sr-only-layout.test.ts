import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// A visually hidden label with no offset sits at its static position — the far
// end of a table that scrolls inside its own container — and widens the whole
// page on a phone (Console responsive sweep, 2026-09-14).
describe('visually hidden labels do not widen the page', () => {
  it('.bz-sr-only is pinned to its containing block', () => {
    const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');
    const rule = /\.bz-sr-only\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toMatch(/position:\s*absolute/);
    expect(rule).toMatch(/top:\s*0/);
    expect(rule).toMatch(/left:\s*0/);
  });
  it('the transactions table header label is pinned too', () => {
    const src = readFileSync(join(process.cwd(), 'app/developers/transacoes/page.tsx'), 'utf8');
    expect(/const SR_ONLY[^}]*top: 0[^}]*left: 0/.test(src)).toBe(true);
  });
});
