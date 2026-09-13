'use client';

// /docs/guides was one page holding six topics. It is now six pages. Links to
// it — in bookmarks, search results and old Console builds — carry the anchor of
// the section they meant, and an HTTP redirect cannot see an anchor. This reads
// it in the browser and replaces the location with the page that section became;
// without JavaScript, the list below is the same map.

import { useEffect } from 'react';

type Lang = 'pt' | 'en';

export const GUIDES_MOVED: Record<Lang, Record<string, string>> = {
  pt: {
    'contas-segregadas': '/docs/transfers#contas-segregadas',
    cobranca: '/docs/payments',
    transferencias: '/docs/transfers#transferencias',
    reembolsos: '/docs/refunds',
    comprovativos: '/docs/receipts',
    webhooks: '/docs/webhooks',
    'como-funciona': '/docs/webhooks',
    reentrega: '/docs/webhooks#reentrega',
    'gerir-endpoint': '/docs/webhooks#gerir-endpoint',
    eventos: '/docs/events',
    resolucao: '/docs/troubleshooting',
    '': '/docs/payments',
  },
  en: {
    'segregated-accounts': '/docs/en/transfers#segregated-accounts',
    charges: '/docs/en/payments',
    transfers: '/docs/en/transfers#transfers',
    refunds: '/docs/en/refunds',
    receipts: '/docs/en/receipts',
    webhooks: '/docs/en/webhooks',
    'how-it-works': '/docs/en/webhooks',
    redelivery: '/docs/en/webhooks#redelivery',
    'manage-endpoint': '/docs/en/webhooks#manage-endpoint',
    events: '/docs/en/events',
    troubleshooting: '/docs/en/troubleshooting',
    '': '/docs/en/payments',
  },
};

const LABELS: Record<Lang, [string, string][]> = {
  pt: [['Aceitar pagamentos', '/docs/payments'], ['Webhooks', '/docs/webhooks'], ['Eventos', '/docs/events'], ['Reembolsos', '/docs/refunds'], ['Comprovativos', '/docs/receipts'], ['Contas e transferências', '/docs/transfers'], ['Resolução de problemas', '/docs/troubleshooting']],
  en: [['Accept payments', '/docs/en/payments'], ['Webhooks', '/docs/en/webhooks'], ['Events', '/docs/en/events'], ['Refunds', '/docs/en/refunds'], ['Receipts', '/docs/en/receipts'], ['Accounts and transfers', '/docs/en/transfers'], ['Troubleshooting', '/docs/en/troubleshooting']],
};

export function GuidesMoved({ lang }: { lang: Lang }) {
  useEffect(() => {
    const anchor = decodeURIComponent(window.location.hash.slice(1));
    const target = GUIDES_MOVED[lang][anchor] ?? GUIDES_MOVED[lang][''];
    window.location.replace(target);
  }, [lang]);
  return (
    <main style={{ maxWidth: 640, margin: '60px auto', padding: '0 24px', fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", color: '#241d20' }}>
      <h1 style={{ fontSize: 26, fontWeight: 700 }}>{lang === 'pt' ? 'Esta página foi dividida' : 'This page was split'}</h1>
      <p style={{ fontSize: 15, lineHeight: 1.6, color: '#3f3538' }}>{lang === 'pt' ? 'Os guias passaram a ter uma página por tarefa:' : 'The guides now have one page per task:'}</p>
      <ul style={{ fontSize: 15, lineHeight: 1.9 }}>
        {LABELS[lang].map(([label, href]) => <li key={href}><a href={href} style={{ color: '#9A1B22' }}>{label}</a></li>)}
      </ul>
    </main>
  );
}
