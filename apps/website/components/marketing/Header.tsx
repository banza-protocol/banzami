'use client';

import { useEffect, useRef, useState } from 'react';
import { NAV, UI, ROUTES, route, navHref, isNavActive, type Lang, type RouteKey, type NavItem } from '@/lib/marketing/nav';

const APP_URL = 'https://app.banzami.com/';

function Arrow({ c = 'currentColor', s = 16 }: { c?: string; s?: number }) {
  return (
    <svg aria-hidden="true" width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
function Chev({ c = 'currentColor', s = 12 }: { c?: string; s?: number }) {
  return (
    <svg aria-hidden="true" className="bz-chev" width={s} height={s} viewBox="0 0 24 24" fill="none">
      <path d="M6 9l6 6 6-6" stroke={c} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function LogoMark({ s = 30 }: { s?: number }) {
  return (
    <span aria-hidden="true" style={{ flex: 'none', width: s, height: s, borderRadius: Math.round(s / 3), background: 'linear-gradient(150deg,#D0182A,#9A1B22)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 14px -4px rgba(181,16,31,.5)' }}>
      <svg width={Math.round(s * 0.56)} height={Math.round(s * 0.56)} viewBox="0 0 100 100" fill="none">
        <rect x="6" y="6" width="42" height="42" rx="13" fill="#fff" />
        <rect x="56" y="10" width="32" height="32" rx="10" fill="#FBD2D0" />
        <rect x="10" y="56" width="38" height="38" rx="11" fill="#FBD2D0" />
        <rect x="58" y="60" width="28" height="28" rx="9" fill="#fff" />
      </svg>
    </span>
  );
}
function QrIcon() {
  return (
    <svg aria-hidden="true" width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#B5101F" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><path d="M14 14h3v3M21 14v7h-7" />
    </svg>
  );
}
function FlagAO() {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/assets/flag-ao.png" alt="" style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />;
}
function FlagEN() {
  return (
    <svg width="22" height="15" viewBox="0 0 60 30" preserveAspectRatio="xMidYMid slice" style={{ display: 'block' }}>
      <rect width="60" height="30" fill="#012169" />
      <path d="M0 0L60 30M60 0L0 30" stroke="#fff" strokeWidth="6" />
      <path d="M0 0L60 30M60 0L0 30" stroke="#C8102E" strokeWidth="2.4" />
      <path d="M30 0v30M0 15h60" stroke="#fff" strokeWidth="10" />
      <path d="M30 0v30M0 15h60" stroke="#C8102E" strokeWidth="6" />
    </svg>
  );
}

function MegaPanel({ item, lang }: { item: NavItem; lang: Lang }) {
  const M = item.mega!;
  return (
    <div className="bz-mega">
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.2fr) minmax(0,.8fr)', gap: '20px', padding: '6px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '16px', padding: '10px 4px 4px 10px' }}>
          <div>
            <p style={{ margin: 0, fontSize: '18px', fontWeight: 900, letterSpacing: '-.02em', color: '#141014' }}>{M.title[lang]}</p>
            <p style={{ margin: '10px 0 0', fontSize: '13px', lineHeight: 1.6, fontWeight: 600, color: '#6a5a5e', textWrap: 'pretty' }}>{M.desc[lang]}</p>
          </div>
          <a href={route(M.cta.to.key, lang, M.cta.to.hash ?? '')} className="bz-mcta" style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: '10px', padding: '11px 18px', borderRadius: '30px', background: 'linear-gradient(160deg,#C8101F,#9A1B22)', color: '#fff', fontWeight: 800, fontSize: '13px', lineHeight: 1.35, textDecoration: 'none', boxShadow: '0 14px 28px -14px rgba(181,16,31,.6)' }}>
            {M.cta.label[lang]}<Arrow c="#fff" s={13} />
          </a>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '6px', paddingTop: '2px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', columnGap: '4px', rowGap: '2px', alignContent: 'start' }}>
            {M.links.map((lnk, i) => {
              const ext = !!lnk.external;
              return (
                <a key={i} href={navHref(lnk, lang)} className="bz-ml" {...(ext ? { target: '_blank', rel: 'noopener' } : {})}>
                  <span style={{ display: 'block', fontSize: '13.5px', lineHeight: 1.3, fontWeight: 800, color: '#141014' }}>{lnk.label[lang]}</span>
                  <span style={{ display: 'block', marginTop: '3px', fontSize: '11.5px', lineHeight: 1.45, fontWeight: 600, color: '#8a7a7e' }}>{lnk.desc[lang]}</span>
                </a>
              );
            })}
          </div>
          {M.status && (
            <p style={{ margin: 0, padding: '2px 12px', display: 'flex', gap: '9px', alignItems: 'flex-start', fontSize: '11.5px', lineHeight: 1.45, fontWeight: 700, color: '#9A1B22' }}>
              <span style={{ flex: 'none', width: '7px', height: '7px', marginTop: '5px', borderRadius: '50%', background: '#E0303A' }} />
              <span>{M.status[lang]}</span>
            </p>
          )}
        </div>
        <div aria-hidden="true" style={{ alignSelf: 'stretch', minHeight: '190px', borderRadius: '22px', background: 'linear-gradient(160deg,#FFEDEB,#FBD7D4)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '14px', padding: '18px 12px' }}>
          <span style={{ width: '96px', height: '96px', borderRadius: '22px', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 22px 40px -22px rgba(122,16,22,.5)' }}><QrIcon /></span>
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '11.5px', color: '#9A1B22' }}>{M.tile[lang]}</span>
        </div>
      </div>
    </div>
  );
}

export function Header({ lang, current }: { lang: Lang; current: RouteKey }) {
  const navRef = useRef<HTMLElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const other: Lang = lang === 'pt' ? 'en' : 'pt';

  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const onScroll = () => {
      const s = window.scrollY > 12;
      el.style.background = s ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0)';
      el.style.backdropFilter = s ? 'saturate(180%) blur(16px)' : 'none';
      (el.style as unknown as { webkitBackdropFilter: string }).webkitBackdropFilter = s ? 'saturate(180%) blur(16px)' : 'none';
      el.style.boxShadow = s ? '0 10px 30px -16px rgba(181,16,31,0.28)' : 'none';
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  const langHref = (target: Lang) => route(current, target);

  return (
    <>
      <header ref={navRef} style={{ position: 'fixed', top: '16px', left: '50%', transform: 'translateX(-50%)', zIndex: 60, width: 'calc(100% - 32px)', maxWidth: '1200px', borderRadius: '40px', transition: 'background .3s,box-shadow .3s,backdrop-filter .3s' }}>
        <nav aria-label="Principal" style={{ padding: '11px 14px 11px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '20px' }}>
          <a href={route('home', lang)} aria-label={UI.homeAria[lang]} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 900, fontSize: '20px', letterSpacing: '-.02em', color: '#2a2024', textDecoration: 'none' }}>
            <LogoMark s={30} />Banzami
          </a>

          <div className="bz-navlinks" style={{ display: 'flex', alignItems: 'center', gap: '2px', fontSize: '14.5px', fontWeight: 700 }}>
            {NAV.map((item) => {
              const on = isNavActive(item, current);
              return (
                <div key={item.key} className="bz-navitem">
                  <a href={route(item.to.key, lang, item.to.hash ?? '')} {...(on ? { 'aria-current': 'page' as const } : {})} style={{ color: on ? '#B5101F' : '#3a2a2e', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}>
                    {item.label[lang]}{item.mega && <Chev />}
                  </a>
                  {item.mega && <MegaPanel item={item} lang={lang} />}
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Language selector */}
            <div className="bz-langdd">
              <button type="button" className="bz-langbtn" aria-haspopup="true" aria-label={UI.langLabel[lang]} style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', height: '40px', padding: '0 6px', border: 'none', borderRadius: '30px', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: '13px', fontWeight: 900, letterSpacing: '.03em', color: '#141014', transition: 'background .2s' }}>
                <span aria-hidden="true" style={{ flex: 'none', width: '26px', height: '18px', borderRadius: '5px', overflow: 'hidden', display: 'block', boxShadow: '0 0 0 2px rgba(255,255,255,.9),0 6px 14px -6px rgba(0,0,0,.45)' }}>{lang === 'pt' ? <FlagAO /> : <FlagEN />}</span>
                <span className="bz-langcode">{lang.toUpperCase()}</span>
                <span style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 14px -6px rgba(122,16,22,.5)' }}><Chev c="#9A1B22" s={10} /></span>
              </button>
              <div className="bz-langmenu">
                <div style={{ minWidth: 0, width: 'max-content', padding: '5px', borderRadius: '16px', background: 'rgba(255,255,255,.98)', border: '1px solid rgba(181,16,31,.07)', boxShadow: '0 30px 60px -28px rgba(122,16,22,.45)' }}>
                  <a href={langHref('pt')} className="bz-lo" hrefLang="pt" lang="pt" {...(lang === 'pt' ? { 'aria-current': 'true' as const } : {})}>
                    <span aria-hidden="true" style={{ flex: 'none', width: '22px', height: '15px', borderRadius: '3px', overflow: 'hidden', display: 'block', boxShadow: '0 0 0 1px rgba(0,0,0,.06)' }}><FlagAO /></span>
                    <span style={{ flex: 1, fontSize: '13px', fontWeight: 800, color: '#141014', whiteSpace: 'nowrap' }}>{UI.langPt[lang]}</span>
                    {lang === 'pt' && <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#B5101F" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
                  </a>
                  <a href={langHref('en')} className="bz-lo" hrefLang="en" lang="en" {...(lang === 'en' ? { 'aria-current': 'true' as const } : {})}>
                    <span aria-hidden="true" style={{ flex: 'none', width: '22px', height: '15px', borderRadius: '3px', overflow: 'hidden', display: 'block', boxShadow: '0 0 0 1px rgba(0,0,0,.06)' }}><FlagEN /></span>
                    <span style={{ flex: 1, fontSize: '13px', fontWeight: 800, color: '#141014', whiteSpace: 'nowrap' }}>{UI.langEn[lang]}</span>
                    {lang === 'en' && <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#B5101F" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
                  </a>
                </div>
              </div>
            </div>

            <a href="/developers/login" className="bz-navcta" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '12px 22px', borderRadius: '30px', background: '#fff', color: '#B5101F', fontWeight: 800, fontSize: '14px', textDecoration: 'none', whiteSpace: 'nowrap', boxShadow: '0 12px 28px -12px rgba(122,16,22,.45),0 0 0 1px rgba(181,16,31,.1)' }}>
              {UI.portalDevelopers[lang]}<Arrow c="#B5101F" s={15} />
            </a>
            <button type="button" onClick={() => setMenuOpen((v) => !v)} aria-label={UI.menu[lang]} aria-expanded={menuOpen} className="bz-burger" style={{ display: 'none', width: '44px', height: '44px', border: 'none', borderRadius: '14px', background: '#FFF1F0', cursor: 'pointer', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '4px' }}>
              <span style={{ width: '18px', height: '2.5px', background: '#B5101F', borderRadius: '2px', display: 'block' }} />
              <span style={{ width: '18px', height: '2.5px', background: '#B5101F', borderRadius: '2px', display: 'block' }} />
              <span style={{ width: '18px', height: '2.5px', background: '#B5101F', borderRadius: '2px', display: 'block' }} />
            </button>
          </div>
        </nav>
      </header>

      {menuOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(255,245,245,.97)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', padding: '88px 22px 24px', display: 'flex', flexDirection: 'column', gap: '2px', overflowY: 'auto' }}>
          {NAV.map((item) => item.mega ? (
            <details key={item.key} className="bz-acc">
              <summary style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 10px', fontSize: '19px', fontWeight: 800, color: '#2a2024', borderBottom: '1px solid rgba(181,16,31,.1)', cursor: 'pointer' }}>
                {item.label[lang]}
                <svg className="bz-acc-chev" width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ transition: 'transform .25s' }}><path d="M9 6l6 6-6 6" stroke="#9A1B22" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </summary>
              <div style={{ padding: '4px 0 8px' }}>
                {item.mega.links.map((lnk, i) => (
                  <a key={i} href={navHref(lnk, lang)} onClick={() => setMenuOpen(false)} {...(lnk.external ? { target: '_blank', rel: 'noopener' } : {})} style={{ display: 'block', padding: '11px 10px 11px 22px', fontSize: '15.5px', fontWeight: 700, color: '#6a5a5e', textDecoration: 'none' }}>{lnk.label[lang]}</a>
                ))}
              </div>
            </details>
          ) : (
            <a key={item.key} href={route(item.to.key, lang, item.to.hash ?? '')} onClick={() => setMenuOpen(false)} style={{ display: 'block', padding: '16px 10px', fontSize: '19px', fontWeight: 800, color: '#2a2024', textDecoration: 'none', borderBottom: '1px solid rgba(181,16,31,.1)' }}>{item.label[lang]}</a>
          ))}
          <a href="/developers/login" onClick={() => setMenuOpen(false)} style={{ marginTop: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '15px', borderRadius: '30px', background: 'linear-gradient(160deg,#C8101F,#9A1B22)', color: '#fff', fontWeight: 800, fontSize: '15px', textDecoration: 'none' }}>{UI.portalDevelopers[lang]}<Arrow c="#fff" s={16} /></a>
          <a href={APP_URL} target="_blank" rel="noopener" onClick={() => setMenuOpen(false)} style={{ marginTop: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '15px', borderRadius: '30px', background: '#fff', border: '1px solid #F3E3E1', color: '#141014', fontWeight: 800, fontSize: '15px', textDecoration: 'none' }}>{UI.openBetaWeb[lang]}<Arrow c="#141014" s={16} /></a>
          <div style={{ marginTop: '18px', display: 'flex', justifyContent: 'center' }}>
            <div role="group" aria-label="Idioma" style={{ display: 'inline-flex', gap: '3px', padding: '4px', borderRadius: '30px', background: '#FBF6F5', border: '1px solid #EFE3E1' }}>
              <a href={langHref('pt')} {...(lang === 'pt' ? { 'aria-current': 'true' as const } : {})} hrefLang="pt" lang="pt" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 14px 6px 10px', borderRadius: '24px', textDecoration: 'none', fontSize: '13px', fontWeight: 900, letterSpacing: '.02em', background: lang === 'pt' ? '#fff' : 'transparent', color: lang === 'pt' ? '#141014' : '#7a6a6e', boxShadow: lang === 'pt' ? '0 6px 14px -8px rgba(122,16,22,.4)' : 'none' }}>
                <span aria-hidden="true" style={{ flex: 'none', width: '22px', height: '15px', borderRadius: '3px', overflow: 'hidden', display: 'block', boxShadow: '0 0 0 1px rgba(0,0,0,.06)' }}><FlagAO /></span>PT
              </a>
              <a href={langHref('en')} {...(lang === 'en' ? { 'aria-current': 'true' as const } : {})} hrefLang="en" lang="en" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 14px 6px 10px', borderRadius: '24px', textDecoration: 'none', fontSize: '13px', fontWeight: 900, letterSpacing: '.02em', background: lang === 'en' ? '#fff' : 'transparent', color: lang === 'en' ? '#141014' : '#7a6a6e', boxShadow: lang === 'en' ? '0 6px 14px -8px rgba(122,16,22,.4)' : 'none' }}>
                <span aria-hidden="true" style={{ flex: 'none', width: '22px', height: '15px', borderRadius: '3px', overflow: 'hidden', display: 'block', boxShadow: '0 0 0 1px rgba(0,0,0,.06)' }}><FlagEN /></span>EN
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
