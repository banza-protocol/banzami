'use client';

import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { ToastProvider, useToast, copyText } from './Toast';
import {
  BrandTile,
  IconArrowRight,
  IconBell,
  IconBolt,
  IconBriefcase,
  IconChevronDown,
  IconChevronUpDown,
  IconDoc,
  IconFlask,
  IconGear,
  IconGrid,
  IconHelp,
  IconKey,
  IconList,
  IconSwap,
  IconUsers,
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
  | 'clientes'
  | 'apikeys'
  | 'webhooks'
  | 'logs'
  | 'docs'
  | 'settings'
  | 'golive'
  | 'suporte'
  | 'status';

const NAV: { key: PortalKey; label: string; href: string; icon: (p: { size?: number }) => ReactNode }[] = [
  { key: 'dashboard', label: 'Visão geral', href: '/developers/dashboard', icon: IconGrid },
  { key: 'saldos', label: 'Saldos', href: '/developers/saldos', icon: IconWallet },
  { key: 'transacoes', label: 'Transações', href: '/developers/transacoes', icon: IconSwap },
  { key: 'clientes', label: 'Clientes', href: '/developers/clientes', icon: IconUsers },
  { key: 'apikeys', label: 'API Keys', href: '/developers/api-keys', icon: IconKey },
  { key: 'webhooks', label: 'Webhooks', href: '/developers/webhooks', icon: IconWebhook },
  { key: 'logs', label: 'Logs / Eventos', href: '/developers/logs', icon: IconList },
  { key: 'docs', label: 'Documentação', href: '/developers/docs', icon: IconDoc },
  { key: 'settings', label: 'Configurações', href: '/developers/settings', icon: IconGear },
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

      {/* project selector */}
      <div
        style={{
          margin: '0 2px 12px',
          padding: '11px 12px',
          border: '1.5px solid #F0E2E0',
          borderRadius: 14,
          background: '#FFFAF9',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          cursor: 'pointer',
        }}
      >
        <span
          style={{
            flex: 'none',
            width: 30,
            height: 30,
            borderRadius: 9,
            background: 'linear-gradient(150deg,#FBD2D0,#FFE7E5)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#B5101F',
          }}
        >
          <IconBriefcase size={16} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 9.5, fontWeight: 800, letterSpacing: '.06em', color: '#a89a9e' }}>PROJETO ATUAL</p>
          <p
            style={{
              margin: '1px 0 0',
              fontSize: 13.5,
              fontWeight: 800,
              color: '#2a2024',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            Minha Loja Online
          </p>
        </div>
        <span style={{ color: '#c2a8aa', display: 'inline-flex' }}>
          <IconChevronUpDown size={15} />
        </span>
      </div>
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
        <NavItem href="/developers/suporte" label="Suporte" active={active === 'suporte'} icon={IconHelp} />
        <NavItem href="/developers/status" active={active === 'status'}>
          <span style={{ width: 18, display: 'inline-flex', justifyContent: 'center' }}>
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: '50%',
                background: '#1F8A5B',
                boxShadow: '0 0 0 4px rgba(31,138,91,.16)',
              }}
            />
          </span>
          Status
          <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 800, color: '#1F8A5B' }}>Operacional</span>
        </NavItem>
      </div>
    </aside>
  );
}

function TopBar() {
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
          Minha Loja Online
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
          href="/developers/go-live"
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
        <button
          className="bz-icobtn"
          aria-label="Notificações"
          style={{
            position: 'relative',
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
          <IconBell size={18} />
          <span
            style={{
              position: 'absolute',
              top: 9,
              right: 10,
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: '#B5101F',
              border: '1.5px solid #fff',
            }}
          />
        </button>
        <Link
          href="/developers/suporte"
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
        <button
          aria-label="Conta"
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
            JM
          </span>
          <span style={{ color: '#b8a4a6', display: 'inline-flex' }}>
            <IconChevronDown size={14} />
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
        href="/developers/go-live"
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
      {showBanner ? <SandboxBanner /> : null}
      {children}
    </main>
  );
}

export function PortalPage({
  active,
  showBanner,
  children,
}: {
  active: PortalKey;
  showBanner?: boolean;
  children: ReactNode;
}) {
  // Banner shows everywhere except Go Live and Docs (dossier §Banner Sandbox).
  const banner = showBanner ?? (active !== 'golive' && active !== 'docs');
  return (
    <ToastProvider>
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
    </ToastProvider>
  );
}
