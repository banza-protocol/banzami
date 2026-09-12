'use client';

import { useState } from 'react';
import { developerApi, type NewWebhookEndpoint } from '@/lib/developer-api';
import { useDeveloperData } from './DeveloperData';
import { Card } from './ui';

/**
 * Register a webhook endpoint, in the product.
 *
 * This is what the Console's empty state used to tell people to do with code:
 * "registe um com createWebhookEndpoint usando a chave do projecto". That made
 * receiving a first event a programming task, and pushed the signing secret
 * through a terminal instead of the reveal-once the Console already has.
 *
 * The event list is the platform's, not the frontend's invention — an event
 * offered here that nothing emits would sell a subscription that never
 * delivers, so the server refuses an unknown name and this list is pinned to
 * the server's by test.
 */

const mono = "'JetBrains Mono', ui-monospace, monospace";
const ctaGradient = 'linear-gradient(160deg,#B5101F,#7C1016)';

// What the operator emits, with what it means. Mirrors
// developer.SupportedWebhookEvents; webhook-events.test.ts pins the two together.
const EVENTS: Array<[string, string]> = [
  ['payment_session.paid',             'Uma sessão de pagamento foi paga. É o evento em que a integração canónica assenta.'],
  ['payment_session.created',          'Uma sessão de pagamento foi aberta.'],
  ['payment_link.paid',                'Um link de pagamento foi pago.'],
  ['payment.completed',                'Um pagamento concluiu.'],
  ['refund.completed',                 'Um reembolso concluiu.'],
  ['payout.sent',                      'Um payout foi enviado.'],
  ['application_settlement.completed', 'Uma liquidação para um beneficiário concluiu.'],
  ['application_settlement.failed',    'Uma liquidação falhou.'],
  ['application_settlement.cancelled', 'Uma liquidação foi cancelada.'],
];

const inputStyle = {
  width: '100%', padding: '11px 13px', borderRadius: 11, fontSize: 14, fontWeight: 600,
  background: '#FFFDFD', color: '#2A1E20', border: '1.5px solid #EBDBD9', outline: 'none',
} as const;

export function WebhookEndpointForm({ onCreated }: { onCreated: (ep: NewWebhookEndpoint) => void }) {
  const { activeProject, csrf, onApiError } = useDeveloperData();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<string[]>(['payment_session.paid']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const ready = !!activeProject && url.trim().length > 0 && events.length > 0 && !busy;

  async function create() {
    if (!ready || !activeProject) return;
    setBusy(true);
    setError('');
    try {
      const ep = await developerApi.createWebhookEndpoint(activeProject.id, url.trim(), events, csrf);
      setUrl('');
      setEvents(['payment_session.paid']);
      setOpen(false);
      onCreated(ep);
    } catch (e) {
      // The two refusals a developer can act on are distinguishable on purpose:
      // "your URL is not allowed" and "that event does not exist" are fixable at
      // the keyboard, and a generic 400 would send them hunting through JSON.
      setError(onApiError(e));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="bz-cta"
        style={{ padding: '11px 18px', border: 'none', borderRadius: 12, background: ctaGradient, color: '#fff', fontWeight: 800, fontSize: 13.5, cursor: 'pointer' }}
      >
        Registar endpoint
      </button>
    );
  }

  return (
    <Card style={{ padding: 22, marginBottom: 16 }}>
      <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 900 }}>Novo endpoint</h3>
      <p style={{ margin: '0 0 16px', fontSize: 13, lineHeight: 1.55, color: '#8a7a7e', fontWeight: 600 }}>
        O endereço tem de ser público e <strong>https</strong>. O Banzami assina cada entrega; verifique
        a assinatura com o segredo que aparece a seguir — é mostrado uma única vez.
      </p>
      {/* There is no route that changes either of these after the fact — the API
          accepts them on creation and nothing else edits them. Saying so here is
          cheaper than saying it once the endpoint is live and undeletable. */}
      <p style={{ margin: '0 0 16px', fontSize: 12.5, lineHeight: 1.55, color: '#8a7a7e', fontWeight: 600 }}>
        O endereço e os eventos ficam fixos: para os mudar, registe outro endpoint.
      </p>

      <label htmlFor="wh-url" style={{ display: 'block', fontSize: 12, fontWeight: 800, color: '#6a5a5e', marginBottom: 6 }}>
        Endereço
      </label>
      <input
        id="wh-url"
        value={url}
        onChange={(e) => { setUrl(e.target.value); if (error) setError(''); }}
        placeholder="https://a-sua-app.com/webhooks/banzami"
        style={{ ...inputStyle, fontFamily: mono, fontSize: 13, marginBottom: 16 }}
      />

      <p id="wh-events-label" style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 800, color: '#6a5a5e' }}>Eventos</p>
      <div role="group" aria-labelledby="wh-events-label" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(268px,1fr))', gap: 8, marginBottom: 16 }}>
        {EVENTS.map(([name, help]) => {
          const on = events.includes(name);
          return (
            <button
              key={name}
              type="button"
              role="switch"
              aria-checked={on}
              onClick={() => setEvents((prev) => (on ? prev.filter((x) => x !== name) : [...prev, name]))}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 9, textAlign: 'left',
                padding: '9px 11px', borderRadius: 11,
                border: `1.5px solid ${on ? '#B5101F' : '#EBDBD9'}`,
                background: on ? '#FFF1F0' : '#fff', cursor: 'pointer',
              }}
            >
              <span aria-hidden style={{
                flex: 'none', width: 16, height: 16, marginTop: 1, borderRadius: 5,
                border: `1.5px solid ${on ? '#B5101F' : '#D8C6C4'}`,
                background: on ? '#B5101F' : '#fff', color: '#fff',
                fontSize: 11, fontWeight: 900, lineHeight: '13px', textAlign: 'center',
              }}>{on ? '✓' : ''}</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontFamily: mono, fontSize: 11.5, fontWeight: 700, color: on ? '#B5101F' : '#6a5a5e', wordBreak: 'break-all' }}>{name}</span>
                <span style={{ display: 'block', marginTop: 2, fontSize: 11.5, fontWeight: 600, lineHeight: 1.4, color: '#9a8a8e' }}>{help}</span>
              </span>
            </button>
          );
        })}
      </div>

      {error ? <p role="alert" style={{ margin: '0 0 14px', fontSize: 12.5, fontWeight: 700, color: '#B5101F' }}>{error}</p> : null}

      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={() => void create()}
          disabled={!ready}
          className="bz-cta"
          style={{ padding: '11px 18px', border: 'none', borderRadius: 12, background: ready ? ctaGradient : '#E7D8D6', color: '#fff', fontWeight: 800, fontSize: 13.5, cursor: ready ? 'pointer' : 'default' }}
        >
          {busy ? 'A registar…' : 'Registar endpoint'}
        </button>
        <button
          onClick={() => { setOpen(false); setError(''); }}
          disabled={busy}
          style={{ padding: '11px 16px', borderRadius: 12, border: '1.5px solid #EBDBD9', background: '#fff', color: '#5a4a4e', fontSize: 13.5, fontWeight: 800, cursor: 'pointer' }}
        >
          Cancelar
        </button>
      </div>
    </Card>
  );
}

export { EVENTS as SUPPORTED_WEBHOOK_EVENTS };
