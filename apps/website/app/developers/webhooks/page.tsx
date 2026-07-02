'use client';

import { PortalPage } from '@/components/developers/portal/PortalShell';
import { Card, Pill, type PillKind } from '@/components/developers/portal/ui';
import { IconPlus, IconWebhook } from '@/components/developers/portal/icons';

// Webhooks — dossier ecrã 7. Endpoints table + recent deliveries. The empty
// state (rendered when `endpoints` is empty) is prepared for the no-endpoint case.

const ctaGradient = 'linear-gradient(160deg,#B5101F,#7C1016)';
const mono = "'JetBrains Mono', ui-monospace, monospace";

type Endpoint = { url: string; events: number; active: boolean; deliveries: string; rate?: string; last: string };
const ENDPOINTS: Endpoint[] = [
  { url: 'https://minhaloja.co.ao/webhook', events: 5, active: true, deliveries: '124', rate: '100%', last: 'há 2 min' },
  { url: 'https://api.minhaloja.co.ao/hook', events: 3, active: true, deliveries: '86', rate: '98.8%', last: 'há 6 min' },
  { url: 'https://backup.minhaloja.co.ao/hook', events: 5, active: false, deliveries: '0', last: '—' },
];

type Delivery = { event: string; url: string; state: PillKind; label: string; time: string };
const DELIVERIES: Delivery[] = [
  { event: 'invoice.paid', url: 'https://minhaloja.co.ao/webhook', state: 'success', label: 'Entregue', time: 'há 2 min' },
  { event: 'transfer.created', url: 'https://minhaloja.co.ao/webhook', state: 'success', label: 'Entregue', time: 'há 12 min' },
  { event: 'payment.failed', url: 'https://api.minhaloja.co.ao/hook', state: 'error', label: 'Falhou · retry', time: 'há 18 min' },
];

const addBtn = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  padding: '11px 18px',
  border: 'none',
  borderRadius: 12,
  background: ctaGradient,
  color: '#fff',
  fontWeight: 800,
  fontSize: 13.5,
  cursor: 'pointer',
  boxShadow: '0 12px 24px -12px rgba(181,16,31,.5)',
} as const;

export default function WebhooksPage() {
  return (
    <PortalPage active="webhooks">
      <div className="bz-view">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, letterSpacing: '-.02em' }}>Webhooks</h1>
            <p style={{ margin: '6px 0 0', fontSize: 14.5, color: '#8a7a7e', fontWeight: 600 }}>
              Receba notificações em tempo real sobre eventos.
            </p>
          </div>
          <button className="bz-cta" style={addBtn}>
            <IconPlus size={15} />
            Adicionar endpoint
          </button>
        </div>

        {ENDPOINTS.length === 0 ? (
          <Card style={{ padding: '48px 30px', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: '#FFF1F0', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, color: '#B5101F' }}>
              <IconWebhook size={26} />
            </div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>Ainda não há endpoints</h3>
            <p style={{ margin: '10px auto 20px', maxWidth: 380, fontSize: 14, lineHeight: 1.55, color: '#8a7a7e', fontWeight: 600 }}>
              Adicione o seu primeiro endpoint para receber eventos em tempo real.
            </p>
            <button className="bz-cta" style={addBtn}>
              <IconPlus size={15} />
              Adicionar endpoint
            </button>
          </Card>
        ) : (
          <>
            <Card style={{ overflow: 'hidden', marginBottom: 18 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: '#a89a9e' }}>
                    <th style={{ padding: '13px 22px', fontSize: 11, fontWeight: 800 }}>ENDPOINT</th>
                    <th style={{ padding: '13px 12px', fontSize: 11, fontWeight: 800 }}>EVENTOS</th>
                    <th style={{ padding: '13px 12px', fontSize: 11, fontWeight: 800 }}>STATUS</th>
                    <th style={{ padding: '13px 12px', fontSize: 11, fontWeight: 800 }}>ENTREGAS 24H</th>
                    <th style={{ padding: '13px 22px', fontSize: 11, fontWeight: 800 }}>ÚLTIMA ENTREGA</th>
                  </tr>
                </thead>
                <tbody>
                  {ENDPOINTS.map((e) => (
                    <tr key={e.url} className="bz-row" style={{ borderTop: '1px solid #F5E9E7' }}>
                      <td style={{ padding: '15px 22px', fontFamily: mono, fontWeight: 600, color: '#2a2024' }}>{e.url}</td>
                      <td style={{ padding: '15px 12px' }}>
                        <span style={{ fontWeight: 800 }}>{e.events}</span> <span style={{ color: '#a89a9e', fontWeight: 700 }}>eventos</span>
                      </td>
                      <td style={{ padding: '15px 12px' }}>
                        <Pill kind={e.active ? 'success' : 'neutral'} dot>
                          {e.active ? 'Ativo' : 'Inativo'}
                        </Pill>
                      </td>
                      <td style={{ padding: '15px 12px', fontWeight: 800 }}>
                        {e.deliveries}
                        {e.rate ? <span style={{ color: '#1F8A5B', fontWeight: 800, fontSize: 11.5 }}> {e.rate}</span> : null}
                      </td>
                      <td style={{ padding: '15px 22px', color: '#a89a9e', fontWeight: 700 }}>{e.last}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            <Card style={{ overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 22px', borderBottom: '1px solid #F5E9E7' }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 900 }}>Entregas recentes</h3>
                <a href="/logs" style={{ fontSize: 12.5, fontWeight: 800, color: '#B5101F', textDecoration: 'none' }}>
                  Ver todos os eventos →
                </a>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <tbody>
                  {DELIVERIES.map((d, i) => (
                    <tr key={i} className="bz-row" style={{ borderTop: '1px solid #F7EDEB' }}>
                      <td style={{ padding: '13px 22px', fontFamily: mono, fontWeight: 600 }}>{d.event}</td>
                      <td style={{ padding: '13px 12px', fontFamily: mono, color: '#8a7a7e' }}>{d.url}</td>
                      <td style={{ padding: '13px 12px' }}>
                        <Pill kind={d.state}>{d.label}</Pill>
                      </td>
                      <td style={{ padding: '13px 22px', color: '#a89a9e', fontWeight: 700 }}>{d.time}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </>
        )}
      </div>
    </PortalPage>
  );
}
