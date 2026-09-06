'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { ToastProvider, useToast, copyText } from './Toast';
import { DeveloperAuthProvider, useDeveloperAuth } from './DeveloperAuth';
import { DeveloperDataProvider, useDeveloperData } from './DeveloperData';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { PreviewNotice } from './PreviewNotice';
import {
  BrandTile,
  IconArrowRight,
  IconBolt,
  IconBriefcase,
  IconChevronDown,
  IconDoc,
  IconFlask,
  IconGear,
  IconGrid,
  IconHelp,
  IconKey,
  IconList,
  IconSwap,
  IconWallet,
  IconWebhook,
} from './icons';

// Shared authenticated shell for every portal page — sidebar (11 items) +
// top bar + optional sandbox banner. Faithful port of the dossier portal shell.
// `active` highlights the current sidebar item; `showBanner` is false for
// Go Live and Docs (per the dossier).

type PortalKey =
  | 'dashboard'
  | 'saldos'
  | 'transacoes'
  | 'apikeys'
  | 'webhooks'
  | 'logs'
  | 'docs'
  | 'settings'
  | 'golive'
  | 'suporte';

const NAV: { key: PortalKey; label: string; href: string; icon: (p: { size?: number }) => ReactNode }[] = [
  { key: 'dashboard', label: 'Visão geral', href: '/', icon: IconGrid },
  { key: 'saldos', label: 'Saldos', href: '/saldos', icon: IconWallet },
  { key: 'transacoes', label: 'Transações', href: '/transacoes', icon: IconSwap },
  { key: 'apikeys', label: 'API Keys', href: '/api-keys', icon: IconKey },
  { key: 'webhooks', label: 'Webhooks', href: '/webhooks', icon: IconWebhook },
  { key: 'logs', label: 'Logs / Eventos', href: '/logs', icon: IconList },
  { key: 'docs', label: 'Documentação', href: '/docs', icon: IconDoc },
  { key: 'settings', label: 'Configurações', href: '/settings', icon: IconGear },
];

function NavItem({
  href,
  label,
  active,
  icon,
  children,
}: {
  href: string;
  label?: string;
  active: boolean;
  icon?: (p: { size?: number }) => ReactNode;
  children?: ReactNode;
}) {
  const style: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 11,
    padding: '10px 12px',
    borderRadius: 12,
    textDecoration: 'none',
    fontSize: 14,
    fontWeight: 800,
    background: active ? '#FFF1F0' : 'transparent',
    color: active ? '#B5101F' : '#6a5a5e',
  };
  return (
    <Link href={href} className="bz-navi" style={style} aria-current={active ? 'page' : undefined}>
      {icon ? icon({ size: 18 }) : null}
      {label}
      {children}
    </Link>
  );
}

const ctaGradient = 'linear-gradient(160deg,#B5101F,#7C1016)';

function Sidebar({ active }: { active: PortalKey }) {
  return (
    <aside
      className="bz-side"
      style={{
        position: 'sticky',
        top: 0,
        height: '100vh',
        overflowY: 'auto',
        borderRight: '1px solid #F2E2E0',
        background: '#fff',
        padding: '20px 16px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', padding: '6px 8px 18px' }}>
        <BrandTile size={32} radius={10} />
        <span style={{ fontWeight: 900, fontSize: 16, letterSpacing: '-.02em', lineHeight: 1.05 }}>
          Banzami
          <br />
          <span style={{ color: '#B5101F', fontSize: 12, letterSpacing: '.02em' }}>Developers</span>
        </span>
      </Link>

      {/* workspace + project switcher (real data) */}
      <WorkspaceSwitcher />
      <div style={{ margin: '0 12px 14px' }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            borderRadius: 30,
            background: '#FDF3E2',
            fontSize: 11,
            fontWeight: 900,
            color: '#B8770A',
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#E0930F' }} />
          SANDBOX
        </span>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV.map((n) => (
          <NavItem key={n.key} href={n.href} label={n.label} active={active === n.key} icon={n.icon} />
        ))}
      </nav>

      <div
        style={{
          marginTop: 'auto',
          paddingTop: 14,
          borderTop: '1px solid #F2E6E4',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        {/* Status was a green dot and the word "Operacional", painted into the
            markup. It asked nothing and could not go amber, so it reported
            healthy through every outage this platform has had. There is no
            status service to connect it to, and inventing one to justify a dot
            would be the same mistake in a larger form. */}
        <NavItem href="/suporte" label="Suporte" active={active === 'suporte'} icon={IconHelp} />
      </div>
    </aside>
  );
}

function initialsOf(user: { name?: string; email?: string } | null): string {
  if (user?.name) {
    const parts = user.name.trim().split(/\s+/);
    return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
  }
  return (user?.email ?? '?').slice(0, 2).toUpperCase();
}

function TopBar() {
  const { user, logout } = useDeveloperAuth();
  const { activeWs, activeProject } = useDeveloperData();
  const router = useRouter();
  const onLogout = async () => {
    await logout();
    router.push('/login');
  };
  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 30,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '13px 26px',
        background: 'rgba(255,249,248,.85)',
        backdropFilter: 'saturate(180%) blur(14px)',
        WebkitBackdropFilter: 'saturate(180%) blur(14px)',
        borderBottom: '1px solid #F2E2E0',
      }}
    >
      <div className="bz-topmeta" style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            padding: '7px 13px',
            borderRadius: 11,
            border: '1.5px solid #F0E2E0',
            background: '#fff',
            fontSize: 13.5,
            fontWeight: 800,
            color: '#2a2024',
            cursor: 'pointer',
          }}
        >
          <span style={{ color: '#B5101F', display: 'inline-flex' }}>
            <IconBriefcase size={15} />
          </span>
          {activeProject?.name ?? activeWs?.name ?? 'Sandbox'}
          <span style={{ color: '#b8a4a6', marginLeft: 2, display: 'inline-flex' }}>
            <IconChevronDown size={14} />
          </span>
        </span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 12px',
            borderRadius: 11,
            background: '#FDF3E2',
            fontSize: 12.5,
            fontWeight: 900,
            color: '#B8770A',
          }}
        >
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#E0930F' }} />
          Sandbox
        </span>
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
        <Link
          href="/go-live"
          className="bz-cta"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            padding: '9px 16px',
            borderRadius: 11,
            background: ctaGradient,
            color: '#fff',
            fontWeight: 800,
            fontSize: 13.5,
            textDecoration: 'none',
            boxShadow: '0 10px 22px -9px rgba(181,16,31,.55)',
          }}
        >
          <IconBolt size={15} />
          Switch to Live
        </Link>
        {/* No notification bell. It had no handler and a red unread dot that was
            always on, so it announced messages that did not exist and did
            nothing when clicked. There is no notification backend, and building
            one to justify an icon is not a reason to build one. */}
        <Link
          href="/suporte"
          className="bz-icobtn"
          aria-label="Suporte"
          style={{
            width: 40,
            height: 40,
            border: '1px solid #F0E2E0',
            borderRadius: 11,
            background: '#fff',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#6a5a5e',
          }}
        >
          <IconHelp size={18} />
        </Link>
        {/* An avatar with a chevron reads as a menu, and this one signed you out
            on the first click. It is now labelled as what it does. */}
        <button
          onClick={onLogout}
          aria-label={user?.email ? `Terminar sessão (${user.email})` : 'Terminar sessão'}
          title={user?.email ? `${user.email} — Terminar sessão` : 'Terminar sessão'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '5px 12px 5px 5px',
            border: '1px solid #F0E2E0',
            borderRadius: 30,
            background: '#fff',
            cursor: 'pointer',
          }}
        >
          <span
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              background: 'linear-gradient(150deg,#B5101F,#7C1016)',
              color: '#fff',
              fontWeight: 900,
              fontSize: 13,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {initialsOf(user)}
          </span>
          <span style={{ color: '#6a5a5e', fontSize: 12.5, fontWeight: 800, whiteSpace: 'nowrap' }}>
            Terminar sessão
          </span>
        </button>
      </div>
    </header>
  );
}

function SandboxBanner() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '16px 20px',
        borderRadius: 18,
        background: 'linear-gradient(120deg,#FFF6E9,#FFF1F0)',
        border: '1px solid #F7E4CB',
        marginBottom: 22,
      }}
    >
      <span
        style={{
          flex: 'none',
          width: 42,
          height: 42,
          borderRadius: 12,
          background: '#FDF0D8',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#C77A0A',
        }}
      >
        <IconFlask size={22} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 900, color: '#2a2024' }}>Você está no modo Sandbox</p>
        <p style={{ margin: '3px 0 0', fontSize: 13.5, fontWeight: 600, color: '#8a6a4e' }}>
          Teste livremente. As alterações aqui não afetam dados reais.
        </p>
      </div>
      <Link
        href="/go-live"
        className="bz-cta"
        style={{
          flex: 'none',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          padding: '11px 18px',
          borderRadius: 12,
          background: ctaGradient,
          color: '#fff',
          fontWeight: 800,
          fontSize: 13.5,
          textDecoration: 'none',
          boxShadow: '0 12px 24px -10px rgba(181,16,31,.5)',
        }}
      >
        Switch to Live
        <IconArrowRight size={15} />
      </Link>
    </div>
  );
}

function Main({ showBanner, children }: { showBanner: boolean; children: ReactNode }) {
  const { flash } = useToast();
  // Copy delegation: any element with [data-copy] copies its value + toasts.
  const onClick = (e: React.MouseEvent<HTMLElement>) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-copy]');
    if (!btn) return;
    e.preventDefault();
    copyText(btn.getAttribute('data-copy') || '');
    flash('Copiado para a área de transferência');
  };
  return (
    <main
      onClick={onClick}
      style={{ flex: 1, padding: 26, maxWidth: 1200, width: '100%', margin: '0 auto' }}
    >
      <PreviewNotice />
      {showBanner ? <SandboxBanner /> : null}
      {children}
    </main>
  );
}

type PortalPageProps = { active: PortalKey; showBanner?: boolean; children: ReactNode };

// PortalGuard runs inside the auth provider: it shows a loading state while the
// session is restored via /auth/me, redirects to sign-in when unauthenticated,
// and renders the shell only when authenticated.
function PortalGuard({ active, showBanner, children }: PortalPageProps) {
  const { status } = useDeveloperAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === 'anon') router.replace('/login');
  }, [status, router]);

  if (status !== 'authed') {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#FFF9F8',
          color: '#8a7a7e',
          fontWeight: 700,
          fontSize: 14,
        }}
      >
        {status === 'loading' ? 'A carregar…' : 'A redirecionar…'}
      </div>
    );
  }

  // Banner shows everywhere except Go Live and Docs (dossier §Banner Sandbox).
  const banner = showBanner ?? (active !== 'golive' && active !== 'docs');
  return (
    <DeveloperDataProvider>
      <div
        className="bz-shellgrid"
        style={{ display: 'grid', gridTemplateColumns: '248px 1fr', minHeight: '100vh', background: '#FFF9F8' }}
      >
        <Sidebar active={active} />
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <TopBar />
          <Main showBanner={banner}>{children}</Main>
        </div>
      </div>
    </DeveloperDataProvider>
  );
}

export function PortalPage(props: PortalPageProps) {
  return (
    <DeveloperAuthProvider>
      <ToastProvider>
        <PortalGuard {...props} />
      </ToastProvider>
    </DeveloperAuthProvider>
  );
}
