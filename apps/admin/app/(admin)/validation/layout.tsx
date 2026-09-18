'use client';

import { usePathname } from 'next/navigation';
import { StudioProvider } from './studio-context';
import { STUDIO_NAV } from '@/components/layout/studio-nav';

/**
 * The Studio has NO header of its own. BANZADMIN's Topbar already owns the
 * title, the SANDBOX badge, notifications and the user; rendering a second of
 * each is chrome, not information. The Studio contributes only its subtitle,
 * through the one place titles come from (nav-config + Topbar SUBS).
 *
 * What remains here is the section label, so a reader inside a sub-route knows
 * where they are without the sidebar.
 */
export default function ValidationLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const current = [...STUDIO_NAV].reverse().find((i) =>
    i.exact ? pathname === i.href : pathname.startsWith(i.href));

  return (
    <StudioProvider>
      <div className="px-[26px] pb-[34px] pt-[20px]">
        {current && current.href !== '/validation' && (
          <p className="mb-4 text-[13px] font-semibold text-[#9a8a8e]">{current.label}</p>
        )}

        {children}
      </div>
    </StudioProvider>
  );
}
