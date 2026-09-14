// Documentation search ranking, with no React and no browser APIs, so the same
// function serves the search box and tools/check-docs-search.mjs.

export type SearchLang = 'pt' | 'en';
export type SearchEntry = { k: 'page' | 'section' | 'endpoint' | 'error' | 'event' | 'method' | 'term'; t: string; h: string; d?: string; a?: string };

/** For a query written as words, a page answers better than an error code that happens to contain them. */
const PROSE_WEIGHT: Record<SearchEntry['k'], number> = { page: 0, section: 1, term: 2, endpoint: 3, method: 3, event: 3, error: 4 };
const looksLikeCode = (q: string) => /[_./]|^[A-Z0-9_]+$|^\d{3}$/.test(q);

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const words = (s: string) => s.split(/[\s/._:—–(),-]+/).filter(Boolean);

/**
 * Ranked: exact title, title prefix, word prefix, substring, then every query
 * word as a word prefix of the title ("rotate key" finds "Rotate and revoke
 * keys"), then the description.
 */
export function searchDocs(entries: SearchEntry[], query: string, limit = 8): SearchEntry[] {
  const raw = query.trim();
  const q = fold(raw);
  if (q.length < 2) return [];
  const prose = !looksLikeCode(raw);
  const qWords = words(q);
  const scored: { e: SearchEntry; s: number }[] = [];
  for (const e of entries) {
    const t = fold(e.t);
    const tWords = words(t);
    let s = -1;
    if (t === q) s = 0;
    else if (t.startsWith(q)) s = 1;
    else if (tWords.some((w) => w.startsWith(q))) s = 2;
    else if (t.includes(q)) s = 3;
    else if (qWords.length > 1 && qWords.every((qw) => tWords.some((w) => w.startsWith(qw)))) s = 4;
    else if (e.a && (fold(e.a).split('|').some((alias) => alias === q || alias.startsWith(q) || (qWords.length > 1 && qWords.every((qw) => words(alias).some((w) => w.startsWith(qw))))))) s = 2;
    else if (e.d && fold(e.d).includes(q)) s = 5;
    // An alias that IS the query names this entry as precisely as a title that
    // starts with it: "idempotency" is the concept, before any code that
    // happens to begin with the word.
    if (e.a && fold(e.a).split('|').includes(q) && (s < 0 || s > 1)) s = 1;
    if (s >= 0) scored.push({ e, s });
  }
  const weight = (e: SearchEntry) => (prose ? PROSE_WEIGHT[e.k] : 0);
  return scored.sort((a, b) => a.s - b.s || weight(a.e) - weight(b.e) || a.e.t.length - b.e.t.length).slice(0, limit).map((x) => x.e);
}
