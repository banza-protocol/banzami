'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  developerApi,
  type WebhookEndpoint,
  type WebhookEvent,
  type WebhookDelivery,
} from '@/lib/developer-api';
import { useDeveloperData } from './DeveloperData';
import { Card, Pill, type PillKind } from './ui';
import { IconWebhook } from './icons';

// Real, project-scoped webhook history.
//
// This screen previously rendered invented endpoints for a fictional shop and
// invented deliveries for event names Banzami does not emit, behind an
// "illustrative data" label. A developer reading a delivery history in their own
// Console reasonably takes it for their own traffic, and debugs against numbers
// that describe nothing.
//
// Everything here is now the project's own: developer-api resolves the merchant
// from the project's binding and scopes every query by it. Nothing in the
// browser names a merchant, and no response carries a signing secret — the view
// types have no field for one.

const mono = "'JetBrains Mono', ui-monospace, monospace";

/** Map a delivery status to the Pill vocabulary, without inventing precision. */
function deliveryTone(status: string, code?: number | null): { kind: PillKind; label: string } {
  const s = status.toUpperCase();
  if (s === 'SUCCESS') return { kind: 'success', label: code ? `Entregue · ${code}` : 'Entregue' };
  if (s === 'FAILED')  return { kind: 'error',   label: code ? `Falhou · ${code}` : 'Falhou' };
  // PENDING covers "scheduled" and "retrying"; the attempt count beside it tells
  // the reader which, so the pill does not have to guess.
  return { kind: 'neutral', label: code ? `Pendente · ${code}` : 'Pendente' };
}

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toISOString().replace('T', ' ').slice(0, 19) + 'Z';
}

export function WebhooksManager() {
  const { activeProject } = useDeveloperData();
  const projectId = activeProject?.id ?? null;

  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([]);
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [deliveries, setDeliveries] = useState<Record<string, WebhookDelivery[]>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error' | 'unprovisioned'>('idle');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!projectId) return;
    setState('loading');
    setError('');
    try {
      const [{ endpoints: eps }, { events: evs }] = await Promise.all([
        developerApi.listWebhookEndpoints(projectId),
        developerApi.listWebhookEvents(projectId, 25),
      ]);
      setEndpoints(eps);
      setEvents(evs);
      setState('ready');
    } catch (e) {
      // A project with no financial binding is refused rather than shown an
      // empty list — an empty list would assert the question was meaningful and
      // the answer was "none".
      const code = (e as { code?: string })?.code;
      if (code === 'NOT_FOUND') { setState('unprovisioned'); return; }
      setError((e as { message?: string })?.message ?? 'Não foi possível carregar.');
      setState('error');
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  const toggle = useCallback(async (eventId: string) => {
    if (open === eventId) { setOpen(null); return; }
    setOpen(eventId);
    if (deliveries[eventId] || !projectId) return;
    try {
      const { deliveries: ds } = await developerApi.listWebhookDeliveries(projectId, eventId);
      setDeliveries((prev) => ({ ...prev, [eventId]: ds }));
    } catch {
      setDeliveries((prev) => ({ ...prev, [eventId]: [] }));
    }
  }, [open, deliveries, projectId]);

  if (!projectId) {
    return (
      <Card style={{ padding: '40px 30px', textAlign: 'center' }}>
        <p style={{ margin: 0, fontSize: 14, color: '#8a7a7e', fontWeight: 600 }}>
          Escolha um projecto para ver os seus webhooks.
        </p>
      </Card>
    );
  }

  if (state === 'unprovisioned') {
    return (
      <Card style={{ padding: '40px 30px', textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: '#FFF1F0', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, color: '#B5101F' }}>
          <IconWebhook size={26} />
        </div>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>Projecto ainda sem titular financeiro</h3>
        <p style={{ margin: '10px auto 0', maxWidth: 420, fontSize: 14, lineHeight: 1.55, color: '#8a7a7e', fontWeight: 600 }}>
          Os webhooks pertencem ao titular que o binding do projecto define. Enquanto
          o projecto não estiver provisionado, não há eventos para mostrar.
        </p>
      </Card>
    );
  }

  return (
    <>
      <Card style={{ overflow: 'hidden', marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 22px', borderBottom: '1px solid #F5E9E7' }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 900 }}>Endpoints</h3>
          <span style={{ fontSize: 12, color: '#a89a9e', fontWeight: 700 }}>
            {state === 'loading' ? 'A carregar…' : `${endpoints.length}`}
          </span>
        </div>
        {endpoints.length === 0 && state === 'ready' ? (
          <div style={{ padding: '28px 22px', textAlign: 'center' }}>
            <p style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 800 }}>Ainda não há endpoints</p>
            <p style={{ margin: 0, fontSize: 13, color: '#8a7a7e', fontWeight: 600 }}>
              Registe um com <code style={{ fontFamily: mono }}>createWebhookEndpoint</code> usando a chave do projecto.
            </p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#a89a9e' }}>
                <th style={{ padding: '13px 22px', fontSize: 11, fontWeight: 800 }}>ENDPOINT</th>
                <th style={{ padding: '13px 12px', fontSize: 11, fontWeight: 800 }}>SUBSCRIÇÕES</th>
                <th style={{ padding: '13px 12px', fontSize: 11, fontWeight: 800 }}>ESTADO</th>
                <th style={{ padding: '13px 22px', fontSize: 11, fontWeight: 800 }}>CRIADO</th>
              </tr>
            </thead>
            <tbody>
              {endpoints.map((e) => (
                <tr key={e.id} className="bz-row" style={{ borderTop: '1px solid #F5E9E7' }}>
                  <td style={{ padding: '15px 22px', fontFamily: mono, fontWeight: 600, color: '#2a2024', wordBreak: 'break-all' }}>{e.url}</td>
                  <td style={{ padding: '15px 12px', fontFamily: mono, fontSize: 11.5, color: '#8a7a7e' }}>
                    {e.events.join(', ') || '—'}
                  </td>
                  <td style={{ padding: '15px 12px' }}>
                    <Pill kind={e.active ? 'success' : 'neutral'} dot>{e.active ? 'Ativo' : 'Inativo'}</Pill>
                  </td>
                  <td style={{ padding: '15px 22px', color: '#a89a9e', fontWeight: 700 }}>{when(e.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card style={{ overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 22px', borderBottom: '1px solid #F5E9E7' }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 900 }}>Eventos e entregas</h3>
          <button
            onClick={() => void load()}
            style={{ border: 'none', background: 'none', fontSize: 12.5, fontWeight: 800, color: '#B5101F', cursor: 'pointer' }}
          >
            Actualizar
          </button>
        </div>
        {events.length === 0 && state === 'ready' ? (
          <div style={{ padding: '28px 22px', textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 13.5, color: '#8a7a7e', fontWeight: 600 }}>
              Ainda não há eventos para este projecto.
            </p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            {/* The events list had no header row: every cell is inside one
                expanding button, so it read as a wall of ids to anything not
                looking at it. The columns are named here and the header is
                hidden visually rather than removed, because the layout is a
                disclosure row and a printed header would be noise. */}
            <thead className="bz-sr-only">
              <tr>
                <th scope="col">Tipo de evento</th>
                <th scope="col">ID do evento</th>
                <th scope="col">Data</th>
                <th scope="col">Entregas</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => {
                const ds = deliveries[ev.id];
                return (
                  <tr key={ev.id} className="bz-row" style={{ borderTop: '1px solid #F7EDEB' }}>
                    <td style={{ padding: 0 }} colSpan={4}>
                      <button
                        onClick={() => void toggle(ev.id)}
                        style={{ display: 'flex', width: '100%', gap: 12, alignItems: 'center', padding: '13px 22px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}
                        aria-expanded={open === ev.id}
                      >
                        <span style={{ fontFamily: mono, fontWeight: 700, flex: '0 0 220px' }}>{ev.event_type}</span>
                        <span style={{ fontFamily: mono, fontSize: 11, color: '#a89a9e', flex: 1 }}>{ev.id}</span>
                        <span style={{ color: '#a89a9e', fontWeight: 700, fontSize: 12 }}>{when(ev.created_at)}</span>
                        <span aria-hidden style={{ color: '#B5101F', fontWeight: 900 }}>{open === ev.id ? '−' : '+'}</span>
                      </button>
                      {open === ev.id && (
                        <div style={{ padding: '0 22px 14px 22px' }}>
                          {ds === undefined ? (
                            <p style={{ margin: 0, fontSize: 12.5, color: '#a89a9e' }}>A carregar entregas…</p>
                          ) : ds.length === 0 ? (
                            <p style={{ margin: 0, fontSize: 12.5, color: '#a89a9e' }}>Sem entregas registadas.</p>
                          ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                              <thead>
                                <tr style={{ textAlign: 'left', color: '#a89a9e' }}>
                                  <th style={{ padding: '6px 0', fontSize: 10.5, fontWeight: 800 }}>ESTADO</th>
                                  <th style={{ padding: '6px 0', fontSize: 10.5, fontWeight: 800 }}>TENTATIVAS</th>
                                  <th style={{ padding: '6px 0', fontSize: 10.5, fontWeight: 800 }}>ENTREGUE</th>
                                </tr>
                              </thead>
                              <tbody>
                                {ds.map((d) => {
                                  const tone = deliveryTone(d.status, d.status_code);
                                  return (
                                    <tr key={d.id}>
                                      <td style={{ padding: '6px 0' }}><Pill kind={tone.kind}>{tone.label}</Pill></td>
                                      <td style={{ padding: '6px 0', fontWeight: 800 }}>{d.attempt_count}</td>
                                      <td style={{ padding: '6px 0', color: '#a89a9e', fontWeight: 700 }}>
                                        {d.delivered_at ? when(d.delivered_at) : '—'}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {state === 'error' && (
        <p style={{ marginTop: 12, fontSize: 13, color: '#B5101F', fontWeight: 700 }}>{error}</p>
      )}
    </>
  );
}
