import type { CSSProperties, ReactNode } from 'react';
import { Ribbon, Badge, Btn, Icon } from '../kit';
import { route, type Lang, type Loc } from '@/lib/marketing/nav';

/**
 * /privacidade — ported verbatim from handoff_site_completo/pages/Privacidade.dc.html
 * and Privacy EN.dc.html. Body only: the shared SiteShell provides header + footer
 * + page background. docPage layout: sticky TOC (.bz-toc) + numbered section cards
 * (.bz-doc grid) + the provisional-document note. Legal copy reproduced exactly,
 * nothing invented. Still provisional (noindex on the route).
 */

const L = (pt: string, en: string): Loc => ({ pt, en });

const T = {
  badge: L('Documento legal', 'Legal document'),
  h1a: L('Política de', 'Privacy'),
  h1b: L('Privacidade.', 'Policy.'),
  lead: L(
    'Que dados tratamos, porquê, e como pode exercer os seus direitos.',
    'What data we process, why, and how you can exercise your rights.',
  ),
  altBtn: L('English version', 'Versão em português'),
  tocLabel: L('Índice', 'Contents'),
  tocTitle: L('ÍNDICE', 'CONTENTS'),
  noteLine1: L(
    'Documento provisório. O texto final será publicado antes da disponibilização do Financial Live.',
    'Provisional document. The final text will be published before Financial Live becomes available.',
  ),
  noteLine2: L('Última atualização: {year} · versão provisória', 'Last updated: {year} · provisional version'),
};

type Sec = { key: string; id: Loc; n: string; title: Loc };
const SECTIONS: Sec[] = [
  { key: 'controller', id: L('responsavel', 'controller'), n: '01', title: L('Responsável pelo tratamento', 'Data controller') },
  { key: 'data', id: L('dados', 'data'), n: '02', title: L('Dados que tratamos', 'Data we process') },
  { key: 'purposes', id: L('finalidades', 'purposes'), n: '03', title: L('Finalidades', 'Purposes') },
  { key: 'receipts', id: L('comprovativos', 'receipts'), n: '04', title: L('Verificação de comprovativos', 'Receipt verification') },
  { key: 'sharing', id: L('partilha', 'sharing'), n: '05', title: L('Partilha de dados', 'Data sharing') },
  { key: 'retention', id: L('conservacao', 'retention'), n: '06', title: L('Conservação', 'Retention') },
  { key: 'rights', id: L('direitos', 'rights'), n: '07', title: L('Os seus direitos', 'Your rights') },
  { key: 'security', id: L('seguranca', 'security'), n: '08', title: L('Segurança', 'Security') },
  { key: 'changes', id: L('alteracoes', 'changes'), n: '09', title: L('Alterações', 'Changes') },
];

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

function body(key: string, lang: Lang): ReactNode {
  const pt = lang === 'pt';
  switch (key) {
    case 'controller':
      return (
        <>
          <p style={pStyle}>{pt
            ? 'O Banzami é responsável pelo tratamento dos dados pessoais recolhidos através da app, do Banzami Business e do Portal Developers.'
            : 'Banzami is the controller of personal data collected through the app, Banzami Business and the Developer Portal.'}</p>
          <p style={pStyle}>{pt ? '[Identificação legal a completar.]' : '[Legal identification to be completed.]'}</p>
        </>
      );
    case 'data':
      return (
        <ul style={ulStyle}>
          {pt ? (
            <>
              <li>Dados de conta: nome, e-mail, telefone e @banza.</li>
              <li>Dados de pagamentos: valores, datas, referências e contrapartes.</li>
              <li>Dados de negócio, no Banzami Business: nome, NIF, categoria e responsável.</li>
              <li>Dados técnicos: registos de acesso e segurança.</li>
            </>
          ) : (
            <>
              <li>Account data: name, email, phone and @banza.</li>
              <li>Payment data: amounts, dates, references and counterparties.</li>
              <li>Business data, for Banzami Business: name, tax ID, category and representative.</li>
              <li>Technical data: access and security logs.</li>
            </>
          )}
        </ul>
      );
    case 'purposes':
      return (
        <ul style={ulStyle}>
          {pt ? (
            <>
              <li>Prestar o serviço e processar pagamentos na Sandbox.</li>
              <li>Emitir e verificar comprovativos.</li>
              <li>Prevenir fraude e proteger contas.</li>
              <li>Responder a pedidos de suporte.</li>
            </>
          ) : (
            <>
              <li>Provide the service and process payments in the Sandbox.</li>
              <li>Issue and verify receipts.</li>
              <li>Prevent fraud and protect accounts.</li>
              <li>Answer support requests.</li>
            </>
          )}
        </ul>
      );
    case 'receipts':
      return (
        <p style={pStyle}>{pt
          ? 'A página de verificação confirma a validade, o valor, a data e a referência de um comprovativo. Não revela saldos, histórico nem dados de contacto.'
          : 'The verification page confirms a receipt’s validity, amount, date and reference. It does not reveal balances, history or contact details.'}</p>
      );
    case 'sharing':
      return (
        <p style={pStyle}>{pt
          ? 'Não vendemos dados pessoais. [Lista de subcontratantes a completar.]'
          : 'We do not sell personal data. [List of processors to be completed.]'}</p>
      );
    case 'retention':
      return (
        <p style={pStyle}>{pt ? '[Prazos de conservação a completar.]' : '[Retention periods to be completed.]'}</p>
      );
    case 'rights':
      return (
        <p style={pStyle}>
          {pt ? 'Pode pedir acesso, retificação ou eliminação dos seus dados escrevendo para ' : 'You can request access, correction or deletion of your data by writing to '}
          <a href="mailto:contact@banzami.com">contact@banzami.com</a>.
        </p>
      );
    case 'security':
      return pt ? (
        <p style={pStyle}>
          Ligações cifradas por TLS, ledger imutável e controlo de acessos. Saiba mais em <a href={route('seguranca', lang)}>Segurança</a>.
        </p>
      ) : (
        <p style={pStyle}>TLS-encrypted connections, an immutable ledger and access controls.</p>
      );
    case 'changes':
      return (
        <p style={pStyle}>{pt
          ? 'Publicaremos qualquer nova versão nesta página, com a data de atualização.'
          : 'We will publish any new version on this page with its update date.'}</p>
      );
    default:
      return null;
  }
}

export function PrivacidadePage({ lang }: { lang: Lang }) {
  const year = new Date().getFullYear();
  const altHref = route('privacidade', lang === 'pt' ? 'en' : 'pt');
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
        <Ribbon />
        <div style={{ position: 'relative', maxWidth: '1140px', margin: '0 auto' }}>
          <div>
            <Badge>{T.badge[lang]}</Badge>
            <h1 style={{ margin: '22px 0 0', fontSize: 'clamp(36px,4.2vw,56px)', fontWeight: 900, lineHeight: 1.02, letterSpacing: '-.035em', color: '#141014', textWrap: 'balance' }}>
              {T.h1a[lang]}<br /><span style={{ color: '#B5101F' }}>{T.h1b[lang]}</span>
            </h1>
            <p style={{ margin: '20px 0 0', fontSize: 'clamp(16px,1.4vw,18px)', lineHeight: 1.55, color: '#4a3a3e', fontWeight: 600, maxWidth: '600px', textWrap: 'pretty' }}>{T.lead[lang]}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '14px', marginTop: '22px' }}>
              <Btn href={altHref} kind="ghost">{T.altBtn[lang]}</Btn>
            </div>
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
                <a key={s.key} href={`#${s.id[lang]}`} style={{ display: 'flex', gap: '10px', padding: '8px 10px', borderRadius: '10px', textDecoration: 'none', fontSize: '13.5px', fontWeight: 700, color: '#4a3a3e', transition: 'background .2s' }}>
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
                <DocSection key={s.key} id={s.id[lang]} n={s.n} title={s.title[lang]}>{body(s.key, lang)}</DocSection>
              ))}
            </article>
          </div>
        </div>
      </section>
    </>
  );
}
