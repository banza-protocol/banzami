'use client';

// The four capability cards at the top of Get started, in either language.
// They existed only in Portuguese; one definition now serves both, so a card
// cannot appear in one language and not the other.

import type { ReactNode } from 'react';
import { BADGE_LABELS_EN, Badge, INK, RED, type Tone } from './ui';

type Lang = 'pt' | 'en';
// A card may say "Disponível em Sandbox" only while its capability is released
// with deployed E2E evidence behind it (assurance-manifest.ts); p3b-ux-polish
// holds each badge to that, in both directions.
const AVAILABLE = { pt: 'Disponível em Sandbox', en: BADGE_LABELS_EN.ok };

const CARDS: { title: Record<Lang, string>; desc: Record<Lang, string>; href: Record<Lang, string>; tone: Tone; badgeText: Record<Lang, string>; icon: ReactNode }[] = [
  {
    title: { pt: 'Criar cobrança', en: 'Create a charge' },
    desc: { pt: 'Links de pagamento, sessões e QR.', en: 'Payment links, sessions and QR.' },
    href: { pt: '/docs/guides#cobranca', en: '/docs/en/guides#charges' },
    tone: 'ok',
    badgeText: AVAILABLE,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 8h13l-3-3M20 16H7l3 3" stroke={RED} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    // Precise on purpose. The capability moves money between accounts of the
    // SAME project owner and cannot leave it; "between accounts" alone invites
    // a reader to expect arbitrary external transfer.
    title: { pt: 'Transferências', en: 'Transfers' },
    desc: { pt: 'Movimente valor entre contas do seu projeto.', en: 'Move value between your project’s accounts.' },
    href: { pt: '/docs/guides#transferencias', en: '/docs/en/guides#transfers' },
    tone: 'ok',
    badgeText: AVAILABLE,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 12h13l-3-3M20 12H7" stroke={RED} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: { pt: 'Webhooks', en: 'Webhooks' },
    desc: { pt: 'Eventos assinados no seu servidor.', en: 'Signed events on your server.' },
    href: { pt: '/docs/guides#webhooks', en: '/docs/en/guides#webhooks' },
    tone: 'ok',
    badgeText: AVAILABLE,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="7" r="2.6" stroke={RED} strokeWidth="1.8" />
        <circle cx="6" cy="17" r="2.2" stroke={RED} strokeWidth="1.8" />
        <circle cx="18" cy="17" r="2.2" stroke={RED} strokeWidth="1.8" />
      </svg>
    ),
  },
  {
    title: { pt: 'Reembolsos', en: 'Refunds' },
    desc: { pt: 'Devolva pagamentos processados.', en: 'Return processed payments.' },
    href: { pt: '/docs/guides#reembolsos', en: '/docs/en/guides#refunds' },
    tone: 'ok',
    badgeText: AVAILABLE,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M20 11a8 8 0 10-1 5" stroke={RED} strokeWidth="1.8" strokeLinecap="round" />
        <path d="M20 5v5h-5" stroke={RED} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

export function CapabilityCards({ lang }: { lang: Lang }) {
  return (
    <div className="bz-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, margin: '18px 0 26px' }}>
      {CARDS.map((c) => (
        <a
          key={c.title.en}
          href={c.href[lang]}
          className="bz-doccard"
          style={{ position: 'relative', display: 'block', textDecoration: 'none', background: '#fff', border: '1px solid #F2E2E0', borderRadius: 16, padding: 18, boxShadow: '0 14px 40px -34px rgba(181,16,31,.35)' }}
        >
          <span style={{ position: 'absolute', top: 13, right: 13 }}><Badge tone={c.tone}>{c.badgeText[lang]}</Badge></span>
          <span style={{ width: 34, height: 34, borderRadius: 10, background: '#FFF1F0', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10, color: RED }}>
            {c.icon}
          </span>
          <p style={{ margin: 0, fontSize: 14.5, fontWeight: 900, color: INK }}>{c.title[lang]}</p>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#8a7a7e', fontWeight: 600 }}>{c.desc[lang]}</p>
        </a>
      ))}
    </div>
  );
}
