import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '../middleware';
import { DOCS_META, docsMetadata } from '../app/developers/docs/docs-meta';
import { GET as sitemap } from '../app/sitemap.xml/route';

const onConsole = (path: string) => middleware(new NextRequest(`https://developers.banzami.com${path}`, { headers: { host: 'developers.banzami.com' } }));

describe('documentation SEO (DOCS-PROD-001 §57)', () => {
  it('indexes the documentation and not the signed-in Console', () => {
    for (const p of ['/docs', '/docs/get-started', '/docs/en/reference']) expect(onConsole(p).headers.get('x-robots-tag'), p).toBeNull();
    for (const p of ['/login', '/api-keys', '/saldos', '/']) expect(onConsole(p).headers.get('x-robots-tag'), p).toBe('noindex, nofollow');
  });
  it('gives every docs page its own title, description, canonical and language alternates', () => {
    const titles = new Set<string>();
    for (const slug of Object.keys(DOCS_META)) {
      for (const lang of ['pt', 'en'] as const) {
        const m = docsMetadata(lang, slug);
        const t = (m.title as { absolute: string }).absolute;
        expect(t).toMatch(/— Banzami Developers$/);
        expect(String(m.description).length).toBeGreaterThan(40);
        expect(String(m.alternates?.canonical)).toBe(`https://developers.banzami.com${lang === 'pt' ? '/docs' : '/docs/en'}${slug ? `/${slug}` : ''}`);
        titles.add(`${lang}:${t}`);
      }
    }
    expect(titles.size).toBe(Object.keys(DOCS_META).length * 2);
  });
  it('lists every docs page in the developers sitemap, and only there', async () => {
    const xml = await (await sitemap(new NextRequest('https://developers.banzami.com/sitemap.xml', { headers: { host: 'developers.banzami.com' } }))).text();
    // /docs/guides is a retired redirect page: noindex, and not in the sitemap.
    expect((xml.match(/<loc>/g) ?? []).length).toBe((Object.keys(DOCS_META).length - 1) * 2);
    expect(xml).not.toMatch(/\/docs(\/en)?\/guides</);
    expect(docsMetadata('pt', 'guides').robots).toEqual({ index: false, follow: true });
    expect(xml).not.toMatch(/login|api-keys|saldos/);
    const other = await sitemap(new NextRequest('https://example.org/sitemap.xml', { headers: { host: 'example.org' } }));
    expect(other.status).toBe(404);
  });
  it('lists the public marketing pages on banzami.com, and no docs or Console page', async () => {
    const xml = await (await sitemap(new NextRequest('https://banzami.com/sitemap.xml', { headers: { host: 'banzami.com' } }))).text();
    for (const p of ['/', '/developers', '/seguranca', '/suporte', '/sobre']) expect(xml).toContain(`<loc>https://banzami.com${p}</loc>`);
    expect(xml).not.toMatch(/\/docs|\/login|activar|estado/);
  });
});
