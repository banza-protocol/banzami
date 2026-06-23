import type { ReactNode } from 'react';
import { LiveClock } from './LiveClock';

export type FrameName =
  | 'intro'
  | 'splash'
  | 'welcome'
  | 'criar'
  | 'entrar'
  | 'pin'
  | 'inicio'
  | 'enviar'
  | 'confenvio'
  | 'comprovativo'
  | 'receber'
  | 'historico'
  | 'perfil'
  | 'scan'
  | 'confpag'
  | 'partilhar';

/* ============================================================
   Shared atoms — verbatim from Banza App Demo.dc.html
   ============================================================ */

// Banzami logo tiles (4 rects) — never alter.
export function LogoTiles({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <rect x="6" y="6" width="42" height="42" rx="13" fill="#fff" />
      <rect x="56" y="10" width="32" height="32" rx="10" fill="#FBD2D0" />
      <rect x="10" y="56" width="38" height="38" rx="11" fill="#FBD2D0" />
      <rect x="58" y="60" width="28" height="28" rx="9" fill="#fff" />
    </svg>
  );
}

// Status bar (time + signal/battery). Dark or light depending on screen bg.
function StatusBar({ time, dark = false }: { time: string; dark?: boolean }) {
  const c = dark ? '#fff' : '#2a2024';
  const op = dark ? '.55' : '.4';
  return (
    <div
      className="flex shrink-0 items-center justify-between"
      style={{ padding: '17px 24px 0', fontSize: 14, fontWeight: 800, color: c }}
    >
      <span>{time}</span>
      <span className="flex items-center" style={{ gap: 6 }}>
        <svg width="17" height="12" viewBox="0 0 17 12" fill="none">
          <rect x="0" y="7.5" width="3" height="4.5" rx="1" fill={c} />
          <rect x="4.5" y="5" width="3" height="7" rx="1" fill={c} />
          <rect x="9" y="2.5" width="3" height="9.5" rx="1" fill={c} />
          <rect x="13.5" y="0" width="3" height="12" rx="1" fill={c} />
        </svg>
        <svg width="25" height="12" viewBox="0 0 26 13" fill="none">
          <rect x="1" y="1" width="21.5" height="11" rx="3.2" stroke={c} strokeWidth="1.1" opacity={op} />
          <rect x="2.6" y="2.6" width="17" height="7.8" rx="1.8" fill={c} />
        </svg>
      </span>
    </div>
  );
}

// Back chevron + centred title header used by criar/entrar/pin/confpag/confenvio.
function TitleBar({ title }: { title: string }) {
  return (
    <div
      className="flex shrink-0 items-center justify-between"
      style={{ padding: '10px 22px 0' }}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M15 5l-7 7 7 7" stroke="#2a2024" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="flex-1 text-center" style={{ fontSize: 18, fontWeight: 800, color: '#2a2024' }}>
        {title}
      </span>
      <span style={{ width: 22 }} />
    </div>
  );
}

// Pixel-art QR code (verbatim svg from the dossier). size = px.
function QrCode({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 29 29" shapeRendering="crispEdges">
      <rect width="29" height="29" fill="#fff" />
      <path fill="#2a2024" d="M0 0h7v7H0zM2 2v3h3V2zM22 0h7v7h-7zM24 2v3h3V2zM0 22h7v7H0zM2 24v3h3v-3z" />
      <rect x="9" y="1" width="1" height="1" fill="#2a2024" />
      <rect x="11" y="0" width="1" height="1" fill="#2a2024" />
      <rect x="13" y="2" width="1" height="1" fill="#2a2024" />
      <rect x="17" y="1" width="1" height="1" fill="#2a2024" />
      <rect x="1" y="9" width="1" height="1" fill="#2a2024" />
      <rect x="3" y="11" width="1" height="1" fill="#2a2024" />
      <rect x="24" y="10" width="1" height="1" fill="#2a2024" />
      <rect x="26" y="12" width="1" height="1" fill="#2a2024" />
      <rect x="13" y="25" width="1" height="1" fill="#2a2024" />
      <rect x="16" y="24" width="1" height="1" fill="#2a2024" />
      <rect x="9" y="9" width="11" height="11" fill="#fff" />
      <rect x="10" y="10" width="9" height="9" rx="1" fill="#FBD2D0" />
      <rect x="12" y="12" width="5" height="5" fill="#9A1B22" />
    </svg>
  );
}

// Bottom tab bar. active = which tab is highlighted.
type Tab = 'inicio' | 'historico' | 'receber' | 'perfil';
function BottomNav({ active }: { active: Tab }) {
  const item = (
    key: Tab,
    label: string,
    icon: (stroke: string) => ReactNode,
  ) => {
    const on = active === key;
    const stroke = on ? '#9A1B22' : '#c2a8aa';
    return (
      <div
        className="flex cursor-pointer flex-col items-center"
        style={{
          gap: 3,
          padding: on ? '6px 13px' : '6px 11px',
          borderRadius: on ? 14 : undefined,
          background: on ? '#FBE6E4' : undefined,
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          {icon(stroke)}
        </svg>
        <span style={{ fontSize: 10.5, fontWeight: on ? 800 : 700, color: stroke }}>{label}</span>
      </div>
    );
  };
  const inicioIcon = (s: string) => (
    <>
      <path d="M3 11l9-7 9 7" stroke={s} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 10v9h14v-9" stroke={s} strokeWidth="1.9" strokeLinejoin="round" />
    </>
  );
  const histIcon = (s: string) => (
    <>
      <circle cx="12" cy="12" r="8.5" stroke={s} strokeWidth="1.9" />
      <path d="M12 7.5v5l3 1.8" stroke={s} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </>
  );
  const recIcon = (s: string) => (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.6" stroke={s} strokeWidth="1.9" />
      <rect x="14" y="3" width="7" height="7" rx="1.6" stroke={s} strokeWidth="1.9" />
      <rect x="3" y="14" width="7" height="7" rx="1.6" stroke={s} strokeWidth="1.9" />
      <path d="M14 14h3v3M21 14v7h-7" stroke={s} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </>
  );
  const perfilIcon = (s: string) => (
    <>
      <circle cx="12" cy="8" r="3.6" stroke={s} strokeWidth="1.9" />
      <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" stroke={s} strokeWidth="1.9" strokeLinecap="round" />
    </>
  );
  return (
    <div
      className="flex shrink-0 items-center justify-around"
      style={{ padding: '9px 8px 12px', background: '#fff', borderTop: '1px solid #F1E2E0' }}
    >
      {item('inicio', 'Início', inicioIcon)}
      {item('historico', 'Histórico', histIcon)}
      {item('receber', 'Receber', recIcon)}
      {item('perfil', 'Perfil', perfilIcon)}
    </div>
  );
}

const SCREEN = 'absolute inset-0 flex flex-col anim-bzfade';
const gradBtn = 'linear-gradient(180deg,#A8121F,#6E0E14)';
const ctaShadow = '0 16px 30px -12px rgba(122,16,22,.5)';

/* ============================================================
   Derived user fields (mirrors renderVals() in the .dc.html)
   ============================================================ */
function deriveUser(handle?: string) {
  // Default user is João Silva (state.user = 'joao').
  if (!handle) {
    return { name: 'João Silva', short: 'João', handle: '@joao', initials: 'JS', avatar: 'J', balance: '318 151' };
  }
  const clean = handle.replace(/^@/, '').replace(/\s+/g, '').toLowerCase() || 'utilizador';
  const cap = clean.charAt(0).toUpperCase() + clean.slice(1);
  return {
    name: cap,
    short: cap,
    handle: '@' + clean,
    initials: cap.slice(0, 2).toUpperCase(),
    avatar: cap.charAt(0).toUpperCase(),
    balance: '47 900',
  };
}

/* ============================================================
   AppScreen — pure presentational renderer for one frame.
   ============================================================ */
export function AppScreen({
  frame,
  valor,
  para,
  nota,
  handle,
}: {
  frame: FrameName;
  valor?: string;
  para?: string;
  nota?: string;
  handle?: string;
}) {
  const u = deriveUser(handle);
  const uHandle = handle ? (handle.startsWith('@') ? handle : '@' + handle) : u.handle;
  const pagValor = valor || '5 000';
  const pagPara = para || '@daniel';
  const pagNota = nota || 'Ajuda financeira';

  switch (frame) {
    /* ---------- INTRO ---------- */
    case 'intro':
      return (
        <div
          className={`${SCREEN} cursor-pointer items-center justify-center text-center`}
          style={{
            padding: 34,
            background: 'radial-gradient(circle at 50% 28%,#C81824,#9A1B22 58%,#6E0E14)',
          }}
        >
          <div
            className="flex items-center justify-center"
            style={{ width: 72, height: 72, borderRadius: 21, background: 'linear-gradient(150deg,#E8434B,#9A1B22)', boxShadow: '0 16px 32px -10px rgba(0,0,0,.5)' }}
          >
            <LogoTiles size={38} />
          </div>
          <p className="bz-mono" style={{ margin: '22px 0 0', fontSize: 12, fontWeight: 600, letterSpacing: '.32em', color: 'rgba(255,255,255,.7)', textIndent: '.32em' }}>DEMO INTERATIVA</p>
          <h2 style={{ margin: '10px 0 0', fontSize: 30, fontWeight: 900, letterSpacing: '-.02em', color: '#fff', lineHeight: 1.05 }}>
            Experimente a<br />app Banzami
          </h2>
          <p style={{ margin: '14px 0 0', fontSize: 15, fontWeight: 600, lineHeight: 1.45, color: 'rgba(255,255,255,.8)' }}>Crie conta, envie dinheiro e veja o comprovativo — tudo aqui mesmo.</p>
          <div className="flex items-center justify-center" style={{ marginTop: 34, width: 66, height: 66, borderRadius: '50%', background: '#fff' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M8 5v14l11-7-11-7z" fill="#9A1B22" /></svg>
          </div>
          <p style={{ margin: '18px 0 0', fontSize: 13, fontWeight: 800, color: '#fff' }}>Toca para começar</p>
        </div>
      );

    /* ---------- SPLASH ---------- */
    case 'splash':
      return (
        <div className={`${SCREEN} cursor-pointer`} style={{ background: 'radial-gradient(circle at 50% 30%,#C81824,#9A1B22 60%,#7C1016)' }}>
          <StatusBar time="14:22" dark />
          <div className="flex flex-1 flex-col items-center justify-center" style={{ padding: 24 }}>
            <div className="flex items-center justify-center" style={{ width: 78, height: 78, borderRadius: 22, background: 'linear-gradient(150deg,#E8434B,#9A1B22)', boxShadow: '0 18px 36px -12px rgba(0,0,0,.5)' }}>
              <LogoTiles size={42} />
            </div>
            <h2 style={{ margin: '24px 0 0', fontSize: 38, fontWeight: 900, letterSpacing: '-.02em', color: '#fff', lineHeight: 1 }}>Banzami</h2>
            <p style={{ margin: '14px 0 0', fontSize: 16, fontWeight: 600, lineHeight: 1.4, textAlign: 'center', color: 'rgba(255,255,255,.82)' }}>Envie e receba dinheiro instantaneamente em Angola.</p>
            <div className="anim-spin" style={{ width: 30, height: 30, marginTop: 54, borderRadius: '50%', border: '3px solid rgba(255,255,255,.25)', borderTopColor: '#fff' }} />
          </div>
        </div>
      );

    /* ---------- WELCOME ---------- */
    case 'welcome':
      return (
        <div className={SCREEN} style={{ background: 'radial-gradient(circle at 28% 16%,#B5141F,#7C1016 72%)' }}>
          <StatusBar time="14:22" dark />
          <div className="flex flex-1 flex-col" style={{ padding: '26px 24px 22px' }}>
            <div className="flex items-center justify-center" style={{ width: 58, height: 58, borderRadius: 17, background: 'linear-gradient(150deg,#E8434B,#9A1B22)', boxShadow: '0 14px 28px -10px rgba(0,0,0,.4)' }}>
              <LogoTiles size={30} />
            </div>
            <h2 style={{ margin: '18px 0 0', fontSize: 36, fontWeight: 900, letterSpacing: '-.02em', color: '#fff', lineHeight: 1 }}>Banzami</h2>
            <p style={{ margin: '12px 0 0', fontSize: 15, fontWeight: 600, lineHeight: 1.4, color: 'rgba(255,255,255,.82)' }}>Envie e receba dinheiro instantaneamente em Angola.</p>
            <div className="flex flex-col" style={{ marginTop: 'auto', gap: 14, paddingBottom: 6 }}>
              {[
                { i: (<><rect x="3" y="3" width="7" height="7" rx="1.6" stroke="#fff" strokeWidth="1.8" /><rect x="14" y="3" width="7" height="7" rx="1.6" stroke="#fff" strokeWidth="1.8" /><rect x="3" y="14" width="7" height="7" rx="1.6" stroke="#fff" strokeWidth="1.8" /><path d="M14 14h3v3M21 14v7h-7" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></>), t: 'Pague por QR em qualquer loja' },
                { i: (<path d="M21 3L10 14M21 3l-7 18-4-7-7-4 18-7z" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round" />), t: 'Envie para qualquer @banza' },
                { i: (<><path d="M4 9l8-5 8 5M5 9v10h14V9" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round" /><path d="M3 20h18" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" /></>), t: 'Multicaixa Express integrado' },
              ].map((r, k) => (
                <div key={k} className="flex items-center" style={{ gap: 13 }}>
                  <span className="flex shrink-0 items-center justify-center" style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(255,255,255,.14)' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">{r.i}</svg>
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{r.t}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-col" style={{ gap: 10 }}>
              <div className="cursor-pointer text-center" style={{ background: '#fff', borderRadius: 30, padding: 15, color: '#9A1B22', fontWeight: 800, fontSize: 16 }}>Criar conta</div>
              <div className="cursor-pointer text-center" style={{ background: 'transparent', border: '1.5px solid rgba(255,255,255,.4)', borderRadius: 30, padding: 14, color: '#fff', fontWeight: 800, fontSize: 15 }}>Já tenho conta</div>
            </div>
          </div>
        </div>
      );

    /* ---------- CRIAR ---------- */
    case 'criar':
      return (
        <div className={SCREEN} style={{ background: '#FBF3F1' }}>
          <StatusBar time="14:22" />
          <TitleBar title="Criar conta" />
          <div className="flex flex-1 flex-col" style={{ padding: '24px 26px 26px' }}>
            <div className="flex items-center justify-center" style={{ width: 58, height: 58, borderRadius: 17, background: 'linear-gradient(150deg,#E8434B,#9A1B22)', boxShadow: '0 12px 26px -10px rgba(181,16,31,.5)' }}>
              <LogoTiles size={30} />
            </div>
            <h2 style={{ margin: '20px 0 0', fontSize: 28, fontWeight: 900, letterSpacing: '-.02em', color: '#2a2024' }}>Escolha o seu @banza</h2>
            <p style={{ margin: '11px 0 0', fontSize: 15, fontWeight: 600, lineHeight: 1.4, color: '#9a8088' }}>É o nome único que as pessoas usam para lhe enviar pagamentos.</p>
            <div style={{ marginTop: 24, background: '#F3E4E2', borderRadius: 18, padding: 17, fontSize: 16, fontWeight: 600, color: '#b09a9c' }}>joaosilva</div>
            <div style={{ marginTop: 12, background: '#F3E4E2', borderRadius: 18, padding: 17, fontSize: 16, fontWeight: 600, color: '#b09a9c' }}>Nome (opcional)</div>
            <div className="cursor-pointer text-center" style={{ marginTop: 'auto', background: gradBtn, borderRadius: 30, padding: 16, color: '#fff', fontWeight: 800, fontSize: 16, boxShadow: ctaShadow }}>Continuar</div>
          </div>
        </div>
      );

    /* ---------- ENTRAR ---------- */
    case 'entrar':
      return (
        <div className={SCREEN} style={{ background: '#FBF3F1' }}>
          <StatusBar time="14:22" />
          <TitleBar title="Entrar" />
          <div className="flex flex-1 flex-col" style={{ padding: '30px 26px 26px' }}>
            <div className="flex items-center justify-center" style={{ width: 58, height: 58, borderRadius: 17, background: 'linear-gradient(150deg,#E8434B,#9A1B22)', boxShadow: '0 12px 26px -10px rgba(181,16,31,.5)' }}>
              <LogoTiles size={30} />
            </div>
            <h2 style={{ margin: '22px 0 0', fontSize: 32, fontWeight: 900, letterSpacing: '-.02em', color: '#2a2024' }}>O seu @banza</h2>
            <p style={{ margin: '12px 0 0', fontSize: 15, fontWeight: 600, lineHeight: 1.4, color: '#9a8088' }}>Entre com a sua conta para continuar.</p>
            <div style={{ marginTop: 28, background: '#F3E4E2', borderRadius: 18, padding: 17, fontSize: 16, fontWeight: 600, color: '#b09a9c' }}>anamaria</div>
            <div className="cursor-pointer text-center" style={{ marginTop: 16, background: gradBtn, borderRadius: 30, padding: 16, color: '#fff', fontWeight: 800, fontSize: 16, boxShadow: ctaShadow }}>Continuar</div>
          </div>
        </div>
      );

    /* ---------- PIN ---------- */
    case 'pin':
      return (
        <div className={SCREEN} style={{ background: '#FBF3F1' }}>
          <StatusBar time="14:30" />
          <TitleBar title="Entrar" />
          <div className="flex flex-1 flex-col items-center" style={{ padding: '10px 24px 22px' }}>
            <p style={{ margin: '34px 0 0', fontSize: 26, fontWeight: 900, letterSpacing: '-.02em', color: '#2a2024' }}>Introduza o PIN</p>
            <p className="bz-mono" style={{ margin: '9px 0 0', fontSize: 15, fontWeight: 600, color: '#9a8088' }}>{uHandle}</p>
            <div className="flex" style={{ margin: '28px 0 0', gap: 15 }}>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <span key={i} style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #d9c4c2' }} />
              ))}
            </div>
            <div className="grid w-full" style={{ marginTop: 'auto', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, maxWidth: 252 }}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => (
                <div key={n} className="mx-auto flex cursor-pointer items-center justify-center" style={{ width: 64, height: 64, borderRadius: '50%', background: '#fff', boxShadow: '0 6px 16px -9px rgba(122,16,22,.3)', fontSize: 25, fontWeight: 700, color: '#2a2024' }}>{n}</div>
              ))}
              <span />
              <div className="mx-auto flex cursor-pointer items-center justify-center" style={{ width: 64, height: 64, borderRadius: '50%', background: '#fff', boxShadow: '0 6px 16px -9px rgba(122,16,22,.3)', fontSize: 25, fontWeight: 700, color: '#2a2024' }}>0</div>
              <div className="mx-auto flex cursor-pointer items-center justify-center" style={{ width: 64, height: 64 }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M10 5h10a1 1 0 011 1v12a1 1 0 01-1 1H10l-6-7 6-7z" stroke="#9a8088" strokeWidth="1.7" strokeLinejoin="round" /><path d="M13 9.5l4 5M17 9.5l-4 5" stroke="#9a8088" strokeWidth="1.7" strokeLinecap="round" /></svg>
              </div>
            </div>
          </div>
        </div>
      );

    /* ---------- INÍCIO ---------- */
    case 'inicio':
      return (
        <div className={SCREEN} style={{ background: '#FBF3F1' }}>
          <StatusBar time="14:30" />
          <div className="flex flex-1 flex-col overflow-hidden" style={{ padding: '14px 20px 0' }}>
            <div className="flex items-center" style={{ gap: 11 }}>
              <span className="flex items-center justify-center" style={{ width: 42, height: 42, borderRadius: '50%', background: '#6E0E14', color: '#fff', fontWeight: 900, fontSize: 14 }}>{u.initials}</span>
              <span style={{ fontSize: 18, fontWeight: 900, color: '#2a2024' }}>Olá, {u.short}</span>
              <span className="flex items-center justify-center" style={{ marginLeft: 'auto', width: 40, height: 40, borderRadius: '50%', background: '#fff', boxShadow: '0 6px 14px -8px rgba(0,0,0,.2)' }}>
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none"><path d="M6 9a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6z" stroke="#9A1B22" strokeWidth="1.8" strokeLinejoin="round" /><path d="M10 20a2 2 0 004 0" stroke="#9A1B22" strokeWidth="1.8" strokeLinecap="round" /></svg>
              </span>
            </div>
            <div className="relative shrink-0 overflow-hidden" style={{ marginTop: 14, borderRadius: 22, padding: '20px 22px', background: 'linear-gradient(150deg,#9A1B22,#6E0E14)' }}>
              <div className="absolute" style={{ top: -30, right: -20, width: 140, height: 140, borderRadius: '50%', background: 'rgba(255,255,255,.06)' }} />
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,.78)' }}>Saldo disponível</p>
              <p style={{ margin: '7px 0 0', fontSize: 32, fontWeight: 900, letterSpacing: '-.02em', color: '#fff' }}>{u.balance} <span style={{ fontSize: 18 }}>Kz</span></p>
              <p style={{ margin: '6px 0 0', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,.6)' }}>Saldo na sua carteira Banzami</p>
            </div>
            <div className="grid shrink-0" style={{ marginTop: 14, gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
              {[
                { i: (<><rect x="3" y="3" width="7" height="7" rx="1.6" stroke="#9A1B22" strokeWidth="1.8" /><rect x="14" y="3" width="7" height="7" rx="1.6" stroke="#9A1B22" strokeWidth="1.8" /><rect x="3" y="14" width="7" height="7" rx="1.6" stroke="#9A1B22" strokeWidth="1.8" /><path d="M14 14h3v3M21 14v7h-7" stroke="#9A1B22" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></>), t: 'QR Code' },
                { i: (<path d="M12 19V5M6 11l6-6 6 6" stroke="#9A1B22" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />), t: 'Enviar' },
                { i: (<path d="M12 5v14M6 13l6 6 6-6" stroke="#9A1B22" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />), t: 'Receber' },
              ].map((c, k) => (
                <div key={k} className="cursor-pointer text-center" style={{ background: '#fff', borderRadius: 18, padding: '16px 6px', boxShadow: '0 8px 20px -14px rgba(181,16,31,.3)' }}>
                  <span className="mx-auto flex items-center justify-center" style={{ width: 38, height: 38, marginBottom: 8, borderRadius: '50%', background: '#FBE6E4' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">{c.i}</svg>
                  </span>
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: '#2a2024' }}>{c.t}</span>
                </div>
              ))}
            </div>
            <div className="flex shrink-0 items-center justify-between" style={{ marginTop: 18 }}>
              <span style={{ fontSize: 17, fontWeight: 900, color: '#2a2024' }}>Atividade recente</span>
              <span className="cursor-pointer" style={{ fontSize: 13, fontWeight: 800, color: '#9A1B22' }}>Ver tudo</span>
            </div>
            <div className="shrink-0" style={{ marginTop: 10, background: '#fff', borderRadius: 18, padding: '4px 14px', boxShadow: '0 8px 22px -16px rgba(181,16,31,.3)' }}>
              <ActivityRow initial="A" name="Ana Maria" kind="Recebido" amount="+1 500 Kz" amountColor="#1f7a45" date="27/5" border />
              <ActivityRow initial="D" name="Daniel Fonseca" kind="Enviado" amount="−5 000 Kz" amountColor="#2a2024" date="27/5" />
            </div>
          </div>
          <BottomNav active="inicio" />
        </div>
      );

    /* ---------- SCAN ---------- */
    case 'scan':
      return (
        <div className={SCREEN} style={{ background: '#0b0b0d' }}>
          <StatusBar time="14:30" dark />
          <div className="flex shrink-0 items-center justify-between" style={{ padding: '12px 18px 0' }}>
            <span className="inline-flex items-center justify-center" style={{ width: 36, height: 36, borderRadius: 12, background: 'rgba(255,255,255,.12)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" /></svg>
            </span>
            <span className="inline-flex items-center justify-center" style={{ width: 36, height: 36, borderRadius: 12, background: 'rgba(255,255,255,.12)' }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M9 2h6l-1 6h3l-8 14 2.5-9.5H7L9 2z" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" /></svg>
            </span>
          </div>
          <div className="relative flex flex-1 items-center justify-center">
            <div className="relative overflow-hidden" style={{ width: '62%', aspectRatio: '1', borderRadius: 22, boxShadow: '0 0 0 999px rgba(0,0,0,.4)' }}>
              <div className="absolute inset-0" style={{ border: '2px solid #E8434B', borderRadius: 22 }} />
              <div className="anim-scanline absolute" style={{ left: 14, right: 14, height: 2, background: 'linear-gradient(90deg,transparent,#E8434B,transparent)', boxShadow: '0 0 12px 2px rgba(232,67,75,.6)', top: '9%' }} />
            </div>
          </div>
          <div className="flex shrink-0 justify-center" style={{ padding: '0 0 30px' }}>
            <span style={{ background: 'rgba(255,255,255,.12)', color: '#fff', fontSize: 14, fontWeight: 700, padding: '12px 22px', borderRadius: 30 }}>Aponte para o código QR</span>
          </div>
        </div>
      );

    /* ---------- CONFIRMAR PAGAMENTO ---------- */
    case 'confpag':
      return (
        <div className={SCREEN} style={{ background: '#FBF3F1' }}>
          <StatusBar time="17:37" />
          <TitleBar title="Confirmar pagamento" />
          <div className="flex flex-1 flex-col items-center text-center" style={{ padding: '18px 24px 22px' }}>
            <div className="flex items-center justify-center" style={{ width: 84, height: 84, borderRadius: '50%', background: 'radial-gradient(circle at 38% 30%,#B5101F,#6E0E14)', color: '#fff', fontWeight: 900, fontSize: 34, boxShadow: '0 16px 32px -12px rgba(122,16,22,.5)' }}>C</div>
            <p style={{ margin: '16px 0 0', fontSize: 21, fontWeight: 900, color: '#2a2024' }}>Cantina do Alex</p>
            <p className="bz-mono" style={{ margin: '3px 0 0', fontSize: 14, fontWeight: 600, color: '#9a8088' }}>@cantina-alex</p>
            <p style={{ margin: '10px 0 0', fontSize: 14, fontWeight: 600, color: '#9a8088' }}>Solicitou um pagamento</p>
            <div style={{ marginTop: 18, background: gradBtn, color: '#fff', fontSize: 30, fontWeight: 900, letterSpacing: '-.02em', padding: '14px 34px', borderRadius: 40, boxShadow: '0 16px 30px -14px rgba(122,16,22,.5)' }}>1 500 Kz</div>
            <p style={{ margin: '16px 0 0', fontSize: 15, fontStyle: 'italic', fontWeight: 600, color: '#7a6a6e' }}>1 Kg de Arroz</p>
            <div className="flex w-full items-center" style={{ marginTop: 20, paddingTop: 18, borderTop: '1px solid #EAD9D7', gap: 12 }}>
              <span className="flex items-center justify-center" style={{ width: 42, height: 42, borderRadius: 12, background: '#FBE6E4' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3" y="6" width="18" height="13" rx="3" stroke="#B5101F" strokeWidth="1.8" /><path d="M3 10h18" stroke="#B5101F" strokeWidth="1.8" /><circle cx="16.5" cy="14.5" r="1.5" fill="#B5101F" /></svg>
              </span>
              <div className="text-left">
                <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#9a8088' }}>Método de pagamento</p>
                <p style={{ margin: '2px 0 0', fontSize: 15, fontWeight: 800, color: '#2a2024' }}>Saldo Banza</p>
              </div>
            </div>
            <div className="cursor-pointer w-full text-center" style={{ marginTop: 'auto', background: gradBtn, borderRadius: 30, padding: 16, color: '#fff', fontWeight: 800, fontSize: 16, boxShadow: ctaShadow }}>Pagar 1 500 Kz</div>
            <p style={{ margin: '12px 0 0', fontSize: 12.5, fontWeight: 600, color: '#9a8088' }}>Pagamento irreversível</p>
          </div>
        </div>
      );

    /* ---------- PARTILHAR ---------- */
    case 'partilhar':
      return (
        <div className={SCREEN} style={{ background: '#FBF3F1' }}>
          <div className="flex shrink-0 items-center justify-between" style={{ padding: '16px 24px 0', fontSize: 10, fontWeight: 800, color: '#2a2024' }}>
            <span>17:36</span>
            <span className="flex items-center" style={{ gap: 4, color: '#B5101F' }}>
              <span style={{ width: 11, height: 11, borderRadius: 4, background: '#B5101F', display: 'inline-block' }} />Banzami
            </span>
          </div>
          <div className="flex flex-1 flex-col overflow-hidden" style={{ padding: '12px 14px 0' }}>
            <div className="text-center" style={{ borderRadius: 22, padding: '16px 16px 18px', background: 'linear-gradient(160deg,#9A1B22,#6E0E14)', boxShadow: '0 18px 36px -18px rgba(122,16,22,.5)' }}>
              <div className="mx-auto flex items-center justify-center" style={{ width: 46, height: 46, borderRadius: '50%', background: '#fff', color: '#9A1B22', fontWeight: 900, fontSize: 18 }}>C</div>
              <p style={{ margin: '8px 0 0', fontSize: 15, fontWeight: 900, color: '#fff' }}>Cantina do Alex</p>
              <p className="bz-mono" style={{ margin: '2px 0 0', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,.72)' }}>@cantina-alex</p>
              <div className="relative mx-auto flex items-center justify-center" style={{ width: 132, height: 132, marginTop: 12, background: '#fff', borderRadius: 16 }}>
                <QrCode size={108} />
                <div className="absolute flex items-center justify-center" style={{ width: 30, height: 30, borderRadius: 9, background: 'linear-gradient(150deg,#E8434B,#9A1B22)', boxShadow: '0 4px 10px -3px rgba(0,0,0,.4)' }}>
                  <LogoTiles size={18} />
                </div>
              </div>
              <p style={{ margin: '12px 0 0', fontSize: 22, fontWeight: 900, letterSpacing: '-.02em', color: '#fff' }}>1 500 <span style={{ fontSize: 13, color: 'rgba(255,255,255,.8)' }}>Kz</span></p>
              <p style={{ margin: '3px 0 0', fontSize: 12, fontStyle: 'italic', color: 'rgba(255,255,255,.8)' }}>&quot;1 Kg de Arroz&quot;</p>
              <p style={{ margin: '6px 0 0', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.6)' }}>Receber com Banzami</p>
            </div>
            <div style={{ marginTop: 10 }}>
              {[
                { i: (<><rect x="3" y="4" width="18" height="16" rx="3" stroke="#2a2024" strokeWidth="1.8" /><circle cx="8.5" cy="9.5" r="1.8" stroke="#2a2024" strokeWidth="1.8" /><path d="M5 18l5-5 4 3 3-3 2 2" stroke="#2a2024" strokeWidth="1.8" strokeLinejoin="round" /></>), t: 'Partilhar imagem', c: '#2a2024', border: true },
                { i: (<path d="M9 12h6M10 8H7a4 4 0 000 8h3M14 8h3a4 4 0 010 8h-3" stroke="#2a2024" strokeWidth="1.8" strokeLinecap="round" />), t: 'Copiar link', c: '#2a2024', border: true },
                { i: (<path d="M4 20l1.3-3.8A7.5 7.5 0 1112 19.5a7.5 7.5 0 01-3.7-1L4 20z" stroke="#1f9a5b" strokeWidth="1.8" strokeLinejoin="round" />), t: 'Partilhar WhatsApp', c: '#1f9a5b', border: false },
              ].map((r, k) => (
                <div key={k} className="flex items-center" style={{ gap: 14, padding: '11px 6px', borderBottom: r.border ? '1px solid #F4E7E5' : undefined }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">{r.i}</svg>
                  <span style={{ fontSize: 14.5, fontWeight: 700, color: r.c }}>{r.t}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="shrink-0 text-center" style={{ padding: 13, borderTop: '1px solid #F1E2E0', fontSize: 15, fontWeight: 800, color: '#9a8088' }}>Fechar</div>
        </div>
      );

    /* ---------- ENVIAR ---------- */
    case 'enviar':
      return (
        <div className={SCREEN} style={{ background: '#FBF3F1' }}>
          <StatusBar time="14:30" />
          <div className="flex flex-1 flex-col" style={{ padding: '14px 24px 26px' }}>
            <svg className="cursor-pointer" width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M15 5l-7 7 7 7" stroke="#2a2024" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <h2 style={{ margin: '14px 0 22px', fontSize: 34, fontWeight: 900, letterSpacing: '-.02em', color: '#2a2024' }}>Enviar</h2>
            <p style={{ margin: '0 0 9px', fontSize: 17, fontWeight: 800, color: '#2a2024' }}>Para quem?</p>
            <div className="flex items-center justify-between" style={{ background: '#F3E4E2', borderRadius: 18, padding: 16 }}>
              <span className="bz-mono" style={{ fontSize: 15, fontWeight: 600, color: '#2a2024' }}>@daniel</span>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="7" rx="1.6" stroke="#9A1B22" strokeWidth="1.8" /><rect x="14" y="3" width="7" height="7" rx="1.6" stroke="#9A1B22" strokeWidth="1.8" /><rect x="3" y="14" width="7" height="7" rx="1.6" stroke="#9A1B22" strokeWidth="1.8" /><path d="M14 14h3v3M21 14v7h-7" stroke="#9A1B22" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
            <p style={{ margin: '20px 0 9px', fontSize: 17, fontWeight: 800, color: '#2a2024' }}>Quanto?</p>
            <div className="flex items-center justify-between" style={{ background: '#F3E4E2', borderRadius: 18, padding: 16 }}>
              <span style={{ fontSize: 22, fontWeight: 900, color: '#2a2024' }}>5 000</span>
              <span style={{ fontSize: 16, fontWeight: 800, color: '#9a8088' }}>Kz</span>
            </div>
            <p style={{ margin: '20px 0 9px', fontSize: 16, fontWeight: 800, color: '#2a2024' }}>Descrição (opcional)</p>
            <div style={{ background: '#F3E4E2', borderRadius: 18, padding: '15px 16px', fontSize: 15, fontWeight: 700, color: '#2a2024' }}>Ajuda financeira</div>
            <div className="cursor-pointer text-center" style={{ marginTop: 'auto', background: gradBtn, borderRadius: 30, padding: 16, color: '#fff', fontWeight: 800, fontSize: 16, boxShadow: ctaShadow }}>Continuar</div>
          </div>
        </div>
      );

    /* ---------- CONFIRMAR ENVIO ---------- */
    case 'confenvio':
      return (
        <div className={SCREEN} style={{ background: '#FBF3F1' }}>
          <StatusBar time="14:30" />
          <TitleBar title="Confirmar envio" />
          <div className="flex flex-1 flex-col" style={{ padding: '16px 20px 22px' }}>
            <div className="flex items-center" style={{ background: '#fff', borderRadius: 20, padding: 16, gap: 14, boxShadow: '0 10px 26px -18px rgba(181,16,31,.3)' }}>
              <span className="flex items-center justify-center" style={{ width: 50, height: 50, borderRadius: '50%', background: '#6E0E14', color: '#fff', fontWeight: 900, fontSize: 19 }}>D</span>
              <div>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#9a8088' }}>Destinatário</p>
                <p style={{ margin: '2px 0 0', fontSize: 17, fontWeight: 900, color: '#2a2024' }}>Daniel Fonseca</p>
                <p className="bz-mono" style={{ margin: '1px 0 6px', fontSize: 13, fontWeight: 600, color: '#9a8088' }}>@daniel</p>
                <span className="inline-flex items-center" style={{ gap: 6, background: '#F3E0DE', color: '#9A1B22', fontSize: 11.5, fontWeight: 800, padding: '4px 10px', borderRadius: 30 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#9A1B22', display: 'inline-block' }} />Endereço Banzami
                </span>
              </div>
            </div>
            <div className="text-center" style={{ marginTop: 14, background: '#fff', borderRadius: 20, padding: '22px 18px', boxShadow: '0 10px 26px -18px rgba(181,16,31,.3)' }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#9a8088' }}>Vai enviar</p>
              <p style={{ margin: '8px 0 0', fontSize: 38, fontWeight: 900, letterSpacing: '-.03em', color: '#2a2024' }}>5 000 <span style={{ fontSize: 20, color: '#9a8a8e' }}>Kz</span></p>
              <div style={{ height: 1, background: '#EEDFDD', margin: '16px 4px' }} />
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#7a6a6e' }}>Ajuda financeira</p>
            </div>
            <div className="flex items-start" style={{ marginTop: 14, background: '#FBE9E7', border: '1px solid #F3D2CF', borderRadius: 16, padding: '13px 15px', gap: 10 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flex: 'none', marginTop: 1 }}><circle cx="12" cy="12" r="9" stroke="#9A1B22" strokeWidth="1.8" /><path d="M12 8h.01M11 12h1v4h1" stroke="#9A1B22" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <span style={{ fontSize: 12.5, fontWeight: 700, lineHeight: 1.45, color: '#8a2a2e' }}>Confirme os detalhes antes de enviar. Esta acção é irreversível.</span>
            </div>
            <div className="cursor-pointer text-center" style={{ marginTop: 'auto', background: gradBtn, borderRadius: 30, padding: 16, color: '#fff', fontWeight: 800, fontSize: 16, boxShadow: ctaShadow }}>Confirmar envio</div>
            <p className="cursor-pointer text-center" style={{ margin: '14px 0 0', fontSize: 15, fontWeight: 800, color: '#9a8088' }}>Cancelar</p>
          </div>
        </div>
      );

    /* ---------- COMPROVATIVO ---------- */
    case 'comprovativo':
      return (
        <div className={SCREEN} style={{ background: 'radial-gradient(circle at 50% 22%,#CA1A26,#A4131F 50%,#7C1016)' }}>
          <StatusBar time="14:30" dark />
          <div className="flex shrink-0 items-center justify-between" style={{ padding: '8px 18px 0' }}>
            <span className="inline-flex items-center justify-center" style={{ width: 34, height: 34, borderRadius: 11, background: 'rgba(255,255,255,.14)' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" /></svg>
            </span>
            <span style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>Comprovativo</span>
            <span style={{ width: 34 }} />
          </div>
          <div className="flex flex-1 flex-col items-center text-center" style={{ padding: '6px 18px 14px' }}>
            <p className="bz-mono" style={{ margin: '6px 0 0', fontSize: 10.5, fontWeight: 600, letterSpacing: '.5em', color: 'rgba(255,255,255,.9)', textIndent: '.5em' }}>BANZA</p>
            <div className="relative flex items-center justify-center" style={{ width: 84, height: 84, margin: '6px 0 0' }}>
              <div className="anim-bzpulsering absolute" style={{ width: 64, height: 64, borderRadius: '50%', border: '2px solid rgba(255,255,255,.4)' }} />
              <div className="anim-bzpulsering-delayed absolute" style={{ width: 64, height: 64, borderRadius: '50%', border: '2px solid rgba(255,255,255,.4)' }} />
              <div className="anim-spin-slow absolute" style={{ width: 84, height: 84, borderRadius: '50%', border: '2px dashed rgba(255,255,255,.55)' }} />
              <div className="flex items-center justify-center" style={{ width: 56, height: 56, borderRadius: '50%', background: 'radial-gradient(circle at 38% 30%,#E8434B,#9A1B22 68%,#6E0E14)', boxShadow: 'inset 0 2px 7px rgba(255,255,255,.4),0 12px 24px -10px rgba(0,0,0,.5)' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
            </div>
            <p style={{ margin: '10px 0 0', fontSize: 15, fontWeight: 800, color: 'rgba(255,255,255,.95)' }}>Enviado com sucesso</p>
            <p style={{ margin: '2px 0 0', fontSize: 30, fontWeight: 900, letterSpacing: '-.03em', color: '#fff', lineHeight: 1.05 }}>{pagValor} <span style={{ fontSize: 15, fontWeight: 800, color: 'rgba(255,255,255,.8)' }}>Kz</span></p>
            <p className="bz-mono" style={{ margin: '2px 0 0', fontSize: 11.5, fontWeight: 600, color: 'rgba(255,255,255,.72)' }}>para {pagPara}</p>
            <div className="w-full text-left" style={{ margin: '10px 0 0', borderRadius: 16, background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.18)', padding: '0 14px' }}>
              <ReceiptRow label="De" value={uHandle} mono border />
              <ReceiptRow label="Para" value={pagPara} mono border />
              <ReceiptRow label="Nota" value={pagNota} border />
              <ReceiptRow label="Ref" value="0FC11CCE" mono border />
              <ReceiptRow label="Método" value="Saldo Banzami" />
            </div>
            <div className="cursor-pointer flex w-full items-center justify-center" style={{ margin: '11px 0 0', gap: 8, background: '#fff', color: '#9A1B22', borderRadius: 24, padding: 12, fontWeight: 800, fontSize: 14 }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#9A1B22" strokeWidth="1.9" /><path d="M8 12l2.6 2.6L16 9" stroke="#9A1B22" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>Concluído
            </div>
            <p className="bz-mono flex items-center justify-center" style={{ margin: '9px 0 0', gap: 6, fontSize: 9.5, color: 'rgba(255,255,255,.78)' }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M12 3l7 3v5c0 4.2-2.9 7.5-7 8.5-4.1-1-7-4.3-7-8.5V6l7-3z" stroke="rgba(255,255,255,.8)" strokeWidth="1.8" strokeLinejoin="round" /></svg>
              Comprovativo Banzami • <LiveClock />
            </p>
          </div>
        </div>
      );

    /* ---------- RECEBER ---------- */
    case 'receber':
      return (
        <div className={SCREEN} style={{ background: '#FBF3F1' }}>
          <StatusBar time="14:30" />
          <div className="flex flex-1 flex-col overflow-hidden" style={{ padding: '12px 20px 0' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 26, fontWeight: 900, letterSpacing: '-.02em', color: '#2a2024' }}>Receber</h2>
              <p style={{ margin: '3px 0 0', fontSize: 13, fontWeight: 600, color: '#9a8088' }}>QR Code e ligação de pagamento</p>
            </div>
            <div className="shrink-0 text-center" style={{ marginTop: 12, background: '#fff', borderRadius: 22, padding: 18, boxShadow: '0 12px 30px -20px rgba(181,16,31,.3)' }}>
              <div className="relative mx-auto flex items-center justify-center" style={{ width: 148, height: 148 }}>
                <QrCode size={148} />
                <div className="absolute flex items-center justify-center" style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(150deg,#E8434B,#9A1B22)', boxShadow: '0 4px 10px -3px rgba(0,0,0,.4)' }}>
                  <LogoTiles size={20} />
                </div>
              </div>
              <div className="inline-flex items-center" style={{ marginTop: 14, gap: 8, background: '#F3E4E2', padding: '8px 14px', borderRadius: 30 }}>
                <span className="bz-mono" style={{ fontSize: 15, fontWeight: 600, color: '#2a2024' }}>{uHandle}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="11" height="11" rx="2.5" stroke="#9a8a8e" strokeWidth="1.8" /><path d="M5 15V5a2 2 0 012-2h8" stroke="#9a8a8e" strokeWidth="1.8" strokeLinecap="round" /></svg>
              </div>
              <p style={{ margin: '10px 0 0', fontSize: 12, fontWeight: 700, color: '#9a8a8e' }}>Mostre este código para receber pagamentos</p>
            </div>
            <div className="flex flex-col" style={{ marginTop: 12, gap: 9 }}>
              <div className="flex items-center justify-center" style={{ background: gradBtn, borderRadius: 26, padding: 14, color: '#fff', fontWeight: 800, fontSize: 15, gap: 9, boxShadow: '0 14px 26px -12px rgba(122,16,22,.5)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 12h6M10 8H7a4 4 0 000 8h3M14 8h3a4 4 0 010 8h-3" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" /></svg>Partilhar link
              </div>
              <div className="flex" style={{ gap: 9 }}>
                <div className="flex-1 text-center" style={{ border: '1.5px solid rgba(122,16,22,.3)', borderRadius: 26, padding: 13, color: '#9A1B22', fontWeight: 800, fontSize: 14 }}>Partilhar QR</div>
                <div className="flex-1 text-center" style={{ border: '1.5px solid rgba(122,16,22,.3)', borderRadius: 26, padding: 13, color: '#9A1B22', fontWeight: 800, fontSize: 14 }}>Definir montante</div>
              </div>
            </div>
          </div>
          <BottomNav active="receber" />
        </div>
      );

    /* ---------- HISTÓRICO ---------- */
    case 'historico':
      return (
        <div className={SCREEN} style={{ background: '#FBF3F1' }}>
          <StatusBar time="14:30" />
          <div className="flex flex-1 flex-col overflow-hidden" style={{ padding: '12px 20px 0' }}>
            <div className="flex items-start justify-between">
              <div>
                <h2 style={{ margin: 0, fontSize: 26, fontWeight: 900, letterSpacing: '-.02em', color: '#2a2024' }}>Histórico</h2>
                <p style={{ margin: '3px 0 0', fontSize: 13, fontWeight: 600, color: '#9a8088' }}>As suas movimentações</p>
              </div>
              <span style={{ fontSize: 13, fontWeight: 900, color: '#9A1B22', background: '#F3E0DE', padding: '5px 12px', borderRadius: 30 }}>50</span>
            </div>
            <div className="flex" style={{ marginTop: 14, gap: 9 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#fff', background: '#7C1016', padding: '9px 18px', borderRadius: 30 }}>Todas</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#9a8088', background: '#fff', padding: '9px 16px', borderRadius: 30 }}>Recebidas</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#9a8088', background: '#fff', padding: '9px 16px', borderRadius: 30 }}>Enviadas</span>
            </div>
            <p style={{ margin: '16px 0 8px', fontSize: 12.5, fontWeight: 700, color: '#9a8a8e' }}>27 mai. 2026</p>
            <div style={{ background: '#fff', borderRadius: 18, padding: '2px 14px', boxShadow: '0 10px 26px -18px rgba(181,16,31,.3)' }}>
              <ActivityRow initial="D" name="Daniel Fonseca" kind="Enviado" amount="−5 000 Kz" amountColor="#2a2024" date="27/5" border small />
              <ActivityRow initial="A" name="Ana Maria" kind="Recebido" amount="+1 500 Kz" amountColor="#1f7a45" date="27/5" border small />
              <ActivityRow initial="B" name="Bento Manuel" kind="Recebido" amount="+350 Kz" amountColor="#1f7a45" date="27/5" border small />
              <ActivityRow initial="A" name="Ana Maria" kind="Enviado" amount="−1 500 Kz" amountColor="#2a2024" date="27/5" small />
            </div>
          </div>
          <BottomNav active="historico" />
        </div>
      );

    /* ---------- PERFIL ---------- */
    case 'perfil':
      return (
        <div className={SCREEN} style={{ background: '#FBF3F1' }}>
          <StatusBar time="14:30" />
          <div className="flex flex-1 flex-col overflow-y-auto" style={{ padding: '12px 20px 0' }}>
            <h2 style={{ margin: 0, fontSize: 30, fontWeight: 900, letterSpacing: '-.02em', color: '#2a2024' }}>Perfil</h2>
            <p style={{ margin: '3px 0 0', fontSize: 13, fontWeight: 600, color: '#9a8088' }}>O seu perfil e definições</p>
            <div className="flex items-center" style={{ marginTop: 14, borderRadius: 20, padding: '16px 18px', background: 'linear-gradient(150deg,#9A1B22,#6E0E14)', gap: 14 }}>
              <span className="flex items-center justify-center" style={{ width: 52, height: 52, borderRadius: '50%', background: '#6E0E14', border: '2px solid #E8C76A', color: '#fff', fontWeight: 900, fontSize: 20 }}>{u.avatar}</span>
              <div>
                <p style={{ margin: 0, fontSize: 17, fontWeight: 900, color: '#fff' }}>{u.name}</p>
                <p className="bz-mono" style={{ margin: '2px 0 0', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,.72)' }}>{uHandle}</p>
              </div>
            </div>
            <div style={{ marginTop: 12, background: '#fff', borderRadius: 20, padding: 16, boxShadow: '0 10px 26px -18px rgba(181,16,31,.3)' }}>
              <div className="flex items-center" style={{ gap: 11 }}>
                <span className="bz-mono flex items-center justify-center" style={{ width: 40, height: 40, borderRadius: 12, background: '#FBE6E4', color: '#9A1B22', fontWeight: 900, fontSize: 19 }}>@</span>
                <span style={{ fontSize: 16, fontWeight: 900, color: '#2a2024' }}>Endereço de pagamento</span>
              </div>
              <div className="flex items-center justify-between" style={{ marginTop: 12, background: '#F3E4E2', borderRadius: 14, padding: '13px 14px' }}>
                <span className="bz-mono" style={{ fontSize: 16, fontWeight: 600, color: '#2a2024' }}>{uHandle}</span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="11" height="11" rx="2.5" stroke="#9a8a8e" strokeWidth="1.8" /><path d="M5 15V5a2 2 0 012-2h8" stroke="#9a8a8e" strokeWidth="1.8" strokeLinecap="round" /></svg>
              </div>
            </div>
            <div style={{ marginTop: 14, background: '#fff', borderRadius: 20, padding: '2px 16px', boxShadow: '0 10px 26px -18px rgba(181,16,31,.3)' }}>
              <SettingRow
                icon={<><rect x="5" y="10" width="14" height="10" rx="2.5" stroke="#2a2024" strokeWidth="1.8" /><path d="M8 10V8a4 4 0 018 0v2" stroke="#2a2024" strokeWidth="1.8" /></>}
                title="PIN & Segurança" sub="Gerir PIN e biometria" border
              />
              <SettingRow
                icon={<><path d="M6 9a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6z" stroke="#2a2024" strokeWidth="1.8" strokeLinejoin="round" /><path d="M10 20a2 2 0 004 0" stroke="#2a2024" strokeWidth="1.8" strokeLinecap="round" /></>}
                title="Notificações" sub="Gerir alertas e notificações"
              />
            </div>
            <p style={{ margin: '18px 0 8px', fontSize: 12, fontWeight: 800, letterSpacing: '.05em', color: '#9a8a8e' }}>CONTA</p>
            <div style={{ background: '#fff', borderRadius: 20, padding: '2px 16px', boxShadow: '0 10px 26px -18px rgba(181,16,31,.3)' }}>
              <div className="cursor-pointer flex items-center" style={{ gap: 13, padding: '14px 0', borderBottom: '1px solid #F4E7E5' }}>
                <span className="flex items-center justify-center" style={{ width: 38, height: 38, borderRadius: 12, background: '#FBE6E4' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M15 12H4M8 8l-4 4 4 4" stroke="#9A1B22" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /><path d="M14 4h5a1 1 0 011 1v14a1 1 0 01-1 1h-5" stroke="#9A1B22" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </span>
                <p className="flex-1" style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: '#9A1B22' }}>Terminar sessão</p>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="#e0a8a8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
              <div className="cursor-pointer flex items-center" style={{ gap: 13, padding: '14px 0' }}>
                <span className="flex items-center justify-center" style={{ width: 38, height: 38, borderRadius: 12, background: '#FBE6E4' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 7h14M10 7V5h4v2M9 7v12M15 7v12M6 7l1 13h10l1-13" stroke="#9A1B22" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </span>
                <div className="flex-1">
                  <p style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: '#9A1B22' }}>Remover conta</p>
                  <p style={{ margin: '1px 0 0', fontSize: 11.5, fontWeight: 700, color: '#c98a8a' }}>Apaga todos os dados guardados</p>
                </div>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="#e0a8a8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
            </div>
            <p className="text-center" style={{ margin: '16px 0 8px', fontSize: 12.5, fontWeight: 700, color: '#b8a4a6' }}>Banzami v1.0</p>
          </div>
          <BottomNav active="perfil" />
        </div>
      );

    default:
      return null;
  }
}

/* ---------- small row helpers ---------- */
function ActivityRow({
  initial, name, kind, amount, amountColor, date, border, small,
}: {
  initial: string; name: string; kind: string; amount: string; amountColor: string; date: string; border?: boolean; small?: boolean;
}) {
  return (
    <div className="flex items-center" style={{ gap: 11, padding: small ? '10px 0' : '11px 0', borderBottom: border ? '1px solid #F4E7E5' : undefined }}>
      <span className="flex items-center justify-center" style={{ width: 36, height: 36, borderRadius: '50%', background: '#6E0E14', color: '#fff', fontWeight: 900, fontSize: 13 }}>{initial}</span>
      <div className="flex-1">
        <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#2a2024' }}>{name}</p>
        <p style={{ margin: '1px 0 0', fontSize: 11.5, fontWeight: 700, color: '#9a8a8e' }}>{kind}</p>
      </div>
      <div className="text-right">
        <p style={{ margin: 0, fontSize: small ? 13.5 : 14, fontWeight: 900, color: amountColor }}>{amount}</p>
        <p style={{ margin: '1px 0 0', fontSize: 11, fontWeight: 700, color: '#9a8a8e' }}>{date}</p>
      </div>
    </div>
  );
}

function ReceiptRow({ label, value, mono, border }: { label: string; value: string; mono?: boolean; border?: boolean }) {
  return (
    <div className="flex items-center justify-between" style={{ padding: '5px 0', borderBottom: border ? '1px solid rgba(255,255,255,.12)' : undefined }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.6)' }}>{label}</span>
      <span className={mono ? 'bz-mono' : undefined} style={{ fontSize: 12, fontWeight: mono ? 600 : 800, color: '#fff', whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  );
}

function SettingRow({ icon, title, sub, border }: { icon: ReactNode; title: string; sub: string; border?: boolean }) {
  return (
    <div className="flex items-center" style={{ gap: 13, padding: '13px 0', borderBottom: border ? '1px solid #F4E7E5' : undefined }}>
      <span className="flex items-center justify-center" style={{ width: 38, height: 38, borderRadius: 12, background: '#F0ECEC' }}>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none">{icon}</svg>
      </span>
      <div className="flex-1">
        <p style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: '#2a2024' }}>{title}</p>
        <p style={{ margin: '1px 0 0', fontSize: 11.5, fontWeight: 700, color: '#9a8a8e' }}>{sub}</p>
      </div>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="#c2a8aa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </div>
  );
}
