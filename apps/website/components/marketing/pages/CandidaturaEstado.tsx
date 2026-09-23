'use client';

import { useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Ribbon, Badge, H1, H2, HeroLead, Small, SectionLabel } from '../kit';
import { Field, SubmitBtn } from '../form-kit';
import { Rotator } from '../Rotator';
import { Reveal } from '@/components/Reveal';
import { route, type Lang } from '@/lib/marketing/nav';

/**
 * Comerciantes · Estado da candidatura — ported verbatim from
 * handoff_site_completo/pages/Comerciantes Estado.dc.html (PT) and
 * Comerciantes Estado EN.dc.html (EN). Status lookup by BZB- code; on submit
 * shows a 4-phase timeline (currently always "Em análise"). Client-side only.
 * Body only; header/footer come from <SiteShell>.
 */

const CONTENT: CSSProperties = { position: 'relative', maxWidth: '1140px', margin: '0 auto' };

const T = {
  pt: {
    badge: 'Versão Beta · Sandbox',
    h1a: 'Estado da', h1b: 'candidatura.',
    lead: 'Introduza o código da candidatura para ver em que fase está o registo do seu negócio.',
    smallPre: 'Ainda não se registou? ', smallLink: 'Registar o negócio', smallPost: '.',
    cardT: 'Consultar candidatura', cardSub: 'O código foi enviado por e-mail quando submeteu a candidatura.',
    l_codigo: 'Código da candidatura', ph_codigo: 'BZB-7Q4K2M',
    consultar: 'Consultar estado',
    resultLabel: 'CANDIDATURA', statusBadge: 'Em análise',
    phases: [
      { t: 'Recebida', d: 'A candidatura deu entrada.' },
      { t: 'Em análise', d: 'A equipa está a rever os dados do negócio.', current: 'Atual' },
      { t: 'Decisão', d: 'Receberá a decisão por e-mail.' },
      { t: 'Ativação', d: 'Ative o negócio com o link que lhe enviarmos.' },
    ],
    outro: 'Consultar outro código', suporte: 'Falar com o suporte',
    fasesLabel: 'FASES', fasesA: 'Da candidatura', fasesB: 'à ativação.',
    fasesLead: 'Cada candidatura passa por quatro fases. Enviamos um e-mail sempre que muda de fase.',
    cards: [
      { tag: '01', t: 'Recebida', d: 'A candidatura entrou e tem um código.' },
      { tag: '02', t: 'Em análise', d: 'Revemos os dados do negócio e do responsável.' },
      { tag: '03', t: 'Decisão', d: 'Aprovada ou com pedido de informação adicional.' },
      { tag: '04', t: 'Ativação', d: 'Ativa o negócio com o link recebido.' },
    ],
    v_default: 'Campo obrigatório.', v_codigo: 'Use o formato BZB-XXXXXX.',
  },
  en: {
    badge: 'Beta · Sandbox',
    h1a: 'Application', h1b: 'status.',
    lead: 'Enter your application code to see what stage your business registration is at.',
    smallPre: 'Not registered yet? ', smallLink: 'Register your business', smallPost: '.',
    cardT: 'Check application', cardSub: 'The code was emailed to you when you submitted the application.',
    l_codigo: 'Application code', ph_codigo: 'BZB-7Q4K2M',
    consultar: 'Check status',
    resultLabel: 'APPLICATION', statusBadge: 'Under review',
    phases: [
      { t: 'Received', d: 'The application has been received.' },
      { t: 'Under review', d: 'The team is reviewing the business details.', current: 'Current' },
      { t: 'Decision', d: 'You will receive the decision by email.' },
      { t: 'Activation', d: 'Activate the business with the link we send you.' },
    ],
    outro: 'Check another code', suporte: 'Contact support',
    fasesLabel: 'STAGES', fasesA: 'From application', fasesB: 'to activation.',
    fasesLead: 'Every application goes through four stages. We email you whenever the stage changes.',
    cards: [
      { tag: '01', t: 'Received', d: 'The application is in and has a code.' },
      { tag: '02', t: 'Under review', d: 'We review the business and representative details.' },
      { tag: '03', t: 'Decision', d: 'Approved, or a request for more information.' },
      { tag: '04', t: 'Activation', d: 'Activate the business with the link you receive.' },
    ],
    v_default: 'Required field.', v_codigo: 'Use the format BZB-XXXXXX.',
  },
} as const;

// phase-card icons (dossier order: doc · search · check · key)
const CARD_ICONS: ReactNode[] = [
  <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></>,
  <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>,
  <path d="M5 12.5l4.5 4.5L19 7.5" />,
  <><circle cx="8" cy="15" r="4" /><path d="M10.8 12.2L20 3M16 7l3 3M14 9l2 2" /></>,
];

function InfoDot() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
  );
}

export function CandidaturaEstadoPage({ lang }: { lang: Lang }) {
  const t = T[lang];
  const [done, setDone] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [err, setErr] = useState('');
  const formRef = useRef<HTMLDivElement>(null);

  const re = /^BZB-[A-Z0-9]{4,}$/i;
  const submit = (e?: React.FormEvent) => {
    if (e && e.preventDefault) e.preventDefault();
    // TODO: GET estado from backend
    let m = '';
    const v = codigo;
    if (v === undefined || v === '') m = t.v_default;
    else if (!re.test(String(v).trim())) m = t.v_codigo;
    setErr(m);
    if (m) { const el = formRef.current?.querySelector<HTMLElement>('[name="codigo"]'); el?.focus(); return; }
    setDone(true);
  };
  const reset = () => { setDone(false); setCodigo(''); setErr(''); };
  const codeUp = String(codigo || '').toUpperCase();

  return (
    <>
      {/* ─── 00 · HERO ─── */}
      <section id="inicio" style={{ position: 'relative', padding: '128px 24px 56px', overflow: 'hidden' }}>
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', right: '-8%', top: '-20%', width: '640px', height: '640px', borderRadius: '50%', background: 'radial-gradient(circle,rgba(251,210,208,.75),rgba(251,210,208,0) 68%)' }} />
          <div style={{ position: 'absolute', left: '-12%', bottom: '-40%', width: '520px', height: '520px', borderRadius: '50%', background: 'radial-gradient(circle,rgba(255,228,226,.8),rgba(255,228,226,0) 70%)' }} />
        </div>
        <Ribbon />
        <div className="bz-g2" style={{ position: 'relative', maxWidth: '1140px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '56px', alignItems: 'center' }}>
          <Reveal>
            <Badge>{t.badge}</Badge>
            <H1 a={t.h1a} b={t.h1b} size="clamp(36px,4.2vw,56px)" />
            <HeroLead mw={600}>{t.lead}</HeroLead>
            <Small mw={600}>{t.smallPre}<a href={route('candidatura', lang)} style={{ fontWeight: 800 }}>{t.smallLink}</a>{t.smallPost}</Small>
          </Reveal>
          <Reveal delay={120}>
            <div ref={formRef} style={{ position: 'relative', background: '#fff', border: '1px solid #F3E3E1', borderRadius: '28px', padding: 'clamp(22px,3vw,32px)', boxShadow: '0 40px 80px -50px rgba(122,16,22,.5)' }}>
              {!done && (
                <>
                  <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 900, letterSpacing: '-.01em', color: '#141014' }}>{t.cardT}</h3>
                  <p style={{ margin: '6px 0 18px', fontSize: '13.5px', fontWeight: 600, color: '#8a7a7e' }}>{t.cardSub}</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(1,minmax(0,1fr))', gap: '16px 18px' }}>
                    <Field name="codigo" label={t.l_codigo} placeholder={t.ph_codigo} mono span2 value={codigo} error={err} onChange={(v) => { setCodigo(v); setErr(''); }} />
                  </div>
                  <div style={{ marginTop: '18px' }}>
                    <SubmitBtn type="submit" onClick={() => submit()}>{t.consultar}</SubmitBtn>
                  </div>
                </>
              )}
              {done && (
                <div role="status">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                    <div>
                      <p style={{ margin: 0, fontSize: '11px', fontWeight: 900, letterSpacing: '.16em', color: '#9a8487' }}>{t.resultLabel}</p>
                      <p style={{ margin: '4px 0 0', fontFamily: "'JetBrains Mono',monospace", fontSize: '17px', fontWeight: 600, color: '#B5101F' }}>{codeUp}</p>
                    </div>
                    <span style={{ padding: '6px 12px', borderRadius: '20px', background: '#FCEFC4', border: '1px solid #E9C66A', fontSize: '12px', fontWeight: 900, color: '#7A4A06' }}>{t.statusBadge}</span>
                  </div>
                  <div style={{ marginTop: '22px' }}>
                    {t.phases.map((ph, i) => {
                      const isDone = i === 0, isCurrent = i === 1;
                      return (
                        <div key={i} style={{ position: 'relative', display: 'flex', gap: '14px', paddingBottom: '18px' }}>
                          <span style={{ flex: 'none', width: '30px', height: '30px', borderRadius: '50%', background: isDone ? '#1a1416' : isCurrent ? 'linear-gradient(150deg,#D8121F,#8E1620)' : '#fff', color: isDone || isCurrent ? '#fff' : '#9a8487', border: `1.5px solid ${isDone || isCurrent ? 'transparent' : '#EFDCDA'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'JetBrains Mono',monospace", fontSize: '11.5px', fontWeight: 600, boxShadow: isCurrent ? '0 0 0 5px rgba(216,18,31,.14)' : undefined }}>
                            {isDone ? <InfoDot /> : i + 1}
                          </span>
                          <div>
                            <p style={{ margin: '4px 0 0', fontSize: '14.5px', fontWeight: 900, color: i <= 1 ? '#141014' : '#9a8487' }}>
                              {ph.t}
                              {'current' in ph && ph.current && <span style={{ marginLeft: '6px', padding: '2px 8px', borderRadius: '10px', background: '#FFF1F0', fontSize: '11px', color: '#B5101F' }}>{ph.current}</span>}
                            </p>
                            <p style={{ margin: '3px 0 0', fontSize: '13px', lineHeight: 1.45, fontWeight: 600, color: '#8a7a7e' }}>{ph.d}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '6px' }}>
                    <button type="button" onClick={reset} style={{ padding: '12px 20px', borderRadius: '40px', border: '1px solid #F3E3E1', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800, fontSize: '14.5px', color: '#141014' }}>{t.outro}</button>
                    <a href={route('suporte', lang)} className="bz-btntext" style={{ display: 'inline-flex', alignItems: 'center', gap: '9px', color: '#141014', fontWeight: 800, fontSize: '14.5px', whiteSpace: 'nowrap', textDecoration: 'none' }}>{t.suporte}<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg></a>
                  </div>
                </div>
              )}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ─── 01 · FASES ─── */}
      <section style={{ position: 'relative', padding: 'clamp(64px,8vw,116px) 24px', margin: '28px 14px', borderRadius: '48px', background: '#fff', boxShadow: '0 40px 90px -70px rgba(122,16,22,.55)', overflow: 'hidden' }}>
        <Reveal><div style={CONTENT}>
          <div className="bz-g2" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.1fr) minmax(0,.9fr)', gap: '20px 56px', alignItems: 'end' }}>
            <div>
              <SectionLabel n="01" label={t.fasesLabel} panel />
              <H2 a={t.fasesA} b={t.fasesB} />
            </div>
            <p style={{ margin: '0 0 6px', fontSize: '16px', lineHeight: 1.6, fontWeight: 600, color: '#6a5a5e', maxWidth: '480px', textWrap: 'pretty' }}>{t.fasesLead}</p>
          </div>
          <Rotator mode="card" idle="#FFF8F7" className="bz-g4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: '14px', marginTop: '44px' }}>
            {t.cards.map((c, i) => (
              <div key={i} data-ri style={{ position: 'relative', overflow: 'hidden', padding: '20px 20px 22px', borderRadius: '22px', border: '1px solid rgba(181,16,31,.06)', background: '#FFF8F7', transition: 'background .6s,border-color .6s,box-shadow .6s,transform .6s cubic-bezier(.16,1,.3,1)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                  <span data-ri-ic style={{ flex: 'none', width: '42px', height: '42px', borderRadius: '13px', background: '#FFF1F0', color: '#B5101F', border: '1px solid rgba(181,16,31,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .6s,color .6s,box-shadow .6s' }}>
                    <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{CARD_ICONS[i]}</svg>
                  </span>
                  <span data-ri-tag style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '10.5px', fontWeight: 600, letterSpacing: '.06em', color: '#B5101F', opacity: 0, transition: 'opacity .6s' }}>{c.tag}</span>
                </div>
                <p style={{ margin: '16px 0 0', fontSize: '16px', fontWeight: 900, letterSpacing: '-.01em', color: '#141014' }}>{c.t}</p>
                <p style={{ margin: '6px 0 0', fontSize: '13.5px', lineHeight: 1.5, fontWeight: 600, color: '#8a7a7e', textWrap: 'pretty' }}>{c.d}</p>
                <span data-ri-bar style={{ position: 'absolute', left: '16px', right: '16px', bottom: 0, height: '2px', borderRadius: '2px', background: 'rgba(181,16,31,.08)', overflow: 'hidden', opacity: 0, transition: 'opacity .6s' }}>
                  <span style={{ display: 'block', height: '100%', width: 0, background: 'linear-gradient(90deg,#D8121F,#9A1B22)' }} />
                </span>
              </div>
            ))}
          </Rotator>
        </div></Reveal>
      </section>
    </>
  );
}
