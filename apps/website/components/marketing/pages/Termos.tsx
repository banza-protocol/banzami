import type { CSSProperties, ReactNode } from 'react';
import { Badge, Icon } from '../kit';
import { type Lang, type Loc } from '@/lib/marketing/nav';

/**
 * /termos — ported verbatim from handoff_site_completo/pages/Termos(.EN).dc.html.
 * Body only: the shared SiteShell provides header + footer + page background.
 * docPage layout: sticky TOC (.bz-toc) + numbered section cards (.bz-doc grid) +
 * the provisional-document note. Copy is legal text — reproduced exactly, no
 * clauses invented. All still provisional (noindex on the route).
 */

const L = (pt: string, en: string): Loc => ({ pt, en });

// ── copy ──────────────────────────────────────────────────────────────────
const T = {
  badge: L('Documento legal', 'Legal document'),
  h1a: L('Termos de', 'Terms of'),
  h1b: L('Utilização.', 'Use.'),
  lead: L(
    'As regras de utilização da app Banzami, do Banzami Business e das ferramentas para developers.',
    'The rules for using the Banzami app, Banzami Business and the developer tools.',
  ),
  tocLabel: L('Índice', 'Contents'),
  tocTitle: L('ÍNDICE', 'CONTENTS'),
  noteLine1: L(
    'Documento provisório. O texto final será publicado antes da disponibilização do Financial Live.',
    'Provisional document. The final text will be published before Financial Live becomes available.',
  ),
  noteLine2: L('Última atualização: {year} · versão provisória', 'Last updated: {year} · provisional version'),
};

type Sec = { id: string; n: string; title: Loc };
const SECTIONS: Sec[] = [
  { id: 'ambito', n: '01', title: L('Âmbito', 'Scope') },
  { id: 'sandbox', n: '02', title: L('Fase Beta e Sandbox', 'Beta phase and Sandbox') },
  { id: 'conta', n: '03', title: L('Conta e @banza', 'Account and @banza') },
  { id: 'utilizacao', n: '04', title: L('Utilização aceitável', 'Acceptable use') },
  { id: 'business', n: '05', title: L('Banzami Business', 'Banzami Business') },
  { id: 'developers', n: '06', title: L('Developers e API', 'Developers and API') },
  { id: 'responsabilidade', n: '07', title: L('Limitação de responsabilidade', 'Limitation of liability') },
  { id: 'alteracoes', n: '08', title: L('Alterações', 'Changes') },
  { id: 'contacto', n: '09', title: L('Contacto', 'Contact') },
];

// ── shared inline styles (dossier-exact) ────────────────────────────────────
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

function DocSection({ id, n, title, children }: { id: string; n: string; title: ReactNode; children: ReactNode }) {
  return (
    <section id={id} style={secStyle}>
      <h2 style={h2Style}><span style={numStyle}>{n}</span>{title}</h2>
      <div style={bodyStyle}>{children}</div>
    </section>
  );
}

// ── section bodies (verbatim) ───────────────────────────────────────────────
function body(id: string, lang: Lang): ReactNode {
  const pt = lang === 'pt';
  switch (id) {
    case 'ambito':
      return (
        <>
          <p style={pStyle}>{pt
            ? 'Estes termos regem a utilização da app Banzami, do Banzami Business, da API e do Portal Developers, operados pelo Banzami.'
            : 'These terms govern the use of the Banzami app, Banzami Business, the API and the Developer Portal, operated by Banzami.'}</p>
          <p style={pStyle}>{pt ? '[Texto provisório — a completar pela equipa jurídica.]' : '[Provisional text — to be completed by the legal team.]'}</p>
        </>
      );
    case 'sandbox':
      return (
        <>
          <p style={pStyle}>{pt
            ? 'Nesta fase, o Banzami funciona apenas em Sandbox. Todos os saldos e pagamentos usam dinheiro fictício, sem valor financeiro.'
            : 'In this phase, Banzami runs only in the Sandbox. All balances and payments use test money with no financial value.'}</p>
          <p style={pStyle}>{pt
            ? 'O Financial Live permanece indisponível, sujeito às aprovações aplicáveis.'
            : 'Financial Live remains unavailable, subject to the applicable approvals.'}</p>
        </>
      );
    case 'conta':
      return (
        <>
          <p style={pStyle}>{pt
            ? 'Cada conta é uma carteira em Kwanza identificada por um @banza único. É responsável por manter o acesso à sua conta seguro.'
            : 'Each account is a Kwanza wallet identified by a unique @banza. You are responsible for keeping access to your account secure.'}</p>
          <p style={pStyle}>{pt ? '[Texto provisório.]' : '[Provisional text.]'}</p>
        </>
      );
    case 'utilizacao':
      return (
        <ul style={ulStyle}>
          {pt ? (
            <>
              <li>Não usar o serviço para atividades ilícitas.</li>
              <li>Não tentar aceder a contas ou dados de terceiros.</li>
              <li>Não interferir com o funcionamento do serviço.</li>
            </>
          ) : (
            <>
              <li>Do not use the service for unlawful activities.</li>
              <li>Do not try to access third-party accounts or data.</li>
              <li>Do not interfere with the operation of the service.</li>
            </>
          )}
        </ul>
      );
    case 'business':
      return (
        <>
          <p style={pStyle}>{pt
            ? 'Os negócios registados aceitam cobrar através de QR, links e ferramentas de cobrança, de acordo com as condições comunicadas na aprovação.'
            : 'Registered businesses agree to charge through QR, links and billing tools, under the conditions communicated on approval.'}</p>
          <p style={pStyle}>{pt ? '[Texto provisório.]' : '[Provisional text.]'}</p>
        </>
      );
    case 'developers':
      return (
        <>
          <p style={pStyle}>{pt
            ? 'O acesso à API e ao SDK está sujeito às chaves emitidas no Portal Developers e à documentação publicada.'
            : 'Access to the API and SDK is subject to the keys issued in the Developer Portal and to the published documentation.'}</p>
          <p style={pStyle}>{pt ? '[Texto provisório.]' : '[Provisional text.]'}</p>
        </>
      );
    case 'responsabilidade':
      return (
        <p style={pStyle}>{pt ? '[Texto provisório — a completar pela equipa jurídica.]' : '[Provisional text — to be completed by the legal team.]'}</p>
      );
    case 'alteracoes':
      return (
        <p style={pStyle}>{pt
          ? 'Podemos atualizar estes termos. Publicaremos a nova versão nesta página com a data de atualização.'
          : 'We may update these terms. We will publish the new version on this page with the update date.'}</p>
      );
    case 'contacto':
      return (
        <p style={pStyle}>
          {pt ? 'Questões sobre estes termos: ' : 'Questions about these terms: '}
          <a href="mailto:contact@banzami.com">contact@banzami.com</a>.
        </p>
      );
    default:
      return null;
  }
}

export function TermosPage({ lang }: { lang: Lang }) {
  const year = new Date().getFullYear();
  return (
    <>
      {/* page-scoped hover for TOC links (globals.css owns the ≤920px collapse) */}
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
              {SECTIONS.map((s) => (
                <a key={s.id} href={`#${s.id}`} style={{ display: 'flex', gap: '10px', padding: '8px 10px', borderRadius: '10px', textDecoration: 'none', fontSize: '13.5px', fontWeight: 700, color: '#4a3a3e', transition: 'background .2s' }}>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '11px', color: '#B5101F', paddingTop: '2px' }}>{s.n}</span>{s.title[lang]}
                </a>
              ))}
            </nav>
            <article style={{ minWidth: 0 }}>
              <div role="note" style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '16px 18px', borderRadius: '18px', background: 'linear-gradient(135deg,#FFFCF3,#FFF6DD)', border: '1px solid #F1DFA6', marginBottom: '28px' }}>
                <Icon name="info" size={18} color="#7A4A06" width={2} />
                <p style={{ margin: 0, fontSize: '13.5px', lineHeight: 1.55, fontWeight: 700, color: '#6a4a0e' }}>
                  {T.noteLine1[lang]}<br />
                  <span style={{ fontWeight: 600, color: '#8a6a2e' }}>{T.noteLine2[lang].replace('{year}', String(year))}</span>
                </p>
              </div>
              {SECTIONS.map((s) => (
                <DocSection key={s.id} id={s.id} n={s.n} title={s.title[lang]}>{body(s.id, lang)}</DocSection>
              ))}
            </article>
          </div>
        </div>
      </section>
    </>
  );
}
