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

  // Prevent body scroll while the mobile menu overlay is open.
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  return (
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
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-11 w-11 cursor-pointer flex-col items-center justify-center gap-1 rounded-[14px] border-none bg-pink-100 md:hidden"
          >
            <span className="block h-[2.5px] w-[18px] rounded bg-banzami" />
            <span className="block h-[2.5px] w-[18px] rounded bg-banzami" />
            <span className="block h-[2.5px] w-[18px] rounded bg-banzami" />
          </button>
        </div>
      </nav>

      {menuOpen && (
        <div className="fixed inset-0 z-[55] flex flex-col gap-2 bg-[rgba(255,245,245,0.97)] px-6 pb-6 pt-[90px] backdrop-blur-sm md:hidden">
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
            className="mt-4 rounded-pill bg-banzami px-4 py-4 text-center text-[18px] font-extrabold text-white no-underline"
          >
            Começar
          </Link>
        </div>
      )}
    </header>
  );
}
