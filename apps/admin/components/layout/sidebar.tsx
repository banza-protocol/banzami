'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { destroySession } from '@/lib/session';
import { BanzamiLogo } from '@/components/ui/brand';
import { attentionHref, attentionLabel, attentionPhrase, badgeText, countFor } from '@/lib/attention';
import { useAttention } from '@/components/layout/attention-provider';
import { NAV, isSection, type NavItem } from '@/components/layout/nav-config';

/**
 * Attention badge. Red (brand token), hidden at 0, "99+" past 99. Two
 * placements from one element set: a pill at the end of the row when the
 * sidebar is expanded, and a small pill over the icon when it collapses to the
 * icon rail (≤860px — also the phone layout). The count is decorative for
 * assistive technology: the link's accessible name already says it in words.
 */
export function AttentionBadge({ n, placement }: { n: number | null; placement: 'row' | 'icon' }) {
  const text = badgeText(n);
  if (text === null) return null;
  const common = 'flex items-center justify-center rounded-full bg-banzami font-extrabold text-white tabular-nums';
  return placement === 'row' ? (
    <span data-attention-badge="row" aria-hidden="true" className={`${common} ml-auto h-[20px] min-w-[20px] px-[6px] text-[11px] max-[860px]:hidden`}>
      {text}
    </span>
  ) : (
    <span data-attention-badge="icon" aria-hidden="true" className={`${common} absolute -right-[9px] -top-[8px] hidden h-[16px] min-w-[16px] px-[4px] text-[9.5px] ring-2 ring-white max-[860px]:flex`}>
      {text}
    </span>
  );
}

function isActive(pathname: string, href: string, exact?: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + '/');
}

function NavLink({ item, pathname, count }: { item: NavItem; pathname: string; count: number | null }) {
  const { href, label, Icon, exact } = item;
  const active = isActive(pathname, href, exact);
  const shown = badgeText(count) !== null;
  return (
    <Link
      href={attentionHref(href, count)}
      aria-current={active ? 'page' : undefined}
      aria-label={attentionLabel(label, count)}
      title={shown ? attentionPhrase(Math.floor(count as number)) : undefined}
      className={`flex items-center gap-3 rounded-[13px] px-[13px] py-[11px] text-[14.5px] font-extrabold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-banzami max-[860px]:justify-center ${
        active ? 'bg-[#FFF1F0] text-banzami' : 'text-[#5a4a4e] hover:bg-[#FFF7F6]'
      }`}
    >
      <span className="relative flex flex-none">
        <Icon size={20} className="flex-none" color={active ? '#B5101F' : '#9a8a8e'} strokeWidth={1.8} aria-hidden="true" />
        <AttentionBadge n={count} placement="icon" />
      </span>
      <span className="max-[860px]:hidden">{label}</span>
      <AttentionBadge n={count} placement="row" />
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { summary } = useAttention();

  function logout() {
    destroySession();
    router.replace('/login');
  }

  return (
    <aside className="adm-side sticky top-0 flex h-screen w-[248px] flex-none flex-col border-r border-[#f1e3e3] bg-white max-[860px]:w-[74px]">
      <div className="flex items-center gap-[11px] border-b border-[#f6eded] px-5 pb-[18px] pt-[22px]">
        <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[11px] bg-banzami shadow-[0_6px_14px_-4px_rgba(181,16,31,0.5)]">
          <BanzamiLogo />
        </span>
        <span className="flex items-baseline gap-[7px] max-[860px]:hidden">
          <span className="text-[19px] font-black tracking-[-0.02em]">BANZADMIN</span>
        </span>
      </div>

      <nav aria-label="Navegação principal" className="flex flex-1 flex-col gap-[3px] overflow-y-auto p-3">
        {NAV.map((entry) => {
          if (isSection(entry)) {
            return (
              <div key={entry.section} className="mt-[14px] flex flex-col gap-[3px]">
                <span className="px-[13px] pb-[2px] text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#bba6aa] max-[860px]:hidden">
                  {entry.section}
                </span>
                {entry.items.map((item) => (
                  <NavLink key={item.href} item={item} pathname={pathname} count={countFor(summary, item.attentionKey)} />
                ))}
              </div>
            );
          }
          return <NavLink key={entry.href} item={entry} pathname={pathname} count={countFor(summary, entry.attentionKey)} />;
        })}
      </nav>

      <div className="border-t border-[#f6eded] p-3">
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-[13px] px-[13px] py-[11px] text-[14.5px] font-bold text-[#9a8a8e] transition-colors hover:bg-[#FFF1F0] hover:text-banzami max-[860px]:justify-center"
        >
          <LogOut size={20} className="flex-none" strokeWidth={1.8} />
          <span className="max-[860px]:hidden">Sair</span>
        </button>
      </div>
    </aside>
  );
}
