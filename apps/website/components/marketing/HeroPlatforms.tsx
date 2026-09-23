'use client';

import { useEffect, useState } from 'react';
import { Field, OptBtns, Check, SubmitBtn, SuccessMark } from './form-kit';
import { submitBetaRegistration, type BetaPlatform, type BetaApp } from '@/lib/beta';
import { route, type Lang, type Loc } from '@/lib/marketing/nav';

const APP_URL = 'https://app.banzami.com/';
const L = (pt: string, en: string): Loc => ({ pt, en });
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const T = {
  betaWeb: L('Beta Web', 'Beta Web'), inBrowser: L('No browser', 'In the browser'),
  channelIOS: L('TestFlight', 'TestFlight'), channelAndroid: L('Google Play', 'Google Play'),
  title: L('Inscrição de tester', 'Tester sign-up'),
  subIOS: L('iPhone · TestFlight', 'iPhone · TestFlight'),
  subAndroid: L('Android · Google Play', 'Android · Google Play'),
  name: L('Nome', 'Name'), namePh: L('O seu nome', 'Your name'),
  email: L('E-mail', 'Email'),
  appLabel: L('App que quer testar', 'App you want to test'),
  appBanzami: L('App Banzami', 'App Banzami'), appBanzamiDesc: L('Pagar e receber', 'Pay and get paid'),
  appBusiness: L('Banzami Business', 'Banzami Business'), appBusinessDesc: L('Para negócios', 'For business'),
  consent: L('Aceito receber o convite e comunicações do Programa Beta por e-mail.', 'I agree to receive the Beta Programme invite and communications by email.'),
  privacy: L('Privacidade', 'Privacy'),
  send: L('Enviar inscrição', 'Send sign-up'), sending: L('A enviar…', 'Sending…'),
  reqField: L('Campo obrigatório.', 'Required field.'),
  badEmail: L('Introduza um e-mail válido.', 'Enter a valid email.'),
  mustConsent: L('É necessário aceitar para continuar.', 'You must accept to continue.'),
  fail: L('Não foi possível enviar. Tente novamente.', 'We could not send it. Please try again.'),
  okTitle: L('Inscrição recebida', 'You are in'),
  okSub: L('Entramos em contacto por e-mail quando a sua vaga abrir.', 'We will email you when your spot opens.'),
  close: L('Fechar', 'Close'),
};

function Tile({ onClick, href, icon, title, sub }: { onClick?: () => void; href?: string; icon: React.ReactNode; title: string; sub: string }) {
  const inner = (
    <>
      <span style={{ display: 'flex' }}>{icon}</span>
      <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
        <span style={{ fontSize: '14px', fontWeight: 800, color: '#fff' }}>{title}</span>
        <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'rgba(255,255,255,.55)' }}>{sub}</span>
      </span>
    </>
  );
  const st: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '11px', padding: '12px 16px', borderRadius: '14px', background: 'linear-gradient(160deg,#241c1e,#120e0f)', border: '1px solid rgba(255,255,255,.06)', textDecoration: 'none', boxShadow: '0 16px 30px -18px rgba(20,16,20,.7)', cursor: 'pointer', fontFamily: 'inherit' };
  if (href) return <a href={href} target="_blank" rel="noopener noreferrer" className="bz-btnlift" style={st}>{inner}</a>;
  return <button type="button" onClick={onClick} className="bz-btnlift" style={{ ...st, textAlign: 'left' }}>{inner}</button>;
}

const GLOBE = <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.6 2.8 3.8 5.8 3.8 9s-1.2 6.2-3.8 9c-2.6-2.8-3.8-5.8-3.8-9S9.4 5.8 12 3z" /></svg>;
const APPLE = <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff"><path d="M17.05 12.04c-.03-2.6 2.12-3.85 2.22-3.91-1.21-1.77-3.09-2.01-3.76-2.04-1.6-.16-3.12.94-3.93.94-.81 0-2.06-.92-3.39-.89-1.74.03-3.35 1.01-4.25 2.57-1.81 3.14-.46 7.79 1.3 10.34.86 1.25 1.88 2.65 3.22 2.6 1.29-.05 1.78-.83 3.34-.83 1.55 0 2 .83 3.37.81 1.39-.03 2.27-1.27 3.12-2.53.98-1.45 1.39-2.85 1.41-2.92-.03-.01-2.7-1.04-2.73-4.11z" /><path d="M14.69 4.86c.71-.86 1.19-2.06 1.06-3.25-1.02.04-2.26.68-2.99 1.54-.66.76-1.23 1.98-1.08 3.15 1.14.09 2.3-.58 3.01-1.44z" /></svg>;
const ANDROID = <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff"><path d="M6 9.5h12v7.5a1.5 1.5 0 0 1-1.5 1.5H15v2.5a1.25 1.25 0 0 1-2.5 0V18.5h-1v2.5a1.25 1.25 0 0 1-2.5 0V18.5H7.5A1.5 1.5 0 0 1 6 17zM3.5 10a1.25 1.25 0 0 1 2.5 0v5a1.25 1.25 0 0 1-2.5 0zM18 10a1.25 1.25 0 0 1 2.5 0v5a1.25 1.25 0 0 1-2.5 0zM6 8.6a6 6 0 0 1 12 0z" /></svg>;

export function HeroPlatforms({ lang }: { lang: Lang }) {
  const [platform, setPlatform] = useState<BetaPlatform | null>(null); // null = closed
  const [f, setF] = useState({ nome: '', email: '', consent: false });
  const [appSel, setAppSel] = useState<string>(T.appBanzami[lang]); // App Banzami by default
  const [err, setErr] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState('');
  const [done, setDone] = useState(false);

  const open = (p: BetaPlatform) => { setPlatform(p); setF({ nome: '', email: '', consent: false }); setAppSel(T.appBanzami[lang]); setErr({}); setSendErr(''); setDone(false); };
  const close = () => setPlatform(null);

  useEffect(() => {
    if (!platform) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [platform]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!f.nome.trim()) next.nome = T.reqField[lang];
    if (!f.email.trim()) next.email = T.reqField[lang]; else if (!EMAIL_RE.test(f.email.trim())) next.email = T.badEmail[lang];
    if (!f.consent) next.consent = T.mustConsent[lang];
    setErr(next);
    if (Object.keys(next).length || !platform) return;
    setSending(true); setSendErr('');
    const parts = f.nome.trim().split(/\s+/);
    const app: BetaApp = appSel === T.appBusiness[lang] ? 'APP_MERCHANT' : 'APP_BANZAMI';
    const res = await submitBetaRegistration({ first_name: parts[0], last_name: parts.slice(1).join(' '), email: f.email.trim(), platform, apps: [app], source: 'home-hero' });
    setSending(false);
    if (res.ok) setDone(true); else setSendErr(T.fail[lang]);
  };

  return (
    <>
      <div className="bz-plat" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '10px', marginTop: '14px', maxWidth: '590px' }}>
        <Tile href={APP_URL} icon={GLOBE} title={T.betaWeb[lang]} sub={T.inBrowser[lang]} />
        <Tile onClick={() => open('IOS')} icon={APPLE} title="iPhone" sub={T.channelIOS[lang]} />
        <Tile onClick={() => open('ANDROID')} icon={ANDROID} title="Android" sub={T.channelAndroid[lang]} />
      </div>

      {platform && (
        <div role="dialog" aria-modal="true" aria-label={T.title[lang]} onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }} style={{ position: 'fixed', inset: 0, zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', background: 'rgba(60,20,22,.5)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}>
          <div style={{ position: 'relative', width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto', background: '#fff', borderRadius: '26px', padding: 'clamp(22px,3vw,32px)', boxShadow: '0 40px 90px -30px rgba(0,0,0,.5)', color: '#2a2024' }}>
            <button type="button" aria-label={T.close[lang]} onClick={close} style={{ position: 'absolute', top: '16px', right: '16px', width: '36px', height: '36px', borderRadius: '12px', border: '1px solid #F3E3E1', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#141014" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
            {!done ? (
              <form onSubmit={submit} noValidate>
                <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 900, letterSpacing: '-.02em', color: '#141014' }}>{T.title[lang]}</h2>
                <p style={{ margin: '6px 0 20px', fontSize: '13.5px', fontWeight: 700, color: '#B5101F' }}>{platform === 'IOS' ? T.subIOS[lang] : T.subAndroid[lang]}</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '16px 18px' }} className="bz-fgrid">
                  <Field name="nome" label={T.name[lang]} placeholder={T.namePh[lang]} autoComplete="name" value={f.nome} error={err.nome} onChange={(v) => { setF((s) => ({ ...s, nome: v })); setErr((e) => ({ ...e, nome: '' })); }} />
                  <Field name="email" label={T.email[lang]} type="email" placeholder="nome@exemplo.ao" autoComplete="email" value={f.email} error={err.email} onChange={(v) => { setF((s) => ({ ...s, email: v })); setErr((e) => ({ ...e, email: '' })); }} />
                  <OptBtns name="app" label={T.appLabel[lang]} value={appSel} onChange={setAppSel} options={[{ value: T.appBanzami[lang], desc: T.appBanzamiDesc[lang], icon: 'phone' }, { value: T.appBusiness[lang], desc: T.appBusinessDesc[lang], icon: 'store' }]} />
                  <Check name="consent" checked={f.consent} error={err.consent} onChange={(v) => { setF((s) => ({ ...s, consent: v })); setErr((e) => ({ ...e, consent: '' })); }} label={<>{T.consent[lang]} <a href={route('privacidade', lang)} style={{ color: '#B5101F', fontWeight: 800 }}>{T.privacy[lang]}</a>.</>} />
                </div>
                {sendErr && <p role="alert" style={{ margin: '16px 0 0', fontSize: '12.5px', fontWeight: 700, color: '#C8101F' }}>{sendErr}</p>}
                <div style={{ marginTop: '22px' }}><SubmitBtn>{sending ? T.sending[lang] : T.send[lang]}</SubmitBtn></div>
              </form>
            ) : (
              <div role="status" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '14px 0 6px' }}>
                <SuccessMark />
                <h2 style={{ margin: '18px 0 0', fontSize: '22px', fontWeight: 900, letterSpacing: '-.02em', color: '#141014' }}>{T.okTitle[lang]}</h2>
                <p style={{ margin: '8px 0 0', maxWidth: '380px', fontSize: '14px', lineHeight: 1.55, fontWeight: 600, color: '#6a5a5e' }}>{T.okSub[lang]}</p>
                <button type="button" onClick={close} style={{ marginTop: '22px', padding: '12px 22px', borderRadius: '40px', border: '1px solid #F3E3E1', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800, fontSize: '14.5px', color: '#141014' }}>{T.close[lang]}</button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
