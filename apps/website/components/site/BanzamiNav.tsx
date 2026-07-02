'use client';

import Link from 'next/link';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { navMenus } from '@/lib/nav-menus';
import { mailto, DEVELOPERS_LOGIN_URL } from '@/lib/site';

// Banzami main navigation — header + desktop mega menu + mobile accordion.
// Faithful port of HANDOFF_Banzami_Nav.md. The desktop mega menu is CSS-only
// (.bz-navitem:hover/:focus-within .bz-mega — see globals.css), so it opens with
// both mouse and keyboard. Only the mobile overlay uses state (menuOpen).

const RED = '#B5101F';

/** Internal routes use next/link; mailto/external/anchors use a plain anchor. */
function NavA({
  href,
  onClick,
  className,
  style,
  children,
  ...rest
}: {
  href: string;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  'aria-haspopup'?: boolean;
}) {
  if (href.startsWith('/') && !href.startsWith('//')) {
    return (
      <Link href={href} onClick={onClick} className={className} style={style} {...rest}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} onClick={onClick} className={className} style={style} {...rest}>
      {children}
    </a>
  );
}

const Chevron = () => (
  <svg className="bz-chev" width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ transition: 'transform .25s', opacity: 0.7 }}>
    <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function BanzamiNav() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const closeMenu = () => setMenuOpen(false);

  return (
    <>
    <header
      className="bz-nav"
      style={{
        position: 'fixed',
        top: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 60,
        width: 'calc(100% - 32px)',
        maxWidth: 1180,
        borderRadius: 42,
        transition: 'background .3s,box-shadow .3s,backdrop-filter .3s',
        background: scrolled ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0)',
        backdropFilter: scrolled ? 'saturate(180%) blur(16px)' : 'none',
        WebkitBackdropFilter: scrolled ? 'saturate(180%) blur(16px)' : 'none',
        boxShadow: scrolled ? '0 10px 30px -16px rgba(181,16,31,0.28)' : 'none',
      }}
    >
      <nav
        style={{
          padding: '11px 14px 11px 22px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 18,
        }}
      >
        {/* Logo */}
        <Link
          href="/"
          onClick={closeMenu}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontWeight: 900,
            fontSize: 20,
            letterSpacing: '-.02em',
            color: '#2a2024',
            textDecoration: 'none',
          }}
        >
          <span
            style={{
              width: 30,
              height: 30,
              borderRadius: 10,
              background: RED,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 6px 14px -4px rgba(181,16,31,.5)',
            }}
          >
            <svg width="17" height="17" viewBox="0 0 100 100" fill="none">
              <rect x="6" y="6" width="42" height="42" rx="13" fill="#fff" />
              <rect x="56" y="10" width="32" height="32" rx="10" fill="#FBD2D0" />
              <rect x="10" y="56" width="38" height="38" rx="11" fill="#FBD2D0" />
              <rect x="58" y="60" width="28" height="28" rx="9" fill="#fff" />
            </svg>
          </span>
          Banzami
        </Link>

        {/* Desktop links + mega menus */}
        <div className="bz-navlinks" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 15, fontWeight: 700 }}>
          {navMenus.map((m) => (
            <div key={m.label} className={`bz-navitem${m.end ? ' bz-end' : ''}`}>
              <NavA
                className="bz-toplink"
                href={m.href}
                aria-haspopup={m.hasMega || undefined}
                onClick={closeMenu}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '9px 13px',
                  borderRadius: 12,
                  color: '#3a2a2e',
                  textDecoration: 'none',
                  transition: 'color .15s,background .15s',
                }}
              >
                {m.label}
                {m.hasMega && <Chevron />}
              </NavA>

              {m.hasMega && (
                <div className="bz-mega" style={{ width: 760 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr 188px', gap: 22 }}>
                    {/* Column 1: title + subtitle + CTA */}
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <p style={{ margin: 0, fontSize: 18, fontWeight: 900, letterSpacing: '-.01em', color: '#2a2024' }}>{m.label}</p>
                      <p style={{ margin: '9px 0 0', fontSize: 13, lineHeight: 1.5, color: '#7a6a6e', fontWeight: 600 }}>{m.subtitle}</p>
                      <NavA
                        className="bz-megacta"
                        href={m.ctaHref || m.href}
                        onClick={closeMenu}
                        style={{
                          marginTop: 'auto',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 7,
                          alignSelf: 'flex-start',
                          padding: '10px 16px',
                          borderRadius: 30,
                          background: RED,
                          color: '#fff',
                          fontSize: 13,
                          fontWeight: 800,
                          textDecoration: 'none',
                          boxShadow: '0 8px 18px -8px rgba(181,16,31,.55)',
                          transition: 'transform .2s',
                        }}
                      >
                        {m.cta}
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                          <path d="M5 12h14M13 6l6 6-6 6" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </NavA>
                    </div>

                    {/* Column 2: links grid + optional note */}
                    <div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                        {m.links?.map((link) => (
                          <NavA key={link.label} className="bz-megalink" href={link.href} onClick={closeMenu}>
                            <span style={{ display: 'block', fontSize: 13.5, fontWeight: 800, color: '#2a2024' }}>{link.label}</span>
                            <span style={{ display: 'block', fontSize: 11.5, lineHeight: 1.4, color: '#9a8a8e', fontWeight: 600, marginTop: 1 }}>
                              {link.desc}
                            </span>
                          </NavA>
                        ))}
                      </div>
                      {m.note && (
                        <p style={{ margin: '12px 4px 0', display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 700, color: '#9A1B22' }}>
                          <span style={{ flex: 'none', width: 7, height: 7, borderRadius: '50%', background: '#E8434B' }} />
                          {m.note}
                        </p>
                      )}
                    </div>

                    {/* Column 3: visual panel */}
                    <div
                      style={{
                        borderRadius: 18,
                        background: 'linear-gradient(155deg,#FFF1F0,#FBD2D0)',
                        padding: 18,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                      }}
                    >
                      <div
                        style={{
                          width: 96,
                          height: 96,
                          borderRadius: 18,
                          background: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 14px 30px -16px rgba(181,16,31,.45)',
                        }}
                      >
                        <svg width="46" height="46" viewBox="0 0 24 24" fill="none">
                          <rect x="3" y="3" width="7" height="7" rx="1.6" stroke={RED} strokeWidth="1.8" />
                          <rect x="14" y="3" width="7" height="7" rx="1.6" stroke={RED} strokeWidth="1.8" />
                          <rect x="3" y="14" width="7" height="7" rx="1.6" stroke={RED} strokeWidth="1.8" />
                          <path d="M14 14h3v3M21 14v7h-7" stroke={RED} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                      <p style={{ margin: '14px 0 0', fontFamily: "'JetBrains Mono',monospace", fontSize: 11, fontWeight: 600, color: '#9A1B22' }}>
                        {m.visualCaption}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Desktop CTA — entry point to the Developers portal (dossier §Ponto de
            entrada): pill unchanged apart from a soft ring + white arrow. */}
        <div className="bz-ctas-desktop" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <NavA
            className="bz-start"
            href={DEVELOPERS_LOGIN_URL}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              padding: '11px 22px',
              borderRadius: 30,
              background: RED,
              color: '#fff',
              fontWeight: 800,
              fontSize: 14,
              textDecoration: 'none',
              boxShadow: '0 8px 18px -6px rgba(181,16,31,.5), 0 0 0 4px rgba(181,16,31,.12)',
              transition: 'transform .2s',
            }}
          >
            Começar
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <path d="M5 12h14M13 6l6 6-6 6" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </NavA>
        </div>

        {/* Burger */}
        <button
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Menu"
          aria-expanded={menuOpen}
          className="bz-burger"
          style={{
            display: 'none',
            width: 44,
            height: 44,
            border: 'none',
            borderRadius: 14,
            background: '#FFF1F0',
            cursor: 'pointer',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <span style={{ width: 18, height: 2.5, background: RED, borderRadius: 2, display: 'block' }} />
          <span style={{ width: 18, height: 2.5, background: RED, borderRadius: 2, display: 'block' }} />
          <span style={{ width: 18, height: 2.5, background: RED, borderRadius: 2, display: 'block' }} />
        </button>
      </nav>
    </header>

    {/* Mobile overlay — sibling of <header> so the header's transform does not
        trap this fixed-position full-screen layer inside the pill. */}
      {menuOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 55,
            background: 'rgba(255,245,245,.98)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            padding: '84px 20px 28px',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
          }}
        >
          {navMenus.map((m) =>
            m.hasMega ? (
              <details key={m.label} style={{ borderBottom: '1px solid rgba(181,16,31,.1)' }}>
                <summary
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '16px 8px',
                    fontSize: 19,
                    fontWeight: 800,
                    color: '#2a2024',
                  }}
                >
                  {m.label}
                  <svg className="bz-acc-chev" width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ transition: 'transform .25s' }}>
                    <path d="M9 6l6 6-6 6" stroke="#9A1B22" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </summary>
                <div style={{ padding: '2px 0 12px' }}>
                  {m.links?.map((link) => (
                    <NavA
                      key={link.label}
                      href={link.href}
                      onClick={closeMenu}
                      style={{ display: 'block', padding: '11px 8px 11px 20px', fontSize: 15, fontWeight: 700, color: '#6a5a5e', textDecoration: 'none' }}
                    >
                      {link.label}
                    </NavA>
                  ))}
                </div>
              </details>
            ) : (
              <NavA
                key={m.label}
                href={m.href}
                onClick={closeMenu}
                style={{
                  display: 'block',
                  padding: '16px 8px',
                  fontSize: 19,
                  fontWeight: 800,
                  color: '#2a2024',
                  textDecoration: 'none',
                  borderBottom: '1px solid rgba(181,16,31,.1)',
                }}
              >
                {m.label}
              </NavA>
            ),
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 24 }}>
            {/* Mobile "Começar" — same Developers portal entry as the desktop
                header CTA (design handoff §Ponto de entrada), so mobile and
                desktop lead to the exact same frontend route. */}
            <NavA
              className="bz-start"
              href={DEVELOPERS_LOGIN_URL}
              onClick={closeMenu}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: 16, borderRadius: 30, background: RED, color: '#fff', fontWeight: 800, fontSize: 16, textDecoration: 'none' }}
            >
              Começar
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M5 12h14M13 6l6 6-6 6" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </NavA>
            <a
              href={mailto('Waitlist Banzami')}
              onClick={closeMenu}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 30, background: RED, color: '#fff', fontWeight: 800, fontSize: 16, textDecoration: 'none' }}
            >
              Entrar na waitlist
            </a>
            <a
              href={mailto()}
              onClick={closeMenu}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 15, borderRadius: 30, border: '1.5px solid rgba(181,16,31,.28)', color: RED, fontWeight: 800, fontSize: 16, textDecoration: 'none' }}
            >
              Falar connosco
            </a>
          </div>
        </div>
      )}
    </>
  );
}
