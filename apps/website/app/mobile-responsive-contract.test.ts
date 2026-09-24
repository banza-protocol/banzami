import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Responsive layout contracts for the mobile experience. These are source
// guards (not fragile snapshots): they lock the specific rules that keep
// banzami.com premium and overflow-free on phones, so a future edit cannot
// silently regress them. Verified live in docs/release/MOBILE-EXPERIENCE-VALIDATION.md.
const CSS = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');

describe('mobile responsive contracts (globals.css)', () => {
  it('the top-bar Portal Developers CTA is hidden on phones (it lives in the burger menu)', () => {
    expect(CSS).toMatch(/@media \(max-width: 600px\)[^}]*\.bz-navcta[^}]*display:\s*none/);
  });

  it('the burger replaces the mega-nav on narrow screens', () => {
    expect(CSS).toContain('@media (max-width: 1120px)');
    expect(CSS).toMatch(/\.bz-burger \{ display: flex !important; \}/);
    expect(CSS).toMatch(/\.bz-navlinks \{ display: none !important; \}/);
  });

  it('the audience cards stack to one column on phones', () => {
    expect(CSS).toMatch(/@media \(max-width: 560px\)[^}]*\.bz-herocards/);
  });

  it('stacked grid children may shrink below content min-content (code sample cannot force overflow)', () => {
    expect(CSS).toMatch(/\.bz-g2 > \* \{ min-width: 0; \}/);
  });

  it('phone showcases become a controlled horizontal swipe on phones/tablets (no hard clip)', () => {
    expect(CSS).toMatch(/@media \(max-width: 720px\)[^]*\.bz-phones[^}]*overflow-x:\s*auto/);
  });

  it('the hero red geometry is faded on phones so the lead copy stays legible', () => {
    expect(CSS).toMatch(/@media \(max-width: 700px\)[^}]*\.bz-homeherobg[^}]*opacity/);
  });

  it('data tables scroll internally rather than overflowing the page', () => {
    expect(CSS).toMatch(/\.bz-tablewrap \{ overflow-x: auto; \}/);
  });

  it('reduced-motion is honoured', () => {
    expect(CSS).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });
});
