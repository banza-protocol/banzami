'use client';

import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Badge, H1, H2, SectionLabel } from '../kit';
import { Field, SubmitBtn, SuccessMark } from '../form-kit';
import { Reveal } from '@/components/Reveal';
import { submitContact } from '@/lib/contact';
import { route, type Lang, type Loc } from '@/lib/marketing/nav';

/**
 * Suporte — ported verbatim from handoff_site_completo/pages/Suporte.dc.html
 * (PT) and Suporte EN.dc.html (EN). Body only; header/footer come from
 * <SiteShell>. Anchors: #contacto, #faq. The contact form is wired to
 * submitContact() (POST /v1/contact → contact@banzami.com, subject "[Suporte] …").
 */

const L = (pt: string, en: string): Loc => ({ pt, en });
const APP_URL = 'https://app.banzami.com/';
const CONTENT: CSSProperties = { position: 'relative', maxWidth: '1140px', margin: '0 auto' };

// ── validation copy (exact dossier strings) ─────────────────────────────────
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MSG_REQUIRED = L('Campo obrigatório.', 'Required field.');
const MSG_EMAIL = L('Introduza um e-mail válido.', 'Enter a valid email.');
const MSG_ASSUNTO = L('Escolha um assunto.', 'Choose a subject.');
const MSG_SEND_FAIL = L(
  'Não foi possível enviar a mensagem. Tente novamente ou escreva para contact@banzami.com.',
  'We could not send your message. Please try again or write to contact@banzami.com.',
);
const OTHER = L('Outro', 'Other');
const SUBJECT_OPTIONS: Loc[] = [
  L('A app Banzami', 'The Banzami app'),
  L('Banzami Business', 'Banzami Business'),
  L('Developers e API', 'Developers and API'),
  L('Comprovativos', 'Receipts'),
  L('Programa Beta', 'Beta Programme'),
  L('Segurança', 'Security'),
  L('Outro', 'Other'),
];

type FormFields = { nome: string; email: string; assunto: string; assunto_outro: string; mensagem: string };

// ── icons (exact dossier paths) ─────────────────────────────────────────────
const IC_MAIL = <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M3.5 7l8.5 6 8.5-6" /></svg>;
const IC_HELP = <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 0 1 4.8.9c0 1.6-2.3 2.1-2.3 3.6M12 17h.01" /></svg>;
const IC_SEARCH = <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>;
const IC_STORE = <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9l1.5-5h13L20 9M4 9v11h16V9M4 9h16M9 20v-6h6v6" /></svg>;
const IC_GLOBE = <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.6 2.8 3.8 5.8 3.8 9s-1.2 6.2-3.8 9c-2.6-2.8-3.8-5.8-3.8-9S9.4 5.8 12 3z" /></svg>;
const IC_PHONE = <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="2.5" width="12" height="19" rx="3" /><path d="M10.5 18.5h3" /></svg>;
const IC_CODE = <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 7l-5 5 5 5M16 7l5 5-5 5" /></svg>;
const IC_SHIELD = <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l7 3v5c0 4.2-2.9 7.5-7 8.5-4.1-1-7-4.3-7-8.5V6z" /><path d="M9.2 11.6l1.9 1.9 3.7-3.7" /></svg>;

const ArrowSm = () => <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B5101F" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>;

// A quick-link / resource card (the dossier style-hover lift is reproduced).
function LiftCard({ href, icon, title, desc, external }: { href: string; icon: ReactNode; title: string; desc: string; external?: boolean }) {
  const ext = external ? { target: '_blank', rel: 'noopener' } : {};
  return (
    <a
      href={href}
      {...ext}
      onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 30px 56px -34px rgba(122,16,22,.5)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 24px 50px -40px rgba(122,16,22,.45)'; }}
      style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '20px', borderRadius: '22px', background: '#fff', border: '1px solid #F3E3E1', textDecoration: 'none', boxShadow: '0 24px 50px -40px rgba(122,16,22,.45)', transition: 'transform .3s cubic-bezier(.16,1,.3,1),box-shadow .3s' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ flex: 'none', width: '40px', height: '40px', borderRadius: '12px', background: '#FFF1F0', color: '#B5101F', border: '1px solid rgba(181,16,31,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</span>
        <ArrowSm />
      </div>
      <div>
        <p style={{ margin: 0, fontSize: '15px', fontWeight: 900, color: '#141014' }}>{title}</p>
        <p style={{ margin: '3px 0 0', fontSize: '13px', lineHeight: 1.45, fontWeight: 600, color: '#8a7a7e' }}>{desc}</p>
      </div>
    </a>
  );
}

// ── FAQ data (exact dossier Q&A) ────────────────────────────────────────────
function Faq({ lang }: { lang: Lang }) {
  const items: { q: Loc; a: ReactNode }[] = [
    {
      q: L('O que é a Sandbox?', 'What is the Sandbox?'),
      a: lang === 'en'
        ? 'It is Banzami’s public test environment. You can create an account, send, receive and see receipts with test money.'
        : 'É o ambiente de testes público do Banzami. Pode criar conta, enviar, receber e ver comprovativos com dinheiro fictício.',
    },
    {
      q: L('O dinheiro na Sandbox é real?', 'Is the money in the Sandbox real?'),
      a: lang === 'en'
        ? 'No. All balances and payments are test money with no financial value. Real-money operations remain unavailable in this phase.'
        : 'Não. Todos os saldos e pagamentos são fictícios e não têm valor financeiro. As operações com dinheiro real permanecem indisponíveis nesta fase.',
    },
    {
      q: L('Como posso testar?', 'How can I test?'),
      a: lang === 'en'
        ? (<>Open <a href={APP_URL} target="_blank" rel="noopener">Beta Web</a> in your browser, or join the <a href={route('testes', lang)}>Beta Programme</a> for iPhone (TestFlight) and Android.</>)
        : (<>Abra a <a href={APP_URL} target="_blank" rel="noopener">Beta Web</a> no browser, ou inscreva-se no <a href={route('testes', lang)}>Programa Beta</a> para iPhone (TestFlight) e Android.</>),
    },
    {
      q: L('O que é um @banza?', 'What is a @banza?'),
      a: lang === 'en'
        ? 'It is your username on Banzami. Use it to send and receive between people, with no IBAN or account number.'
        : 'É o seu nome de utilizador no Banzami. Serve para enviar e receber entre pessoas, sem IBAN nem número de conta.',
    },
    {
      q: L('Como verifico um comprovativo?', 'How do I verify a receipt?'),
      a: lang === 'en'
        ? (<>Every receipt has a reference starting with BZM-. Enter it in <a href={route('verificar', lang)}>Verify a receipt</a>.</>)
        : (<>Cada comprovativo tem uma referência que começa por BZM-. Introduza-a em <a href={route('verificar', lang)}>Verificar comprovativo</a>.</>),
    },
    {
      q: L('O Banzami pede o número do cartão?', 'Does Banzami ask for my card number?'),
      a: lang === 'en'
        ? 'No. Banzami is not a card processor and will never ask for your card number or CVV.'
        : 'Não. O Banzami não é um processador de cartões e nunca lhe pede o número do cartão nem o CVV.',
    },
    {
      q: L('Tenho um negócio. Como recebo?', 'I have a business. How do I get paid?'),
      a: lang === 'en'
        ? (<>With Banzami Business: QR, links and billing tools. Start by <a href={route('candidatura', lang)}>registering your business</a>.</>)
        : (<>Com o Banzami Business: QR, links e ferramentas de cobrança. Comece por <a href={route('candidatura', lang)}>registar o negócio</a>.</>),
    },
  ];
  return (
    <div className="sp-faq" style={{ maxWidth: '820px', margin: '40px auto 0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {items.map((it, i) => (
        <details key={i} style={{ background: '#fff', border: '1px solid #F3E3E1', borderRadius: '20px', boxShadow: '0 20px 44px -40px rgba(122,16,22,.45)' }}>
          <summary style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', padding: '20px 22px', cursor: 'pointer', fontSize: '16px', fontWeight: 900, color: '#141014' }}>
            {it.q[lang]}
            <span style={{ flex: 'none', width: '30px', height: '30px', borderRadius: '50%', background: '#FFF1F0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg className="bz-acc-chev" aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ transition: 'transform .25s' }}><path d="M9 6l6 6-6 6" stroke="#B5101F" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
          </summary>
          <p style={{ margin: 0, padding: '0 22px 20px', fontSize: '14.5px', lineHeight: 1.65, fontWeight: 600, color: '#5a4a4e', textWrap: 'pretty' }}>{it.a}</p>
        </details>
      ))}
    </div>
  );
}

// ── contact subject <select> (bilingual placeholder, dossier styling) ────────
function SubjectSelect({ lang, value, error, onChange }: { lang: Lang; value: string; error?: string; onChange: (v: string) => void }) {
  const focus = (e: React.FocusEvent<HTMLElement>) => { e.currentTarget.style.borderColor = '#D8121F'; e.currentTarget.style.boxShadow = '0 0 0 4px rgba(216,18,31,.12)'; };
  const blur = (e: React.FocusEvent<HTMLElement>) => { e.currentTarget.style.borderColor = '#EFDCDA'; e.currentTarget.style.boxShadow = 'none'; };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', minWidth: 0, gridColumn: '1 / -1' }}>
      <label htmlFor="f_assunto" style={{ fontSize: '13px', fontWeight: 800, color: '#2a2024' }}>{lang === 'en' ? 'Subject' : 'Assunto'} <span aria-hidden="true" style={{ color: '#B5101F' }}>*</span></label>
      <div style={{ position: 'relative' }}>
        <select id="f_assunto" name="assunto" value={value} aria-required="true" onChange={(e) => onChange(e.target.value)} onFocus={focus} onBlur={blur} style={{ width: '100%', padding: '13px 15px', borderRadius: '14px', border: '1px solid #EFDCDA', background: '#fff', fontFamily: 'inherit', fontSize: '15px', fontWeight: 600, color: '#141014', outline: 'none', transition: 'border-color .2s,box-shadow .2s', appearance: 'none', WebkitAppearance: 'none', paddingRight: '40px', cursor: 'pointer' }}>
          <option value="">{lang === 'en' ? 'Select…' : 'Selecione…'}</option>
          {SUBJECT_OPTIONS.map((o) => <option key={o.pt} value={o[lang]}>{o[lang]}</option>)}
        </select>
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#B5101F" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', right: '15px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}><path d="M6 9l6 6 6-6" /></svg>
      </div>
      {error && (
        <p role="alert" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', fontWeight: 700, color: '#C8101F' }}>
          <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#C8101F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 11.5v4.5M12 8h.01" /></svg>{error}
        </p>
      )}
    </div>
  );
}

// ═══════════════════ page ═══════════════════
export function SuportePage({ lang }: { lang: Lang }) {
  const [f, setF] = useState<FormFields>({ nome: '', email: '', assunto: '', assunto_outro: '', mensagem: '' });
  const [err, setErr] = useState<Partial<Record<keyof FormFields, string>>>({});
  const [done, setDone] = useState(false);
  const [sending, setSending] = useState(false);
  const [submitErr, setSubmitErr] = useState('');
  const formRef = useRef<HTMLFormElement>(null);

  const isOutro = f.assunto === OTHER[lang];

  const setField = (name: keyof FormFields, v: string) => {
    setF((s) => ({ ...s, [name]: v }));
    setErr((s) => ({ ...s, [name]: '' }));
    if (submitErr) setSubmitErr('');
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const keys: (keyof FormFields)[] = ['nome', 'email', 'assunto', 'mensagem'].concat(isOutro ? ['assunto_outro'] : []) as (keyof FormFields)[];
    const nextErr: Partial<Record<keyof FormFields, string>> = {};
    keys.forEach((k) => {
      const v = f[k];
      if (v === undefined || v === '') {
        nextErr[k] = k === 'assunto' ? MSG_ASSUNTO[lang] : MSG_REQUIRED[lang];
      } else if (k === 'email' && !EMAIL_RE.test(String(v).trim())) {
        nextErr[k] = MSG_EMAIL[lang];
      }
    });
    setErr(nextErr);
    const firstBad = Object.keys(nextErr)[0];
    if (firstBad) {
      const el = formRef.current?.querySelector<HTMLElement>(`[name="${firstBad}"]`);
      el?.focus();
      return;
    }
    // Deliver the message through the operator's contact endpoint. The subject
    // matches the dossier convention: "[Suporte] …" (PT) / "[Support] …" (EN),
    // and for "Outro"/"Other" the free-text subject is used.
    const chosen = isOutro ? f.assunto_outro : f.assunto;
    const prefix = lang === 'en' ? '[Support] ' : '[Suporte] ';
    setSending(true);
    setSubmitErr('');
    const res = await submitContact({ name: f.nome, email: f.email, subject: prefix + chosen, message: f.mensagem });
    setSending(false);
    if (res.ok) {
      setDone(true);
    } else {
      setSubmitErr(res.message === 'default' ? MSG_SEND_FAIL[lang] : res.message);
    }
  }

  function reset() {
    setF({ nome: '', email: '', assunto: '', assunto_outro: '', mensagem: '' });
    setErr({});
    setSubmitErr('');
    setDone(false);
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        .sp-faq summary{list-style:none}
        .sp-faq summary::-webkit-details-marker{display:none}
        .sp-faq details[open] .bz-acc-chev{transform:rotate(90deg)}
      ` }} />

      {/* ─────────── 00 · HERO (#inicio) ─────────── */}
      <section id="inicio" style={{ position: 'relative', padding: '128px 24px 56px', overflow: 'hidden' }}>
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', right: '-8%', top: '-20%', width: '640px', height: '640px', borderRadius: '50%', background: 'radial-gradient(circle,rgba(251,210,208,.75),rgba(251,210,208,0) 68%)' }} />
          <div style={{ position: 'absolute', left: '-12%', bottom: '-40%', width: '520px', height: '520px', borderRadius: '50%', background: 'radial-gradient(circle,rgba(255,228,226,.8),rgba(255,228,226,0) 70%)' }} />
        </div>

        <div className="bz-g2" style={{ position: 'relative', maxWidth: '1140px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1.1fr .9fr', gap: '56px', alignItems: 'center' }}>
          <Reveal>
            <Badge>{lang === 'en' ? 'Support' : 'Suporte'}</Badge>
            <H1 a={lang === 'en' ? 'How can we' : 'Como podemos'} b={lang === 'en' ? 'help?' : 'ajudar?'} size="clamp(36px,4.2vw,56px)" />
            <p style={{ margin: '20px 0 0', fontSize: 'clamp(16px,1.4vw,18px)', lineHeight: 1.55, color: '#4a3a3e', fontWeight: 600, maxWidth: '600px', textWrap: 'pretty' }}>
              {lang === 'en' ? 'Quick answers to the most common questions, or talk directly to our team.' : 'Respostas rápidas às perguntas mais comuns, ou fale diretamente com a nossa equipa.'}
            </p>
          </Reveal>
          <Reveal delay={120}>
            <div className="bz-g2s" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <LiftCard href="#contacto" icon={IC_MAIL} title={lang === 'en' ? 'Contact the team' : 'Contactar a equipa'} desc={lang === 'en' ? 'Reply by email.' : 'Resposta por e-mail.'} />
              <LiftCard href="#faq" icon={IC_HELP} title={lang === 'en' ? 'FAQ' : 'Perguntas frequentes'} desc={lang === 'en' ? 'Sandbox, @banza and more.' : 'Sandbox, @banza e mais.'} />
              <LiftCard href={route('verificar', lang)} icon={IC_SEARCH} title={lang === 'en' ? 'Verify a receipt' : 'Verificar comprovativo'} desc={lang === 'en' ? 'Check a reference.' : 'Confirme uma referência.'} />
              <LiftCard href={route('estado', lang)} icon={IC_STORE} title={lang === 'en' ? 'Application status' : 'Estado da candidatura'} desc={lang === 'en' ? 'For businesses.' : 'Para negócios.'} />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ─────────── 01 · CONTACTO (#contacto) ─────────── */}
      <section id="contacto" style={{ position: 'relative', padding: 'clamp(64px,8vw,116px) 24px', margin: '28px 14px', borderRadius: '48px', background: '#fff', boxShadow: '0 40px 90px -70px rgba(122,16,22,.55)', overflow: 'hidden' }}>
        <Reveal><div style={CONTENT}>
          <div className="bz-g2" style={{ display: 'grid', gridTemplateColumns: '.85fr 1.15fr', gap: '56px', alignItems: 'center' }}>
            <div style={{ position: 'relative', minWidth: 0 }}>
              <SectionLabel n="01" label={lang === 'en' ? 'CONTACT' : 'CONTACTO'} panel />
              <H2 a={lang === 'en' ? 'Talk to' : 'Fale com'} b={lang === 'en' ? 'our team.' : 'a nossa equipa.'} />
              <p style={{ margin: '16px 0 0', fontSize: '16px', lineHeight: 1.6, fontWeight: 600, color: '#6a5a5e', maxWidth: '440px', textWrap: 'pretty' }}>
                {lang === 'en' ? 'Choose a subject so your message reaches the right person.' : 'Escolha o assunto para que a mensagem chegue à pessoa certa.'}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '26px', maxWidth: '420px' }}>
                {([
                  { email: 'contact@banzami.com', label: lang === 'en' ? 'General' : 'Geral', icon: IC_MAIL },
                  { email: 'security@banzami.com', label: lang === 'en' ? 'Security' : 'Segurança', icon: IC_SHIELD },
                ]).map((row) => (
                  <a key={row.email} href={`mailto:${row.email}`} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px', borderRadius: '18px', background: '#FFF8F7', border: '1px solid #F3E3E1', textDecoration: 'none' }}>
                    <span style={{ flex: 'none', width: '38px', height: '38px', borderRadius: '12px', background: '#FFF1F0', color: '#B5101F', border: '1px solid rgba(181,16,31,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: row.email.startsWith('security') ? '<path d="M12 3l7 3v5c0 4.2-2.9 7.5-7 8.5-4.1-1-7-4.3-7-8.5V6z"></path><path d="M9.2 11.6l1.9 1.9 3.7-3.7"></path>' : '<rect x="3" y="5" width="18" height="14" rx="3"></rect><path d="M3.5 7l8.5 6 8.5-6"></path>' }} />
                    </span>
                    <span>
                      <span style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#9a8487' }}>{row.label}</span>
                      <span style={{ display: 'block', fontFamily: "'JetBrains Mono',monospace", fontSize: '13.5px', fontWeight: 600, color: '#141014' }}>{row.email}</span>
                    </span>
                  </a>
                ))}
              </div>
            </div>
            <div style={{ position: 'relative', minWidth: 0 }}>
              <div style={{ background: '#fff', border: '1px solid #F3E3E1', borderRadius: '28px', padding: 'clamp(22px,3vw,34px)', boxShadow: '0 40px 80px -50px rgba(122,16,22,.5)' }}>
                {!done ? (
                  <form ref={formRef} onSubmit={submit} noValidate>
                    <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 900, letterSpacing: '-.01em', color: '#141014' }}>{lang === 'en' ? 'Send message' : 'Enviar mensagem'}</h3>
                    <p style={{ margin: '6px 0 20px', fontSize: '13.5px', fontWeight: 600, color: '#8a7a7e' }}>
                      {lang === 'en'
                        ? (<>We send your message to <strong style={{ color: '#141014' }}>contact@banzami.com</strong> and reply to the email you give.</>)
                        : (<>Enviamos a sua mensagem para <strong style={{ color: '#141014' }}>contact@banzami.com</strong> e respondemos para o e-mail que indicar.</>)}
                    </p>
                    <div className="bz-fgrid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '16px 18px' }}>
                      <Field name="nome" label={lang === 'en' ? 'Name' : 'Nome'} placeholder={lang === 'en' ? 'Your name' : 'O seu nome'} autoComplete="name" value={f.nome} error={err.nome} onChange={(v) => setField('nome', v)} />
                      <Field name="email" label={lang === 'en' ? 'Email' : 'E-mail'} type="email" placeholder={lang === 'en' ? 'name@example.com' : 'nome@exemplo.ao'} autoComplete="email" value={f.email} error={err.email} onChange={(v) => setField('email', v)} />
                      <SubjectSelect lang={lang} value={f.assunto} error={err.assunto} onChange={(v) => setField('assunto', v)} />
                      {isOutro && (
                        <Field name="assunto_outro" label={lang === 'en' ? 'What is it about?' : 'Qual é o assunto?'} placeholder={lang === 'en' ? 'Type the subject' : 'Escreva o assunto'} span2 value={f.assunto_outro} error={err.assunto_outro} onChange={(v) => setField('assunto_outro', v)} />
                      )}
                      <Field name="mensagem" label={lang === 'en' ? 'Message' : 'Mensagem'} type="textarea" placeholder={lang === 'en' ? 'How can we help?' : 'Como podemos ajudar?'} span2 value={f.mensagem} error={err.mensagem} onChange={(v) => setField('mensagem', v)} />
                    </div>
                    {submitErr && (
                      <p role="alert" style={{ margin: '16px 0 0', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', fontWeight: 700, color: '#C8101F' }}>
                        <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#C8101F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 11.5v4.5M12 8h.01" /></svg>{submitErr}
                      </p>
                    )}
                    <div style={{ marginTop: '22px' }}>
                      <SubmitBtn>{sending ? (lang === 'en' ? 'Sending…' : 'A enviar…') : (lang === 'en' ? 'Send message' : 'Enviar mensagem')}</SubmitBtn>
                    </div>
                  </form>
                ) : (
                  <div role="status" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '20px 0 6px' }}>
                    <SuccessMark />
                    <h3 style={{ margin: '20px 0 0', fontSize: '24px', fontWeight: 900, letterSpacing: '-.02em', color: '#141014' }}>{lang === 'en' ? 'Message sent' : 'Mensagem enviada'}</h3>
                    <p style={{ margin: '8px 0 0', maxWidth: '400px', fontSize: '14.5px', lineHeight: 1.55, fontWeight: 600, color: '#6a5a5e' }}>
                      {lang === 'en' ? 'We received your message and will reply to the email you gave. You can also write to contact@banzami.com.' : 'Recebemos a sua mensagem e respondemos para o e-mail que indicou. Também pode escrever para contact@banzami.com.'}
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '12px', marginTop: '22px' }}>
                      <button type="button" onClick={reset} style={{ padding: '12px 20px', borderRadius: '40px', border: '1px solid #F3E3E1', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800, fontSize: '14.5px', color: '#141014' }}>{lang === 'en' ? 'Send another' : 'Enviar outro'}</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div></Reveal>
      </section>

      {/* ─────────── 02 · PERGUNTAS FREQUENTES (#faq) ─────────── */}
      <section id="faq" style={{ position: 'relative', padding: 'clamp(64px,8vw,116px) 24px', overflow: 'hidden' }}>
        <Reveal><div style={CONTENT}>
          <div>
            <SectionLabel n="02" label={lang === 'en' ? 'FAQ' : 'PERGUNTAS FREQUENTES'} />
            <H2 a={lang === 'en' ? 'Before' : 'Antes de'} b={lang === 'en' ? 'you write to us.' : 'nos escrever.'} />
          </div>
          <Faq lang={lang} />
        </div></Reveal>
      </section>

      {/* ─────────── 03 · LINKS ÚTEIS ─────────── */}
      <section style={{ position: 'relative', padding: 'clamp(64px,8vw,116px) 24px', margin: '28px 14px', borderRadius: '48px', background: '#fff', boxShadow: '0 40px 90px -70px rgba(122,16,22,.55)', overflow: 'hidden' }}>
        <Reveal><div style={CONTENT}>
          <div>
            <SectionLabel n="03" label={lang === 'en' ? 'USEFUL LINKS' : 'LINKS ÚTEIS'} panel />
            <H2 a={lang === 'en' ? 'More' : 'Mais'} b={lang === 'en' ? 'resources.' : 'recursos.'} />
          </div>
          <div className="bz-g4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: '14px', marginTop: '40px' }}>
            <LiftCard href={APP_URL} icon={IC_GLOBE} title="Beta Web" desc={lang === 'en' ? 'Open the app in your browser.' : 'Abrir a app no browser.'} />
            <LiftCard href={route('testes', lang)} icon={IC_PHONE} title={lang === 'en' ? 'Beta Programme' : 'Programa Beta'} desc={lang === 'en' ? 'iPhone and Android.' : 'iPhone e Android.'} />
            <LiftCard href={route('developers', lang)} icon={IC_CODE} title="Developers" desc={lang === 'en' ? 'API, SDK and webhooks.' : 'API, SDK e webhooks.'} />
            <LiftCard href={route('seguranca', lang)} icon={IC_SHIELD} title={lang === 'en' ? 'Security' : 'Segurança'} desc={lang === 'en' ? 'How we protect you.' : 'Como protegemos.'} />
          </div>
        </div></Reveal>
      </section>
    </>
  );
}
