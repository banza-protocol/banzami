import type { CSSProperties, ReactNode } from 'react';
import { Badge } from '../kit';
import { type Lang, type Loc } from '@/lib/marketing/nav';
import { PRIVACY_SECTIONS, PRIVACY_VERSION, LEGAL_EFFECTIVE_DATE, type Block } from '@/lib/legal-content';

/**
 * /privacidade — Privacy Policy for the Public Beta. Body only: the shared
 * SiteShell provides header + footer + page background. Frozen docPage layout
 * (sticky TOC + numbered section cards). The legal text is the single source of
 * truth in lib/legal-content.ts (versioned + content-hashed via lib/terms.ts).
 */

const L = (pt: string, en: string): Loc => ({ pt, en });

const T = {
  badge: L('Documento legal', 'Legal document'),
  h1a: L('Política de', 'Privacy'),
  h1b: L('Privacidade.', 'Policy.'),
  lead: L(
    'Que dados tratamos, porquê, e como pode exercer os seus direitos, na Beta Sandbox.',
    'What data we process, why, and how you can exercise your rights, in the Beta Sandbox.',
  ),
  tocLabel: L('Índice', 'Contents'),
  tocTitle: L('ÍNDICE', 'CONTENTS'),
  note: L(
    `Versão ${PRIVACY_VERSION} · em vigor desde ${LEGAL_EFFECTIVE_DATE}. Descreve o tratamento de dados na Beta Sandbox; as operações com dinheiro real não estão disponíveis.`,
    `Version ${PRIVACY_VERSION} · effective ${LEGAL_EFFECTIVE_DATE}. Describes data processing in the Beta Sandbox; real-money operations are not available.`,
  ),
};

const secStyle: CSSProperties = {
  scrollMarginTop: '110px', background: '#fff', border: '1px solid #F3E3E1', borderRadius: '24px',
  padding: 'clamp(22px,3vw,34px)', marginBottom: '14px', boxShadow: '0 24px 50px -44px rgba(122,16,22,.4)',
};
const h2Style: CSSProperties = {
  margin: 0, display: 'flex', alignItems: 'baseline', gap: '12px', fontSize: 'clamp(20px,2vw,24px)',
  fontWeight: 900, letterSpacing: '-.02em', color: '#141014',
};
const numStyle: CSSProperties = { fontFamily: "'JetBrains Mono',monospace", fontSize: '13px', fontWeight: 600, color: '#B5101F' };
const bodyStyle: CSSProperties = { marginTop: '12px', fontSize: '15px', lineHeight: 1.7, fontWeight: 600, color: '#5a4a4e' };
const pStyle: CSSProperties = { margin: '0 0 12px', textWrap: 'pretty' };
const ulStyle: CSSProperties = { margin: '0 0 12px', paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px' };

function renderBlocks(body: Block[], lang: Lang): ReactNode {
  return body.map((b, i) => {
    if ('ul' in b) {
      return <ul key={i} style={ulStyle}>{b.ul.map((it, j) => <li key={j}>{it[lang]}</li>)}</ul>;
    }
    return <p key={i} style={pStyle}>{b.p[lang]}</p>;
  });
}

function DocSection({ id, n, title, children }: { id: string; n: string; title: ReactNode; children: ReactNode }) {
  return (
    <section id={id} style={secStyle}>
      <h2 style={h2Style}><span style={numStyle}>{n}</span>{title}</h2>
      <div style={bodyStyle}>{children}</div>
    </section>
  );
}

export function PrivacidadePage({ lang }: { lang: Lang }) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: '.bz-toc a:hover{background:#FFF1F0;color:#B5101F}' }} />

      {/* ═══════════════ 00 · HERO ═══════════════ */}
      <section id="inicio" style={{ position: 'relative', padding: '128px 24px 56px', overflow: 'hidden' }}>
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', right: '-8%', top: '-20%', width: '640px', height: '640px', borderRadius: '50%', background: 'radial-gradient(circle,rgba(251,210,208,.75),rgba(251,210,208,0) 68%)' }} />
          <div style={{ position: 'absolute', left: '-12%', bottom: '-40%', width: '520px', height: '520px', borderRadius: '50%', background: 'radial-gradient(circle,rgba(255,228,226,.8),rgba(255,228,226,0) 70%)' }} />
        </div>
        <div style={{ position: 'relative', maxWidth: '1140px', margin: '0 auto' }}>
          <div>
            <Badge>{T.badge[lang]}</Badge>
            <h1 style={{ margin: '22px 0 0', fontSize: 'clamp(36px,4.2vw,56px)', fontWeight: 900, lineHeight: 1.02, letterSpacing: '-.035em', color: '#141014', textWrap: 'balance' }}>
              {T.h1a[lang]}<br /><span style={{ color: '#B5101F' }}>{T.h1b[lang]}</span>
            </h1>
            <p style={{ margin: '20px 0 0', fontSize: 'clamp(16px,1.4vw,18px)', lineHeight: 1.55, color: '#4a3a3e', fontWeight: 600, maxWidth: '600px', textWrap: 'pretty' }}>{T.lead[lang]}</p>
          </div>
        </div>
      </section>

      {/* ═══════════════ DOCUMENTO ═══════════════ */}
      <section style={{ position: 'relative', padding: '8px 24px clamp(64px,8vw,110px)', overflow: 'clip' }}>
        <div style={{ position: 'relative', maxWidth: '1140px', margin: '0 auto' }}>
          <div className="bz-doc" style={{ display: 'grid', gridTemplateColumns: '260px minmax(0,1fr)', gap: '48px', alignItems: 'start' }}>
            <nav className="bz-toc" aria-label={T.tocLabel[lang]} style={{ position: 'sticky', top: '104px', background: '#fff', border: '1px solid #F3E3E1', borderRadius: '22px', padding: '20px', boxShadow: '0 24px 50px -40px rgba(122,16,22,.4)' }}>
              <p style={{ margin: '0 0 10px', fontSize: '11px', fontWeight: 900, letterSpacing: '.18em', color: '#9a8487' }}>{T.tocTitle[lang]}</p>
              {PRIVACY_SECTIONS.map((s) => (
                <a key={s.id} href={`#${s.id}`} style={{ display: 'flex', gap: '10px', padding: '8px 10px', borderRadius: '10px', textDecoration: 'none', fontSize: '13.5px', fontWeight: 700, color: '#4a3a3e', transition: 'background .2s' }}>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '11px', color: '#B5101F', paddingTop: '2px' }}>{s.n}</span>{s.title[lang]}
                </a>
              ))}
            </nav>
            <article style={{ minWidth: 0 }}>
              <div role="note" style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '16px 18px', borderRadius: '18px', background: 'linear-gradient(135deg,#FFFCF3,#FFF6DD)', border: '1px solid #F1DFA6', marginBottom: '28px' }}>
                <p style={{ margin: 0, fontSize: '13.5px', lineHeight: 1.55, fontWeight: 700, color: '#6a4a0e' }}>{T.note[lang]}</p>
              </div>
              {PRIVACY_SECTIONS.map((s) => (
                <DocSection key={s.id} id={s.id} n={s.n} title={s.title[lang]}>{renderBlocks(s.body, lang)}</DocSection>
              ))}
            </article>
          </div>
        </div>
      </section>
    </>
  );
}
