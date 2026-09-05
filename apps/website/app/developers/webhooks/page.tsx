'use client';

import { PortalPage } from '@/components/developers/portal/PortalShell';
import { WebhooksManager } from '@/components/developers/portal/WebhooksManager';

// Webhooks — dossier ecrã 7.
//
// This screen used to render three invented endpoints for a fictional shop with
// delivery counts and success rates, plus three invented deliveries for event
// names Banzami does not emit. A developer reading a delivery history in their
// own Console reasonably takes it for their own traffic.
//
// It now shows the project's real endpoints, events and delivery attempts,
// scoped by the merchant the project's binding names. Nothing in the browser
// names a merchant, and no response carries a signing secret.
//
// (The removed strings are asserted absent in illustrative-data.test.ts, so they
// are deliberately not repeated here.)

export default function WebhooksPage() {
  return (
    <PortalPage active="webhooks">
      <div className="bz-view">
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, letterSpacing: '-.02em' }}>Webhooks</h1>
          <p style={{ margin: '6px 0 0', fontSize: 14.5, color: '#8a7a7e', fontWeight: 600 }}>
            Os endpoints, eventos e entregas reais do seu projecto.
          </p>
        </div>
        <WebhooksManager />
      </div>
    </PortalPage>
  );
}
