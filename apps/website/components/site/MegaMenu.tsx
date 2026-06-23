'use client';

import Link from 'next/link';
import { useId } from 'react';
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
// Live links call onNavigate so the panel closes when the user picks an option.
function PanelItem({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
  if (item.soon) {
    return (
      <div className="px-3 py-[9px]" role="menuitem" aria-disabled="true">
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

  if (item.mailto) return <a href={item.mailto} role="menuitem" onClick={onNavigate} className={cls}>{body}</a>;
  if (item.external)
    return (
      <a href={item.external} target="_blank" rel="noopener noreferrer" role="menuitem" onClick={onNavigate} className={cls}>
        {body}
      </a>
    );
  return (
    <Link href={item.href ?? '#'} role="menuitem" onClick={onNavigate} className={cls}>
      {body}
    </Link>
  );
}

// Desktop top-level nav item with a controlled mega-menu panel.
// The TRIGGER IS A BUTTON — it never navigates; it opens/toggles the menu.
// Open on hover, toggle on click; submenu items are the only links.
export function MegaMenu({
  menu,
  isActive,
  isOpen,
  onOpen,
  onToggle,
  onScheduleClose,
  onCancelClose,
  onNavigate,
}: {
  menu: NavMenu;
  isActive: boolean;
  isOpen: boolean;
  onOpen: (key: string) => void;
  onToggle: (key: string) => void;
  onScheduleClose: () => void;
  onCancelClose: () => void;
  onNavigate: () => void;
}) {
  const panelId = useId();
  const highlighted = isOpen || isActive;

  return (
    <div
      className="relative"
      onMouseEnter={() => onOpen(menu.key)}
      onMouseLeave={onScheduleClose}
    >
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => onToggle(menu.key)}
        onFocus={onCancelClose}
        className={`inline-flex cursor-pointer items-center gap-[5px] rounded-[12px] border-none bg-transparent px-[10px] py-[6px] text-[15px] transition-[color,background-color] duration-200 hover:bg-cream-100 ${isOpen ? 'bg-cream-100' : ''}`}
        style={{ color: highlighted ? '#B5101F' : '#5a4a4e', fontWeight: isActive ? 800 : 700 }}
      >
        {menu.label}
        <Chevron className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <div
        id={panelId}
        role="menu"
        aria-label={menu.label}
        className={`absolute left-1/2 top-full z-[70] mt-[14px] -translate-x-1/2 rounded-card border border-glass p-4 shadow-mega transition-[opacity,transform] duration-200 ease-out [backdrop-filter:saturate(180%)_blur(20px)] ${
          isOpen ? 'visible translate-y-0 opacity-100' : 'invisible -translate-y-2 opacity-0'
        }`}
        style={{ width: menu.width, background: 'rgba(255,255,255,0.97)' }}
      >
        <div className="grid gap-3" style={{ gridTemplateColumns: menu.columns.length > 1 ? '1fr 1fr' : '1fr' }}>
          {menu.columns.map((col, ci) => (
            <div key={ci}>
              {col.heading && (
                <p className="m-0 mb-1 px-3 text-[11px] font-black tracking-[0.06em] text-ink-muted">{col.heading}</p>
              )}
              {col.items.map((item) => (
                <PanelItem key={item.label} item={item} onNavigate={onNavigate} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
