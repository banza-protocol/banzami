'use client';

import Link from 'next/link';

/**
 * One developer platform, two financial environments (canonical environment
 * model). The Sandbox is available and self-service, with fictitious value.
 * Real-money operations are the same platform behind institutional approval, and
 * they are not ready: nothing in this Console can switch them on, and a Sandbox
 * key opens nothing there. Sandbox is compared with Sandbox and real-money with
 * real-money — the cards never suggest one becomes the other.
 */
export function EnvironmentCards({ compact = false }: { compact?: boolean }) {
  const card = { borderRadius: 16, padding: compact ? 16 : 20, border: '1px solid #F2E2E0', background: '#fff' } as const;
  const badge = (bg: string, color: string) => ({
    display: 'inline-block', padding: '3px 10px', borderRadius: 30, fontSize: 11.5, fontWeight: 900, background: bg, color,
  });
  return (
    <div data-testid="environment-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
      <div data-testid="environment-sandbox" style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: '#2a2024' }}>Sandbox</h3>
          <span style={badge('#EAF7F0', '#1F8A5B')}>Disponível</span>
        </div>
        <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 13, lineHeight: 1.65, color: '#6a5a5e', fontWeight: 600 }}>
          <li>Self-service: sem aprovação do Banzami.</li>
          <li>Valor fictício; chaves <code>bz_test_</code>.</li>
          <li>Os mesmos contratos v1 que as operações com dinheiro real usarão.</li>
        </ul>
      </div>
      <div data-testid="environment-live" style={{ ...card, background: '#FBF8F8' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: '#2a2024' }}>Operações com dinheiro real</h3>
          <span style={badge('#F3EDEC', '#6a5a5e')}>Indisponível</span>
        </div>
        <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 13, lineHeight: 1.65, color: '#6a5a5e', fontWeight: 600 }}>
          <li>Sujeito às aprovações regulatórias, contratuais e operacionais aplicáveis.</li>
          <li>Nenhuma chave <code>bz_live_</code> é emitida; uma chave Sandbox não abre as operações com dinheiro real.</li>
          <li>Nada nesta consola o ativa.</li>
        </ul>
        {!compact && (
          <Link href="/go-live" style={{ display: 'inline-block', marginTop: 10, fontSize: 12.5, fontWeight: 800, color: '#B5101F', textDecoration: 'none' }}>
            O que isto significa →
          </Link>
        )}
      </div>
    </div>
  );
}
