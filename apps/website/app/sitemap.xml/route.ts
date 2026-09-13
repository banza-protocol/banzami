// /sitemap.xml, per host.
//
// developers.banzami.com lists the documentation — every canonical page in both
// languages, with its alternate — and nothing from the signed-in Console, which
// is noindex. Other hosts have no sitemap of their own yet, and answer 404
// rather than a list somebody guessed.
import { NextResponse, type NextRequest } from 'next/server';
import { DOCS_META } from '../developers/docs/docs-meta';

const ORIGIN = 'https://developers.banzami.com';

export function GET(req: NextRequest) {
  const host = (req.headers.get('host') ?? '').split(':')[0].toLowerCase();
  if (host !== 'developers.banzami.com') return new NextResponse('Not found', { status: 404 });
  const urls = Object.keys(DOCS_META).flatMap((slug) => (['pt', 'en'] as const).map((lang) => {
    const path = (l: 'pt' | 'en') => `${l === 'pt' ? '/docs' : '/docs/en'}${slug ? `/${slug}` : ''}`;
    return `  <url>\n    <loc>${ORIGIN}${path(lang)}</loc>\n`
      + `    <xhtml:link rel="alternate" hreflang="pt" href="${ORIGIN}${path('pt')}"/>\n`
      + `    <xhtml:link rel="alternate" hreflang="en" href="${ORIGIN}${path('en')}"/>\n  </url>`;
  }));
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`;
  return new NextResponse(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
}
