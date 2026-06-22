'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { NAV_MENUS, NAV_LINKS, NAV_CTA, activeNavKey } from '@/lib/site';
import { Logo } from './BrandMark';
import { MegaMenu } from './MegaMenu';
import { MobileDrawer } from './MobileDrawer';

// Unified site header (README §"Sistema de navegação").
// Floating glass pill: transparent at top, gains glass background on scroll>8.
// Desktop mega-menus (≥lg) + mobile drawer (<lg). Active item derived from the
// current route via activeNavKey() — no per-page prop needed.
export function SiteHeader() {
  const pathname = usePathname() || '/';
  const active = activeNavKey(pathname);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Lock scroll + close on Escape while the drawer is open.
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    if (menuOpen) document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  return (
    <>
      <header
        className="fixed left-1/2 top-4 z-[60] w-[calc(100%-32px)] max-w-container -translate-x-1/2 rounded-nav transition-all duration-300"
        style={{
          background: scrolled ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0)',
          backdropFilter: scrolled ? 'saturate(180%) blur(20px)' : 'none',
          WebkitBackdropFilter: scrolled ? 'saturate(180%) blur(20px)' : 'none',
          boxShadow: scrolled ? '0 10px 30px -16px rgba(181,16,31,0.28)' : 'none',
        }}
      >
        <nav className="flex items-center justify-between gap-5 py-[11px] pl-[22px] pr-[14px]">
          <Link href="/" className="no-underline">
            <Logo />
          </Link>

          <div className="hidden items-center gap-[26px] text-[15px] font-bold lg:flex">
            {NAV_MENUS.map((menu) => (
              <MegaMenu key={menu.key} menu={menu} isActive={active === menu.key} />
            ))}
            {NAV_LINKS.map((l) => (
              <Link
                key={l.key}
                href={l.href}
                className="no-underline transition-colors hover:text-cherry"
                style={{ color: active === l.key ? '#B5101F' : '#5a4a4e', fontWeight: active === l.key ? 800 : 700 }}
              >
                {l.label}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-[10px]">
            <Link href={NAV_CTA.href} className="bz-btn-primary">
              {NAV_CTA.label}
            </Link>
            <button
              type="button"
              aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex h-11 w-11 cursor-pointer flex-col items-center justify-center gap-1 rounded-[14px] border-none bg-cream-100 lg:hidden"
            >
              <span className="block h-[2.5px] w-[18px] rounded bg-cherry" />
              <span className="block h-[2.5px] w-[18px] rounded bg-cherry" />
              <span className="block h-[2.5px] w-[18px] rounded bg-cherry" />
            </button>
          </div>
        </nav>
      </header>

      {menuOpen && <MobileDrawer onClose={() => setMenuOpen(false)} />}
    </>
  );
}
