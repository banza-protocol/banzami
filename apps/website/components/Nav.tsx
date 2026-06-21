'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { NAV_LINKS } from '@/lib/site';
import { BrandMark } from './BrandMark';

export function Nav({ active }: { active?: string }) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Lock body scroll + close on Escape while the mobile menu is open.
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
        className="fixed left-1/2 top-4 z-[60] w-[calc(100%-32px)] max-w-container -translate-x-1/2 rounded-pill transition-all duration-300"
        style={{
          background: scrolled ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0)',
          backdropFilter: scrolled ? 'saturate(180%) blur(16px)' : 'none',
          WebkitBackdropFilter: scrolled ? 'saturate(180%) blur(16px)' : 'none',
          boxShadow: scrolled ? '0 10px 30px -16px rgba(181,16,31,0.28)' : 'none',
        }}
      >
        <nav className="flex items-center justify-between gap-5 py-[11px] pl-[22px] pr-[14px]">
          <Link
            href="/"
            className="flex items-center gap-[10px] text-[20px] font-black tracking-[-0.02em] text-ink no-underline"
          >
            <span className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-[10px] bg-banzami shadow-[0_6px_14px_-4px_rgba(181,16,31,.5)]">
              <BrandMark size={17} />
            </span>
            Banzami
          </Link>

          <div className="hidden items-center gap-[26px] text-[15px] font-bold md:flex">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="no-underline transition-colors hover:text-banzami"
                style={{ color: active === l.href ? '#B5101F' : '#5a4a4e' }}
              >
                {l.label}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-[10px]">
            <Link
              href="/#contacto"
              className="bz-btn-primary !px-[18px] !py-[10px] !text-[14px] !shadow-[0_8px_18px_-6px_rgba(181,16,31,.5)]"
            >
              Começar
            </Link>
            <button
              type="button"
              aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex h-11 w-11 cursor-pointer flex-col items-center justify-center gap-1 rounded-[14px] border-none bg-pink-100 md:hidden"
            >
              <span className="block h-[2.5px] w-[18px] rounded bg-banzami" />
              <span className="block h-[2.5px] w-[18px] rounded bg-banzami" />
              <span className="block h-[2.5px] w-[18px] rounded bg-banzami" />
            </button>
          </div>
        </nav>
      </header>

      {/* Mobile menu panel — rendered OUTSIDE the transformed <header> so its
          fixed positioning is relative to the viewport (a `transform` ancestor
          would otherwise become its containing block). Full-screen, opaque. */}
      {menuOpen && (
        <div
          id="mobile-menu"
          role="dialog"
          aria-modal="true"
          aria-label="Menu de navegação"
          className="fixed inset-0 z-[80] flex flex-col overflow-y-auto bg-[#fff5f5] md:hidden"
        >
          <div className="flex items-center justify-between px-6 pb-2 pt-[18px]">
            <Link
              href="/"
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-[10px] text-[20px] font-black tracking-[-0.02em] text-ink no-underline"
            >
              <span className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-[10px] bg-banzami shadow-[0_6px_14px_-4px_rgba(181,16,31,.5)]">
                <BrandMark size={17} />
              </span>
              Banzami
            </Link>
            <button
              type="button"
              aria-label="Fechar menu"
              onClick={() => setMenuOpen(false)}
              className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-[14px] border-none bg-pink-100"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="#B5101F"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>

          <nav className="flex flex-1 flex-col gap-1 px-6 pt-6">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setMenuOpen(false)}
                className="border-b border-[rgba(181,16,31,0.1)] px-[10px] py-4 text-[22px] font-extrabold text-ink no-underline"
              >
                {l.label}
              </Link>
            ))}
            <Link
              href="/#contacto"
              onClick={() => setMenuOpen(false)}
              className="mt-6 rounded-pill bg-banzami px-4 py-4 text-center text-[18px] font-extrabold text-white no-underline"
            >
              Começar
            </Link>
          </nav>
        </div>
      )}
    </>
  );
}
