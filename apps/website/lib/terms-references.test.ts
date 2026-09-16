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
  it('link infrastructure is ready but the document is still DRAFT (not published)', () => {
    // TERMS_LINK_INFRASTRUCTURE=PASS vs TERMS_DOCUMENT_PUBLICATION_STATUS=DRAFT:
    // a 200 placeholder does not mean the Terms are legally available.
    expect(TERMS.status).toBe('DRAFT');
    expect(isTermsPublished()).toBe(false);
    expect(TERMS.version).toBeNull();
  });
  it('acceptance flows send a Terms version only once published (DRAFT sends none)', () => {
    for (const f of [
      'app/comerciantes/candidatura/CandidaturaForm.tsx',
      'components/developers/portal/BusinessApplicationForm.tsx',
    ]) {
      expect(read(f), `${f} gates terms_version on publication`).toContain('isTermsPublished() ? TERMS.version');
    }
  });
  it('developer sign-in does not treat continuing as Terms acceptance', () => {
    const login = read('app/developers/login/page.tsx');
    expect(login).not.toContain('concorda com os nossos');
    expect(login).toContain('Ao entrar, aplica-se a nossa');
  });
  it('a DRAFT (unpublished) Terms page is noindex — no draft text in the index', () => {
    if (TERMS.status !== 'PUBLISHED') {
      expect(read('app/termos/page.tsx')).toContain('index: false');
    }
  });
});

describe('Terms references resolve to /termos', () => {
  const REFS: { file: string; mustContain: string }[] = [
    // public merchant application (candidatura) — checkbox link
    { file: 'app/comerciantes/candidatura/CandidaturaForm.tsx', mustContain: 'href="/termos"' },
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
