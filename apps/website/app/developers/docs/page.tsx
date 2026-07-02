'use client';

import type { ReactNode } from 'react';
import { PortalPage } from '@/components/developers/portal/PortalShell';
import { useToast, copyText } from '@/components/developers/portal/Toast';
import { IconCopy, IconRotate, IconSwap, IconTransfer, IconWebhookNodes } from '@/components/developers/portal/icons';

// Documentação — dossier ecrã 11. No sandbox banner. Docs sidebar + intro cards
// + copyable cURL example + help footer.

const ctaGradient = 'linear-gradient(160deg,#B5101F,#7C1016)';
const mono = "'JetBrains Mono', ui-monospace, monospace";

const DOC_NAV = ['Introdução', 'Quickstart', 'API Reference', 'SDKs', 'Webhooks', 'Errors', 'Changelog'];

const CARDS: { title: string; desc: string; icon: ReactNode }[] = [
  { title: 'Criar cobrança', desc: 'Aceite pagamentos via API.', icon: <IconSwap size={18} /> },
  { title: 'Transferências', desc: 'Envie dinheiro entre contas.', icon: <IconTransfer size={18} /> },
  { title: 'Webhooks', desc: 'Reaja a eventos em tempo real.', icon: <IconWebhookNodes size={18} /> },
  { title: 'Reembolsos', desc: 'Devolva pagamentos.', icon: <IconRotate size={18} /> },
];

// Exact copy payload from the dossier prototype.
const CURL =
  'curl -X POST https://api.banzami.com/v1/charges \\\n  -H "Authorization: Bearer sk_test_sua_chave_secreta" \\\n  -H "Content-Type: application/json" \\\n  -d \'{ "amount": 25000, "currency": "AOA", "description": "Pagamento do pedido #123", "metadata": { "order_id": "123" } }\'';

const S = { str: '#8ED6A8', key: '#F5A9A5', num: '#F0C98A' };

function CurlBlock() {
  const { flash } = useToast();
  const copy = () => {
    copyText(CURL);
    flash('Exemplo cURL copiado');
  };
  return (
    <div style={{ background: '#2A1E20', borderRadius: 16, overflow: 'hidden', boxShadow: '0 20px 50px -34px rgba(0,0,0,.5)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#E8434B' }} />
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#FBD2D0' }} />
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#5a4a4e' }} />
        <span style={{ marginLeft: 6, fontFamily: mono, fontSize: 11.5, color: '#b8a4a6', fontWeight: 600 }}>cURL · criar cobrança</span>
        <button
          onClick={copy}
          className="bz-icobtn"
          style={{
            marginLeft: 'auto',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            border: '1px solid rgba(255,255,255,.14)',
            borderRadius: 9,
            background: 'rgba(255,255,255,.06)',
            color: '#fff',
            fontSize: 12,
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          <IconCopy size={13} strokeWidth={1.9} />
          Copiar
        </button>
      </div>
      <pre style={{ margin: 0, padding: 20, fontFamily: mono, fontSize: 12.5, lineHeight: 1.75, color: '#EDE3E1', overflowX: 'auto' }}>
        <span style={{ color: S.key }}>curl</span> -X POST <span style={{ color: S.str }}>https://api.banzami.com/v1/charges</span> {'\\'}
        {'\n'}  -H <span style={{ color: S.str }}>&quot;Authorization: Bearer sk_test_sua_chave_secreta&quot;</span> {'\\'}
        {'\n'}  -H <span style={{ color: S.str }}>&quot;Content-Type: application/json&quot;</span> {'\\'}
        {'\n'}  -d &apos;{'{'}
        {'\n'}    <span style={{ color: S.key }}>&quot;amount&quot;</span>: <span style={{ color: S.num }}>25000</span>,
        {'\n'}    <span style={{ color: S.key }}>&quot;currency&quot;</span>: <span style={{ color: S.str }}>&quot;AOA&quot;</span>,
        {'\n'}    <span style={{ color: S.key }}>&quot;description&quot;</span>: <span style={{ color: S.str }}>&quot;Pagamento do pedido #123&quot;</span>,
        {'\n'}    <span style={{ color: S.key }}>&quot;metadata&quot;</span>: {'{'}
        {'\n'}      <span style={{ color: S.key }}>&quot;order_id&quot;</span>: <span style={{ color: S.str }}>&quot;123&quot;</span>
        {'\n'}    {'}'}
        {'\n'}  {'}'}&apos;
      </pre>
    </div>
  );
}

export default function DocsPage() {
  return (
    <PortalPage active="docs">
      <div className="bz-view">
        <div className="bz-docsgrid" style={{ display: 'grid', gridTemplateColumns: '210px 1fr', gap: 26, alignItems: 'start' }}>
          <aside style={{ position: 'sticky', top: 90 }}>
            <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 900, letterSpacing: '.06em', color: '#a89a9e' }}>DOCUMENTAÇÃO</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {DOC_NAV.map((n, i) => (
                <a
                  key={n}
                  href="#"
                  style={{
                    padding: '8px 12px',
                    borderRadius: 10,
                    background: i === 0 ? '#FFF1F0' : 'transparent',
                    color: i === 0 ? '#B5101F' : '#6a5a5e',
                    fontSize: 13.5,
                    fontWeight: i === 0 ? 800 : 700,
                    textDecoration: 'none',
                  }}
                >
                  {n}
                </a>
              ))}
            </div>
          </aside>

          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900, letterSpacing: '-.02em' }}>Introdução</h1>
            <p style={{ margin: '10px 0 24px', fontSize: 15, color: '#8a7a7e', fontWeight: 600, maxWidth: 560 }}>
              Comece a integrar Banzami em poucos minutos. Todas as chamadas usam o ambiente Sandbox por defeito.
            </p>

            <div className="bz-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 26 }}>
              {CARDS.map((c) => (
                <a
                  key={c.title}
                  href="#"
                  style={{
                    textDecoration: 'none',
                    background: '#fff',
                    border: '1px solid #F2E2E0',
                    borderRadius: 16,
                    padding: 18,
                    boxShadow: '0 14px 40px -34px rgba(181,16,31,.35)',
                  }}
                >
                  <span style={{ width: 34, height: 34, borderRadius: 10, background: '#FFF1F0', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10, color: '#B5101F' }}>
                    {c.icon}
                  </span>
                  <p style={{ margin: 0, fontSize: 14.5, fontWeight: 900, color: '#2a2024' }}>{c.title}</p>
                  <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#8a7a7e', fontWeight: 600 }}>{c.desc}</p>
                </a>
              ))}
            </div>

            <p style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 900 }}>Exemplo rápido</p>
            <CurlBlock />

            <div style={{ marginTop: 22, display: 'flex', alignItems: 'center', gap: 14, background: '#FFF1F0', border: '1px solid #F7DAD7', borderRadius: 16, padding: '18px 20px' }}>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 14.5, fontWeight: 900 }}>Precisa de ajuda?</p>
                <p style={{ margin: '3px 0 0', fontSize: 13, color: '#a08a8c', fontWeight: 600 }}>A nossa equipa de suporte está disponível.</p>
              </div>
              <a
                href="/suporte"
                className="bz-cta"
                style={{ padding: '11px 18px', border: 'none', borderRadius: 12, background: ctaGradient, color: '#fff', fontWeight: 800, fontSize: 13.5, cursor: 'pointer', textDecoration: 'none', boxShadow: '0 12px 24px -12px rgba(181,16,31,.5)' }}
              >
                Abrir suporte
              </a>
            </div>
          </div>
        </div>
      </div>
    </PortalPage>
  );
}
