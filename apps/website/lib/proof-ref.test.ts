import { describe, expect, it } from 'vitest';
import { isProofRef, normalizeProofRef } from './proof-ref';

const SECURE = 'BZM-HPXT-AT8D-8V7B-H3YJ-QY5R-BYN0';

describe('normalizeProofRef', () => {
  it('accepts a secure reference as printed on the comprovativo', () => {
    expect(normalizeProofRef(SECURE)).toBe(SECURE);
  });

  it('accepts a legacy Sandbox reference', () => {
    expect(normalizeProofRef('BZM-0056-EAD5')).toBe('BZM-0056-EAD5');
  });

  it('takes the reference out of the verification link', () => {
    expect(normalizeProofRef(`https://banzami.com/r/${SECURE}`)).toBe(SECURE);
    expect(normalizeProofRef(`banzami.com/r/${SECURE}?x=1`)).toBe(SECURE);
  });

  it('takes the reference out of copied comprovativo details', () => {
    const copied = `Pagamento de 2 625 Kz\nPara @doa\nReferência do comprovativo: ${SECURE}\nData e hora: 10/09/2026, 23:30 (WAT)`;
    expect(normalizeProofRef(copied)).toBe(SECURE);
    expect(normalizeProofRef('Ref BZM-0056-EAD5\nPara @doa')).toBe('BZM-0056-EAD5');
  });

  it('writes lowercase, spaces, missing hyphens and typographic dashes canonically', () => {
    expect(normalizeProofRef(SECURE.toLowerCase())).toBe(SECURE);
    expect(normalizeProofRef(`  ${SECURE}  `)).toBe(SECURE);
    expect(normalizeProofRef('BZM HPXT AT8D 8V7B H3YJ QY5R BYN0')).toBe(SECURE);
    expect(normalizeProofRef('BZMHPXTAT8D8V7BH3YJQY5RBYN0')).toBe(SECURE);
    expect(normalizeProofRef(SECURE.replace(/-/g, '–'))).toBe(SECURE);
  });

  it('reads O as 0 and I or L as 1, as Crockford base32 does', () => {
    expect(normalizeProofRef('BZM-HPXT-AT8D-8V7B-H3YJ-QY5R-BYNO')).toBe(SECURE);
    expect(normalizeProofRef('BZM-HPXT-AT8D-8V7B-H3YJ-QY5R-BYNI')).toBe('BZM-HPXT-AT8D-8V7B-H3YJ-QY5R-BYN1');
  });

  it('refuses anything that is not a reference', () => {
    expect(normalizeProofRef('')).toBeNull();
    expect(normalizeProofRef('DOA-203EE717')).toBeNull();
    expect(normalizeProofRef('963a9aaa')).toBeNull();
    expect(normalizeProofRef('BZM-HPXT-AT8D-8V7B-H3YJ-QY5R')).toBeNull(); // 20 symbols
    expect(normalizeProofRef('BZM-HPXT-AT8D-8V7B-H3YJ-QY5R-BYNU')).toBeNull(); // U is never issued
    expect(normalizeProofRef('BZM-ZZZZ-ZZZZ')).toBeNull(); // legacy is hex
  });
});

describe('isProofRef', () => {
  it('is the gateway classification: exact canonical spelling only', () => {
    expect(isProofRef(SECURE)).toBe(true);
    expect(isProofRef('BZM-0056-EAD5')).toBe(true);
    expect(isProofRef(SECURE.toLowerCase())).toBe(false);
    expect(isProofRef(SECURE.replace(/-/g, ''))).toBe(false);
  });
});
