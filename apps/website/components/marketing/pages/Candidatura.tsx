'use client';

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Badge, H1, HeroLead, Small, Icon, type IconName } from '../kit';
import { Field, Check, FGrid, SubmitBtn, BackBtn, SuccessMark } from '../form-kit';
import { Reveal } from '@/components/Reveal';
import { getPlatformMode, submitApplication } from '@/lib/api';
import { TERMS, isTermsPublished } from '@/lib/terms';
import { route, type Lang } from '@/lib/marketing/nav';

/**
 * Comerciantes · Candidatura — Public Beta Sandbox business onboarding.
 * Data-minimized to the Sandbox policy (name, @negócio, category, email; optional
 * município/description) — no NIF, no legal representative, no documents (those
 * belong to Financial Live/KYB, which is unavailable). Submits for real to
 * POST /v1/merchant/applications and shows the server-issued reference
 * (application_id) — never a browser-fabricated code. Frozen visual system.
 */

const CONTENT: CSSProperties = { position: 'relative', maxWidth: '1140px', margin: '0 auto' };
type Errs = Record<string, string>;

// ── copy ──────────────────────────────────────────────────────────────────
const T = {
  pt: {
    badge: 'Versão Beta · Sandbox',
    h1a: 'Registar o', h1b: 'negócio.',
    lead: 'Candidatura ao Banzami Business em Sandbox. Dados mínimos, cerca de dois minutos.',
    smallPre: 'Já enviou? ', smallLink: 'Consulte o estado da candidatura', smallPost: '.',
    steps: ['Negócio', 'Confirmar'],
    of: (n: number) => `PASSO ${n} DE 2`,
    s1t: 'Dados do negócio', s1s: 'O essencial para criar o acesso Sandbox. Sem NIF nem documentos nesta fase.',
    l_nome_comercial: 'Nome comercial', ph_nome_comercial: 'Cantina do Alex',
    l_handle: '@negócio', ph_handle: 'cantinadoalex', hint_handle: '3 a 30 letras minúsculas, dígitos ou _. É como recebe pagamentos.',
    l_categoria: 'Categoria', l_municipio: 'Município (opcional)', ph_municipio: 'Talatona',
    l_descricao: 'O que vende? (opcional)', ph_descricao: 'Refeições, bebidas…',
    l_email: 'E-mail de contacto', ph_email: 'alex@exemplo.ao',
    selectPh: 'Selecione…',
    categorias: ['Restauração', 'Comércio a retalho', 'Mercearia e alimentação', 'Serviços', 'Transporte', 'Educação', 'Saúde e beleza', 'Eventos', 'Outro'],
    continuar: 'Continuar',
    voltar: 'Voltar',
    s4t: 'Confirmar', s4s: 'Reveja os dados antes de enviar.',
    sum: { negocio: 'Negócio', handle: '@negócio', categoria: 'Categoria', email: 'E-mail' },
    enviar: 'Enviar candidatura',
    enviando: 'A enviar…',
    doneT: 'Candidatura enviada',
    donePre: 'Recebemos os dados de ', donePost: '. Guarde a referência para consultar o estado.',
    refLabel: 'Referência da candidatura',
    verEstado: 'Ver estado da candidatura', nova: 'Nova candidatura',
    aside1: 'O que vai precisar',
    aside1rows: [
      { icon: 'store' as IconName, t: 'Dados do negócio', d: 'Nome, @negócio e categoria.' },
      { icon: 'mail' as IconName, t: 'Contacto', d: 'E-mail do negócio.' },
    ],
    asideSandbox: 'Os negócios aprovados nesta fase recebem apenas dinheiro fictício. O Financial Live permanece indisponível.',
    aside3t: 'Precisa de ajuda?', aside3p: 'A nossa equipa responde por e-mail.', aside3link: 'Falar com o suporte',
    termosPre: 'Li e aceito os ', termos: 'Termos de Serviço', termosMid: '. Consulte a ', privacidade: 'Política de Privacidade', termosPost: '.',
    sandboxLabel: 'Compreendo que, nesta fase Beta, o negócio opera apenas na Sandbox, com dinheiro fictício.',
    v_default: 'Campo obrigatório.',
    v_email: 'Introduza um e-mail válido.',
    v_handle: 'O @negócio deve ter 3 a 30 letras minúsculas, dígitos ou _.',
    v_termos: 'É necessário aceitar os Termos.',
    v_sandbox: 'Confirme que compreende a fase Sandbox.',
    v_handle_taken: 'Este @negócio já está em uso. Escolha outro.',
    v_submit: 'Não foi possível enviar a candidatura. Tente novamente.',
    sbxFill: 'Usar dados de teste',
    sbxToast: 'Secção preenchida com dados sandbox.',
  },
  en: {
    badge: 'Beta · Sandbox',
    h1a: 'Register the', h1b: 'business.',
    lead: 'Apply to Banzami Business in the Sandbox. Minimal data, about two minutes.',
    smallPre: 'Already applied? ', smallLink: 'Check the application status', smallPost: '.',
    steps: ['Business', 'Confirm'],
    of: (n: number) => `STEP ${n} OF 2`,
    s1t: 'Business details', s1s: 'The essentials to create Sandbox access. No tax ID or documents at this stage.',
    l_nome_comercial: 'Business name', ph_nome_comercial: 'Alex’s Canteen',
    l_handle: '@business', ph_handle: 'alexcanteen', hint_handle: '3 to 30 lowercase letters, digits or _. This is how you get paid.',
    l_categoria: 'Category', l_municipio: 'Municipality (optional)', ph_municipio: 'Talatona',
    l_descricao: 'What do you sell? (optional)', ph_descricao: 'Meals, drinks…',
    l_email: 'Contact email', ph_email: 'alex@example.ao',
    selectPh: 'Select…',
    categorias: ['Food and drink', 'Retail', 'Grocery', 'Services', 'Transport', 'Education', 'Health and beauty', 'Events', 'Other'],
    continuar: 'Continue',
    voltar: 'Back',
    s4t: 'Confirm', s4s: 'Review the details before sending.',
    sum: { negocio: 'Business', handle: '@business', categoria: 'Category', email: 'Email' },
    enviar: 'Send application',
    enviando: 'Sending…',
    doneT: 'Application sent',
    donePre: 'We have received the details for ', donePost: '. Keep the reference to check the status.',
    refLabel: 'Application reference',
    verEstado: 'Check application status', nova: 'New application',
    aside1: 'What you will need',
    aside1rows: [
      { icon: 'store' as IconName, t: 'Business details', d: 'Name, @business and category.' },
      { icon: 'mail' as IconName, t: 'Contact', d: 'Business email.' },
    ],
    asideSandbox: 'Businesses approved in this phase receive test money only. Financial Live remains unavailable.',
    aside3t: 'Need help?', aside3p: 'Our team replies by email.', aside3link: 'Contact support',
    termosPre: 'I have read and accept the ', termos: 'Terms of Service', termosMid: '. See the ', privacidade: 'Privacy Policy', termosPost: '.',
    sandboxLabel: 'I understand that, during this Beta, the business operates only in the Sandbox, with test money.',
    v_default: 'Required field.',
    v_email: 'Enter a valid email.',
    v_handle: 'The @business must be 3 to 30 lowercase letters, digits or _.',
    v_termos: 'You must accept the Terms.',
    v_sandbox: 'Confirm you understand the Sandbox phase.',
    v_handle_taken: 'This @business is already taken. Choose another.',
    v_submit: 'Could not send the application. Please try again.',
    sbxFill: 'Use test data',
    sbxToast: 'Section filled with sandbox data.',
  },
} as const;

// ── bespoke stepper (matches the dossier candidatura/activar stepper) ────────
function FlowStepper({ steps, current, done }: { steps: string[]; current: number; done?: boolean }) {
  const n = steps.length;
  const pct = (done ? 100 : Math.round(((current - 1) / Math.max(1, n - 1)) * 100)) + '%';
  const align = (i: number) => (i === 0 ? 'flex-start' : i === n - 1 ? 'flex-end' : 'center');
  return (
    <div className="bz-stepper" style={{ position: 'relative', display: 'grid', gridTemplateColumns: `repeat(${n},minmax(0,1fr))`, gap: '8px' }}>
      <div aria-hidden="true" style={{ position: 'absolute', left: '16px', right: '16px', top: '15px', height: '3px', borderRadius: '3px', background: '#F4E6E4' }}>
        <div style={{ height: '100%', width: pct, borderRadius: '3px', background: 'linear-gradient(90deg,#D8121F,#9A1B22)', transition: 'width .5s cubic-bezier(.16,1,.3,1)' }} />
      </div>
      {steps.map((s, i) => {
        const nn = i + 1;
        const filled = nn < current || done;
        const active = nn <= current || done;
        return (
          <div key={i} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: align(i), gap: '8px' }}>
            <span style={{ width: '32px', height: '32px', borderRadius: '50%', background: filled ? '#1a1416' : nn === current ? 'linear-gradient(150deg,#D8121F,#8E1620)' : '#fff', color: active ? '#fff' : '#9a8487', border: `1.5px solid ${active ? 'transparent' : '#EFDCDA'}`, fontFamily: "'JetBrains Mono',monospace", fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .4s,color .4s' }}>{nn}</span>
            <span className="bz-stl" style={{ fontSize: '12.5px', fontWeight: 800, color: active ? '#141014' : '#9a8487' }}>{s}</span>
          </div>
        );
      })}
    </div>
  );
}

function StepHead({ kicker, title, sub, action }: { kicker: string; title: string; sub: string; action?: React.ReactNode }) {
  return (
    <div style={{ margin: '30px 0 20px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '14px' }}>
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontFamily: "'JetBrains Mono',monospace", fontSize: '11px', color: '#B5101F' }}>{kicker}</p>
        <h2 style={{ margin: '6px 0 0', fontSize: '22px', fontWeight: 900, letterSpacing: '-.02em', color: '#141014' }}>{title}</h2>
        <p style={{ margin: '4px 0 0', fontSize: '14px', fontWeight: 600, color: '#8a7a7e' }}>{sub}</p>
      </div>
      {action}
    </div>
  );
}

// SANDBOX-only "fill with test data" control — amber ghost, right-aligned.
const SbxSpark = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
);
function SbxFill({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="bz-btnlift" style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 12px', borderRadius: '10px', border: '1.5px solid #F2CD6E', background: 'rgba(252,239,196,.6)', color: '#7A4A06', fontSize: '12.5px', fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' }}>
      {SbxSpark}{label}
    </button>
  );
}

function StepFooter({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginTop: '28px', paddingTop: '22px', borderTop: '1px solid #F5E8E6' }}>{children}</div>;
}

function SumRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', padding: '11px 0', borderBottom: '1px solid #F5E8E6' }}>
      <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#8a7a7e' }}>{label}</span>
      <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#141014', textAlign: 'right', overflowWrap: 'anywhere' }}>{value}</span>
    </div>
  );
}

const HANDLE_RE = /^[a-z0-9_]{3,30}$/;
const initial = { nome_comercial: '', handle: '', categoria: '', municipio: '', descricao: '', email: '', termos: false, sandbox: false };

export function CandidaturaPage({ lang }: { lang: Lang }) {
  const t = T[lang];
  const [step, setStep] = useState(1);
  const [done, setDone] = useState(false);
  const [f, setF] = useState<typeof initial>({ ...initial });
  const [err, setErr] = useState<Errs>({});
  const [appRef, setAppRef] = useState('');
  const [sending, setSending] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  // SANDBOX-only autofill (ADR-025): follows the live Platform Mode, fails closed
  // to SANDBOX, never shown in LIVE.
  const [isSandbox, setIsSandbox] = useState(false);
  useEffect(() => {
    let active = true;
    void getPlatformMode().then((p) => { if (active) setIsSandbox(p.mode !== 'LIVE'); });
    return () => { active = false; };
  }, []);

  const [toast, setToast] = useState<{ id: number; msg: string } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(id);
  }, [toast]);

  const fillMany = (obj: Partial<typeof initial>) => {
    setF((s) => ({ ...s, ...obj }));
    setErr((e) => { const n = { ...e }; Object.keys(obj).forEach((k) => delete n[k]); return n; });
    setToast({ id: Date.now(), msg: t.sbxToast });
  };
  const seed = () => Math.floor(1000 + Math.random() * 9000);
  const fillStep1 = () => fillMany({
    nome_comercial: lang === 'en' ? 'Kilamba Canteen' : 'Cantina do Kilamba',
    handle: `cantina_teste_${seed()}`,
    categoria: t.categorias[0],
    municipio: 'Talatona',
    descricao: lang === 'en' ? 'Meals and drinks to go' : 'Refeições e bebidas para levar',
    email: `negocio.teste${seed()}@exemplo.co.ao`,
  });
  const fillStep2 = () => fillMany({ termos: true, sandbox: true });

  const rules: Record<string, { re?: RegExp; bad?: string; msg?: string }> = {
    email: { re: /^[^@\s]+@[^@\s]+\.[^@\s]+$/, bad: t.v_email },
    handle: { re: HANDLE_RE, bad: t.v_handle },
    termos: { msg: t.v_termos },
    sandbox: { msg: t.v_sandbox },
  };
  const stepFields: Record<number, string[]> = { 1: ['nome_comercial', 'handle', 'categoria', 'email'], 2: ['termos', 'sandbox'] };

  const set = (name: string, v: string | boolean) => {
    // The @handle is always lowercase; normalise as the user types.
    const val = name === 'handle' && typeof v === 'string' ? v.toLowerCase().replace(/\s+/g, '') : v;
    setF((s) => ({ ...s, [name]: val }));
    setErr((e) => ({ ...e, [name]: '', submit: '' }));
  };

  const validate = (keys: string[]) => {
    const e: Errs = {};
    keys.forEach((k) => {
      const v = (f as Record<string, string | boolean>)[k];
      const r = rules[k];
      if (v === undefined || v === '' || v === false) e[k] = r && r.msg ? r.msg : t.v_default;
      else if (r && r.re && !r.re.test(String(v).trim())) e[k] = r.bad || t.v_default;
    });
    setErr(e);
    if (Object.keys(e).length && formRef.current) {
      const el = formRef.current.querySelector<HTMLElement>('[name="' + Object.keys(e)[0] + '"]');
      if (el && el.focus) el.focus();
    }
    return !Object.keys(e).length;
  };

  const next = () => { if (validate(stepFields[step] || [])) setStep((s) => Math.min(2, s + 1)); };
  const back = () => { setStep((s) => Math.max(1, s - 1)); setErr({}); };

  const submit = async (e?: React.FormEvent) => {
    if (e && e.preventDefault) e.preventDefault();
    if (sending) return;
    if (!validate(stepFields[step] || [])) return;
    setSending(true);
    setErr((prev) => ({ ...prev, submit: '' }));
    try {
      const res = await submitApplication({
        business_name: f.nome_comercial.trim(),
        desired_handle: f.handle.trim(),
        category: f.categoria,
        email: f.email.trim(),
        municipality: f.municipio.trim() || undefined,
        business_activity: f.descricao.trim() || undefined,
        terms_accepted: true,
        // Only send a version once the Terms are actually published.
        terms_version: isTermsPublished() ? (TERMS.version ?? undefined) : undefined,
      });
      if (res.ok && res.applicationId) {
        setAppRef(res.applicationId);
        setDone(true);
        return;
      }
      // Map server refusals to a field where possible; otherwise a banner.
      if (res.code === 'INVALID_HANDLE') setErr((prev) => ({ ...prev, handle: t.v_handle }));
      else if (res.code && /HANDLE|TAKEN|RESERVED/i.test(res.code)) setErr((prev) => ({ ...prev, handle: t.v_handle_taken }));
      else setErr((prev) => ({ ...prev, submit: res.error || t.v_submit }));
      if (res.code === 'INVALID_HANDLE' || (res.code && /HANDLE|TAKEN|RESERVED/i.test(res.code))) setStep(1);
    } catch {
      setErr((prev) => ({ ...prev, submit: t.v_submit }));
    } finally {
      setSending(false);
    }
  };

  const reset = () => { setDone(false); setStep(1); setF({ ...initial }); setErr({}); setAppRef(''); };

  const asideCard: CSSProperties = { position: 'relative', overflow: 'hidden', background: '#fff', border: '1px solid #F3E3E1', borderRadius: '24px', padding: '24px', boxShadow: '0 26px 56px -40px rgba(122,16,22,.45)' };

  return (
    <>
      {/* ─── 00 · HERO ─── */}
      <section id="inicio" style={{ position: 'relative', padding: '128px 24px 56px', overflow: 'hidden' }}>
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', right: '-8%', top: '-20%', width: '640px', height: '640px', borderRadius: '50%', background: 'radial-gradient(circle,rgba(251,210,208,.75),rgba(251,210,208,0) 68%)' }} />
          <div style={{ position: 'absolute', left: '-12%', bottom: '-40%', width: '520px', height: '520px', borderRadius: '50%', background: 'radial-gradient(circle,rgba(255,228,226,.8),rgba(255,228,226,0) 70%)' }} />
        </div>

        <div style={CONTENT}>
          <Reveal>
            <Badge>{t.badge}</Badge>
            <H1 a={t.h1a} b={t.h1b} size="clamp(36px,4.2vw,56px)" />
            <HeroLead mw={600}>{t.lead}</HeroLead>
            <Small mw={600}>{t.smallPre}<a href={route('estado', lang)} style={{ fontWeight: 800 }}>{t.smallLink}</a>{t.smallPost}</Small>
          </Reveal>
        </div>
      </section>

      {/* ─── 01 · FORM ─── */}
      <section id="candidatura" style={{ position: 'relative', padding: '8px 24px clamp(64px,8vw,110px)', overflow: 'clip' }}>
        <Reveal><div style={{ position: 'relative', maxWidth: '1140px', margin: '0 auto' }}>
          <div className="bz-g2" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,.7fr)', gap: '24px', alignItems: 'start' }}>
            {/* left — form card */}
            <div style={{ minWidth: 0 }}>
              <div ref={formRef} style={{ background: '#fff', border: '1px solid #F3E3E1', borderRadius: '28px', padding: 'clamp(22px,3.4vw,40px)', boxShadow: '0 40px 80px -50px rgba(122,16,22,.5)' }}>
                {!done && <FlowStepper steps={t.steps as unknown as string[]} current={step} done={done} />}

                {!done && step === 1 && (
                  <>
                    <StepHead kicker={t.of(1)} title={t.s1t} sub={t.s1s} action={isSandbox ? <SbxFill label={t.sbxFill} onClick={fillStep1} /> : undefined} />
                    <FGrid>
                      <Field name="nome_comercial" label={t.l_nome_comercial} placeholder={t.ph_nome_comercial} autoComplete="organization" value={f.nome_comercial} error={err.nome_comercial} onChange={(v) => set('nome_comercial', v)} />
                      <Field name="handle" label={t.l_handle} placeholder={t.ph_handle} hint={t.hint_handle} mono value={f.handle} error={err.handle} onChange={(v) => set('handle', v)} />
                      <Field name="categoria" label={t.l_categoria} options={t.categorias as unknown as string[]} selectPlaceholder={t.selectPh} value={f.categoria} error={err.categoria} onChange={(v) => set('categoria', v)} />
                      <Field name="email" label={t.l_email} type="email" placeholder={t.ph_email} autoComplete="email" value={f.email} error={err.email} onChange={(v) => set('email', v)} />
                      <Field name="municipio" label={t.l_municipio} placeholder={t.ph_municipio} required={false} value={f.municipio} error={err.municipio} onChange={(v) => set('municipio', v)} />
                      <Field name="descricao" label={t.l_descricao} placeholder={t.ph_descricao} required={false} value={f.descricao} error={err.descricao} onChange={(v) => set('descricao', v)} />
                    </FGrid>
                    <StepFooter><span /><SubmitBtn type="button" onClick={next}>{t.continuar}</SubmitBtn></StepFooter>
                  </>
                )}

                {!done && step === 2 && (
                  <>
                    <StepHead kicker={t.of(2)} title={t.s4t} sub={t.s4s} action={isSandbox ? <SbxFill label={t.sbxFill} onClick={fillStep2} /> : undefined} />
                    <div style={{ padding: '4px 18px', borderRadius: '18px', background: '#FFFBFA', border: '1px solid #F5E8E6', marginBottom: '18px' }}>
                      <SumRow label={t.sum.negocio} value={f.nome_comercial} />
                      <SumRow label={t.sum.handle} value={f.handle ? '@' + f.handle : ''} />
                      <SumRow label={t.sum.categoria} value={f.categoria} />
                      <SumRow label={t.sum.email} value={f.email} />
                    </div>
                    <FGrid>
                      <Check name="termos" checked={f.termos} error={err.termos} onChange={(v) => set('termos', v)} label={<>{t.termosPre}<a href={route('termos', lang)} target="_blank" rel="noopener noreferrer">{t.termos}</a>{t.termosMid}<a href={route('privacidade', lang)} target="_blank" rel="noopener noreferrer">{t.privacidade}</a>{t.termosPost}</>} />
                      <Check name="sandbox" checked={f.sandbox} error={err.sandbox} onChange={(v) => set('sandbox', v)} label={t.sandboxLabel} />
                    </FGrid>
                    {err.submit && <p role="alert" style={{ margin: '14px 0 0', fontSize: '13.5px', fontWeight: 700, color: '#C4303C' }}>{err.submit}</p>}
                    <StepFooter><BackBtn onClick={back}>{t.voltar}</BackBtn><SubmitBtn type="submit" onClick={() => submit()}>{sending ? t.enviando : t.enviar}</SubmitBtn></StepFooter>
                  </>
                )}

                {done && (
                  <div role="status" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '24px 0 8px' }}>
                    <SuccessMark />
                    <h2 style={{ margin: '20px 0 0', fontSize: '26px', fontWeight: 900, letterSpacing: '-.02em', color: '#141014' }}>{t.doneT}</h2>
                    <p style={{ margin: '8px 0 0', maxWidth: '440px', fontSize: '15px', lineHeight: 1.55, fontWeight: 600, color: '#6a5a5e' }}>{t.donePre}<strong style={{ color: '#141014' }}>{f.nome_comercial}</strong>{t.donePost}</p>
                    <p style={{ margin: '18px 0 0', fontSize: '11px', fontWeight: 900, letterSpacing: '.14em', color: '#9a8487' }}>{t.refLabel.toUpperCase()}</p>
                    <div style={{ marginTop: '6px', padding: '12px 20px', borderRadius: '16px', background: '#FFF1F0', border: '1px dashed rgba(181,16,31,.35)', fontFamily: "'JetBrains Mono',monospace", fontSize: '14px', fontWeight: 600, letterSpacing: '.02em', color: '#B5101F', overflowWrap: 'anywhere', maxWidth: '100%' }}>{appRef}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '12px', marginTop: '24px' }}>
                      <a href={`${route('estado', lang)}?ref=${encodeURIComponent(appRef)}`} className="bz-btnlift" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', padding: '13px 24px', borderRadius: '40px', background: 'linear-gradient(160deg,#C8101F,#9A1B22)', color: '#fff', fontWeight: 800, fontSize: '14.5px', textDecoration: 'none', whiteSpace: 'nowrap', boxShadow: '0 14px 28px -14px rgba(181,16,31,.6),inset 0 1px 0 rgba(255,255,255,.2)' }}>{t.verEstado}<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg></a>
                      <button type="button" onClick={reset} style={{ padding: '12px 20px', borderRadius: '40px', border: '1px solid #F3E3E1', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800, fontSize: '14.5px', color: '#141014' }}>{t.nova}</button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* right — sidebar */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', position: 'sticky', top: '104px' }}>
              <div style={asideCard}>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 900, letterSpacing: '-.01em', color: '#141014' }}>{t.aside1}</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
                  {t.aside1rows.map((r, i) => (
                    <div key={i} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <span style={{ flex: 'none', width: '38px', height: '38px', borderRadius: '12px', background: '#FFF1F0', color: '#B5101F', border: '1px solid rgba(181,16,31,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={r.icon} color="currentColor" size={17} /></span>
                      <div>
                        <p style={{ margin: 0, fontSize: '14px', fontWeight: 900, color: '#141014' }}>{r.t}</p>
                        <p style={{ margin: '2px 0 0', fontSize: '12.5px', fontWeight: 600, color: '#8a7a7e' }}>{r.d}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={asideCard}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '20px', background: '#FCEFC4', border: '1px solid #E9C66A', fontSize: '11px', fontWeight: 900, letterSpacing: '.04em', color: '#7A4A06' }}>SANDBOX</span>
                </div>
                <p style={{ margin: '12px 0 0', fontSize: '13.5px', lineHeight: 1.55, fontWeight: 600, color: '#6a5a5e' }}>{t.asideSandbox}</p>
              </div>
              <div style={asideCard}>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 900, letterSpacing: '-.01em', color: '#141014' }}>{t.aside3t}</h3>
                <p style={{ margin: '8px 0 14px', fontSize: '13.5px', lineHeight: 1.55, fontWeight: 600, color: '#6a5a5e' }}>{t.aside3p}</p>
                <a href={route('suporte', lang)} className="bz-btntext" style={{ display: 'inline-flex', alignItems: 'center', gap: '9px', color: '#141014', fontWeight: 800, fontSize: '14.5px', whiteSpace: 'nowrap', textDecoration: 'none' }}>{t.aside3link}<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg></a>
              </div>
            </div>
          </div>
        </div></Reveal>
      </section>

      {/* SANDBOX autofill toast */}
      {toast && (
        <div role="status" aria-live="polite" style={{ position: 'fixed', insetInline: 0, bottom: '24px', zIndex: 90, display: 'flex', justifyContent: 'center', padding: '0 16px', pointerEvents: 'none' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', borderRadius: '14px', background: '#2a2024', color: '#fff', padding: '12px 20px', fontSize: '13.5px', fontWeight: 800, boxShadow: '0 16px 40px -12px rgba(0,0,0,.5)' }}>
            <span style={{ color: '#F2CD6E' }}>{SbxSpark}</span>{toast.msg}
          </div>
        </div>
      )}
    </>
  );
}
