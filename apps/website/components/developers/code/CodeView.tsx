'use client';

/**
 * The one code surface of the Developer Platform (DOCS-VISUAL-DX-002): the
 * documentation's guides and reference, and the Console's API Explorer.
 *
 *   <CodeView lang="curl" raw={…} context="POST /v1/payment-sessions" />
 *   <CodeTabs items={[{ lang: 'ts', raw }, { lang: 'curl', raw }]} />
 *
 * · The body is highlighted on the server and the client alike (highlight.ts is
 *   synchronous), so the HTML arrives coloured and hydration changes nothing.
 * · Copy writes `raw` — the source string — never the rendered tokens.
 * · The copy button says "Copiado" for a moment and a polite live region says it
 *   aloud; its width is fixed, so the header never moves.
 * · Tabs lay out only the active panel, so a short example is not padded to the
 *   longest. The frame's height changes when the reader picks a tab (an input,
 *   excluded from layout-shift scoring) and, for a reader who chose another
 *   language before, once as the preference is restored after hydration.
 */
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { getDocsCodeLang, setDocsCodeLang } from '@/lib/developer-prefs';
import { LANG_LABEL, highlight, type CodeLang, type Token } from './highlight';

const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const LINE_HEIGHT = 21; // px — 13px type, used to place line marks
const PAD_Y = 14;

export type LineMark = { from: number; to?: number; tone: 'bad' | 'good' | 'focus' };

/**
 * The marks a block gets without asking: in a request, the Idempotency-Key
 * header is a focus line (it is what makes a retry safe, and it is easy to miss
 * among headers); in a "wrong and right" example, the WRONG/ERRADO part is
 * marked bad and the RIGHT/CERTO part good, from the comment that opens each.
 */
export function defaultMarks(raw: string, lang: CodeLang): LineMark[] {
  const lines = raw.split('\n');
  const marks: LineMark[] = [];
  if (lang === 'curl' || lang === 'shell' || lang === 'http') {
    lines.forEach((l, i) => { if (/Idempotency-Key:/i.test(l)) marks.push({ from: i + 1, tone: 'focus' }); });
  }
  const section = (re: RegExp, tone: 'bad' | 'good') => {
    const start = lines.findIndex((l) => re.test(l));
    if (start < 0) return;
    let end = start;
    while (end + 1 < lines.length && lines[end + 1].trim() !== '') end += 1;
    marks.push({ from: start + 1, to: end + 1, tone });
  };
  section(/^\s*(\/\/|#)\s*(ERRADO|WRONG)\b/, 'bad');
  section(/^\s*(\/\/|#)\s*(CERTO|RIGHT)\b/, 'good');
  return marks;
}

export type CodeUiText = { copy: string; copied: string; announce: string; languages: string };
export const CODE_UI_TEXT: Record<'pt' | 'en', CodeUiText> = {
  pt: { copy: 'Copiar', copied: 'Copiado', announce: 'Código copiado para a área de transferência', languages: 'Linguagem do exemplo' },
  en: { copy: 'Copy', copied: 'Copied', announce: 'Code copied to the clipboard', languages: 'Example language' },
};

function Tokens({ tokens }: { tokens: Token[] }) {
  return (
    <>
      {tokens.map((tk, i) => (tk.t === 'plain' ? tk.v : <span key={i} data-token={tk.t} className={`tk-${tk.t}`}>{tk.v}</span>))}
    </>
  );
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Insecure context or a denied permission: the old path still works.
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

function CopyButton({ raw, label, text }: { raw: string; label: string; text: CodeUiText }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const onClick = async () => {
    if (await writeClipboard(raw)) {
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1800);
    }
  };
  return (
    <>
      <button
        type="button"
        onClick={() => void onClick()}
        aria-label={`${text.copy}: ${label}`}
        data-copy-button
        className="bz-codecopy"
        style={{
          marginLeft: 'auto', flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          minWidth: 96, height: 28, padding: '0 10px', border: '1px solid rgba(255,255,255,.14)', borderRadius: 8,
          background: copied ? 'rgba(111,207,151,.14)' : 'rgba(255,255,255,.05)', color: copied ? '#9FE3BA' : '#EDE6E4',
          fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        {copied ? (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="9" y="9" width="11" height="11" rx="2.5" stroke="currentColor" strokeWidth="1.9" />
            <path d="M5 15V5a2 2 0 012-2h8" stroke="currentColor" strokeWidth="1.9" />
          </svg>
        )}
        {copied ? text.copied : text.copy}
      </button>
      <span role="status" aria-live="polite" className="bz-sr-only">{copied ? text.announce : ''}</span>
    </>
  );
}

const FRAME: CSSProperties = {
  background: '#1D1618', border: '1px solid #2E2427', borderRadius: 12, overflow: 'hidden', margin: '0 0 16px',
  maxWidth: '100%', boxShadow: '0 1px 2px rgba(36,29,32,.10), 0 8px 24px -16px rgba(36,29,32,.35)',
};
const HEADER: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, padding: '7px 10px 7px 14px',
  borderBottom: '1px solid rgba(255,255,255,.07)', background: '#231B1D',
};
const LANG_TAG: CSSProperties = {
  flex: 'none', fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: '.02em', color: '#F1E9E7',
};
const CONTEXT: CSSProperties = {
  minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: MONO, fontSize: 11.5, color: '#A8999C',
};

function Body({ raw, lang, marks, label, hidden }: { raw: string; lang: CodeLang; marks?: LineMark[]; label: string; hidden?: boolean }) {
  const tokens = useMemo(() => highlight(raw, lang), [raw, lang]);
  return (
    <pre
      tabIndex={hidden ? -1 : 0}
      aria-label={label}
      className="bz-codebody"
      style={{
        position: 'relative', margin: 0, padding: `${PAD_Y}px 16px`, fontFamily: MONO, fontSize: 13, lineHeight: `${LINE_HEIGHT}px`,
        color: '#EDE6E4', overflowX: 'auto', whiteSpace: 'pre', tabSize: 2,
      }}
    >
      {marks?.map((m, i) => (
        <span
          key={i}
          aria-hidden="true"
          data-line-mark={m.tone}
          style={{
            position: 'absolute', left: 0, right: 0, top: PAD_Y + (m.from - 1) * LINE_HEIGHT, height: ((m.to ?? m.from) - m.from + 1) * LINE_HEIGHT,
            background: m.tone === 'bad' ? 'rgba(244,114,128,.10)' : m.tone === 'good' ? 'rgba(111,207,151,.09)' : 'rgba(255,255,255,.06)',
            borderLeft: `2px solid ${m.tone === 'bad' ? '#F07A88' : m.tone === 'good' ? '#6FCF97' : '#C9B8BB'}`,
            pointerEvents: 'none',
          }}
        />
      ))}
      <code style={{ position: 'relative', fontFamily: 'inherit' }}><Tokens tokens={tokens} /></code>
    </pre>
  );
}

export function CodeView({
  raw, lang, context, status, marks, ui = 'pt', title,
}: { raw: string; lang: CodeLang; context?: string; status?: ReactNode; marks?: LineMark[]; ui?: 'pt' | 'en'; title?: string }) {
  const text = CODE_UI_TEXT[ui];
  const label = [title ?? LANG_LABEL[lang], context].filter(Boolean).join(' · ');
  return (
    <div data-code-block data-lang={lang} data-raw-length={raw.length} style={FRAME}>
      <div style={HEADER}>
        <span style={LANG_TAG}>{title ?? LANG_LABEL[lang]}</span>
        {context ? <span style={CONTEXT}>{context}</span> : null}
        {status ? <span style={{ flex: 'none' }}>{status}</span> : null}
        <CopyButton raw={raw} label={label} text={text} />
      </div>
      <Body raw={raw} lang={lang} marks={marks ?? defaultMarks(raw, lang)} label={label} />
    </div>
  );
}

export type CodeTab = { lang: CodeLang; raw: string; context?: string; marks?: LineMark[] };

const PREF_EVENT = 'bz-docs-code-lang';

/** Equivalent examples in more than one language, one visible at a time. */
export function CodeTabs({ items, ui = 'pt' }: { items: CodeTab[]; ui?: 'pt' | 'en' }) {
  const text = CODE_UI_TEXT[ui];
  const [active, setActive] = useState(0);
  const base = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // The reader's language follows them from example to example, and page to page.
  useEffect(() => {
    const apply = (lang: string | null) => {
      const i = items.findIndex((t) => t.lang === lang);
      if (i >= 0) setActive(i);
    };
    apply(getDocsCodeLang());
    const onPref = (e: Event) => apply((e as CustomEvent<string>).detail);
    window.addEventListener(PREF_EVENT, onPref);
    return () => window.removeEventListener(PREF_EVENT, onPref);
  }, [items]);

  const choose = (i: number, focus = false) => {
    setActive(i);
    const lang = items[i].lang;
    setDocsCodeLang(lang);
    window.dispatchEvent(new CustomEvent(PREF_EVENT, { detail: lang }));
    if (focus) tabRefs.current[i]?.focus();
  };
  const onKey = (e: KeyboardEvent) => {
    const n = items.length;
    if (e.key === 'ArrowRight') { e.preventDefault(); choose((active + 1) % n, true); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); choose((active - 1 + n) % n, true); }
    else if (e.key === 'Home') { e.preventDefault(); choose(0, true); }
    else if (e.key === 'End') { e.preventDefault(); choose(n - 1, true); }
  };
  const current = items[active];
  const label = [LANG_LABEL[current.lang], current.context].filter(Boolean).join(' · ');

  return (
    <div data-code-tabs style={FRAME}>
      <div style={HEADER}>
        <div role="tablist" aria-label={text.languages} onKeyDown={onKey} style={{ display: 'flex', gap: 2, flex: 'none' }}>
          {items.map((t, i) => (
            <button
              key={t.lang + i}
              ref={(el) => { tabRefs.current[i] = el; }}
              type="button"
              role="tab"
              id={`${base}-tab-${i}`}
              aria-selected={i === active}
              aria-controls={`${base}-panel-${i}`}
              tabIndex={i === active ? 0 : -1}
              onClick={() => choose(i)}
              className="bz-codetab"
              style={{
                height: 28, padding: '0 10px', borderRadius: 7, border: '1px solid transparent', cursor: 'pointer',
                fontFamily: MONO, fontSize: 11.5, fontWeight: 700,
                background: i === active ? 'rgba(255,255,255,.10)' : 'transparent',
                borderColor: i === active ? 'rgba(255,255,255,.14)' : 'transparent',
                color: i === active ? '#F6F0EE' : '#A8999C',
              }}
            >
              {LANG_LABEL[t.lang]}
            </button>
          ))}
        </div>
        {current.context ? <span style={CONTEXT}>{current.context}</span> : null}
        <CopyButton raw={current.raw} label={label} text={text} />
      </div>
      <div>
        {items.map((t, i) => (
          <div
            key={t.lang + i}
            role="tabpanel"
            id={`${base}-panel-${i}`}
            aria-labelledby={`${base}-tab-${i}`}
            data-code-block
            data-lang={t.lang}
            data-raw-length={t.raw.length}
            // Only the active example is laid out: a short TypeScript example is not padded to
            // the height of a cURL request with its response. The height changes only when the
            // reader picks a tab — an input, which layout-shift scoring excludes.
            hidden={i !== active}
            {...(i === active ? {} : { inert: true, 'aria-hidden': true })}
            style={{ minWidth: 0 }}
          >
            <Body raw={t.raw} lang={t.lang} marks={t.marks ?? defaultMarks(t.raw, t.lang)} label={[LANG_LABEL[t.lang], t.context].filter(Boolean).join(' · ')} hidden={i !== active} />
          </div>
        ))}
      </div>
    </div>
  );
}
