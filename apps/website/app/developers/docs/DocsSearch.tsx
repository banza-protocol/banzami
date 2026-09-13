'use client';

// Documentation search, entirely in the browser.
//
// The index (search-index.json) is generated from the pages, the reference, the
// error catalogue and the glossary by tools/docs/build-search-index.mjs, and CI
// fails when it is stale. What a reader types is matched here and never sent
// anywhere — a search box on a payments documentation site sees API keys pasted
// into it by mistake, and the only safe place for that is nowhere.

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import index from './search-index.json';
import { INK, RED, mono } from './ui';

type Lang = 'pt' | 'en';
type Entry = { k: 'page' | 'section' | 'endpoint' | 'error' | 'event' | 'method' | 'term'; t: string; h: string; d?: string };

const KIND: Record<Entry['k'], Record<Lang, string>> = {
  page: { pt: 'Página', en: 'Page' },
  section: { pt: 'Secção', en: 'Section' },
  endpoint: { pt: 'Endpoint', en: 'Endpoint' },
  error: { pt: 'Erro', en: 'Error' },
  event: { pt: 'Evento', en: 'Event' },
  method: { pt: 'Método SDK', en: 'SDK method' },
  term: { pt: 'Glossário', en: 'Glossary' },
};
const CODE_KINDS = new Set(['endpoint', 'error', 'event', 'method']);

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Ranked: exact title, title prefix, word prefix, substring; then description. */
export function searchDocs(entries: Entry[], query: string, limit = 8): Entry[] {
  const q = fold(query.trim());
  if (q.length < 2) return [];
  const scored: { e: Entry; s: number }[] = [];
  for (const e of entries) {
    const t = fold(e.t);
    let s = -1;
    if (t === q) s = 0;
    else if (t.startsWith(q)) s = 1;
    else if (t.split(/[\s/._:—-]+/).some((w) => w.startsWith(q))) s = 2;
    else if (t.includes(q)) s = 3;
    else if (e.d && fold(e.d).includes(q)) s = 4;
    if (s >= 0) scored.push({ e, s });
  }
  return scored.sort((a, b) => a.s - b.s || a.e.t.length - b.e.t.length).slice(0, limit).map((x) => x.e);
}

export function DocsSearch({ lang }: { lang: Lang }) {
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const entries = (index as Record<Lang, Entry[]>)[lang];
  const results = useMemo(() => searchDocs(entries, q), [entries, q]);

  // "/" focuses the box, as on most documentation sites — but never while the
  // reader is typing somewhere else.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const el = ev.target as HTMLElement | null;
      if (ev.key !== '/' || ev.metaKey || ev.ctrlKey || ev.altKey) return;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      ev.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const label = lang === 'pt' ? 'Pesquisar na documentação' : 'Search the documentation';
  return (
    <div role="search" style={{ margin: '0 0 14px' }}>
      <label htmlFor={`${listId}-q`} style={{ display: 'block', margin: '0 0 6px', fontSize: 11, fontWeight: 900, letterSpacing: '.06em', color: '#a89a9e' }}>
        {lang === 'pt' ? 'PESQUISAR' : 'SEARCH'}
      </label>
      <input
        id={`${listId}-q`}
        ref={inputRef}
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') setQ(''); }}
        placeholder={lang === 'pt' ? 'Página, erro, evento, método…  /' : 'Page, error, event, method…  /'}
        aria-label={label}
        aria-controls={`${listId}-r`}
        autoComplete="off"
        spellCheck={false}
        style={{ width: '100%', boxSizing: 'border-box', minHeight: 36, padding: '8px 10px', borderRadius: 10, border: '1px solid #F2E2E0', background: '#fff', fontSize: 13.5, color: INK }}
      />
      <div id={`${listId}-r`} aria-live="polite">
        {q.trim().length >= 2 ? (
          results.length ? (
            <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {results.map((r) => (
                <li key={`${r.k}:${r.t}:${r.h}`}>
                  <a href={r.h} className="bz-toplink" style={{ display: 'block', padding: '7px 10px', borderRadius: 9, textDecoration: 'none', background: '#fff', border: '1px solid #F5E9E7' }}>
                    <span style={{ display: 'block', fontSize: 10.5, fontWeight: 800, letterSpacing: '.03em', color: '#a89a9e' }}>{KIND[r.k][lang]}</span>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 800, color: RED, overflowWrap: 'anywhere', fontFamily: CODE_KINDS.has(r.k) ? mono : undefined }}>{r.t}</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ margin: '8px 0 0', fontSize: 12.5, color: '#8a7a7e' }}>{lang === 'pt' ? 'Nada encontrado.' : 'Nothing found.'}</p>
          )
        ) : null}
      </div>
    </div>
  );
}

/**
 * "On this page": the sections of the current page, read from the rendered
 * headings so it can never list one that is not there. Collapsed by default,
 * which is what makes the same element usable on a phone and out of the way on
 * a desktop.
 */
export function OnThisPage({ lang }: { lang: Lang }) {
  const [items, setItems] = useState<{ id: string; text: string }[]>([]);
  useEffect(() => {
    const hs = Array.from(document.querySelectorAll<HTMLHeadingElement>('article h3[id]'));
    setItems(hs.map((h) => ({ id: h.id, text: (h.textContent ?? '').replace(/\s+/g, ' ').trim() })).filter((x) => x.text));
  }, []);
  if (items.length < 3) return null;
  return (
    <details style={{ margin: '0 0 18px', background: '#fff', border: '1px solid #F2E2E0', borderRadius: 14, padding: '10px 14px' }}>
      <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 900, color: INK, minHeight: 24 }}>
        {lang === 'pt' ? `Nesta página (${items.length})` : `On this page (${items.length})`}
      </summary>
      <nav aria-label={lang === 'pt' ? 'Nesta página' : 'On this page'}>
        <ul style={{ listStyle: 'none', margin: '8px 0 2px', padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {items.map((i) => (
            <li key={i.id}>
              <a href={`#${i.id}`} className="bz-toplink" style={{ display: 'block', padding: '5px 4px', fontSize: 13, fontWeight: 700, color: '#6a5a5e', textDecoration: 'none', minHeight: 24 }}>{i.text}</a>
            </li>
          ))}
        </ul>
      </nav>
    </details>
  );
}
