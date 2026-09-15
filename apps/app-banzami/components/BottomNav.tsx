'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/inicio', label: 'Início', icon: 'home' },
  { href: '/historico', label: 'Histórico', icon: 'history' },
  { href: '/receber', label: 'Receber', icon: 'qr' },
  { href: '/perfil', label: 'Perfil', icon: 'user' },
] as const;

function Icon({ name, active }: { name: string; active: boolean }) {
  const s = active ? '#B5101F' : '#9a8f92';
  const w = active ? 2.2 : 1.8;
  switch (name) {
    case 'home': return <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M4 11l8-7 8 7M6 10v9a1 1 0 001 1h10a1 1 0 001-1v-9" stroke={s} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round"/></svg>;
    case 'history': return <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.5" stroke={s} strokeWidth={w}/><path d="M12 7.5V12l3 2" stroke={s} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round"/></svg>;
    case 'qr': return <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1.5" stroke={s} strokeWidth={w}/><rect x="14" y="3.5" width="6.5" height="6.5" rx="1.5" stroke={s} strokeWidth={w}/><rect x="3.5" y="14" width="6.5" height="6.5" rx="1.5" stroke={s} strokeWidth={w}/><path d="M14 14h3v3M20.5 14v6.5H14" stroke={s} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round"/></svg>;
    default: return <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="3.5" stroke={s} strokeWidth={w}/><path d="M5.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5" stroke={s} strokeWidth={w} strokeLinecap="round"/></svg>;
  }
}

export function BottomNav() {
  const path = usePathname();
  return (
    <nav className="sticky bottom-0 z-30 mx-auto flex max-w-[520px] items-stretch justify-around border-t border-[#efe7e7] bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      {TABS.map((t) => {
        const active = path === t.href || path.startsWith(t.href + '/');
        return (
          <Link key={t.href} href={t.href} aria-current={active ? 'page' : undefined} className="flex flex-1 flex-col items-center gap-1 py-2.5 no-underline">
            <Icon name={t.icon} active={active} />
            <span className={`text-[11px] font-bold ${active ? 'text-cherry' : 'text-ink-muted'}`}>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
