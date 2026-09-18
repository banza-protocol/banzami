'use client';

import { usePathname } from 'next/navigation';
import { Microscope } from 'lucide-react';
import { getSession } from '@/lib/session';
import { StudioProvider } from './studio-context';
import { STUDIO_NAV } from '@/components/layout/studio-nav';

/**
 * The Studio's own header: what this surface is, and what it deliberately does
 * not do, in one line the operator reads before anything else.
 */
export default function ValidationLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const role = getSession()?.user.role;
  const current = [...STUDIO_NAV].reverse().find((i) =>
    i.exact ? pathname === i.href : pathname.startsWith(i.href));

  return (
    <StudioProvider>
      <div className="px-[26px] pb-[34px] pt-[22px]">
        <header className="mb-[22px] flex flex-wrap items-start justify-between gap-4 border-b border-[#f1e3e3] pb-[16px]">
          <div className="flex items-start gap-3">
            <span className="flex h-[40px] w-[40px] flex-none items-center justify-center rounded-[13px] bg-[#FBE9E9]">
              <Microscope className="h-[21px] w-[21px] text-[#B5101F]" aria-hidden />
            </span>
            <div>
              <h1 className="text-[27px] font-black leading-none tracking-[-0.02em] text-[#1a1a1a]">
                Validation Studio
              </h1>
              <p className="mt-[7px] text-[13.5px] text-[#9a8a8e]">
                Preparar. Verificar. Cancelar. Não inicia execuções.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 pt-1">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#f0dfa6] bg-[#FDF7E3] px-3 py-[5px] text-[12.5px] font-extrabold text-[#8a6d12]">
              <span className="h-[7px] w-[7px] rounded-full bg-[#E3B23C]" aria-hidden />
              SANDBOX
            </span>
            {role && (
              <span className="rounded-full border border-[#f1e3e3] bg-white px-3 py-[5px] text-[12.5px] font-bold text-[#6a5a5e]">
                {role}
              </span>
            )}
          </div>
        </header>

        {current && current.href !== '/validation' && (
          <p className="mb-4 text-[13px] font-semibold text-[#9a8a8e]">{current.label}</p>
        )}

        {children}
      </div>
    </StudioProvider>
  );
}
