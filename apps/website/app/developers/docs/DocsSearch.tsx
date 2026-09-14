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
import { searchDocs, type SearchEntry, type SearchLang } from './search-core';
import { INK, RED, mono } from './ui';

type Lang = SearchLang;
type Entry = SearchEntry;

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

export { searchDocs };

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
      <label htmlFor={`${listId}-q`} style={{ display: 'block', margin: '0 0 6px', fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: '#6f6468' }}>
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
        style={{ width: '100%', boxSizing: 'border-box', minHeight: 36, padding: '8px 10px', borderRadius: 10, border: '1px solid #EAE3E3', background: '#fff', fontSize: 13.5, color: INK }}
      />
      <div id={`${listId}-r`} aria-live="polite">
        {q.trim().length >= 2 ? (
          results.length ? (
            <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {results.map((r) => (
                <li key={`${r.k}:${r.t}:${r.h}`}>
                  <a href={r.h} className="bz-toplink" style={{ display: 'block', padding: '7px 10px', borderRadius: 9, textDecoration: 'none', background: '#fff', border: '1px solid #EAE3E3' }}>
                    <span style={{ display: 'block', fontSize: 10.5, fontWeight: 600, letterSpacing: '.03em', color: '#6f6468' }}>{KIND[r.k][lang]}</span>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: RED, overflowWrap: 'anywhere', fontFamily: CODE_KINDS.has(r.k) ? mono : undefined }}>{r.t}</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ margin: '8px 0 0', fontSize: 12.5, color: '#6f6468' }}>{lang === 'pt' ? 'Nada encontrado.' : 'Nothing found.'}</p>
          )
        ) : null}
      </div>
    </div>
  );
}

/**
 * "On this page": the sections of the current page, read from the rendered
 * headings so it can never list one that is not there. On a wide screen it is a
 * sticky rail beside the article; on a narrow one it is a collapsed list above
 * it. The CSS shows exactly one of the two.
 *
 * Neither variant can move the article: the rail sits in its own grid column,
 * and the inline box is drawn collapsed at its final height before the headings
 * are read. (A first version appeared only after mount and pushed the page down
 * — a layout shift of 0.2 on the reference, measured.)
 */
/**
 * Which section the reader is in: the last heading whose top has passed the
 * reading line (a little below the sticky Sandbox banner). Before the first
 * heading, the first; at the very bottom of the page, the last — a short final
 * section can never scroll up to the line, and it must still be reachable.
 */
export function activeSection(tops: number[], line: number, atBottom: boolean): number {
  if (tops.length === 0) return -1;
  if (atBottom) return tops.length - 1;
  let current = 0;
  for (let i = 0; i < tops.length; i += 1) {
    if (tops[i] <= line) current = i;
    else break;
  }
  return current;
}

/** The reading line, in px from the top of the viewport. */
const READING_LINE = 120;

export function OnThisPage({ lang, variant }: { lang: Lang; variant: 'rail' | 'inline' }) {
  const [items, setItems] = useState<{ id: string; text: string }[]>([]);
  useEffect(() => {
    // The page body can render after this component mounts, so read the headings
    // again whenever the article changes, not once.
    const root = document.getElementById('docs-content');
    if (!root) return;
    const read = () => {
      const next = Array.from(root.querySelectorAll<HTMLHeadingElement>('h2[id]'))
        .map((h) => ({ id: h.id, text: (h.textContent ?? '').replace(/\s+/g, ' ').trim() }))
        .filter((x) => x.text);
      setItems((prev) => (prev.length === next.length && prev.every((p, i) => p.id === next[i].id && p.text === next[i].text) ? prev : next));
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  // Follow the reader: recompute on scroll and resize, at most once a frame.
  const [active, setActive] = useState<string | null>(null);
  const railRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (items.length === 0) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const tops = items.map((i) => document.getElementById(i.id)?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY);
      const doc = document.documentElement;
      // Only a page that scrolls has a bottom to reach; a short page is read by the line.
      const atBottom = doc.scrollHeight > window.innerHeight && window.innerHeight + window.scrollY >= doc.scrollHeight - 2;
      const idx = activeSection(tops, READING_LINE, atBottom);
      setActive(idx >= 0 ? items[idx].id : null);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('hashchange', schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('hashchange', schedule);
    };
  }, [items]);

  // A long list scrolls inside the sticky rail: keep the active entry in view
  // there, without ever scrolling the page itself.
  useEffect(() => {
    if (variant !== 'rail' || !active) return;
    const container = railRef.current?.closest('.bz-toc-rail') as HTMLElement | null;
    const link = Array.from(railRef.current?.querySelectorAll<HTMLElement>('a') ?? []).find((a) => a.getAttribute('href') === `#${active}`);
    if (!container || !link || container.scrollHeight <= container.clientHeight) return;
    const c = container.getBoundingClientRect();
    const l = link.getBoundingClientRect();
    if (l.top < c.top + 24) container.scrollTop -= c.top + 24 - l.top;
    else if (l.bottom > c.bottom - 24) container.scrollTop += l.bottom - (c.bottom - 24);
  }, [active, variant]);

  const label = lang === 'pt' ? 'Nesta página' : 'On this page';
  const list = (
    <ul ref={railRef} style={{ listStyle: 'none', margin: variant === 'rail' ? 0 : '8px 0 2px', padding: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
      {items.map((i) => {
        const on = i.id === active;
        return (
          <li key={i.id}>
            <a
              href={`#${i.id}`}
              aria-current={on ? 'location' : undefined}
              onClick={() => setActive(i.id)}
              className="bz-toplink"
              style={{
                display: 'block',
                padding: variant === 'rail' ? '5px 10px' : '5px 8px',
                borderLeft: variant === 'rail' ? '1px solid #EAE3E3' : undefined,
                borderRadius: variant === 'rail' ? '0 6px 6px 0' : 6,
                background: on ? '#FDF0EF' : 'transparent',
                fontSize: 13,
                fontWeight: 400,
                lineHeight: 1.4,
                color: on ? RED : '#5b4f53',
                textDecoration: 'none',
                minHeight: 24,
              }}
            >
              {i.text}
            </a>
          </li>
        );
      })}
    </ul>
  );
  if (variant === 'rail') {
    return (
      <nav aria-label={label}>
        <p style={{ margin: '0 0 8px', fontSize: 11.5, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: '#6f6468' }}>{label}</p>
        {list}
      </nav>
    );
  }
  return (
    <details className="bz-toc-inline" style={{ margin: '0 0 18px', background: '#fff', border: '1px solid #EAE3E3', borderRadius: 12, padding: '10px 14px' }}>
      <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, color: INK, minHeight: 24 }}>{label}</summary>
      <nav aria-label={label}>{list}</nav>
    </details>
  );
}
