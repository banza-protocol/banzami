'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { developerApi, type WebhookEvent, type WebhookDelivery } from '@/lib/developer-api';
import { useDeveloperData } from './DeveloperData';
import { Card, Pill, type PillKind } from './ui';
import { IconSearch } from './icons';

// Real, project-scoped activity.
//
// This screen used to render a table of invented rows — event names Banzami
// does not emit, references to a shop that does not exist — behind an
// "illustrative data" label. A developer debugging an integration reasonably
// reads their own Console as their own traffic; a plausible fake is worse than
// an empty table, because an empty table is true.
//
// What is shown now is what the operator actually records for the project: the
// events it emitted, and for each one every delivery attempt with the status
// code the receiver answered and how many attempts it took. developer-api
// resolves the merchant from the project binding, so nothing in the browser
// names one.
//
// A per-HTTP-request API log used to be absent here, and the page said so. It is
// no longer absent: the gateway records one (migration 0104) and it has its own
// tab, RequestLog. This component stays what it always was — the webhook side —
// rather than growing to cover both.

const mono = "'JetBrains Mono', ui-monospace, monospace";

function deliveryTone(status: string, code?: number | null): { kind: PillKind; label: string } {
  const s = status.toUpperCase();
  if (s === 'SUCCESS') return { kind: 'success', label: code ? `Entregue · ${code}` : 'Entregue' };
  if (s === 'FAILED') return { kind: 'error', label: code ? `Falhou · ${code}` : 'Falhou' };
  return { kind: 'neutral', label: code ? `Pendente · ${code}` : 'Pendente' };
}

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toISOString().replace('T', ' ').slice(0, 19) + 'Z';
}

type Row = { event: WebhookEvent; deliveries: WebhookDelivery[] };

export function ActivityLog() {
  const { activeProject } = useDeveloperData();
  const projectId = activeProject?.id ?? null;

  const [rows, setRows] = useState<Row[]>([]);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error' | 'unprovisioned'>('idle');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    if (!projectId) return;
    setState('loading');
    setError('');
    try {
      const { events } = await developerApi.listWebhookEvents(projectId, 50);
      // Deliveries are fetched per event rather than in one call because that is
      // the shape the API exposes; the list is capped above, so this is bounded.
      const withDeliveries = await Promise.all(
        events.map(async (event) => {
          try {
            const { deliveries } = await developerApi.listWebhookDeliveries(projectId, event.id);
            return { event, deliveries };
          } catch {
            // One unreadable event must not blank the whole history.
            return { event, deliveries: [] };
          }
        }),
      );
      setRows(withDeliveries);
      setState('ready');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'erro desconhecido';
      // A project with no Banzami binding has no events at all — that is a
      // provisioning state, not a failure, and it reads differently.
      if (/not provisioned|PAYMENTS_UNAVAILABLE|403/.test(msg)) setState('unprovisioned');
      else { setError(msg); setState('error'); }
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(({ event, deliveries }) =>
      event.id.toLowerCase().includes(q)
      || event.event_type.toLowerCase().includes(q)
      || deliveries.some((d) => d.id.toLowerCase().includes(q) || String(d.status_code ?? '').includes(q)));
  }, [rows, query]);

  const th = { padding: '13px 12px', fontSize: 11, fontWeight: 800 } as const;

  return (
    <>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#b8a4a6' }}>
            <IconSearch size={16} />
          </span>
          <input
            className="bz-in"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrar por id de evento, tipo ou código de resposta…"
            style={{
              width: '100%', padding: '11px 14px 11px 40px', border: '1.5px solid #EBDBD9',
              borderRadius: 12, fontSize: 13.5, fontWeight: 600, color: '#2a2024',
              background: '#fff', outline: 'none',
            }}
          />
        </div>
        <button
          className="bz-ghost"
          onClick={() => void load()}
          style={{
            padding: '11px 16px', border: '1.5px solid #EBDBD9', borderRadius: 12,
            background: '#fff', fontSize: 13.5, fontWeight: 800, color: '#B5101F', cursor: 'pointer',
          }}
        >
          Actualizar
        </button>
      </div>

      {state === 'loading' && <Card style={{ padding: 18, fontSize: 13.5, color: '#8a7a7e' }}>A carregar…</Card>}

      {state === 'unprovisioned' && (
        <Card style={{ padding: 18, fontSize: 13.5, color: '#8a7a7e' }}>
          Este projeto ainda não está ligado a uma conta Banzami, por isso não emite eventos.
        </Card>
      )}

      {state === 'error' && (
        <Card style={{ padding: 18, fontSize: 13.5, color: '#B5101F' }}>
          Não foi possível ler a actividade: {error}
        </Card>
      )}

      {state === 'ready' && filtered.length === 0 && (
        <Card style={{ padding: 18, fontSize: 13.5, color: '#8a7a7e' }}>
          {rows.length === 0
            ? 'Ainda não há eventos neste projeto. Assim que uma cobrança for paga, aparece aqui.'
            : 'Nenhum evento corresponde ao filtro.'}
        </Card>
      )}

      {state === 'ready' && filtered.length > 0 && (
        <Card style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 640 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#a89a9e' }}>
                  <th style={{ ...th, padding: '13px 22px' }}>EVENT ID</th>
                  <th style={th}>EVENTO</th>
                  <th style={th}>ENTREGA</th>
                  <th style={th}>TENTATIVAS</th>
                  <th style={{ ...th, padding: '13px 22px' }}>DATA</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(({ event, deliveries }) => {
                  // The newest attempt is the one that describes the event's
                  // current fate; the attempt count carries the rest.
                  const last = deliveries[0];
                  const tone = last ? deliveryTone(last.status, last.status_code) : null;
                  return (
                    <tr key={event.id} className="bz-row" style={{ borderTop: '1px solid #F7EDEB' }}>
                      <td style={{ padding: '13px 22px', fontFamily: mono, color: '#8a7a7e' }}>{event.id}</td>
                      <td style={{ padding: '13px 12px', fontFamily: mono, fontWeight: 600 }}>{event.event_type}</td>
                      <td style={{ padding: '13px 12px' }}>
                        {tone ? <Pill kind={tone.kind}>{tone.label}</Pill> : <Pill kind="neutral">Sem endpoint</Pill>}
                      </td>
                      <td style={{ padding: '13px 12px', fontFamily: mono, color: '#8a7a7e' }}>
                        {last ? last.attempt_count : '—'}
                      </td>
                      <td style={{ padding: '13px 22px', fontFamily: mono, color: '#8a7a7e' }}>{when(event.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
