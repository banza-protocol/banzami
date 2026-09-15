'use client';

// App Banzami — the Consumer side of a Sandbox integration, as a first-class
// Developer Console tool (DEV-CONSOLE-APP-WEB-001). This page LAUNCHES and
// EXPLAINS the real Consumer client at app.banzami.com; it never embeds a fake
// Consumer dashboard and never shows Consumer wallet state inside the Developer
// account. The handoff is a plain new-tab open of the PUBLIC app origin — no
// query string, no Developer session, no Project key, no secret — so Developer
// and Consumer stay strictly separate identities.

import Link from 'next/link';
import { IconArrowRight, IconFlask, IconPhone } from './icons';

const APP_WEB_URL = 'https://app.banzami.com';

const card: React.CSSProperties = {
  border: '1px solid #F2E2E0',
  background: '#fff',
  borderRadius: 18,
  padding: 22,
};

export function AppBanzamiWeb() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 880 }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 900, letterSpacing: '-.02em', color: '#2a2024' }}>App Banzami</h1>
          <p style={{ margin: '6px 0 0', fontSize: 14.5, fontWeight: 600, color: '#8a7a7e', maxWidth: 620 }}>
            Teste a experiência do consumidor diretamente no browser.
          </p>
        </div>
        <span
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 12px',
            borderRadius: 30, background: '#FDF3E2', fontSize: 12, fontWeight: 900, color: '#B8770A', whiteSpace: 'nowrap',
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#E0930F' }} />
          Sandbox · Disponível
        </span>
      </div>

      {/* Launch card */}
      <div style={{ ...card, background: 'linear-gradient(150deg,#FFFCFB,#FFF3F1)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
          <span style={{ display: 'grid', placeItems: 'center', width: 46, height: 46, borderRadius: 13, background: '#fff', border: '1px solid #F4D9D6', color: '#B5101F', flex: 'none' }}>
            <IconPhone size={22} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 900, color: '#2a2024' }}>Testar o lado do consumidor</h2>
            <p style={{ margin: '7px 0 0', fontSize: 14, fontWeight: 600, lineHeight: 1.55, color: '#5a4a4e' }}>
              Use uma conta Banzami Sandbox para pagar sessões, abrir links, usar QR e acompanhar
              transferências com dinheiro fictício. É a App Banzami real — o mesmo cliente que os seus
              utilizadores usarão.
            </p>
            <a
              href={APP_WEB_URL}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="open-app-banzami-web"
              style={{
                marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 9, padding: '11px 18px',
                borderRadius: 13, background: 'linear-gradient(160deg,#B5101F,#7C1016)', color: '#fff',
                fontSize: 14.5, fontWeight: 900, textDecoration: 'none',
              }}
            >
              Abrir App Banzami Web
              <IconArrowRight size={16} />
            </a>
            <p style={{ margin: '12px 0 0', fontSize: 12.5, fontWeight: 600, color: '#8a7a7e' }}>
              Abre num novo separador. O saldo e os pagamentos são fictícios; o Financial Live está indisponível.
            </p>
          </div>
        </div>
      </div>

      {/* Interactive vs deterministic — complementary, not the same thing */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 14 }}>
        <div style={card}>
          <span style={{ display: 'inline-grid', placeItems: 'center', width: 38, height: 38, borderRadius: 11, background: '#FFF1F0', color: '#B5101F' }}>
            <IconPhone size={19} />
          </span>
          <h3 style={{ margin: '12px 0 0', fontSize: 15, fontWeight: 900, color: '#2a2024' }}>App Banzami Web</h3>
          <p style={{ margin: '6px 0 0', fontSize: 13.5, fontWeight: 600, lineHeight: 1.5, color: '#6a5a5e' }}>
            O consumidor humano, interativo. Crie uma conta Sandbox e pague como um cliente real, à mão.
          </p>
        </div>
        <div style={card}>
          <span style={{ display: 'inline-grid', placeItems: 'center', width: 38, height: 38, borderRadius: 11, background: '#FFF1F0', color: '#B5101F' }}>
            <IconFlask size={19} />
          </span>
          <h3 style={{ margin: '12px 0 0', fontSize: 15, fontWeight: 900, color: '#2a2024' }}>Pagador de teste</h3>
          <p style={{ margin: '6px 0 0', fontSize: 13.5, fontWeight: 600, lineHeight: 1.5, color: '#6a5a5e' }}>
            Um teste determinístico de Sandbox, para cenários automatizados e repetíveis.{' '}
            <Link href="/dados-de-teste" style={{ color: '#B5101F', fontWeight: 800, textDecoration: 'none' }}>
              Criar pagador de teste →
            </Link>
          </p>
        </div>
      </div>

      {/* Truthful boundaries */}
      <div style={{ ...card, background: '#FBF9F9' }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#6a5a5e', lineHeight: 1.6 }}>
          A App Banzami Web opera em <b>Sandbox</b>: o dinheiro é fictício e o Financial Live está indisponível.
          A sua conta de <b>developer</b> (workspace, projeto, chaves) e a conta de <b>consumidor</b> (@banza,
          carteira) são identidades separadas — abrir a App não o autentica como consumidor.
        </p>
        <p style={{ margin: '10px 0 0', fontSize: 12.5, fontWeight: 600, color: '#8a7a7e', lineHeight: 1.55 }}>
          Prefere o <b>checkout hospedado</b>? Ao criar uma Payment Session ou Payment Link no{' '}
          <Link href="/explorer" style={{ color: '#B5101F', fontWeight: 800, textDecoration: 'none' }}>API Explorer</Link>{' '}
          tem <b>Testar na App Banzami Web</b> e <b>Abrir a página de pagamento</b> (pay.banzami.com) lado a lado.
        </p>
        <div style={{ marginTop: 12, display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12.5, fontWeight: 700 }}>
          <Link href="/docs/payments" style={{ color: '#B5101F', textDecoration: 'none' }}>Testar com a App Banzami Web →</Link>
          <span style={{ color: '#a59699' }}>Nativo (secundário): iPhone · TestFlight — Android · Google Play testing</span>
        </div>
      </div>
    </div>
  );
}
