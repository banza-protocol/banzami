import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The Sandbox ribbon carries a sentence for assistive technology. It must never
 * be VISIBLE: on pay.banzami.com it appeared in the top-left corner of every pay
 * page ("Ambiente SANDBOX — dinheiro fictício…"), because it was hidden with a
 * utility class that this app's CSS did not contain.
 */
const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

describe('the Sandbox ribbon label is never visible', () => {
  const badge = read('components/PlatformBadge.tsx');

  it('is hidden with inline styles, not with a class that CSS purging can drop', () => {
    expect(badge).not.toMatch(/className="sr-only"/);
    expect(badge).toContain('style={VISUALLY_HIDDEN}');
    for (const rule of ["position: 'absolute'", "width: '1px'", "height: '1px'", "overflow: 'hidden'", "clip: 'rect(0 0 0 0)'"]) {
      expect(badge, rule).toContain(rule);
    }
  });

  it('Tailwind scans components/, so a utility class used there is never silently missing', () => {
    expect(read('tailwind.config.ts')).toContain("'./components/**/*.{ts,tsx}'");
  });

  it('no other component in this app relies on the purged class', () => {
    expect(read('components/PlatformBadge.tsx').match(/sr-only/g) ?? []).toHaveLength(0);
  });
});
