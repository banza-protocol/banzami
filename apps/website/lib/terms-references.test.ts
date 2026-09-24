import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TERMS, TERMS_ROUTE, isTermsPublished } from './terms';

// PUBLIC-WEBSITE-LEGAL-RELEASE-001 — every public "Terms" reference must resolve
// to the one canonical route (/termos), never to /sobre, /suporte, '#', or a
// missing route. The Terms BODY is human-approved and not asserted here.

const ROOT = join(__dirname, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('Terms versioning scaffold', () => {
  it('canonical route is /termos', () => {
    expect(TERMS_ROUTE).toBe('/termos');
  });
  it('carries the full version scaffold (null until the approved doc is published)', () => {
    for (const k of ['version', 'effectiveDate', 'publishedAt', 'documentHash'] as const) {
      expect(k in TERMS, `TERMS.${k}`).toBe(true);
    }
    expect(TERMS.legalEntity).toBeTruthy();
    expect(TERMS.contactEmail).toContain('@banzami.com');
    expect(['DRAFT', 'PUBLISHED']).toContain(TERMS.status);
  });
  it('the /termos route exists', () => {
    expect(() => read('app/termos/page.tsx')).not.toThrow();
  });
  it('the Beta Sandbox Terms + Privacy are PUBLISHED and versioned', () => {
    // PUBLIC-WEBSITE-LEGAL-RELEASE-001 closed for the Beta: real, versioned,
    // content-hashed legal documents (see legal-content.test.ts).
    expect(TERMS.status).toBe('PUBLISHED');
    expect(isTermsPublished()).toBe(true);
    expect(TERMS.version).toBeTruthy();
    expect(TERMS.privacyVersion).toBeTruthy();
    expect(TERMS.documentHash).toMatch(/^[0-9a-f]{64}$/);
  });
  it('acceptance flows send a Terms version only once published (DRAFT sends none)', () => {
    for (const f of [
      'components/marketing/pages/Candidatura.tsx',
      'components/developers/portal/BusinessApplicationForm.tsx',
    ]) {
      const src = read(f);
      expect(src.includes('isTermsPublished()'), `${f} gates terms_version on publication`).toBe(true);
      expect(src.includes('TERMS.version'), `${f} sends TERMS.version`).toBe(true);
    }
  });
  it('developer sign-in does not treat continuing as Terms acceptance', () => {
    const login = read('app/developers/login/page.tsx');
    expect(login).not.toContain('concorda com os nossos');
    expect(login).toContain('Ao entrar, aplica-se a nossa');
  });
  it('a PUBLISHED Terms page is indexable (no noindex)', () => {
    // Published legal documents belong in the index; a DRAFT one would be noindex.
    if (TERMS.status === 'PUBLISHED') {
      expect(read('app/termos/page.tsx')).not.toContain('index: false');
      expect(read('app/privacidade/page.tsx')).not.toContain('index: false');
    } else {
      expect(read('app/termos/page.tsx')).toContain('index: false');
    }
  });
});

describe('Terms references resolve to /termos', () => {
  const REFS: { file: string; mustContain: string }[] = [
    // public merchant application (candidatura) — checkbox link
    { file: 'components/marketing/pages/Candidatura.tsx', mustContain: "route('termos', lang)" },
    // Console business application — checkbox link
    { file: 'components/developers/portal/BusinessApplicationForm.tsx', mustContain: 'href="/termos"' },
    // developer sign-in consent
    { file: 'app/developers/login/page.tsx', mustContain: 'https://banzami.com/termos' },
  ];

  for (const { file, mustContain } of REFS) {
    it(`${file} links "termos" to /termos`, () => {
      const src = read(file);
      // The word "termos" appears (it's a Terms reference)…
      expect(/termos e condições|Termos de Serviço/i.test(src), `${file} references Terms`).toBe(true);
      // …and it resolves to the canonical route.
      expect(src, `${file} must link to /termos`).toContain(mustContain);
    });

    it(`${file} does NOT point a Terms link at /sobre or /suporte`, () => {
      const src = read(file);
      // No Terms link may target the About or Support page.
      expect(src).not.toContain('href="/suporte"\n                      termos');
      expect(src).not.toMatch(/banzami\.com\/sobre"[^>]*>\s*Termos de Serviço/);
    });
  }
});
