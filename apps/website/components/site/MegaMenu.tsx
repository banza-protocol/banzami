'use client';

import Link from 'next/link';
import type { NavItem, NavMenu } from '@/lib/site';
import { ComingSoonBadge } from './ComingSoonBadge';

function Chevron({ className = '' }: { className?: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// One row inside a mega-menu panel: a live link, or a disabled "Em breve" row.
function PanelItem({ item }: { item: NavItem }) {
  if (item.soon) {
    return (
      <div className="px-3 py-[9px]">
        <span className="flex items-center gap-2 text-[14px] font-extrabold text-[#b8a4a6]">
          {item.label}
          <ComingSoonBadge />
        </span>
        {item.sub && <span className="mt-px block text-[12px] font-semibold text-[#c2a8aa]">{item.sub}</span>}
      </div>
    );
  }

  const body = (
    <>
      <span className="block text-[14px] font-extrabold text-ink">{item.label}</span>
      {item.sub && <span className="mt-px block text-[12px] font-semibold text-ink-muted">{item.sub}</span>}
    </>
  );
  const cls = 'block rounded-[12px] px-3 py-[9px] no-underline transition-colors hover:bg-cream-100';

  if (item.mailto) return <a href={item.mailto} className={cls}>{body}</a>;
  if (item.external) return <a href={item.external} target="_blank" rel="noopener noreferrer" className={cls}>{body}</a>;
  return <Link href={item.href ?? '#'} className={cls}>{body}</Link>;
}

// Desktop top-level nav item with a hover/focus mega-menu panel.
// Panel: fade + slide (240ms), glass, z-70. Hidden ≤920px (lg).
export function MegaMenu({ menu, isActive }: { menu: NavMenu; isActive: boolean }) {
  return (
    <div className="group relative">
      <Link
        href={menu.href}
        aria-haspopup="true"
        className="inline-flex items-center gap-[5px] no-underline transition-colors hover:text-cherry group-focus-within:text-cherry"
        style={{ color: isActive ? '#B5101F' : '#5a4a4e', fontWeight: isActive ? 800 : 700 }}
      >
        {menu.label}
        <Chevron className="transition-transform duration-200 group-hover:rotate-180" />
      </Link>
      <div
        className="invisible absolute left-1/2 top-full z-[70] mt-[14px] -translate-x-1/2 translate-y-[-8px] rounded-card border border-glass p-4 opacity-0 shadow-mega transition-[opacity,transform] duration-[240ms] ease-out [backdrop-filter:saturate(180%)_blur(20px)] group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100"
        style={{ width: menu.width, background: 'rgba(255,255,255,0.97)' }}
      >
        <div className="grid gap-3" style={{ gridTemplateColumns: menu.columns.length > 1 ? '1fr 1fr' : '1fr' }}>
          {menu.columns.map((col, ci) => (
            <div key={ci}>
              {col.heading && (
                <p className="m-0 mb-1 px-3 text-[11px] font-black tracking-[0.06em] text-ink-muted">{col.heading}</p>
              )}
              {col.items.map((item) => (
                <PanelItem key={item.label} item={item} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
