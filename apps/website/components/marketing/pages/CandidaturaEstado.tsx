'use client';

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Badge, H1, H2, HeroLead, Small, SectionLabel } from '../kit';
import { Field, SubmitBtn } from '../form-kit';
import { Rotator } from '../Rotator';
import { Reveal } from '@/components/Reveal';
import { route, type Lang } from '@/lib/marketing/nav';
import { fetchApplicationStatus, isApplicationReference, STATUS_COPY, type ApplicationStatus } from '@/lib/application-status';

/**
 * Comerciantes · Estado da candidatura — real status lookup by the application
 * reference (the server-issued application id / UUID). Renders only real backend
 * states; no fabricated timeline. Prefilled from ?ref= after a submission. Body
 * only; header/footer come from <SiteShell>.
 */

const CONTENT: CSSProperties = { position: 'relative', maxWidth: '1140px', margin: '0 auto' };

const T = {
  pt: {
    badge: 'Versão Beta · Sandbox',
    h1a: 'Estado da', h1b: 'candidatura.',
    lead: 'Introduza o código da candidatura para ver em que fase está o registo do seu negócio.',
    smallPre: 'Ainda não se registou? ', smallLink: 'Registar o negócio', smallPost: '.',
    cardT: 'Consultar candidatura', cardSub: 'A referência foi mostrada quando submeteu a candidatura e enviada por e-mail.',
    l_codigo: 'Referência da candidatura', ph_codigo: '00000000-0000-0000-0000-000000000000',
    consultar: 'Consultar estado', consultando: 'A consultar…',
    resultLabel: 'CANDIDATURA',
    needLabel: 'Ainda em falta', notFound: 'Não encontrámos uma candidatura com essa referência. Verifique e tente de novo.', unavailable: 'Não foi possível consultar agora. Tente novamente.',
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
    v_default: 'Campo obrigatório.', v_codigo: 'Use a referência (UUID) que recebeu.',
  },
  en: {
    badge: 'Beta · Sandbox',
    h1a: 'Application', h1b: 'status.',
    lead: 'Enter your application code to see what stage your business registration is at.',
    smallPre: 'Not registered yet? ', smallLink: 'Register your business', smallPost: '.',
    cardT: 'Check application', cardSub: 'The reference was shown when you submitted and emailed to you.',
    l_codigo: 'Application reference', ph_codigo: '00000000-0000-0000-0000-000000000000',
    consultar: 'Check status', consultando: 'Checking…',
    resultLabel: 'APPLICATION',
    needLabel: 'Still needed', notFound: 'We could not find an application with that reference. Check it and try again.', unavailable: 'Could not check right now. Please try again.',
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
    v_default: 'Required field.', v_codigo: 'Use the reference (UUID) you received.',
  },
} as const;

// Bilingual status copy (title + one line), keyed by the real backend statuses.
const STATUS_LABEL: Record<ApplicationStatus['status'], { pt: string; en: string; body_en: string }> = {
  DRAFT: { pt: STATUS_COPY.DRAFT.title, en: 'Draft', body_en: 'The application has not been submitted yet.' },
  SUBMITTED: { pt: STATUS_COPY.SUBMITTED.title, en: 'Received', body_en: 'The Banzami team will review your business details.' },
  UNDER_REVIEW: { pt: STATUS_COPY.UNDER_REVIEW.title, en: 'Under review', body_en: 'The Banzami team is reviewing your application.' },
  INFORMATION_REQUIRED: { pt: STATUS_COPY.INFORMATION_REQUIRED.title, en: 'More information needed', body_en: 'Review is on hold until you answer the request below. The application stays open and the @business stays reserved.' },
  APPROVED: { pt: STATUS_COPY.APPROVED.title, en: 'Approved', body_en: 'Your business was approved. You received an email with the link to activate access to the Banzami Business app.' },
  REJECTED: { pt: STATUS_COPY.REJECTED.title, en: 'Not approved', body_en: 'The application was not approved. You received the reason by email and can apply again.' },
  CANCELLED: { pt: STATUS_COPY.CANCELLED.title, en: 'Cancelled', body_en: 'This application was cancelled.' },
  PROVISIONING_FAILED: { pt: STATUS_COPY.PROVISIONING_FAILED.title, en: 'Approved — finishing', body_en: 'The application was approved and the Banzami team is finishing creating your account.' },
};

// Which of the four visible phases a real status sits at.
function phaseFor(status: ApplicationStatus['status']): number {
  switch (status) {
    case 'DRAFT': return 0;
    case 'SUBMITTED': return 1;
    case 'UNDER_REVIEW': case 'INFORMATION_REQUIRED': return 1;
    case 'REJECTED': return 2;
    case 'APPROVED': case 'PROVISIONING_FAILED': return 3;
    case 'CANCELLED': return 2;
    default: return 1;
  }
}

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
  const [codigo, setCodigo] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<ApplicationStatus | null>(null);
  const [lookupError, setLookupError] = useState('');
  const formRef = useRef<HTMLDivElement>(null);
  const done = status !== null;

  const lookup = async (refValue: string) => {
    const v = (refValue || '').trim();
    if (!v) { setErr(t.v_default); return; }
    if (!isApplicationReference(v)) {
      setErr(t.v_codigo);
      formRef.current?.querySelector<HTMLElement>('[name="codigo"]')?.focus();
      return;
    }
    setErr(''); setLookupError(''); setLoading(true);
    const res = await fetchApplicationStatus(v);
    setLoading(false);
    if (res.ok) setStatus(res.status);
    else setLookupError(res.reason === 'NOT_FOUND' ? t.notFound : t.unavailable);
  };
  const submit = (e?: React.FormEvent) => { if (e && e.preventDefault) e.preventDefault(); void lookup(codigo); };
  const reset = () => { setStatus(null); setCodigo(''); setErr(''); setLookupError(''); };

  // Prefill and auto-look-up from ?ref= (the candidatura success screen links here).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ref = new URLSearchParams(window.location.search).get('ref');
    if (ref && isApplicationReference(ref)) { setCodigo(ref); void lookup(ref); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentPhase = status ? phaseFor(status.status) : 1;
  const stBody = status ? (lang === 'en' ? STATUS_LABEL[status.status].body_en : STATUS_COPY[status.status].body) : '';
  const stTitle = status ? (lang === 'en' ? STATUS_LABEL[status.status].en : STATUS_LABEL[status.status].pt) : '';
  const dueFields = status ? status.requirements.currently_due : [];

  return (
    <>
      {/* ─── 00 · HERO ─── */}
      <section id="inicio" style={{ position: 'relative', padding: '128px 24px 56px', overflow: 'hidden' }}>
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', right: '-8%', top: '-20%', width: '640px', height: '640px', borderRadius: '50%', background: 'radial-gradient(circle,rgba(251,210,208,.75),rgba(251,210,208,0) 68%)' }} />
          <div style={{ position: 'absolute', left: '-12%', bottom: '-40%', width: '520px', height: '520px', borderRadius: '50%', background: 'radial-gradient(circle,rgba(255,228,226,.8),rgba(255,228,226,0) 70%)' }} />
        </div>

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
                  {lookupError && <p role="alert" style={{ margin: '14px 0 0', fontSize: '13.5px', fontWeight: 700, color: '#C4303C' }}>{lookupError}</p>}
                  <div style={{ marginTop: '18px' }}>
                    <SubmitBtn type="submit" onClick={() => submit()}>{loading ? t.consultando : t.consultar}</SubmitBtn>
                  </div>
                </>
              )}
              {done && status && (
                <div role="status">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: '11px', fontWeight: 900, letterSpacing: '.16em', color: '#9a8487' }}>{t.resultLabel}</p>
                      <p style={{ margin: '4px 0 0', fontFamily: "'JetBrains Mono',monospace", fontSize: '12.5px', fontWeight: 600, color: '#B5101F', overflowWrap: 'anywhere' }}>{status.requested_handle ? '@' + status.requested_handle : status.application_id}</p>
                    </div>
                    <span style={{ flex: 'none', padding: '6px 12px', borderRadius: '20px', background: '#FCEFC4', border: '1px solid #E9C66A', fontSize: '12px', fontWeight: 900, color: '#7A4A06' }}>{stTitle}</span>
                  </div>
                  <p style={{ margin: '14px 0 0', fontSize: '13.5px', lineHeight: 1.5, fontWeight: 600, color: '#6a5a5e' }}>{stBody}</p>
                  {status.status === 'INFORMATION_REQUIRED' && status.information_request && (
                    <p style={{ margin: '10px 0 0', padding: '12px 14px', borderRadius: '14px', background: '#FFF1F0', border: '1px solid rgba(181,16,31,.18)', fontSize: '13px', fontWeight: 700, color: '#B5101F' }}>{status.information_request}</p>
                  )}
                  {dueFields.length > 0 && (
                    <div style={{ margin: '12px 0 0' }}>
                      <p style={{ margin: 0, fontSize: '11px', fontWeight: 900, letterSpacing: '.14em', color: '#9a8487' }}>{t.needLabel.toUpperCase()}</p>
                      <ul style={{ margin: '6px 0 0', paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {dueFields.map((d) => <li key={d.code} style={{ fontSize: '13px', fontWeight: 700, color: '#6a5a5e' }}>{d.label}</li>)}
                      </ul>
                    </div>
                  )}
                  <div style={{ marginTop: '22px' }}>
                    {t.phases.map((ph, i) => {
                      const isDone = i < currentPhase, isCurrent = i === currentPhase;
                      return (
                        <div key={i} style={{ position: 'relative', display: 'flex', gap: '14px', paddingBottom: '18px' }}>
                          <span style={{ flex: 'none', width: '30px', height: '30px', borderRadius: '50%', background: isDone ? '#1a1416' : isCurrent ? 'linear-gradient(150deg,#D8121F,#8E1620)' : '#fff', color: isDone || isCurrent ? '#fff' : '#9a8487', border: `1.5px solid ${isDone || isCurrent ? 'transparent' : '#EFDCDA'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'JetBrains Mono',monospace", fontSize: '11.5px', fontWeight: 600, boxShadow: isCurrent ? '0 0 0 5px rgba(216,18,31,.14)' : undefined }}>
                            {isDone ? <InfoDot /> : i + 1}
                          </span>
                          <div>
                            <p style={{ margin: '4px 0 0', fontSize: '14.5px', fontWeight: 900, color: i <= currentPhase ? '#141014' : '#9a8487' }}>
                              {ph.t}
                              {isCurrent && 'current' in ph && ph.current && <span style={{ marginLeft: '6px', padding: '2px 8px', borderRadius: '10px', background: '#FFF1F0', fontSize: '11px', color: '#B5101F' }}>{ph.current}</span>}
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
