'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { developerApi, type ApiRequestLog } from '@/lib/developer-api';
import { useDeveloperData } from './DeveloperData';
import { Card, Pill, type PillKind } from './ui';
import { IconSearch } from './icons';

// Real Developer API request logs.
//
// This screen previously showed webhook events and delivery attempts and said,
// honestly, that a per-request API log was not recorded. Showing something true
// is better than inventing rows, but it is not the feature: a developer looking
// for "Logs" wants the request THEY made — what they called, what came back, and
// the request_id they were told to quote in support.
//
// The operator now records exactly that (migration 0104), written by the gateway
// at the point a project credential authenticates. What it does not record is
// as deliberate as what it does: no Authorization header, no key, no webhook
// secret, no cookie, no body. The columns below are the whole record.

const mono = "'JetBrains Mono', ui-monospace, monospace";

function statusTone(status: number): PillKind {
  if (status >= 500) return 'error';
  if (status >= 400) return 'pending';
  return 'success';
}

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toISOString().replace('T', ' ').slice(0, 19) + 'Z';
}

type Window = '1h' | '24h' | '7d' | 'all';

// A gateway request_id is 32 hex characters (obs.newID). Matching on shape
// rather than on a prefix is what makes pasting one into the search box work;
// an earlier version looked for a `req_` prefix that the operator never emits,
// and silently searched the path instead — finding nothing, for a real id.
const isRequestId = (q: string) => /^[0-9a-f]{16,64}$/i.test(q);

const WINDOWS: { id: Window; label: string; hours: number | null }[] = [
  { id: '1h', label: '1 hora', hours: 1 },
  { id: '24h', label: '24 horas', hours: 24 },
  { id: '7d', label: '7 dias', hours: 24 * 7 },
  { id: 'all', label: 'Tudo', hours: null },
];

export function RequestLog() {
  const { activeProject } = useDeveloperData();
  const projectId = activeProject?.id ?? null;

  const [logs, setLogs] = useState<ApiRequestLog[]>([]);
  const [retentionDays, setRetentionDays] = useState<number | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = useState('');

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [win, setWin] = useState<Window>('24h');

  const load = useCallback(async () => {
    if (!projectId) return;
    setState('loading');
    setError('');
    const hours = WINDOWS.find((w) => w.id === win)?.hours ?? null;
    const q = query.trim();
    try {
      const res = await developerApi.listApiRequestLogs(projectId, {
        limit: 100,
        // A request_id is an exact lookup; anything else is a path filter. One
        // box does both because a developer pasting an id should not have to
        // know which field it is — and the id is 32 hex characters, not a
        // prefixed string, so the shape is what decides.
        ...(q ? (isRequestId(q) ? { request_id: q } : { path: q }) : {}),
        ...(status ? { status: Number(status) } : {}),
        ...(hours ? { since: new Date(Date.now() - hours * 3600_000).toISOString() } : {}),
      });
      setLogs(res.logs);
      setRetentionDays(res.retention_days ?? null);
      setState('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'erro desconhecido');
      setState('error');
    }
  }, [projectId, query, status, win]);

  useEffect(() => { void load(); }, [load]);

  const summary = useMemo(() => {
    const errors = logs.filter((l) => l.status >= 400).length;
    const measured = logs.filter((l) => typeof l.latency_ms === 'number');
    const p50 = measured.length
      ? [...measured].map((l) => l.latency_ms as number).sort((a, b) => a - b)[Math.floor(measured.length / 2)]
      : null;
    return { total: logs.length, errors, p50 };
  }, [logs]);

  const th = { padding: '13px 12px', fontSize: 11, fontWeight: 800 } as const;
  const td = { padding: '13px 12px', fontFamily: mono } as const;

  return (
    <>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 240 }}>
          <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#b8a4a6' }}>
            <IconSearch size={16} />
          </span>
          <input
            className="bz-in"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="request_id ou parte do caminho…"
            style={{
              width: '100%', padding: '11px 14px 11px 40px', border: '1.5px solid #EBDBD9',
              borderRadius: 12, fontSize: 13.5, fontWeight: 600, color: '#2a2024',
              background: '#fff', outline: 'none',
            }}
          />
        </div>
        <input
          className="bz-in"
          value={status}
          onChange={(e) => setStatus(e.target.value.replace(/\D/g, '').slice(0, 3))}
          placeholder="Estado"
          inputMode="numeric"
          style={{
            width: 96, padding: '11px 14px', border: '1.5px solid #EBDBD9', borderRadius: 12,
            fontSize: 13.5, fontWeight: 600, color: '#2a2024', background: '#fff', outline: 'none',
          }}
        />
        <div style={{ display: 'flex', gap: 4, background: '#fff', border: '1.5px solid #EBDBD9', borderRadius: 12, padding: 3 }}>
          {WINDOWS.map((w) => (
            <button
              key={w.id}
              onClick={() => setWin(w.id)}
              style={{
                padding: '8px 12px', border: 'none', borderRadius: 9, cursor: 'pointer',
                fontSize: 12.5, fontWeight: 800,
                background: win === w.id ? '#FBD2D0' : 'transparent',
                color: win === w.id ? '#B5101F' : '#8a7a7e',
              }}
            >
              {w.label}
            </button>
          ))}
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

      {state === 'error' && (
        <Card style={{ padding: 18, fontSize: 13.5, color: '#B5101F' }}>
          Não foi possível ler os registos: {error}
        </Card>
      )}

      {state === 'ready' && logs.length === 0 && (
        <Card style={{ padding: 18, fontSize: 13.5, color: '#8a7a7e' }}>
          Nenhum pedido corresponde a este filtro. Os pedidos aparecem aqui assim que uma chave deste projeto
          for usada contra a API.
        </Card>
      )}

      {state === 'ready' && logs.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: 18, marginBottom: 14, fontSize: 12.5, fontWeight: 700, color: '#8a7a7e' }}>
            <span>{summary.total} pedidos</span>
            <span>{summary.errors} com erro</span>
            {summary.p50 !== null && <span>latência mediana {summary.p50} ms</span>}
          </div>
          <Card style={{ overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 760 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: '#a89a9e' }}>
                    <th style={{ ...th, padding: '13px 22px' }}>DATA</th>
                    <th style={th}>MÉTODO</th>
                    <th style={th}>CAMINHO</th>
                    <th style={th}>ESTADO</th>
                    <th style={th}>LATÊNCIA</th>
                    <th style={{ ...th, padding: '13px 22px' }}>REQUEST ID</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l) => (
                    <tr key={l.id} className="bz-row" style={{ borderTop: '1px solid #F7EDEB' }}>
                      <td style={{ ...td, padding: '13px 22px', color: '#8a7a7e' }}>{when(l.created_at)}</td>
                      <td style={{ ...td, fontWeight: 700 }}>{l.method}</td>
                      <td style={{ ...td, color: '#2a2024' }} title={l.route || l.path}>{l.path}</td>
                      <td style={{ padding: '13px 12px' }}>
                        <Pill kind={statusTone(l.status)}>{l.status}</Pill>
                      </td>
                      <td style={{ ...td, color: '#8a7a7e' }}>
                        {typeof l.latency_ms === 'number' ? `${l.latency_ms} ms` : '—'}
                      </td>
                      <td style={{ ...td, padding: '13px 22px', color: '#8a7a7e' }}>{l.request_id || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {retentionDays !== null && (
        <p style={{ margin: '14px 0 0', fontSize: 12.5, color: '#a89a9e', fontWeight: 600 }}>
          Os registos de pedidos são guardados durante {retentionDays} dias. Um pedido mais antigo não aparece
          porque expirou, não porque se perdeu.
        </p>
      )}
    </>
  );
}
