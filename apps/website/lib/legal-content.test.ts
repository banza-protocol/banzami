import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { TERMS, isTermsPublished } from './terms';
import { TERMS_SECTIONS, PRIVACY_SECTIONS, TERMS_VERSION, PRIVACY_VERSION } from './legal-content';

// A published legal version is immutable: the pinned hash must match the current
// content. If this fails, the legal text changed — bump the version + hash on
// purpose (reacceptance) rather than editing text under a published version.
describe('legal content hash (immutability)', () => {
  it('lib/terms.ts documentHash matches sha256 of lib/legal-content.ts', () => {
    const path = fileURLToPath(new URL('./legal-content.ts', import.meta.url));
    const hash = createHash('sha256').update(readFileSync(path)).digest('hex');
    expect(TERMS.documentHash).toBe(hash);
  });
});

describe('legal publication state', () => {
  it('Terms are PUBLISHED with a version', () => {
    expect(isTermsPublished()).toBe(true);
    expect(TERMS.version).toBe(TERMS_VERSION);
    expect(TERMS.privacyVersion).toBe(PRIVACY_VERSION);
    expect(TERMS.effectiveDate).toBeTruthy();
  });
});

const allText = [...TERMS_SECTIONS, ...PRIVACY_SECTIONS]
  .flatMap((s) => s.body.flatMap((b) => ('ul' in b ? b.ul : [b.p])))
  .flatMap((l) => [l.pt, l.en])
  .join('\n')
  .toLowerCase();

// §32 legal-claims gate: the published legal text must not assert a regulatory
// status Banzami does not hold, and must not promise real-money behaviour.
describe('legal claims gate (no false regulatory/financial claims)', () => {
  const forbidden = [
    'licensed financial institution',
    'bna approved',
    'approved by the bna',
    'aprovado pelo bna',
    'instituição financeira licenciada',
    'somos regulados',
    'we are regulated',
    'we are licensed',
  ];
  for (const phrase of forbidden) {
    it(`does not claim: "${phrase}"`, () => {
      expect(allText).not.toContain(phrase);
    });
  }

  it('states real-money operations are unavailable / out of scope', () => {
    // Public terminology: the internal term "Financial Live" must not appear in
    // the published legal text; the concept is stated as real-money operations.
    expect(allText).not.toContain('financial live');
    expect(
      allText.includes('operações com dinheiro real') || allText.includes('real-money operations'),
    ).toBe(true);
    expect(
      allText.includes('não estão disponíveis') || allText.includes('are not available') || allText.includes('unavailable'),
    ).toBe(true);
  });

  it('states sandbox money has no real value', () => {
    expect(
      allText.includes('não tem valor monetário') || allText.includes('no monetary value'),
    ).toBe(true);
  });
});
