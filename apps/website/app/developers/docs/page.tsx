'use client';

import { useState } from 'react';
import { BrandTile } from '@/components/developers/portal/icons';

// Public Developer Documentation (developers.banzami.com/docs).
//
// Faithful rebuild of the Banzami Developers handoff §11 "Documentação" screen
// (210px docs sidebar · Introdução + 2×2 cards · dark cURL block · blush help
// card). PUBLIC + STATIC: no auth guard, no session, no developer-api fetch. The
// only additions to the designed screen are the minimal public header links
// (back to Banzami, enter Console) that replace the console shell around it, and
// concise Sandbox-honesty labels (cards "Em breve", cURL preview) — no redesign.

const RED = '#B5101F';
const INK = '#2a2024';
const mono = "'JetBrains Mono', ui-monospace, monospace";
const BANZAMI_URL = 'https://banzami.com';

const DOC_NAV = ['Introdução', 'Quickstart', 'API Reference', 'SDKs', 'Webhooks', 'Errors', 'Changelog'];

// Four designed capability cards with the handoff's exact inline SVG icons.
const CARDS: { title: string; desc: string; icon: React.ReactNode }[] = [
  {
    title: 'Criar cobrança',
    desc: 'Aceite pagamentos via API.',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M4 8h13l-3-3M20 16H7l3 3" stroke={RED} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: 'Transferências',
    desc: 'Envie dinheiro entre contas.',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M4 12h13l-3-3M20 12H7" stroke={RED} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: 'Webhooks',
    desc: 'Reaja a eventos em tempo real.',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="7" r="2.6" stroke={RED} strokeWidth="1.8" />
        <circle cx="6" cy="17" r="2.2" stroke={RED} strokeWidth="1.8" />
        <circle cx="18" cy="17" r="2.2" stroke={RED} strokeWidth="1.8" />
      </svg>
    ),
  },
  {
    title: 'Reembolsos',
    desc: 'Devolva pagamentos.',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M20 11a8 8 0 10-1 5" stroke={RED} strokeWidth="1.8" strokeLinecap="round" />
        <path d="M20 5v5h-5" stroke={RED} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

// Exact designed payload. Preview of the FUTURE payments API — not callable today.
const CURL_RAW = `curl -X POST https://api.banzami.com/v1/charges \\
  -H "Authorization: Bearer sk_test_sua_chave_secreta" \\
  -H "Content-Type: application/json" \\
  -d '{
    "amount": 25000,
    "currency": "AOA",
    "description": "Pagamento do pedido #123",
    "metadata": {
      "order_id": "123"
    }
  }'`;

const S = { str: '#8ED6A8', key: '#F5A9A5', num: '#F0C98A' };

function CurlBlock() {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator?.clipboard?.writeText(CURL_RAW).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      },
      () => {},
    );
  };
  return (
    <div style={{ background: '#2A1E20', borderRadius: 16, overflow: 'hidden', boxShadow: '0 20px 50px -34px rgba(0,0,0,.5)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#E8434B' }} />
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#FBD2D0' }} />
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#5a4a4e' }} />
        <span style={{ marginLeft: 6, fontFamily: mono, fontSize: 11.5, color: '#b8a4a6', fontWeight: 600 }}>cURL · criar cobrança · pré-visualização</span>
        <button
          type="button"
          onClick={copy}
          className="bz-icobtn"
          style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', border: '1px solid rgba(255,255,255,.14)', borderRadius: 9, background: 'rgba(255,255,255,.06)', color: '#fff', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <rect x="9" y="9" width="11" height="11" rx="2.5" stroke="#fff" strokeWidth="1.9" />
            <path d="M5 15V5a2 2 0 012-2h8" stroke="#fff" strokeWidth="1.9" />
          </svg>
          {copied ? 'Copiado' : 'Copiar'}
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

const backLinkStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 13,
  fontWeight: 700,
  color: '#7a6a6e',
  textDecoration: 'none',
  padding: '3px 9px',
  borderRadius: 8,
};

export default function DocsPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#FFF9F8', display: 'flex', flexDirection: 'column' }}>
      {/* Minimal public header — replaces the console shell chrome. Back to the
          public site + enter the Console. (No full-width Sandbox banner.) */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '18px 28px', maxWidth: 1200, width: '100%', margin: '0 auto' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
          <a href={BANZAMI_URL} aria-label="Voltar ao Banzami" className="bz-toplink" style={backLinkStyle}>
            <span aria-hidden="true" style={{ fontSize: 15, lineHeight: 1 }}>←</span>
            Voltar ao Banzami
          </a>
          <span style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <BrandTile size={32} radius={10} />
            <span style={{ fontWeight: 900, fontSize: 18, letterSpacing: '-.02em', color: INK }}>
              Banzami <span style={{ color: RED }}>Developers</span>
            </span>
          </span>
        </div>
        <a href="/login" className="bz-toplink" aria-label="Entrar na Consola" style={{ ...backLinkStyle, color: RED, fontWeight: 800 }}>
          Entrar na Consola
          <span aria-hidden="true" style={{ fontSize: 15, lineHeight: 1 }}>→</span>
        </a>
      </header>

      <main style={{ flex: 1, maxWidth: 1200, width: '100%', margin: '0 auto', padding: '10px 26px 60px' }}>
        <div className="bz-docsgrid" style={{ display: 'grid', gridTemplateColumns: '210px 1fr', gap: 26, alignItems: 'start' }}>
          {/* Docs sidebar (sticky) — the seven designed items */}
          <aside style={{ position: 'sticky', top: 24 }}>
            <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 900, letterSpacing: '.06em', color: '#a89a9e' }}>DOCUMENTAÇÃO</p>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {DOC_NAV.map((n, i) => (
                <a
                  key={n}
                  href="#introducao"
                  style={{ padding: '8px 12px', borderRadius: 10, background: i === 0 ? '#FFF1F0' : 'transparent', color: i === 0 ? RED : '#6a5a5e', fontSize: 13.5, fontWeight: i === 0 ? 800 : 700, textDecoration: 'none' }}
                >
                  {n}
                </a>
              ))}
            </nav>
          </aside>

          <div id="introducao" style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900, letterSpacing: '-.02em', color: INK }}>Introdução</h1>
            <p style={{ margin: '10px 0 24px', fontSize: 15, color: '#8a7a7e', fontWeight: 600, maxWidth: 560 }}>
              Comece a integrar Banzami em poucos minutos. Todas as chamadas usam o ambiente Sandbox por defeito.
            </p>

            {/* 2×2 capability cards — designed treatment, with a native "Em breve"
                badge because these APIs are not yet available. */}
            <div className="bz-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 26 }}>
              {CARDS.map((c) => (
                <div
                  key={c.title}
                  style={{ position: 'relative', background: '#fff', border: '1px solid #F2E2E0', borderRadius: 16, padding: 18, boxShadow: '0 14px 40px -34px rgba(181,16,31,.35)' }}
                >
                  <span style={{ position: 'absolute', top: 14, right: 14, padding: '3px 9px', borderRadius: 30, background: '#FDF3E2', border: '1px solid #F7E4CB', fontSize: 10, fontWeight: 800, letterSpacing: '.02em', color: '#B8770A' }}>
                    Em breve
                  </span>
                  <span style={{ width: 34, height: 34, borderRadius: 10, background: '#FFF1F0', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10, color: RED }}>
                    {c.icon}
                  </span>
                  <p style={{ margin: 0, fontSize: 14.5, fontWeight: 900, color: INK }}>{c.title}</p>
                  <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#8a7a7e', fontWeight: 600 }}>{c.desc}</p>
                </div>
              ))}
            </div>

            <p style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 900, color: INK }}>Exemplo rápido</p>
            <p style={{ margin: '0 0 12px', fontSize: 12.5, color: '#a08a8c', fontWeight: 600, maxWidth: 560 }}>
              Pré-visualização da futura API de pagamentos. <code style={{ fontFamily: mono, fontSize: 12 }}>api.banzami.com</code> é o
              endpoint público de integração planeado — ainda não disponível hoje e sem dinheiro real (Sandbox).
            </p>
            <CurlBlock />

            {/* Blush help card */}
            <div style={{ marginTop: 22, display: 'flex', alignItems: 'center', gap: 14, background: '#FFF1F0', border: '1px solid #F7DAD7', borderRadius: 16, padding: '18px 20px' }}>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 14.5, fontWeight: 900, color: INK }}>Precisa de ajuda?</p>
                <p style={{ margin: '3px 0 0', fontSize: 13, color: '#a08a8c', fontWeight: 600 }}>A nossa equipa de suporte está disponível.</p>
              </div>
              <a
                href="/suporte"
                className="bz-cta"
                style={{ padding: '11px 18px', border: 'none', borderRadius: 12, background: 'linear-gradient(160deg,#B5101F,#7C1016)', color: '#fff', fontWeight: 800, fontSize: 13.5, cursor: 'pointer', textDecoration: 'none', boxShadow: '0 12px 24px -12px rgba(181,16,31,.5)' }}
              >
                Abrir suporte
              </a>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
