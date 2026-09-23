import type { CSSProperties, ReactNode } from 'react';

/* Reusable atoms for the marketing site (handoff_site_completo/reference/site-kit.js).
   Values kept exact. Icons mirror the site-kit `P` registry. */

// ── icons ───────────────────────────────────────────────────────────────────
export const ICONS = {
  people: '<circle cx="9" cy="8.5" r="3"></circle><path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 6a3 3 0 0 1 0 5.6M16.5 13.5a5.5 5.5 0 0 1 4 5.3"></path>',
  code: '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5"></path>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1.5"></rect><rect x="14" y="3" width="7" height="7" rx="1.5"></rect><rect x="3" y="14" width="7" height="7" rx="1.5"></rect><path d="M14 14h3v3M21 14v7h-7"></path>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"></path>',
  cal: '<rect x="3.5" y="5" width="17" height="15" rx="3"></rect><path d="M8 3v4M16 3v4M3.5 10h17M8 14h3M8 17h6"></path>',
  plug: '<path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0zM12 18v4"></path>',
  layers: '<path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5"></path>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"></path>',
  box: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"></path><path d="M4 7.5l8 4.5 8-4.5M12 12v9"></path>',
  store: '<path d="M4 9l1.5-5h13L20 9M4 9v11h16V9M4 9h16M9 20v-6h6v6"></path>',
  shield: '<path d="M12 3l7 3v5c0 4.2-2.9 7.5-7 8.5-4.1-1-7-4.3-7-8.5V6z"></path><path d="M9.2 11.6l1.9 1.9 3.7-3.7"></path>',
  info: '<circle cx="12" cy="12" r="9"></circle><path d="M12 11.5v4.5M12 8h.01"></path>',
  help: '<circle cx="12" cy="12" r="9"></circle><path d="M9.5 9.5a2.5 2.5 0 0 1 4.8.9c0 1.6-2.3 2.1-2.3 3.6M12 17h.01"></path>',
  life: '<circle cx="12" cy="12" r="9"></circle><circle cx="12" cy="12" r="3.5"></circle><path d="M5.6 5.6l3.9 3.9M14.5 14.5l3.9 3.9M18.4 5.6l-3.9 3.9M9.5 14.5l-3.9 3.9"></path>',
  at: '<circle cx="12" cy="12" r="3.6"></circle><path d="M15.6 12v1.4a2.4 2.4 0 0 0 4.8 0V12a8.4 8.4 0 1 0-3.3 6.7"></path>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2.5"></rect><path d="M8 11V8a4 4 0 0 1 8 0v3"></path>',
  globe: '<circle cx="12" cy="12" r="9"></circle><path d="M3 12h18M12 3c2.6 2.8 3.8 5.8 3.8 9s-1.2 6.2-3.8 9c-2.6-2.8-3.8-5.8-3.8-9S9.4 5.8 12 3z"></path>',
  send: '<path d="M21 3L10 14M21 3l-7 18-4-7-7-4z"></path>',
  down: '<path d="M12 4v12M6 11l6 6 6-6M5 20h14"></path>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"></path><path d="M9 8h6M9 12h6M9 16h3"></path>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"></path>',
  split: '<circle cx="12" cy="12" r="9"></circle><path d="M12 3v18M12 12l6.4 6.4"></path>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"></path>',
  refund: '<path d="M9 14L4 9l5-5"></path><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"></path>',
  key: '<circle cx="8" cy="15" r="4"></circle><path d="M10.8 12.2L20 3M16 7l3 3M14 9l2 2"></path>',
  ledger: '<rect x="4" y="3" width="16" height="18" rx="2.5"></rect><path d="M12 3v18M7 8h2M7 12h2M15 8h2M15 12h2"></path>',
  repeat: '<path d="M17 2l4 4-4 4"></path><path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4"></path><path d="M21 13v2a3 3 0 0 1-3 3H3"></path>',
  bug: '<rect x="7" y="7" width="10" height="13" rx="5"></rect><path d="M12 7V4M9 4.5L10 7M15 4.5L14 7M4 11h3M17 11h3M4 17h3M17 17h3"></path>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="3"></rect><path d="M3.5 7l8.5 6 8.5-6"></path>',
  target: '<circle cx="12" cy="12" r="9"></circle><circle cx="12" cy="12" r="5"></circle><circle cx="12" cy="12" r="1.2"></circle>',
  user: '<circle cx="12" cy="8" r="4"></circle><path d="M4 21a8 8 0 0 1 16 0"></path>',
  phone: '<rect x="6" y="2.5" width="12" height="19" rx="3"></rect><path d="M10.5 18.5h3"></path>',
  doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"></path><path d="M14 3v5h5M9 13h6M9 17h6"></path>',
  clock: '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"></path>',
} as const;
export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 18, color = 'currentColor', width = 2 }: { name: IconName; size?: number; color?: string; width?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: ICONS[name] }} />
  );
}

// Code syntax-highlight token helpers (dossier palette) — server-safe.
export const tok = {
  k: (t: ReactNode) => <span style={{ color: '#FF7A7A' }}>{t}</span>,
  p: (t: ReactNode) => <span style={{ color: '#FF9A8A' }}>{t}</span>,
  v: (t: ReactNode) => <span style={{ color: '#FFD58A' }}>{t}</span>,
  c: (t: ReactNode) => <span style={{ color: '#8a7a7e' }}>{t}</span>,
};

export function ArrowIcon({ color = 'currentColor', size = 16 }: { color?: string; size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

// ── SANDBOX ribbon (corner) ───────────────────────────────────────────────
// Replaces the old global PlatformBanner: carries the same sr-only disclosure
// for assistive tech and crawlers (the hero copy also states it visibly).
export function Ribbon() {
  return (
    <div role="status" style={{ position: 'absolute', top: 0, left: 0, zIndex: 61, width: '150px', height: '150px', overflow: 'hidden', pointerEvents: 'none' }}>
      <span className="sr-only">Ambiente SANDBOX — dinheiro fictício. O Financial Live está indisponível.</span>
      <div aria-hidden="true" style={{ position: 'absolute', top: '12px', left: '-52px', transform: 'rotate(-45deg)', width: '150px', padding: '5px 0', textAlign: 'center', background: 'linear-gradient(90deg,#FBE6A6,#F2CD6E)', color: '#7A4A06', fontSize: '9.5px', fontWeight: 900, letterSpacing: '.16em', boxShadow: '0 8px 18px -8px rgba(122,74,6,.5)' }}>SANDBOX</div>
    </div>
  );
}

// ── Beta badge (pulsing dot) ──────────────────────────────────────────────
export function Badge({ children }: { children: ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 15px', borderRadius: '30px', background: '#fff', border: '1px solid #F3E3E1', boxShadow: '0 8px 20px -12px rgba(181,16,31,.35)', fontWeight: 800, fontSize: '12.5px', color: '#B5101F' }}>
      <span aria-hidden="true" style={{ position: 'relative', width: '8px', height: '8px', display: 'block' }}>
        <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: '#D8121F' }} />
        <span style={{ position: 'absolute', inset: '-4px', borderRadius: '50%', border: '1.5px solid #D8121F', animation: 'bzring 2s ease-out infinite' }} />
      </span>
      {children}
    </span>
  );
}

// ── section label pill: number + dash + LABEL ─────────────────────────────
export function SectionLabel({ n, label, panel }: { n: string; label: string; panel?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '12px', padding: '5px 16px 5px 5px', borderRadius: '30px', background: panel ? 'linear-gradient(180deg,#FFF6F5,#FFEDEB)' : 'linear-gradient(180deg,#fff,#FFF8F7)', border: '1px solid rgba(181,16,31,.1)', boxShadow: '0 10px 26px -18px rgba(181,16,31,.55),inset 0 1px 0 #fff' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '30px', height: '24px', padding: '0 8px', borderRadius: '20px', background: 'linear-gradient(150deg,#D0182A,#8E1620)', color: '#fff', fontFamily: "'JetBrains Mono',monospace", fontSize: '11px', fontWeight: 600, letterSpacing: '.02em', boxShadow: '0 6px 12px -6px rgba(181,16,31,.7),inset 0 1px 0 rgba(255,255,255,.25)' }}>{n}</span>
      <span aria-hidden="true" style={{ width: '14px', height: '1px', background: 'rgba(181,16,31,.35)' }} />
      <span style={{ fontSize: '11px', fontWeight: 900, letterSpacing: '.22em', color: '#B5101F' }}>{label}</span>
    </span>
  );
}

// ── headings ──────────────────────────────────────────────────────────────
export function H1({ a, b, size = 'clamp(38px,4.6vw,62px)' }: { a: ReactNode; b?: ReactNode; size?: string }) {
  return (
    <h1 style={{ margin: '22px 0 0', fontSize: size, fontWeight: 900, lineHeight: 1.02, letterSpacing: '-.035em', color: '#141014', textWrap: 'balance' }}>
      {a}{b && (<><br /><span style={{ color: '#B5101F' }}>{b}</span></>)}
    </h1>
  );
}
export function H2({ a, b, center }: { a: ReactNode; b?: ReactNode; center?: boolean }) {
  return (
    <h2 style={{ margin: '20px 0 0', fontSize: 'clamp(32px,3.5vw,44px)', lineHeight: 1.06, fontWeight: 900, letterSpacing: '-.03em', color: '#141014', textAlign: center ? 'center' : undefined, textWrap: 'balance' }}>
      {a}{b && (<><br /><span style={{ color: '#B5101F' }}>{b}</span></>)}
    </h2>
  );
}
export function Lead({ children, mw = 440, center }: { children: ReactNode; mw?: number; center?: boolean }) {
  return <p style={{ margin: center ? '16px auto 0' : '16px 0 0', fontSize: '16px', lineHeight: 1.6, fontWeight: 600, color: '#6a5a5e', maxWidth: `${mw}px`, textWrap: 'pretty', textAlign: center ? 'center' : undefined }}>{children}</p>;
}
export function HeroLead({ children, mw = 540 }: { children: ReactNode; mw?: number }) {
  return <p style={{ margin: '20px 0 0', fontSize: 'clamp(16px,1.4vw,18px)', lineHeight: 1.55, color: '#4a3a3e', fontWeight: 600, maxWidth: `${mw}px`, textWrap: 'pretty' }}>{children}</p>;
}
export function Small({ children, mw = 520 }: { children: ReactNode; mw?: number }) {
  return <p style={{ margin: '12px 0 0', fontSize: '13.5px', lineHeight: 1.55, color: '#8a7a7e', fontWeight: 600, maxWidth: `${mw}px`, textWrap: 'pretty' }}>{children}</p>;
}

// ── buttons ─────────────────────────────────────────────────────────────────
type BtnKind = 'red' | 'dark' | 'ghost' | 'text' | 'white' | 'outlineW';
export function Btn({ href, children, kind = 'red', external, arrow = true }: { href: string; children: ReactNode; kind?: BtnKind; external?: boolean; arrow?: boolean }) {
  const ext = external ? { target: '_blank', rel: 'noopener noreferrer' } : {};
  const base: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: kind === 'text' ? '9px' : '10px', textDecoration: 'none', whiteSpace: 'nowrap', fontWeight: 800, fontSize: '14.5px' };
  if (kind === 'text') return <a href={href} {...ext} className="bz-btntext" style={{ ...base, color: '#141014' }}>{children}{arrow && <ArrowIcon color="currentColor" size={16} />}</a>;
  if (kind === 'ghost') return <a href={href} {...ext} className="bz-btnlift" style={{ ...base, padding: '12px 22px', borderRadius: '40px', background: '#fff', border: '1px solid #F3E3E1', color: '#141014', boxShadow: '0 14px 30px -22px rgba(122,16,22,.4)' }}>{children}{arrow && <ArrowIcon color="#B5101F" size={15} />}</a>;
  if (kind === 'white') return <a href={href} {...ext} className="bz-btnlift" style={{ ...base, padding: '13px 22px', borderRadius: '40px', background: '#fff', color: '#9A1B22', boxShadow: '0 14px 28px -16px rgba(0,0,0,.4)' }}>{children}{arrow && <ArrowIcon color="#9A1B22" size={15} />}</a>;
  if (kind === 'outlineW') return <a href={href} {...ext} style={{ ...base, padding: '12px 22px', borderRadius: '40px', background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.4)', color: '#fff' }}>{children}{arrow && <ArrowIcon color="#fff" size={15} />}</a>;
  const bg = kind === 'dark' ? 'linear-gradient(160deg,#2a2124,#120e0f)' : 'linear-gradient(160deg,#C8101F,#9A1B22)';
  const sh = kind === 'dark' ? '0 14px 28px -14px rgba(20,16,20,.6),inset 0 1px 0 rgba(255,255,255,.12)' : '0 14px 28px -14px rgba(181,16,31,.6),inset 0 1px 0 rgba(255,255,255,.2)';
  return <a href={href} {...ext} className="bz-btnlift" style={{ ...base, padding: '13px 24px', borderRadius: '40px', background: bg, color: '#fff', boxShadow: sh }}>{children}{arrow && <ArrowIcon color="#fff" size={16} />}</a>;
}
export function Row({ children, mt = 28, gap = 14 }: { children: ReactNode; mt?: number; gap?: number }) {
  return <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: `${gap}px`, marginTop: `${mt}px` }}>{children}</div>;
}

// ── sections / panels ─────────────────────────────────────────────────────
export function Section({ id, panel, children, pad, decor, style }: { id?: string; panel?: boolean; children: ReactNode; pad?: string; decor?: ReactNode; style?: CSSProperties }) {
  return (
    <section id={id} style={{ position: 'relative', padding: pad || 'clamp(64px,8vw,116px) 24px', overflow: 'clip', ...(panel ? { margin: '28px 14px', borderRadius: '48px', background: '#fff', boxShadow: '0 40px 90px -70px rgba(122,16,22,.55)' } : {}), ...style }}>
      {decor}
      <div style={{ position: 'relative', maxWidth: '1140px', margin: '0 auto' }}>{children}</div>
    </section>
  );
}
export function Split({ left, right, cols = '.9fr 1.1fr', reverse }: { left: ReactNode; right: ReactNode; cols?: string; reverse?: boolean }) {
  return (
    <div className="bz-g2" style={{ display: 'grid', gridTemplateColumns: cols, gap: '56px', alignItems: 'center' }}>
      <div className={reverse ? 'bz-first' : undefined} style={{ position: 'relative', minWidth: 0, order: reverse ? 2 : undefined }}>{left}</div>
      <div style={{ position: 'relative', minWidth: 0 }}>{right}</div>
    </div>
  );
}

// ── cards ───────────────────────────────────────────────────────────────────
export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ position: 'relative', overflow: 'hidden', background: '#fff', border: '1px solid #F3E3E1', borderRadius: '24px', padding: '24px', boxShadow: '0 26px 56px -40px rgba(122,16,22,.45)', ...style }}>{children}</div>;
}
export function DarkCard({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ position: 'relative', overflow: 'hidden', background: 'linear-gradient(160deg,#2a2023,#140f10)', border: '1px solid rgba(255,255,255,.06)', borderRadius: '24px', padding: '24px', boxShadow: '0 30px 60px -34px rgba(20,10,12,.8)', color: '#fff', ...style }}>{children}</div>;
}
export function RedCard({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: '28px', padding: 'clamp(28px,4vw,48px)', background: 'linear-gradient(150deg,#C8101F 0%,#9A1B22 55%,#6E0E14 100%)', color: '#fff', boxShadow: '0 40px 80px -40px rgba(122,16,22,.7)', ...style }}>
      <div aria-hidden="true" style={{ position: 'absolute', bottom: '-120px', right: '-80px', width: '340px', height: '340px', borderRadius: '50%', border: '1px solid rgba(255,255,255,.12)' }} />
      <div aria-hidden="true" style={{ position: 'absolute', bottom: '-60px', right: '-20px', width: '220px', height: '220px', borderRadius: '50%', border: '1px solid rgba(255,255,255,.1)' }} />
      <div style={{ position: 'relative' }}>{children}</div>
    </div>
  );
}

// ── icon box ────────────────────────────────────────────────────────────────
export function IconBox({ name, s = 42, on }: { name: IconName; s?: number; on?: boolean }) {
  return (
    <span style={{ flex: 'none', width: s, height: s, borderRadius: Math.round(s * 0.31), background: on ? 'linear-gradient(150deg,#D8121F,#8E1620)' : '#FFF1F0', color: on ? '#fff' : '#B5101F', border: '1px solid rgba(181,16,31,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: on ? '0 10px 20px -8px rgba(181,16,31,.6)' : undefined }}>
      <Icon name={name} color="currentColor" size={Math.round(s * 0.45)} />
    </span>
  );
}

// ── chips + sandbox ─────────────────────────────────────────────────────────
export function Chip({ children, icon }: { children: ReactNode; icon?: IconName }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', background: '#FFF1F0', border: '1px solid #F7E1DF', borderRadius: '30px', padding: '6px 13px', fontSize: '12.5px', fontWeight: 800, color: '#9A1B22' }}>{icon && <Icon name={icon} color="#B5101F" size={14} />}{children}</span>;
}
export function SandboxChip({ children }: { children: ReactNode }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '20px', background: '#FCEFC4', border: '1px solid #E9C66A', fontSize: '11px', fontWeight: 900, letterSpacing: '.04em', color: '#7A4A06' }}>{children}</span>;
}
export function SandboxNotice({ title, children, cta }: { title: string; children: ReactNode; cta?: ReactNode }) {
  return (
    <div style={{ position: 'relative', overflow: 'hidden', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '20px', padding: '24px 26px', borderRadius: '24px', background: 'linear-gradient(135deg,#FFFCF3,#FFF6DD)', border: '1px solid #F1DFA6', boxShadow: '0 24px 50px -40px rgba(122,74,6,.5)' }}>
      <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', maxWidth: '640px' }}>
        <span style={{ flex: 'none', width: '42px', height: '42px', borderRadius: '13px', background: '#FCEFC4', border: '1px solid #E9C66A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="info" color="#7A4A06" size={20} /></span>
        <div>
          <p style={{ margin: 0, fontSize: '15px', fontWeight: 900, color: '#3a2a0e' }}>{title}</p>
          <p style={{ margin: '5px 0 0', fontSize: '13.5px', lineHeight: 1.55, fontWeight: 600, color: '#6a5a3e', textWrap: 'pretty' }}>{children}</p>
        </div>
      </div>
      {cta}
    </div>
  );
}
