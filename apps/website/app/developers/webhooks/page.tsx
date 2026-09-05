'use client';

import { PortalPage } from '@/components/developers/portal/PortalShell';
import { Card } from '@/components/developers/portal/ui';
import { IconWebhook } from '@/components/developers/portal/icons';

// Webhooks — dossier ecrã 7.
//
// This screen used to render three invented endpoints for a fictional shop,
// with delivery counts and success rates, plus three invented deliveries for
// event names Banzami does not even emit. A developer reading a delivery history
// here would reasonably believe it was their own traffic and debug against
// numbers describing nothing. A label saying "illustrative" helped, but the
// honest fix is to stop inventing.
//
// (The removed strings are asserted absent in illustrative-data.test.ts, so they
// are deliberately not repeated here.)
//
// It is not wired to live data yet: showing a project's real deliveries needs
// the Console's session-authenticated backend to reach gateway data on the
// project's behalf, which is a new internal authority path and deserves its own
// decision rather than arriving as UI work (ADR-051).
//
// What IS real, and what this page now points at, is the API: endpoint
// registration, listing, delivery history and secret rotation all work with a
// project key today.

const mono = "'JetBrains Mono', ui-monospace, monospace";
const ctaGradient = 'linear-gradient(160deg,#B5101F,#7C1016)';

const SNIPPET = `import { BanzamiClient } from '@banzami/sdk';
const banzami = new BanzamiClient({ apiKey: process.env.BANZAMI_API_KEY });

// Registar. O segredo vem UMA vez — guarde-o já.
const ep = await banzami.createWebhookEndpoint({
  url:    'https://o-seu-servidor.com/webhooks/banzami',
  events: ['payment_session.paid'],
});

// Ver entregas
const { data: eventos }  = await banzami.listWebhookEvents(20);
const { data: entregas } = await banzami.listWebhookDeliveries(eventos[0].id);

// Rodar o segredo (actualize o receptor primeiro)
const novo = await banzami.rotateWebhookEndpointSecret(ep.id);`;

export default function WebhooksPage() {
  return (
    <PortalPage active="webhooks">
      <div className="bz-view">
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, letterSpacing: '-.02em' }}>Webhooks</h1>
          <p style={{ margin: '6px 0 0', fontSize: 14.5, color: '#8a7a7e', fontWeight: 600 }}>
            Receba notificações em tempo real sobre eventos.
          </p>
        </div>

        <Card style={{ padding: '40px 30px', textAlign: 'center', marginBottom: 18 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: '#FFF1F0', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, color: '#B5101F' }}>
            <IconWebhook size={26} />
          </div>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>Ainda não há vista de endpoints aqui</h3>
          <p style={{ margin: '10px auto 4px', maxWidth: 460, fontSize: 14, lineHeight: 1.6, color: '#8a7a7e', fontWeight: 600 }}>
            Esta consola ainda não mostra os seus endpoints e entregas reais. Preferimos
            deixá-la vazia a preenchê-la com exemplos — uma lista de entregas inventada
            lê-se como tráfego seu.
          </p>
          <p style={{ margin: '0 auto 20px', maxWidth: 460, fontSize: 14, lineHeight: 1.6, color: '#8a7a7e', fontWeight: 600 }}>
            A API já faz tudo isto com a chave do seu projeto: registar, listar, ver
            entregas e rodar o segredo.
          </p>
          <a
            href="/docs/guias#gerir-endpoint"
            className="bz-cta"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '11px 18px', borderRadius: 12, background: ctaGradient, color: '#fff', fontWeight: 800, fontSize: 13.5, textDecoration: 'none', boxShadow: '0 12px 24px -12px rgba(181,16,31,.5)' }}
          >
            Ver o guia de webhooks
          </a>
        </Card>

        <Card style={{ overflow: 'hidden' }}>
          <div style={{ padding: '16px 22px', borderBottom: '1px solid #F5E9E7' }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 900 }}>Gerir com o SDK</h3>
          </div>
          <pre style={{ margin: 0, padding: '18px 22px', fontFamily: mono, fontSize: 12.5, lineHeight: 1.65, color: '#2a2024', overflowX: 'auto', background: '#FFFBFA' }}>
            {SNIPPET}
          </pre>
        </Card>
      </div>
    </PortalPage>
  );
}
