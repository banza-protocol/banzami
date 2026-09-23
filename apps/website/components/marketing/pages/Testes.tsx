'use client';

// /testes (+ /en/testes) — ported verbatim from
// handoff_site_completo/pages/Testes(.EN).dc.html. Body only: the shared
// SiteShell provides header + footer + page background. The tester sign-up form
// owns its own state here (values, errors, success) and posts to the real beta
// capture endpoint (submitBetaRegistration → POST /v1/beta/testers).
//
// Animations reuse global keyframes: bzring (via <Badge>), bzspin (via
// <SuccessMark>) and scanline; the QR scan line needs the dossier's exact
// 14%→78% range, added as the one bespoke keyframe (ts-scanline).

import { useState } from 'react';
import { Ribbon, Badge, SectionLabel, H1, H2, Btn, Icon, type IconName } from '../kit';
import { Field, OptBtns, Check, FGrid, SubmitBtn, SuccessMark } from '../form-kit';
import { Rotator } from '../Rotator';
import { Reveal } from '@/components/Reveal';
import { LiveClock } from '@/components/site/LiveClock';
import { route, APP_URL, type Lang, type Loc } from '@/lib/marketing/nav';
import {
  submitBetaRegistration,
  type BetaApp,
  type BetaPlatform,
} from '@/lib/beta';

const L = (pt: string, en: string): Loc => ({ pt, en });

// ── copy ────────────────────────────────────────────────────────────────────
const T = {
  // hero
  badge: L('Programa Beta', 'Beta Programme'),
  h1a: L('Teste o Banzami', 'Try Banzami'),
  h1b: L('antes de todos.', 'before everyone.'),
  heroLead: L(
    'Junte-se ao Beta público. Convidamos testers por etapas para a Beta Web, iPhone (TestFlight) e Android.',
    'Join the public Beta. We invite testers in stages for Beta Web, iPhone (TestFlight) and Android.',
  ),
  heroSmall: L('Tudo acontece na Sandbox, com dinheiro fictício.', 'Everything runs in the Sandbox, with test money.'),
  ctaSignup: L('Inscrever-me', 'Sign me up'),
  ctaLang: L('English', 'Português'),
  // platform pills
  pillWeb: L('No browser', 'In your browser'),
  pillIphone: L('TestFlight', 'TestFlight'),
  pillAndroid: L('Em testes', 'In testing'),
  // phone mockups
  scanHint: L('Aponte para o código QR', 'Point at the QR code'),
  qrAlt: L('QR Banzami', 'QR Banzami'),
  confirmPay: L('Confirmar pagamento', 'Confirm payment'),
  requested: L('Solicitou um pagamento', 'Requested a payment'),
  vaquinha: L('vaquinha', 'vaquinha'),
  payMethod: L('Método de pagamento', 'Payment method'),
  balance: L('Saldo Banzami', 'Banzami balance'),
  payBtn: L('Pagar 1 500 Kz', 'Pay 1 500 Kz'),
  irreversible: L('Pagamento irreversível', 'Irreversible payment'),
  // 01 channels
  label01: L('CANAIS', 'CHANNELS'),
  s1h2a: L('Três formas', 'Three ways'),
  s1h2b: L('de testar.', 'to test.'),
  s1lead: L('Comece já no browser ou peça acesso às apps móveis.', 'Start now in the browser or request access to the mobile apps.'),
  // 02 sign up
  label02: L('COMO PARTICIPAR', 'HOW TO JOIN'),
  s2h2a: L('Inscreva-se', 'Sign up'),
  s2h2b: L('e aguarde o convite.', 'and wait for your invite.'),
  s2lead: L(
    'Abrimos novas vagas em cada etapa. Quando for a sua vez, recebe o convite por e-mail.',
    'We open new spots at each stage. When it is your turn, you get the invite by email.',
  ),
  // form
  formTitle: L('Inscrição de tester', 'Tester sign-up'),
  formSub: L('Leva menos de um minuto.', 'Takes less than a minute.'),
  fNome: L('Nome', 'Name'),
  fNomePh: L('O seu nome', 'Your name'),
  fEmail: L('E-mail', 'Email'),
  fEmailPh: L('nome@exemplo.ao', 'name@example.com'),
  fApp: L('App que quer testar', 'App you want to test'),
  appBanzami: L('App Banzami', 'Banzami app'),
  appBanzamiDesc: L('Pagar e receber', 'Pay and receive'),
  appBusiness: L('Banzami Business', 'Banzami Business'),
  appBusinessDesc: L('Para negócios', 'For businesses'),
  fPlataforma: L('Plataforma', 'Platform'),
  selectPh: L('Selecione…', 'Select…'),
  consentText: L('Aceito receber o convite e comunicações do Programa Beta por e-mail. ', 'I agree to receive the invite and Beta Programme emails. '),
  consentPrivacy: L('Privacidade', 'Privacy'),
  submit: L('Enviar inscrição', 'Send sign-up'),
  // success
  successTitle: L('Inscrição recebida', 'You are in!'),
  successBody: L('Enviamos o convite por e-mail quando abrir a próxima etapa.', 'We will email your invite when the next stage opens.'),
  sendAnother: L('Enviar outro', 'Send another'),
  // validation (dossier engine defaults)
  errRequired: L('Campo obrigatório.', 'Required field.'),
  errInvalid: L('Valor inválido.', 'Invalid value.'),
} as const;

// The three channel cards (01).
const CHANNELS: { icon: IconName; tag: Loc; title: Loc; desc: Loc }[] = [
  { icon: 'globe', tag: L('DISPONÍVEL', 'AVAILABLE'), title: L('Beta Web', 'Beta Web'), desc: L('Disponível agora no browser, sem instalar nada.', 'Available now in your browser, nothing to install.') },
  { icon: 'phone', tag: L('CONVITE', 'INVITE'), title: L('iPhone', 'iPhone'), desc: L('Via TestFlight, por convite.', 'Via TestFlight, by invitation.') },
  { icon: 'phone', tag: L('CONVITE', 'INVITE'), title: L('Android', 'Android'), desc: L('Em testes, por convite.', 'In testing, by invitation.') },
];

// The three sign-up steps (02).
const STEPS: { icon: IconName; title: Loc; desc: Loc }[] = [
  { icon: 'doc', title: L('Inscreva-se', 'Sign up'), desc: L('Diga-nos que app quer testar e em que plataforma.', 'Tell us which app you want to test and on which platform.') },
  { icon: 'mail', title: L('Convites por etapas', 'Staged invites'), desc: L('Enviamos convites à medida que abrimos vagas.', 'We send invites as new spots open.') },
  { icon: 'sparkle', title: L('Teste na Sandbox', 'Test in the Sandbox'), desc: L('Use a app com dinheiro fictício e envie-nos feedback.', 'Use the app with test money and send us feedback.') },
];

// The plataforma dropdown values (exact, both languages).
const PLATFORMS = ['Beta Web', 'iPhone (TestFlight)', 'Android'] as const;

function looksLikeEmail(e: string): boolean {
  const t = e.trim();
  if (t.length < 5 || t.length > 254 || /\s/.test(t)) return false;
  const at = t.indexOf('@');
  return at > 0 && at === t.lastIndexOf('@') && at < t.length - 1 && t.slice(at + 1).includes('.');
}

// Map the dossier's app label to the beta app id (both language labels).
function appId(app: string): BetaApp | null {
  if (app === 'App Banzami' || app === 'Banzami app') return 'APP_BANZAMI';
  if (app === 'Banzami Business') return 'APP_MERCHANT';
  return null;
}

// Map the plataforma choice to the beta endpoint's platform enum. The endpoint
// has no dedicated WEB platform, so "Beta Web" is recorded as BOTH.
// TODO: POST inscrição tester — add a WEB platform to /v1/beta/testers so a
// Beta Web sign-up is not conflated with a mobile-store invite.
function platformId(p: string): BetaPlatform {
  if (p === 'iPhone (TestFlight)') return 'IOS';
  if (p === 'Android') return 'ANDROID';
  return 'BOTH';
}

const inSt: React.CSSProperties = {
  width: '100%', padding: '13px 15px', borderRadius: '14px', border: '1px solid #EFDCDA', background: '#fff',
  fontFamily: 'inherit', fontSize: '15px', fontWeight: 600, color: '#141014', outline: 'none',
  transition: 'border-color .2s, box-shadow .2s',
};

// Dark platform pill (hero). Beta Web opens the real web app; the mobile pills
// point to the sign-up form (apps are invite-only).
function PlatPill({ href, external, icon, title, sub }: { href: string; external?: boolean; icon: React.ReactNode; title: string; sub: string }) {
  const ext = external ? { target: '_blank', rel: 'noopener noreferrer' } : {};
  return (
    <a href={href} {...ext} className="bz-btnlift" style={{ display: 'flex', alignItems: 'center', gap: '11px', padding: '12px 16px', borderRadius: '14px', background: 'linear-gradient(160deg,#241c1e,#120e0f)', border: '1px solid rgba(255,255,255,.06)', textDecoration: 'none', boxShadow: '0 16px 30px -18px rgba(20,16,20,.7)' }}>
      {icon}
      <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
        <span style={{ fontSize: '14px', fontWeight: 800, color: '#fff' }}>{title}</span>
        <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'rgba(255,255,255,.55)' }}>{sub}</span>
      </span>
    </a>
  );
}

export function TestesPage({ lang }: { lang: Lang }) {
  const other: Lang = lang === 'pt' ? 'en' : 'pt';

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [app, setApp] = useState('');
  const [plataforma, setPlataforma] = useState('');
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);

  const platFocus = (e: React.FocusEvent<HTMLSelectElement>) => { e.currentTarget.style.borderColor = '#D8121F'; e.currentTarget.style.boxShadow = '0 0 0 4px rgba(216,18,31,.12)'; };
  const platBlur = (e: React.FocusEvent<HTMLSelectElement>) => { e.currentTarget.style.borderColor = '#EFDCDA'; e.currentTarget.style.boxShadow = 'none'; };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Client validation, messages in the page language, focus first invalid.
    const err: Record<string, string> = {};
    if (!nome.trim()) err.nome = T.errRequired[lang];
    if (!email.trim()) err.email = T.errRequired[lang];
    else if (!looksLikeEmail(email)) err.email = T.errInvalid[lang];
    if (!plataforma) err.plataforma = T.errRequired[lang];
    if (!consent) err.consent = T.errRequired[lang];
    setErrors(err);
    if (Object.keys(err).length) {
      const first = ['nome', 'email', 'plataforma', 'consent'].find((k) => err[k]);
      const el = first === 'consent'
        ? document.querySelector<HTMLInputElement>('input[name="consent"]')
        : document.getElementById('f_' + first) as HTMLElement | null;
      el?.focus();
      return;
    }

    // A clear endpoint exists (the beta-tester capture): use it. The dossier
    // form carries a single name, an optional app and a "Beta Web" platform, so
    // we map conservatively (see appId/platformId).
    const parts = nome.trim().split(/\s+/);
    const chosen = appId(app);
    await submitBetaRegistration({
      first_name: parts[0],
      last_name: parts.slice(1).join(' ') || parts[0],
      email: email.trim(),
      platform: platformId(plataforma),
      apps: chosen ? [chosen] : ['APP_BANZAMI'],
      source: 'testes',
    });
    // A non-enumerating capture answers success either way; the dossier always
    // shows the confirmation screen.
    setDone(true);
  }

  function reset() {
    setNome(''); setEmail(''); setApp(''); setPlataforma(''); setConsent(false);
    setErrors({}); setDone(false);
  }

  return (
    <>
      {/* bespoke keyframe: the QR scan line's exact dossier range */}
      <style dangerouslySetInnerHTML={{ __html: '@keyframes ts-scanline{0%{top:14%}100%{top:78%}}' }} />

      {/* ═══════════════ 00 · HERO ═══════════════ */}
      <section id="inicio" style={{ position: 'relative', padding: '112px 24px 64px', overflow: 'hidden', background: '#fff', borderRadius: '0 0 48px 48px', boxShadow: '0 40px 80px -60px rgba(122,16,22,.45)' }}>
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/hero-bg-red.png" alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', display: 'block' }} />
        </div>
        <Ribbon />
        <Reveal>
          <div className="bz-herogrid" style={{ position: 'relative', maxWidth: '1140px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1.05fr .95fr', gap: '48px', alignItems: 'center' }}>
            <div>
              <Badge>{T.badge[lang]}</Badge>
              <H1 a={T.h1a[lang]} b={T.h1b[lang]} />
              <p style={{ margin: '20px 0 0', fontSize: 'clamp(16px,1.4vw,18px)', lineHeight: 1.55, color: '#4a3a3e', fontWeight: 600, maxWidth: '540px', textWrap: 'pretty' }}>{T.heroLead[lang]}</p>
              <p style={{ margin: '12px 0 0', fontSize: '13.5px', lineHeight: 1.55, color: '#8a7a7e', fontWeight: 600, maxWidth: '540px', textWrap: 'pretty' }}>{T.heroSmall[lang]}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', marginTop: '26px' }}>
                <Btn href="#inscricao" kind="red">{T.ctaSignup[lang]}</Btn>
                <Btn href={route('testes', other)} kind="ghost">{T.ctaLang[lang]}</Btn>
              </div>
              <div className="bz-plat" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: '10px', marginTop: '22px', maxWidth: '590px' }}>
                <PlatPill href={APP_URL} external title="Beta Web" sub={T.pillWeb[lang]} icon={
                  <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.6 2.8 3.8 5.8 3.8 9s-1.2 6.2-3.8 9c-2.6-2.8-3.8-5.8-3.8-9S9.4 5.8 12 3z" /></svg>
                } />
                <PlatPill href="#inscricao" title="iPhone" sub={T.pillIphone[lang]} icon={
                  <span style={{ display: 'flex' }}><svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="#fff"><path d="M17.05 12.04c-.03-2.6 2.12-3.85 2.22-3.91-1.21-1.77-3.09-2.01-3.76-2.04-1.6-.16-3.12.94-3.93.94-.81 0-2.06-.92-3.39-.89-1.74.03-3.35 1.01-4.25 2.57-1.81 3.14-.46 7.79 1.3 10.34.86 1.25 1.88 2.65 3.22 2.6 1.29-.05 1.78-.83 3.34-.83 1.55 0 2 .83 3.37.81 1.39-.03 2.27-1.27 3.12-2.53.98-1.45 1.39-2.85 1.41-2.92-.03-.01-2.7-1.04-2.73-4.11z" /><path d="M14.69 4.86c.71-.86 1.19-2.06 1.06-3.25-1.02.04-2.26.68-2.99 1.54-.66.76-1.23 1.98-1.08 3.15 1.14.09 2.3-.58 3.01-1.44z" /></svg></span>
                } />
                <PlatPill href="#inscricao" title="Android" sub={T.pillAndroid[lang]} icon={
                  <span style={{ display: 'flex' }}><svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="#fff"><path d="M6 9.5h12v7.5a1.5 1.5 0 0 1-1.5 1.5H15v2.5a1.25 1.25 0 0 1-2.5 0V18.5h-1v2.5a1.25 1.25 0 0 1-2.5 0V18.5H7.5A1.5 1.5 0 0 1 6 17zM3.5 10a1.25 1.25 0 0 1 2.5 0v5a1.25 1.25 0 0 1-2.5 0zM18 10a1.25 1.25 0 0 1 2.5 0v5a1.25 1.25 0 0 1-2.5 0zM6 8.6a6 6 0 0 1 12 0z" /><circle cx="9.6" cy="6.8" r=".8" fill="#1a1416" /><circle cx="14.4" cy="6.8" r=".8" fill="#1a1416" /></svg></span>
                } />
              </div>
            </div>
            {/* Decorative phone mockups */}
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '600px' }}>
              <div style={{ position: 'relative', filter: 'drop-shadow(0 50px 60px rgba(60,0,8,.35))' }}>
                <div className="bz-phones" style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {/* Phone 1 — QR scanner (dark) */}
                  <div aria-hidden="true" style={{ transform: 'rotate(-6deg) translate(34px,24px)', zIndex: 1, position: 'relative', flex: 'none', width: '228px', height: '512px', borderRadius: '40px', background: '#0d0b0c', padding: '8px', boxShadow: '0 40px 70px -30px rgba(122,16,22,.5)' }}>
                    <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: '33px', background: '#0b0b0d', padding: '12px 10px 8px', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: "-apple-system,system-ui,'Nunito',sans-serif" }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 6px', fontSize: '10px', fontWeight: 700, color: '#fff' }}>
                        <span><LiveClock kind="hm" /></span>
                        <span style={{ width: '58px', height: '17px', borderRadius: '10px', background: '#0b0b0b' }} />
                        <span style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                          <svg width="14" height="9" viewBox="0 0 14 9"><rect x="0" y="6" width="2.4" height="3" rx=".6" fill="#fff" /><rect x="3.8" y="4.2" width="2.4" height="4.8" rx=".6" fill="#fff" /><rect x="7.6" y="2.2" width="2.4" height="6.8" rx=".6" fill="#fff" /><rect x="11.4" y="0" width="2.4" height="9" rx=".6" fill="rgba(255,255,255,.45)" /></svg>
                          <svg width="12" height="9" viewBox="0 0 12 9"><path d="M6 8.6l1.9-2.1a2.7 2.7 0 0 0-3.8 0z" fill="#fff" /><path d="M2.6 5.1a4.9 4.9 0 0 1 6.8 0" fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" /><path d="M.8 3.1a7.5 7.5 0 0 1 10.4 0" fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" /></svg>
                          <svg width="20" height="9" viewBox="0 0 20 9"><rect x=".6" y=".6" width="16.4" height="7.8" rx="2.2" fill="none" stroke="#fff" strokeWidth="1.1" /><rect x="2" y="2" width="13.6" height="5" rx="1.2" fill="#fff" /><rect x="18" y="3" width="1.4" height="3" rx=".6" fill="rgba(255,255,255,.45)" /></svg>
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 6px 0' }}>
                        <span style={{ width: '26px', height: '26px', borderRadius: '9px', background: 'rgba(255,255,255,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                        </span>
                        <span style={{ width: '26px', height: '26px', borderRadius: '9px', background: 'rgba(255,255,255,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinejoin="round"><path d="M13 2L4 14h7l-1 8 9-12h-7z" /></svg>
                        </span>
                      </div>
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ position: 'relative', width: '148px', height: '148px', borderRadius: '20px', border: '2px solid #E0303A', boxShadow: '0 0 30px -4px rgba(224,48,58,.65),inset 0 0 20px -6px rgba(224,48,58,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src="/assets/qr-banzami.png" alt={T.qrAlt[lang]} style={{ width: '118px', height: 'auto', display: 'block', borderRadius: '12px' }} />
                          <span style={{ position: 'absolute', left: '10px', right: '10px', height: '2px', borderRadius: '2px', background: '#FF3B45', boxShadow: '0 0 12px 2px rgba(255,59,69,.7)', animation: 'ts-scanline 2.2s ease-in-out infinite alternate' }} />
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: '22px' }}>
                        <span style={{ padding: '9px 16px', borderRadius: '20px', background: 'rgba(255,255,255,.12)', color: '#fff', fontSize: '10px', fontWeight: 700 }}>{T.scanHint[lang]}</span>
                      </div>
                      <span style={{ position: 'absolute', bottom: '6px', left: '50%', transform: 'translateX(-50%)', width: '76px', height: '4px', borderRadius: '3px', background: 'rgba(255,255,255,.4)' }} />
                    </div>
                  </div>
                  {/* Phone 2 — confirm payment (light) */}
                  <div aria-hidden="true" style={{ zIndex: 2, position: 'relative', flex: 'none', width: '228px', height: '512px', borderRadius: '40px', background: '#0d0b0c', padding: '8px', boxShadow: '0 40px 70px -30px rgba(122,16,22,.5)' }}>
                    <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: '33px', background: '#FBF6F5', padding: '12px 10px 8px', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: "-apple-system,system-ui,'Nunito',sans-serif" }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 6px', fontSize: '10px', fontWeight: 700, color: '#141014' }}>
                        <span><LiveClock kind="hm" /></span>
                        <span style={{ width: '58px', height: '17px', borderRadius: '10px', background: '#0b0b0b' }} />
                        <span style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                          <svg width="14" height="9" viewBox="0 0 14 9"><rect x="0" y="6" width="2.4" height="3" rx=".6" fill="#141014" /><rect x="3.8" y="4.2" width="2.4" height="4.8" rx=".6" fill="#141014" /><rect x="7.6" y="2.2" width="2.4" height="6.8" rx=".6" fill="#141014" /><rect x="11.4" y="0" width="2.4" height="9" rx=".6" fill="#b3aeaf" /></svg>
                          <svg width="12" height="9" viewBox="0 0 12 9"><path d="M6 8.6l1.9-2.1a2.7 2.7 0 0 0-3.8 0z" fill="#141014" /><path d="M2.6 5.1a4.9 4.9 0 0 1 6.8 0" fill="none" stroke="#141014" strokeWidth="1.4" strokeLinecap="round" /><path d="M.8 3.1a7.5 7.5 0 0 1 10.4 0" fill="none" stroke="#141014" strokeWidth="1.4" strokeLinecap="round" /></svg>
                          <svg width="20" height="9" viewBox="0 0 20 9"><rect x=".6" y=".6" width="16.4" height="7.8" rx="2.2" fill="none" stroke="#141014" strokeWidth="1.1" /><rect x="2" y="2" width="13.6" height="5" rx="1.2" fill="#141014" /><rect x="18" y="3" width="1.4" height="3" rx=".6" fill="#b3aeaf" /></svg>
                        </span>
                      </div>
                      <div style={{ padding: '12px 8px 0' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1d1a1b" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
                        <div style={{ marginTop: '8px', fontSize: '17px', fontWeight: 800, letterSpacing: '-.02em', color: '#1d1a1b' }}>{T.confirmPay[lang]}</div>
                      </div>
                      <div style={{ marginTop: '22px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div style={{ width: '54px', height: '54px', borderRadius: '50%', background: 'linear-gradient(135deg,#C8101F 0%,#E0303A 45%,#8E1620 100%)', color: '#fff', fontSize: '24px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>M</div>
                        <div style={{ marginTop: '8px', fontSize: '12px', fontWeight: 700, color: '#1d1a1b' }}>@maria</div>
                        <div style={{ marginTop: '4px', fontSize: '8.5px', color: '#9a8487' }}>{T.requested[lang]}</div>
                        <div style={{ marginTop: '12px', padding: '9px 20px', borderRadius: '24px', background: '#B5101F', color: '#fff', fontSize: '20px', fontWeight: 800, letterSpacing: '-.02em' }}>1 500 Kz</div>
                        <div style={{ marginTop: '10px', fontSize: '10px', fontStyle: 'italic', color: '#5a4a4e' }}>{T.vaquinha[lang]}</div>
                      </div>
                      <div style={{ margin: '16px 8px 0', padding: '10px 12px', borderTop: '1px solid #F1E6E4', borderBottom: '1px solid #F1E6E4', display: 'flex', alignItems: 'center', gap: '9px' }}>
                        <span style={{ width: '24px', height: '24px', borderRadius: '6px', background: '#F4ECEB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg width="12" height="12" viewBox="0 0 24 24"><rect x="3" y="5" width="16" height="15" rx="3" fill="#C8101F" /><rect x="12" y="10" width="10" height="6" rx="2" fill="#F4ECEB" /><circle cx="15" cy="13" r="1.3" fill="#C8101F" /></svg>
                        </span>
                        <div>
                          <div style={{ fontSize: '8px', color: '#9a8487' }}>{T.payMethod[lang]}</div>
                          <div style={{ fontSize: '10px', fontWeight: 700, color: '#1d1a1b' }}>{T.balance[lang]}</div>
                        </div>
                      </div>
                      <div style={{ margin: 'auto 8px 0', padding: '10px', borderRadius: '14px', background: 'linear-gradient(95deg,#B5101F 0%,#D8242F 45%,#9A1B22 100%)', color: '#fff', fontSize: '11px', fontWeight: 800, textAlign: 'center', boxShadow: '0 10px 18px -8px rgba(181,16,31,.55)' }}>{T.payBtn[lang]}</div>
                      <div style={{ margin: '6px 0 16px', textAlign: 'center', fontSize: '8.5px', color: '#9a8487' }}>{T.irreversible[lang]}</div>
                      <span style={{ position: 'absolute', bottom: '6px', left: '50%', transform: 'translateX(-50%)', width: '76px', height: '4px', borderRadius: '3px', background: '#bdb5b6' }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ═══════════════ 01 · CANAIS ═══════════════ */}
      <section style={{ position: 'relative', padding: 'clamp(64px,8vw,116px) 24px', margin: '28px 14px', borderRadius: '48px', background: '#fff', boxShadow: '0 40px 90px -70px rgba(122,16,22,.55)', overflow: 'hidden' }}>
        <Reveal>
          <div style={{ position: 'relative', maxWidth: '1140px', margin: '0 auto' }}>
            <div className="bz-g2" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.1fr) minmax(0,.9fr)', gap: '20px 56px', alignItems: 'end' }}>
              <div>
                <SectionLabel n="01" label={T.label01[lang]} panel />
                <H2 a={T.s1h2a[lang]} b={T.s1h2b[lang]} />
              </div>
              <p style={{ margin: '0 0 6px', fontSize: '16px', lineHeight: 1.6, fontWeight: 600, color: '#6a5a5e', maxWidth: '480px', textWrap: 'pretty' }}>{T.s1lead[lang]}</p>
            </div>
            <Rotator mode="card" idle="#FFF8F7" className="bz-g3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: '14px', marginTop: '44px' }}>
              {CHANNELS.map((c, i) => (
                <div key={i} data-ri style={{ position: 'relative', overflow: 'hidden', padding: '20px 20px 22px', borderRadius: '22px', border: '1px solid rgba(181,16,31,.06)', background: '#FFF8F7', transition: 'background .6s,border-color .6s,box-shadow .6s,transform .6s cubic-bezier(.16,1,.3,1)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                    <span data-ri-ic style={{ flex: 'none', width: '42px', height: '42px', borderRadius: '13px', background: '#FFF1F0', color: '#B5101F', border: '1px solid rgba(181,16,31,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .6s,color .6s,box-shadow .6s' }}>
                      <Icon name={c.icon} size={19} color="currentColor" />
                    </span>
                    <span data-ri-tag style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '10.5px', fontWeight: 600, letterSpacing: '.06em', color: '#B5101F', opacity: 0, transition: 'opacity .6s' }}>{c.tag[lang]}</span>
                  </div>
                  <p style={{ margin: '16px 0 0', fontSize: '16px', fontWeight: 900, letterSpacing: '-.01em', color: '#141014' }}>{c.title[lang]}</p>
                  <p style={{ margin: '6px 0 0', fontSize: '13.5px', lineHeight: 1.5, fontWeight: 600, color: '#8a7a7e', textWrap: 'pretty' }}>{c.desc[lang]}</p>
                  <span data-ri-bar style={{ position: 'absolute', left: '16px', right: '16px', bottom: 0, height: '2px', borderRadius: '2px', background: 'rgba(181,16,31,.08)', overflow: 'hidden', opacity: 0, transition: 'opacity .6s' }}><span style={{ display: 'block', height: '100%', width: 0, background: 'linear-gradient(90deg,#D8121F,#9A1B22)' }} /></span>
                </div>
              ))}
            </Rotator>
          </div>
        </Reveal>
      </section>

      {/* ═══════════════ 02 · INSCRIÇÃO ═══════════════ */}
      <section id="inscricao" style={{ position: 'relative', padding: 'clamp(64px,8vw,116px) 24px', overflow: 'hidden' }}>
        <Reveal>
          <div style={{ position: 'relative', maxWidth: '1140px', margin: '0 auto' }}>
            <div className="bz-g2" style={{ display: 'grid', gridTemplateColumns: '.9fr 1.1fr', gap: '56px', alignItems: 'center' }}>
              <div style={{ position: 'relative', minWidth: 0 }}>
                <SectionLabel n="02" label={T.label02[lang]} />
                <H2 a={T.s2h2a[lang]} b={T.s2h2b[lang]} />
                <p style={{ margin: '16px 0 0', fontSize: '16px', lineHeight: 1.6, fontWeight: 600, color: '#6a5a5e', maxWidth: '440px', textWrap: 'pretty' }}>{T.s2lead[lang]}</p>
                <Rotator mode="list" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '26px', maxWidth: '440px' }}>
                  {STEPS.map((s, i) => (
                    <div key={i} data-ri style={{ position: 'relative', overflow: 'hidden', display: 'flex', gap: '14px', alignItems: 'center', padding: '13px 16px 13px 13px', borderRadius: '18px', border: '1px solid transparent', transition: 'background .6s,border-color .6s,box-shadow .6s,transform .6s cubic-bezier(.16,1,.3,1)' }}>
                      <span data-ri-ic style={{ flex: 'none', width: '42px', height: '42px', borderRadius: '13px', background: '#FFF1F0', color: '#B5101F', border: '1px solid rgba(181,16,31,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .6s,color .6s,box-shadow .6s' }}>
                        <Icon name={s.icon} size={19} color="currentColor" />
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: '14.5px', fontWeight: 900, color: '#141014' }}>{s.title[lang]}</p>
                        <p style={{ margin: '3px 0 0', fontSize: '13px', lineHeight: 1.45, fontWeight: 600, color: '#8a7a7e', textWrap: 'pretty' }}>{s.desc[lang]}</p>
                      </div>
                      <span data-ri-bar style={{ position: 'absolute', left: '16px', right: '16px', bottom: 0, height: '2px', borderRadius: '2px', background: 'rgba(181,16,31,.08)', overflow: 'hidden', opacity: 0, transition: 'opacity .6s' }}><span style={{ display: 'block', height: '100%', width: 0, background: 'linear-gradient(90deg,#D8121F,#9A1B22)' }} /></span>
                    </div>
                  ))}
                </Rotator>
              </div>

              {/* form card */}
              <div style={{ position: 'relative', minWidth: 0 }}>
                <div style={{ background: '#fff', border: '1px solid #F3E3E1', borderRadius: '28px', padding: 'clamp(22px,3vw,34px)', boxShadow: '0 40px 80px -50px rgba(122,16,22,.5)' }}>
                  {!done ? (
                    <form onSubmit={onSubmit} noValidate>
                      <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 900, letterSpacing: '-.01em', color: '#141014' }}>{T.formTitle[lang]}</h3>
                      <p style={{ margin: '6px 0 20px', fontSize: '13.5px', fontWeight: 600, color: '#8a7a7e' }}>{T.formSub[lang]}</p>
                      <FGrid cols={2}>
                        <Field name="nome" label={T.fNome[lang]} placeholder={T.fNomePh[lang]} autoComplete="name" value={nome} error={errors.nome} onChange={setNome} />
                        <Field name="email" label={T.fEmail[lang]} type="email" placeholder={T.fEmailPh[lang]} autoComplete="email" value={email} error={errors.email} onChange={setEmail} />
                        <OptBtns
                          name="app"
                          label={T.fApp[lang]}
                          value={app}
                          onChange={setApp}
                          options={[
                            { value: T.appBanzami[lang], desc: T.appBanzamiDesc[lang], icon: 'phone' },
                            { value: T.appBusiness[lang], desc: T.appBusinessDesc[lang], icon: 'store' },
                          ]}
                        />
                        {/* plataforma — bespoke select so the placeholder is language-exact */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', minWidth: 0, gridColumn: '1 / -1' }}>
                          <label htmlFor="f_plataforma" style={{ fontSize: '13px', fontWeight: 800, color: '#2a2024' }}>{T.fPlataforma[lang]}<span aria-hidden="true" style={{ color: '#B5101F' }}> *</span></label>
                          <div style={{ position: 'relative' }}>
                            <select id="f_plataforma" name="plataforma" value={plataforma} aria-required="true" onChange={(e) => setPlataforma(e.target.value)} onFocus={platFocus} onBlur={platBlur} style={{ ...inSt, appearance: 'none', WebkitAppearance: 'none', paddingRight: '40px', cursor: 'pointer' }}>
                              <option value="">{T.selectPh[lang]}</option>
                              {PLATFORMS.map((o) => <option key={o} value={o}>{o}</option>)}
                            </select>
                            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#B5101F" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', right: '15px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}><path d="M6 9l6 6 6-6" /></svg>
                          </div>
                          {errors.plataforma && (
                            <p role="alert" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', fontWeight: 700, color: '#C8101F' }}>
                              <Icon name="info" color="#C8101F" size={13} />{errors.plataforma}
                            </p>
                          )}
                        </div>
                        <Check
                          name="consent"
                          checked={consent}
                          error={errors.consent}
                          onChange={setConsent}
                          label={<>{T.consentText[lang]}<a href={route('privacidade', lang)} target="_blank" rel="noopener noreferrer">{T.consentPrivacy[lang]}</a>.</>}
                        />
                      </FGrid>
                      <div style={{ marginTop: '22px' }}>
                        <SubmitBtn>{T.submit[lang]}</SubmitBtn>
                      </div>
                    </form>
                  ) : (
                    <div role="status" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '20px 0 6px' }}>
                      <SuccessMark />
                      <h3 style={{ margin: '20px 0 0', fontSize: '24px', fontWeight: 900, letterSpacing: '-.02em', color: '#141014' }}>{T.successTitle[lang]}</h3>
                      <p style={{ margin: '8px 0 0', maxWidth: '400px', fontSize: '14.5px', lineHeight: 1.55, fontWeight: 600, color: '#6a5a5e' }}>{T.successBody[lang]}</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '12px', marginTop: '22px' }}>
                        <button type="button" onClick={reset} style={{ padding: '12px 20px', borderRadius: '40px', border: '1px solid #F3E3E1', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800, fontSize: '14.5px', color: '#141014' }}>{T.sendAnother[lang]}</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </section>
    </>
  );
}
