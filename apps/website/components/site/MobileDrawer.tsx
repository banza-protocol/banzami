'use client';

import Link from 'next/link';
import { NAV_MENUS, NAV_LINKS, NAV_CTA, type NavMenu } from '@/lib/site';
import { Logo } from './BrandMark';
import { ComingSoonBadge } from './ComingSoonBadge';

// Native <details> accordion group. Chevron rotates on open; transitions are
// disabled under prefers-reduced-motion via globals.css.
function Accordion({ menu, onNavigate }: { menu: NavMenu; onNavigate: () => void }) {
  return (
    <details className="group/acc">
      <summary className="flex cursor-pointer list-none items-center justify-between border-b border-[rgba(181,16,31,0.1)] px-[10px] py-4 text-[20px] font-extrabold text-ink [&::-webkit-details-marker]:hidden">
        {menu.label}
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className="transition-transform duration-200 group-open/acc:rotate-90"
        >
          <path d="M9 6l6 6-6 6" stroke="#9A1B22" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <div className="py-1 pb-2">
        {menu.columns.flatMap((c) => c.items).map((item) =>
          item.soon ? (
            <span
              key={item.label}
              className="flex items-center justify-between px-[10px] py-[11px] pl-[22px] text-[15.5px] font-bold text-[#b8a4a6]"
            >
              {item.label}
              <ComingSoonBadge />
            </span>
          ) : item.mailto ? (
            <a
              key={item.label}
              href={item.mailto}
              onClick={onNavigate}
              className="block px-[10px] py-[11px] pl-[22px] text-[15.5px] font-bold text-ink-secondary no-underline"
            >
              {item.label}
            </a>
          ) : (
            <Link
              key={item.label}
              href={item.href ?? '#'}
              onClick={onNavigate}
              className="block px-[10px] py-[11px] pl-[22px] text-[15.5px] font-bold text-ink-secondary no-underline"
            >
              {item.label}
            </Link>
          ),
        )}
      </div>
    </details>
  );
}

// Full-screen mobile overlay (≤920px / lg). Order per README: Produtos /
// Developers / Suporte accordions, then FAQ, Sobre links, then Começar CTA.
export function MobileDrawer({ onClose }: { onClose: () => void }) {
  return (
    <div
      id="mobile-menu"
      role="dialog"
      aria-modal="true"
      aria-label="Menu de navegação"
      className="fixed inset-0 z-[80] flex flex-col overflow-y-auto lg:hidden"
      style={{ background: 'rgba(255,245,245,0.97)', backdropFilter: 'blur(8px)' }}
    >
      <div className="flex items-center justify-between px-6 pb-2 pt-[18px]">
        <Link href="/" onClick={onClose} className="no-underline">
          <Logo />
        </Link>
        <button
          type="button"
          aria-label="Fechar menu"
          onClick={onClose}
          className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-[14px] border-none bg-cream-100"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="#B5101F" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-[2px] px-6 pt-4">
        {NAV_MENUS.map((menu) => (
          <Accordion key={menu.key} menu={menu} onNavigate={onClose} />
        ))}
        {NAV_LINKS.map((l) => (
          <Link
            key={l.key}
            href={l.href}
            onClick={onClose}
            className="border-b border-[rgba(181,16,31,0.1)] px-[10px] py-4 text-[20px] font-extrabold text-ink no-underline"
          >
            {l.label}
          </Link>
        ))}
        <Link
          href={NAV_CTA.href}
          onClick={onClose}
          className="mt-4 rounded-pill bg-cherry px-4 py-4 text-center text-[18px] font-extrabold text-white no-underline"
        >
          {NAV_CTA.label}
        </Link>
      </nav>
    </div>
  );
}
