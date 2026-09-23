'use client';

import { useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Ribbon, Badge, H1, HeroLead, Small, Icon, type IconName } from '../kit';
import { Field, Check, FGrid, SubmitBtn, BackBtn, SuccessMark } from '../form-kit';
import { Reveal } from '@/components/Reveal';
import { route, type Lang } from '@/lib/marketing/nav';

/**
 * Comerciantes · Candidatura — ported verbatim from
 * handoff_site_completo/pages/Comerciantes Candidatura.dc.html (PT) and
 * Comerciantes Candidatura EN.dc.html (EN). 4-step KYB form with a bespoke
 * stepper (matches the dossier), client-side validation, and success screen.
 * Body only; header/footer come from <SiteShell>.
 */

const CONTENT: CSSProperties = { position: 'relative', maxWidth: '1140px', margin: '0 auto' };
type Errs = Record<string, string>;

// ── copy ──────────────────────────────────────────────────────────────────
const T = {
  pt: {
    badge: 'Versão Beta · Sandbox',
    h1a: 'Registar o', h1b: 'negócio.',
    lead: 'Candidatura online para o Banzami Business. Quatro passos, cerca de cinco minutos.',
    smallPre: 'Já enviou? ', smallLink: 'Consulte o estado da candidatura', smallPost: '.',
    steps: ['Negócio', 'Responsável', 'Contacto', 'Confirmar'],
    of: (n: number) => `PASSO ${n} DE 4`,
    s1t: 'Dados do negócio', s1s: 'Como o negócio aparece aos clientes e nos registos.',
    l_nome_comercial: 'Nome comercial', ph_nome_comercial: 'Cantina do Alex',
    l_nome_legal: 'Nome legal / razão social', ph_nome_legal: 'Alex Comércio, Lda.',
    l_nif: 'NIF', ph_nif: '5000000000', hint_nif: 'Entre 9 e 14 caracteres.',
    l_categoria: 'Categoria', l_provincia: 'Província',
    l_descricao: 'O que vende?', ph_descricao: 'Refeições, bebidas…',
    selectPh: 'Selecione…',
    categorias: ['Restauração', 'Comércio a retalho', 'Mercearia e alimentação', 'Serviços', 'Transporte', 'Educação', 'Saúde e beleza', 'Eventos', 'Outro'],
    provincias: ['Luanda', 'Benguela', 'Huíla', 'Huambo', 'Cabinda', 'Bié', 'Cuanza Sul', 'Malanje', 'Namibe', 'Uíge', 'Zaire', 'Outra'],
    continuar: 'Continuar',
    s2t: 'Responsável', s2s: 'A pessoa que representa o negócio perante o Banzami.',
    l_resp_nome: 'Nome completo', ph_resp_nome: 'Alexandre Manuel',
    l_resp_cargo: 'Cargo', ph_resp_cargo: 'Sócio-gerente',
    l_resp_doc: 'Nº do BI ou passaporte', ph_resp_doc: '000000000LA000',
    voltar: 'Voltar',
    s3t: 'Contacto', s3s: 'Para onde enviamos as atualizações da candidatura.',
    l_email: 'E-mail', ph_email: 'alex@exemplo.ao',
    l_telefone: 'Telefone', ph_telefone: '+244 923 000 000',
    l_morada: 'Morada do negócio', ph_morada: 'Rua, bairro, município',
    rever: 'Rever candidatura',
    s4t: 'Confirmar', s4s: 'Reveja os dados antes de enviar.',
    sum: { negocio: 'Negócio', nif: 'NIF', categoria: 'Categoria', resp: 'Responsável', email: 'E-mail', telefone: 'Telefone' },
    enviar: 'Enviar candidatura',
    doneT: 'Candidatura enviada',
    donePre: 'Recebemos os dados de ', donePost: '. Guarde o código para consultar o estado.',
    verEstado: 'Ver estado da candidatura', nova: 'Nova candidatura',
    aside1: 'O que vai precisar',
    aside1rows: [
      { icon: 'store' as IconName, t: 'Dados do negócio', d: 'Nome, NIF e categoria.' },
      { icon: 'user' as IconName, t: 'Responsável', d: 'Nome e documento de identificação.' },
      { icon: 'mail' as IconName, t: 'Contacto', d: 'E-mail e telefone.' },
    ],
    asideSandbox: 'Os negócios aprovados nesta fase recebem apenas dinheiro fictício. O Financial Live permanece indisponível.',
    aside3t: 'Precisa de ajuda?', aside3p: 'A nossa equipa responde por e-mail.', aside3link: 'Falar com o suporte',
    termosPre: 'Li e aceito os ', termos: 'Termos', termosMid: ' e a ', privacidade: 'Política de Privacidade', termosPost: ' do Banzami.',
    sandboxLabel: 'Compreendo que, nesta fase Beta, o negócio opera apenas na Sandbox, com dinheiro fictício.',
    v_default: 'Campo obrigatório.',
    v_nif: 'O NIF deve ter entre 9 e 14 caracteres.',
    v_email: 'Introduza um e-mail válido.',
    v_telefone: 'Introduza um telefone válido.',
    v_termos: 'É necessário aceitar os termos.',
    v_sandbox: 'Confirme que compreende a fase Sandbox.',
  },
  en: {
    badge: 'Beta · Sandbox',
    h1a: 'Register your', h1b: 'business.',
    lead: 'Online application for Banzami Business. Four steps, about five minutes.',
    smallPre: 'Already applied? ', smallLink: 'Check your application status', smallPost: '.',
    steps: ['Business', 'Representative', 'Contact', 'Confirm'],
    of: (n: number) => `STEP ${n} OF 4`,
    s1t: 'Business details', s1s: 'How the business appears to customers and in records.',
    l_nome_comercial: 'Trading name', ph_nome_comercial: 'Alex’s Canteen',
    l_nome_legal: 'Legal name', ph_nome_legal: 'Alex Trading, Lda.',
    l_nif: 'NIF', ph_nif: '5000000000', hint_nif: 'Between 9 and 14 characters.',
    l_categoria: 'Category', l_provincia: 'Province',
    l_descricao: 'What do you sell?', ph_descricao: 'Meals, drinks…',
    selectPh: 'Select…',
    categorias: ['Food and drink', 'Retail', 'Grocery', 'Services', 'Transport', 'Education', 'Health and beauty', 'Events', 'Other'],
    provincias: ['Luanda', 'Benguela', 'Huíla', 'Huambo', 'Cabinda', 'Bié', 'Cuanza Sul', 'Malanje', 'Namibe', 'Uíge', 'Zaire', 'Other'],
    continuar: 'Continue',
    s2t: 'Representative', s2s: 'The person who represents the business to Banzami.',
    l_resp_nome: 'Full name', ph_resp_nome: 'Alexandre Manuel',
    l_resp_cargo: 'Role', ph_resp_cargo: 'Managing partner',
    l_resp_doc: 'ID card or passport number', ph_resp_doc: '000000000LA000',
    voltar: 'Back',
    s3t: 'Contact', s3s: 'Where we send application updates.',
    l_email: 'Email', ph_email: 'alex@example.com',
    l_telefone: 'Phone', ph_telefone: '+244 923 000 000',
    l_morada: 'Business address', ph_morada: 'Street, neighbourhood, municipality',
    rever: 'Review application',
    s4t: 'Confirm', s4s: 'Review the details before sending.',
    sum: { negocio: 'Business', nif: 'NIF', categoria: 'Category', resp: 'Representative', email: 'Email', telefone: 'Phone' },
    enviar: 'Send application',
    doneT: 'Application sent',
    donePre: 'We have received the details for ', donePost: '. Keep the code to check the status.',
    verEstado: 'Check application status', nova: 'New application',
    aside1: 'What you will need',
    aside1rows: [
      { icon: 'store' as IconName, t: 'Business details', d: 'Name, tax ID and category.' },
      { icon: 'user' as IconName, t: 'Representative', d: 'Name and ID document.' },
      { icon: 'mail' as IconName, t: 'Contact', d: 'Email and phone.' },
    ],
    asideSandbox: 'Businesses approved in this phase receive test money only. Financial Live remains unavailable.',
    aside3t: 'Need help?', aside3p: 'Our team replies by email.', aside3link: 'Contact support',
    // NOTE: "e a" reproduced verbatim from the EN dossier (Comerciantes Candidatura EN.dc.html).
    termosPre: 'I have read and accept the ', termos: 'Terms', termosMid: ' e a ', privacidade: 'Privacy Policy', termosPost: ' of Banzami.',
    sandboxLabel: 'I understand that, during this Beta, the business operates only in the Sandbox, with test money.',
    v_default: 'Required field.',
    v_nif: 'The tax ID must have 9 to 14 characters.',
    v_email: 'Enter a valid email.',
    v_telefone: 'Enter a valid phone number.',
    v_termos: 'You must accept the terms.',
    v_sandbox: 'Confirm you understand the Sandbox phase.',
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

function StepHead({ kicker, title, sub }: { kicker: string; title: string; sub: string }) {
  return (
    <div style={{ margin: '30px 0 20px' }}>
      <p style={{ margin: 0, fontFamily: "'JetBrains Mono',monospace", fontSize: '11px', color: '#B5101F' }}>{kicker}</p>
      <h2 style={{ margin: '6px 0 0', fontSize: '22px', fontWeight: 900, letterSpacing: '-.02em', color: '#141014' }}>{title}</h2>
      <p style={{ margin: '4px 0 0', fontSize: '14px', fontWeight: 600, color: '#8a7a7e' }}>{sub}</p>
    </div>
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

const initial = { nome_comercial: '', nome_legal: '', nif: '', categoria: '', provincia: '', descricao: '', resp_nome: '', resp_cargo: '', resp_doc: '', email: '', telefone: '', morada: '', termos: false, sandbox: false };

export function CandidaturaPage({ lang }: { lang: Lang }) {
  const t = T[lang];
  const [step, setStep] = useState(1);
  const [done, setDone] = useState(false);
  const [f, setF] = useState<typeof initial>({ ...initial });
  const [err, setErr] = useState<Errs>({});
  const [appCode, setAppCode] = useState('');
  const formRef = useRef<HTMLDivElement>(null);

  const rules: Record<string, { re?: RegExp; bad?: string; msg?: string }> = {
    email: { re: /^[^@\s]+@[^@\s]+\.[^@\s]+$/, bad: t.v_email },
    nif: { re: /^[A-Za-z0-9]{9,14}$/, bad: t.v_nif },
    telefone: { re: /^\+?[\d\s]{9,16}$/, bad: t.v_telefone },
    termos: { msg: t.v_termos },
    sandbox: { msg: t.v_sandbox },
  };
  const stepFields: Record<number, string[]> = { 1: ['nome_comercial', 'nome_legal', 'nif', 'categoria', 'provincia'], 2: ['resp_nome', 'resp_cargo', 'resp_doc'], 3: ['email', 'telefone'], 4: ['termos', 'sandbox'] };

  const set = (name: string, v: string | boolean) => { setF((s) => ({ ...s, [name]: v })); setErr((e) => ({ ...e, [name]: '' })); };

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

  const next = () => { if (validate(stepFields[step] || [])) setStep((s) => Math.min(4, s + 1)); };
  const back = () => { setStep((s) => Math.max(1, s - 1)); setErr({}); };
  const submit = (e?: React.FormEvent) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!validate(stepFields[step] || [])) return;
    // TODO: replace with server-issued code (POST candidatura)
    const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 6; i++) s += c[Math.floor(Math.random() * c.length)];
    setAppCode('BZB-' + s);
    setDone(true);
  };
  const reset = () => { setDone(false); setStep(1); setF({ ...initial }); setErr({}); };

  const asideCard: CSSProperties = { position: 'relative', overflow: 'hidden', background: '#fff', border: '1px solid #F3E3E1', borderRadius: '24px', padding: '24px', boxShadow: '0 26px 56px -40px rgba(122,16,22,.45)' };

  return (
    <>
      {/* ─── 00 · HERO ─── */}
      <section id="inicio" style={{ position: 'relative', padding: '128px 24px 56px', overflow: 'hidden' }}>
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', right: '-8%', top: '-20%', width: '640px', height: '640px', borderRadius: '50%', background: 'radial-gradient(circle,rgba(251,210,208,.75),rgba(251,210,208,0) 68%)' }} />
          <div style={{ position: 'absolute', left: '-12%', bottom: '-40%', width: '520px', height: '520px', borderRadius: '50%', background: 'radial-gradient(circle,rgba(255,228,226,.8),rgba(255,228,226,0) 70%)' }} />
        </div>
        <Ribbon />
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
                    <StepHead kicker={t.of(1)} title={t.s1t} sub={t.s1s} />
                    <FGrid>
                      <Field name="nome_comercial" label={t.l_nome_comercial} placeholder={t.ph_nome_comercial} autoComplete="organization" value={f.nome_comercial} error={err.nome_comercial} onChange={(v) => set('nome_comercial', v)} />
                      <Field name="nome_legal" label={t.l_nome_legal} placeholder={t.ph_nome_legal} value={f.nome_legal} error={err.nome_legal} onChange={(v) => set('nome_legal', v)} />
                      <Field name="nif" label={t.l_nif} placeholder={t.ph_nif} hint={t.hint_nif} mono value={f.nif} error={err.nif} onChange={(v) => set('nif', v)} />
                      <Field name="categoria" label={t.l_categoria} options={t.categorias as unknown as string[]} selectPlaceholder={t.selectPh} value={f.categoria} error={err.categoria} onChange={(v) => set('categoria', v)} />
                      <Field name="provincia" label={t.l_provincia} options={t.provincias as unknown as string[]} selectPlaceholder={t.selectPh} value={f.provincia} error={err.provincia} onChange={(v) => set('provincia', v)} />
                      <Field name="descricao" label={t.l_descricao} placeholder={t.ph_descricao} required={false} value={f.descricao} error={err.descricao} onChange={(v) => set('descricao', v)} />
                    </FGrid>
                    <StepFooter><span /><SubmitBtn type="button" onClick={next}>{t.continuar}</SubmitBtn></StepFooter>
                  </>
                )}

                {!done && step === 2 && (
                  <>
                    <StepHead kicker={t.of(2)} title={t.s2t} sub={t.s2s} />
                    <FGrid>
                      <Field name="resp_nome" label={t.l_resp_nome} placeholder={t.ph_resp_nome} autoComplete="name" value={f.resp_nome} error={err.resp_nome} onChange={(v) => set('resp_nome', v)} />
                      <Field name="resp_cargo" label={t.l_resp_cargo} placeholder={t.ph_resp_cargo} value={f.resp_cargo} error={err.resp_cargo} onChange={(v) => set('resp_cargo', v)} />
                      <Field name="resp_doc" label={t.l_resp_doc} placeholder={t.ph_resp_doc} mono span2 value={f.resp_doc} error={err.resp_doc} onChange={(v) => set('resp_doc', v)} />
                    </FGrid>
                    <StepFooter><BackBtn onClick={back}>{t.voltar}</BackBtn><SubmitBtn type="button" onClick={next}>{t.continuar}</SubmitBtn></StepFooter>
                  </>
                )}

                {!done && step === 3 && (
                  <>
                    <StepHead kicker={t.of(3)} title={t.s3t} sub={t.s3s} />
                    <FGrid>
                      <Field name="email" label={t.l_email} type="email" placeholder={t.ph_email} autoComplete="email" value={f.email} error={err.email} onChange={(v) => set('email', v)} />
                      <Field name="telefone" label={t.l_telefone} type="tel" placeholder={t.ph_telefone} autoComplete="tel" value={f.telefone} error={err.telefone} onChange={(v) => set('telefone', v)} />
                      <Field name="morada" label={t.l_morada} placeholder={t.ph_morada} required={false} span2 value={f.morada} error={err.morada} onChange={(v) => set('morada', v)} />
                    </FGrid>
                    <StepFooter><BackBtn onClick={back}>{t.voltar}</BackBtn><SubmitBtn type="button" onClick={next}>{t.rever}</SubmitBtn></StepFooter>
                  </>
                )}

                {!done && step === 4 && (
                  <>
                    <StepHead kicker={t.of(4)} title={t.s4t} sub={t.s4s} />
                    <div style={{ padding: '4px 18px', borderRadius: '18px', background: '#FFFBFA', border: '1px solid #F5E8E6', marginBottom: '18px' }}>
                      <SumRow label={t.sum.negocio} value={f.nome_comercial} />
                      <SumRow label={t.sum.nif} value={f.nif} />
                      <SumRow label={t.sum.categoria} value={f.categoria} />
                      <SumRow label={t.sum.resp} value={f.resp_nome} />
                      <SumRow label={t.sum.email} value={f.email} />
                      <SumRow label={t.sum.telefone} value={f.telefone} />
                    </div>
                    <FGrid>
                      <Check name="termos" checked={f.termos} error={err.termos} onChange={(v) => set('termos', v)} label={<>{t.termosPre}<a href={route('termos', lang)} target="_blank" rel="noopener noreferrer">{t.termos}</a>{t.termosMid}<a href={route('privacidade', lang)} target="_blank" rel="noopener noreferrer">{t.privacidade}</a>{t.termosPost}</>} />
                      <Check name="sandbox" checked={f.sandbox} error={err.sandbox} onChange={(v) => set('sandbox', v)} label={t.sandboxLabel} />
                    </FGrid>
                    <StepFooter><BackBtn onClick={back}>{t.voltar}</BackBtn><SubmitBtn type="submit" onClick={() => submit()}>{t.enviar}</SubmitBtn></StepFooter>
                  </>
                )}

                {done && (
                  <div role="status" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '24px 0 8px' }}>
                    <SuccessMark />
                    <h2 style={{ margin: '20px 0 0', fontSize: '26px', fontWeight: 900, letterSpacing: '-.02em', color: '#141014' }}>{t.doneT}</h2>
                    <p style={{ margin: '8px 0 0', maxWidth: '420px', fontSize: '15px', lineHeight: 1.55, fontWeight: 600, color: '#6a5a5e' }}>{t.donePre}<strong style={{ color: '#141014' }}>{f.nome_comercial}</strong>{t.donePost}</p>
                    <div style={{ marginTop: '20px', padding: '14px 22px', borderRadius: '16px', background: '#FFF1F0', border: '1px dashed rgba(181,16,31,.35)', fontFamily: "'JetBrains Mono',monospace", fontSize: '20px', fontWeight: 600, letterSpacing: '.06em', color: '#B5101F' }}>{appCode}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '12px', marginTop: '24px' }}>
                      <a href={route('estado', lang)} className="bz-btnlift" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', padding: '13px 24px', borderRadius: '40px', background: 'linear-gradient(160deg,#C8101F,#9A1B22)', color: '#fff', fontWeight: 800, fontSize: '14.5px', textDecoration: 'none', whiteSpace: 'nowrap', boxShadow: '0 14px 28px -14px rgba(181,16,31,.6),inset 0 1px 0 rgba(255,255,255,.2)' }}>{t.verEstado}<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg></a>
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
    </>
  );
}
