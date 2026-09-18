'use client';

/**
 * Validation Studio navigation.
 *
 * Inside /validation the sidebar becomes the Studio's own, the way a sub-app
 * does: the operator is working in one surface and should not be scanning past
 * Candidaturas and Liquidações to find Execuções. A back link returns to
 * BANZADMIN, so nothing is trapped.
 *
 * Only surfaces that EXIST appear here. There is no Studio settings page, so
 * there is no Configurações entry — a nav item that leads nowhere is a promise
 * the product does not keep.
 */

import Link from 'next/link';
import { ArrowLeft, LayoutGrid, PlayCircle, UsersRound, FileSliders, ShieldCheck, Library, Boxes, type LucideIcon } from 'lucide-react';

export type StudioNavItem = { href: string; label: string; Icon: LucideIcon; exact?: boolean };

export const STUDIO_NAV: StudioNavItem[] = [
  { href: '/validation',            label: 'Visão geral',        Icon: LayoutGrid, exact: true },
  { href: '/validation/runs',       label: 'Execuções',          Icon: PlayCircle },
  { href: '/validation/actors',     label: 'Actores',            Icon: UsersRound },
  { href: '/validation/profiles',   label: 'Perfis',             Icon: FileSliders },
  { href: '/validation/preflight',  label: 'Verificação prévia', Icon: ShieldCheck },
  { href: '/validation/registry',   label: 'Registos',           Icon: Library },
  { href: '/validation/components', label: 'Componentes',        Icon: Boxes },
];

export function isStudioRoute(pathname: string): boolean {
  return pathname === '/validation' || pathname.startsWith('/validation/');
}

function active(pathname: string, item: StudioNavItem): boolean {
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}

export function StudioNav({ pathname }: { pathname: string }) {
  return (
    <nav aria-label="Navegação do Validation Studio" className="flex flex-1 flex-col gap-[3px] overflow-y-auto p-3">
      <Link
        href="/"
        className="mb-2 flex items-center gap-2 rounded-[11px] px-[13px] py-[9px] text-[13px] font-bold text-[#9a8a8e] transition-colors hover:bg-[#FFF1F0] hover:text-banzami max-[860px]:justify-center"
      >
        <ArrowLeft size={17} strokeWidth={2} className="flex-none" aria-hidden />
        <span className="max-[860px]:hidden">BANZADMIN</span>
      </Link>

      <span className="px-[13px] pb-[2px] text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#bba6aa] max-[860px]:hidden">
        Validation Studio
      </span>

      {STUDIO_NAV.map((item) => {
        const on = active(pathname, item);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={on ? 'page' : undefined}
            className={`relative flex items-center gap-3 rounded-[13px] px-[13px] py-[11px] text-[14.5px] font-extrabold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-banzami max-[860px]:justify-center ${
              on ? 'bg-[#FFF1F0] text-banzami' : 'text-[#5a4a4e] hover:bg-[#FFF7F6] hover:text-[#1a1a1a]'
            }`}
          >
            {on && <span aria-hidden className="absolute left-0 top-[9px] h-[22px] w-[3px] rounded-r-full bg-banzami" />}
            <item.Icon size={20} className="flex-none" color={on ? '#B5101F' : '#9a8a8e'} strokeWidth={1.8} aria-hidden />
            <span className="max-[860px]:hidden">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
