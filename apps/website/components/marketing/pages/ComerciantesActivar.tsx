'use client';

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { Ribbon, Badge, H1, H2, HeroLead, Small, SectionLabel, Icon, type IconName } from '../kit';
import { Field, Check, FGrid, SubmitBtn, BackBtn, SuccessMark } from '../form-kit';
import { Rotator } from '../Rotator';
import { Reveal } from '@/components/Reveal';
import { route, APP_URL, type Lang } from '@/lib/marketing/nav';

/**
 * Comerciantes · Activar — ported verbatim from
 * handoff_site_completo/pages/Comerciantes Activar.dc.html (PT) and
 * Comerciantes Activar EN.dc.html (EN). Two-step activation (code + consents)
 * with a bespoke stepper; the code prefills from ?codigo=. Client-side only.
 * Body only; header/footer come from <SiteShell>.
 */

const CONTENT: CSSProperties = { position: 'relative', maxWidth: '1140px', margin: '0 auto' };
type Errs = Record<string, string>;

const T = {
  pt: {
    badge: 'Versão Beta · Sandbox',
    h1a: 'Ativar o', h1b: 'negócio.',
    lead: 'A candidatura foi aprovada. Falta confirmar os dados e aceitar os termos para começar a receber.',
    smallPre: 'Não tem código? ', smallLink: 'Consulte o estado da candidatura', smallPost: '.',
    steps: ['Código', 'Consentimento'],
    s1t: 'Código de ativação', s1s: 'Está no e-mail de aprovação. Se abriu o link, já vem preenchido.',
    l_codigo: 'Código', ph_codigo: 'ACT-7Q4K-2M9A',
    continuar: 'Continuar', voltar: 'Voltar',
    s2t: 'Consentimento', s2pre: 'Para ativar ', s2post: ', confirme:',
    c1: 'Os dados do negócio enviados na candidatura estão corretos.',
    c2pre: 'Aceito os ', c2terms: 'Termos', c2mid: ' do Banzami Business e a ', c2priv: 'Política de Privacidade', c2post: '.',
    c3: 'Compreendo que, nesta fase, o negócio recebe apenas dinheiro fictício na Sandbox.',
    ativar: 'Ativar o negócio',
    doneT: 'Negócio ativado na Sandbox',
    doneP: 'Já pode criar cobranças por QR e links de pagamento com dinheiro fictício.',
    abrir: 'Abrir Beta Web', ver: 'Ver Banzami Business',
    depoisLabel: 'DEPOIS DE ATIVAR', depoisA: 'Pronto para', depoisB: 'receber.',
    depoisLead: 'Assim que ativa, o negócio fica disponível na Sandbox.',
    cards: [
      { icon: 'qr' as IconName, t: 'Criar cobranças', d: 'QR com valor e descrição.', tag: '01' },
      { icon: 'link' as IconName, t: 'Links de pagamento', d: 'Partilhe por qualquer canal.', tag: '02' },
      { icon: 'list' as IconName, t: 'Histórico e comprovativos', d: 'Cada venda fica registada.', tag: '03' },
    ],
    v_default: 'Campo obrigatório.', v_codigo: 'Código inválido.',
    v_c1: 'Confirme os dados.', v_c2: 'É necessário aceitar os termos.', v_c3: 'Confirme que compreende a fase Sandbox.',
  },
  en: {
    badge: 'Beta · Sandbox',
    h1a: 'Activate your', h1b: 'business.',
    lead: 'Your application has been approved. Confirm the details and accept the terms to start receiving.',
    smallPre: 'No code? ', smallLink: 'Check your application status', smallPost: '.',
    steps: ['Code', 'Consent'],
    s1t: 'Activation code', s1s: 'It is in the approval email. If you opened the link, it is already filled in.',
    l_codigo: 'Code', ph_codigo: 'ACT-7Q4K-2M9A',
    continuar: 'Continue', voltar: 'Back',
    s2t: 'Consent', s2pre: 'To activate ', s2post: ', please confirm:',
    c1: 'The business details sent in the application are correct.',
    c2pre: 'I accept the ', c2terms: 'Terms', c2mid: ' of Banzami Business and the ', c2priv: 'Privacy Policy', c2post: '.',
    c3: 'I understand that, in this phase, the business only receives test money in the Sandbox.',
    ativar: 'Activate your business',
    doneT: 'Business activated in the Sandbox',
    doneP: 'You can now create QR charges and payment links with test money.',
    abrir: 'Open Beta Web', ver: 'See Banzami Business',
    depoisLabel: 'AFTER ACTIVATION', depoisA: 'Ready to', depoisB: 'get paid.',
    depoisLead: 'Once activated, the business is available in the Sandbox.',
    cards: [
      { icon: 'qr' as IconName, t: 'Create charges', d: 'QR with amount and description.', tag: '01' },
      { icon: 'link' as IconName, t: 'Payment links', d: 'Share on any channel.', tag: '02' },
      { icon: 'list' as IconName, t: 'History and receipts', d: 'Every sale is recorded.', tag: '03' },
    ],
    v_default: 'Required field.', v_codigo: 'Invalid code.',
    v_c1: 'Confirm the details.', v_c2: 'You must accept the terms.', v_c3: 'Confirm you understand the Sandbox phase.',
  },
} as const;

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

function StepFooter({ children }: { children: ReactNode }) {
  return <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginTop: '28px', paddingTop: '22px', borderTop: '1px solid #F5E8E6' }}>{children}</div>;
}

const initial = { codigo: '', c1: false, c2: false, c3: false };

export function ComerciantesActivarPage({ lang }: { lang: Lang }) {
  const t = T[lang];
  const sp = useSearchParams();
  const [step, setStep] = useState(1);
  const [done, setDone] = useState(false);
  const [f, setF] = useState<typeof initial>({ ...initial });
  const [err, setErr] = useState<Errs>({});
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const c = sp.get('codigo');
    if (c) setF((s) => ({ ...s, codigo: c }));
  }, [sp]);

  const rules: Record<string, { re?: RegExp; bad?: string; msg?: string }> = {
    codigo: { re: /^[A-Z0-9-]{6,}$/i, bad: t.v_codigo },
    c1: { msg: t.v_c1 }, c2: { msg: t.v_c2 }, c3: { msg: t.v_c3 },
  };
  const stepFields: Record<number, string[]> = { 1: ['codigo'], 2: ['c1', 'c2', 'c3'] };

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

  const next = () => { if (validate(stepFields[step] || [])) setStep((s) => Math.min(2, s + 1)); };
  const back = () => { setStep((s) => Math.max(1, s - 1)); setErr({}); };
  const submit = (e?: React.FormEvent) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!validate(stepFields[step] || [])) return;
    // TODO: POST ativação
    setDone(true);
  };
  const codeUp = String(f.codigo || '').toUpperCase();

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
            <Small mw={600}>{t.smallPre}<a href={route('estado', lang)} style={{ fontWeight: 800 }}>{t.smallLink}</a>{t.smallPost}</Small>
          </Reveal>
          <Reveal delay={120}>
            <div ref={formRef} style={{ position: 'relative', background: '#fff', border: '1px solid #F3E3E1', borderRadius: '28px', padding: 'clamp(22px,3vw,32px)', boxShadow: '0 40px 80px -50px rgba(122,16,22,.5)' }}>
              {!done && <FlowStepper steps={t.steps as unknown as string[]} current={step} done={done} />}

              {!done && step === 1 && (
                <div style={{ marginTop: '26px' }}>
                  <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 900, letterSpacing: '-.01em', color: '#141014' }}>{t.s1t}</h3>
                  <p style={{ margin: '6px 0 18px', fontSize: '13.5px', fontWeight: 600, color: '#8a7a7e' }}>{t.s1s}</p>
                  <FGrid cols={1}>
                    <Field name="codigo" label={t.l_codigo} placeholder={t.ph_codigo} mono span2 value={f.codigo} error={err.codigo} onChange={(v) => set('codigo', v)} />
                  </FGrid>
                  <StepFooter><span /><SubmitBtn type="button" onClick={next}>{t.continuar}</SubmitBtn></StepFooter>
                </div>
              )}

              {!done && step === 2 && (
                <div style={{ marginTop: '26px' }}>
                  <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 900, letterSpacing: '-.01em', color: '#141014' }}>{t.s2t}</h3>
                  <p style={{ margin: '6px 0 18px', fontSize: '13.5px', fontWeight: 600, color: '#8a7a7e' }}>{t.s2pre}<span style={{ fontFamily: "'JetBrains Mono',monospace", color: '#B5101F' }}>{codeUp}</span>{t.s2post}</p>
                  <FGrid cols={1}>
                    <Check name="c1" checked={f.c1} error={err.c1} onChange={(v) => set('c1', v)} label={t.c1} />
                    <Check name="c2" checked={f.c2} error={err.c2} onChange={(v) => set('c2', v)} label={<>{t.c2pre}<a href={route('termos', lang)} target="_blank" rel="noopener noreferrer">{t.c2terms}</a>{t.c2mid}<a href={route('privacidade', lang)} target="_blank" rel="noopener noreferrer">{t.c2priv}</a>{t.c2post}</>} />
                    <Check name="c3" checked={f.c3} error={err.c3} onChange={(v) => set('c3', v)} label={t.c3} />
                  </FGrid>
                  <StepFooter><BackBtn onClick={back}>{t.voltar}</BackBtn><SubmitBtn type="submit" onClick={() => submit()}>{t.ativar}</SubmitBtn></StepFooter>
                </div>
              )}

              {done && (
                <div role="status" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '16px 0 4px' }}>
                  <SuccessMark />
                  <h2 style={{ margin: '20px 0 0', fontSize: '24px', fontWeight: 900, letterSpacing: '-.02em', color: '#141014' }}>{t.doneT}</h2>
                  <p style={{ margin: '8px 0 0', maxWidth: '380px', fontSize: '14.5px', lineHeight: 1.55, fontWeight: 600, color: '#6a5a5e' }}>{t.doneP}</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '12px', marginTop: '22px' }}>
                    <a href={APP_URL} target="_blank" rel="noopener noreferrer" className="bz-btnlift" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', padding: '13px 24px', borderRadius: '40px', background: 'linear-gradient(160deg,#C8101F,#9A1B22)', color: '#fff', fontWeight: 800, fontSize: '14.5px', textDecoration: 'none', whiteSpace: 'nowrap', boxShadow: '0 14px 28px -14px rgba(181,16,31,.6),inset 0 1px 0 rgba(255,255,255,.2)' }}>{t.abrir}<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg></a>
                    <a href={route('comerciantes', lang)} className="bz-btnlift" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', padding: '12px 22px', borderRadius: '40px', background: '#fff', border: '1px solid #F3E3E1', color: '#141014', fontWeight: 800, fontSize: '14.5px', textDecoration: 'none', whiteSpace: 'nowrap', boxShadow: '0 14px 30px -22px rgba(122,16,22,.4)' }}>{t.ver}<svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#B5101F" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg></a>
                  </div>
                </div>
              )}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ─── 01 · DEPOIS DE ATIVAR ─── */}
      <section style={{ position: 'relative', padding: 'clamp(64px,8vw,116px) 24px', margin: '28px 14px', borderRadius: '48px', background: '#fff', boxShadow: '0 40px 90px -70px rgba(122,16,22,.55)', overflow: 'hidden' }}>
        <Reveal><div style={CONTENT}>
          <div className="bz-g2" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.1fr) minmax(0,.9fr)', gap: '20px 56px', alignItems: 'end' }}>
            <div>
              <SectionLabel n="01" label={t.depoisLabel} panel />
              <H2 a={t.depoisA} b={t.depoisB} />
            </div>
            <p style={{ margin: '0 0 6px', fontSize: '16px', lineHeight: 1.6, fontWeight: 600, color: '#6a5a5e', maxWidth: '480px', textWrap: 'pretty' }}>{t.depoisLead}</p>
          </div>
          <Rotator mode="card" idle="#FFF8F7" className="bz-g3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: '14px', marginTop: '44px' }}>
            {t.cards.map((c, i) => (
              <div key={i} data-ri style={{ position: 'relative', overflow: 'hidden', padding: '20px 20px 22px', borderRadius: '22px', border: '1px solid rgba(181,16,31,.06)', background: '#FFF8F7', transition: 'background .6s,border-color .6s,box-shadow .6s,transform .6s cubic-bezier(.16,1,.3,1)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                  <span data-ri-ic style={{ flex: 'none', width: '42px', height: '42px', borderRadius: '13px', background: '#FFF1F0', color: '#B5101F', border: '1px solid rgba(181,16,31,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .6s,color .6s,box-shadow .6s' }}>
                    <Icon name={c.icon} color="currentColor" size={19} />
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
