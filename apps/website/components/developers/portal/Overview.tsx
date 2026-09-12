'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, Pill, type PillKind } from '@/components/developers/portal/ui';
import { useDeveloperData } from '@/components/developers/portal/DeveloperData';
import {
  developerApi,
  type ApiRequestLog,
  type ApiRequestSummary,
  type WebhookEvent,
} from '@/lib/developer-api';
import {
  IconChart, IconCheck, IconCode, IconFlask, IconSwap, IconWebhookNodes,
} from '@/components/developers/portal/icons';

// Visão geral — this project's real activity.
//
// This page used to render invented numbers behind an "illustrative data"
// label: 1.482 transações, 12.450.000 AOA of volume, 128 comerciantes, and an
// activity table of event names Banzami does not emit against references that
// never existed. The label was honest and the page was still the first thing a
// developer saw, and what they saw was fiction.
//
// Every figure below now comes from what the operator actually recorded for the
// active project: the API request log (ADR-054) and the project's own webhook
// events. Where there is nothing to show, the page says so — an empty state is
// true, and a plausible fake is not.

const ctaGradient = 'linear-gradient(160deg,#B5101F,#7C1016)';
const mono = "'JetBrains Mono', ui-monospace, monospace";
const th = { padding: '10px 12px', fontSize: 11, fontWeight: 800, letterSpacing: '.04em' } as const;

const nf = new Intl.NumberFormat('pt-PT');
const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toISOString().replace('T', ' ').slice(5, 16) + 'Z';
};

type Kpi = { label: string; value: string; note: string; icon: React.ReactNode; tile: string; iconColor: string };

export function Overview() {
  const { activeProject } = useDeveloperData();
  const projectId = activeProject?.id ?? null;

  const [summary, setSummary] = useState<ApiRequestSummary | null>(null);
  const [logs, setLogs] = useState<ApiRequestLog[]>([]);
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [keyCount, setKeyCount] = useState<number | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!projectId) return;
    setState('loading');
    setError('');
    const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
    try {
      const res = await developerApi.listApiRequestLogs(projectId, { limit: 10, since });
      setSummary(res.summary);
      setLogs(res.logs);
      // Neither of these is essential to the page; a project with no Banzami
      // binding has no events at all, and that is a provisioning state rather
      // than a failure.
      try {
        const ev = await developerApi.listWebhookEvents(projectId, 50);
        setEvents(ev.events);
      } catch { setEvents([]); }
      try {
        const ks = await developerApi.listKeys(projectId);
        setKeyCount(ks.keys.filter((k) => k.status === 'ACTIVE').length);
      } catch { setKeyCount(null); }
      setState('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'erro desconhecido');
      setState('error');
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  const kpis: Kpi[] = useMemo(() => {
    const req = summary?.requests ?? 0;
    const err = summary?.errors ?? 0;
    const ok = req - err;
    const rate = req > 0 ? `${((ok / req) * 100).toFixed(1)}%` : '—';
    const med = typeof summary?.median_latency_ms === 'number' ? `${summary.median_latency_ms} ms` : '—';
    return [
      { label: 'Pedidos à API', value: nf.format(req), note: 'últimos 7 dias', icon: <IconCode size={16} />, tile: '#FFF1F0', iconColor: '#B5101F' },
      { label: 'Com erro', value: nf.format(err), note: req ? `${((err / req) * 100).toFixed(1)}% dos pedidos` : 'sem pedidos', icon: <IconSwap size={16} />, tile: '#FFF1F0', iconColor: '#B5101F' },
      { label: 'Taxa de sucesso', value: rate, note: req ? `${nf.format(ok)} de ${nf.format(req)}` : 'sem pedidos', icon: <IconCheck size={16} />, tile: '#EAF7F0', iconColor: '#1F8A5B' },
      { label: 'Latência mediana', value: med, note: 'últimos 7 dias', icon: <IconChart size={16} />, tile: '#FFF1F0', iconColor: '#B5101F' },
      { label: 'Eventos emitidos', value: nf.format(events.length), note: 'mais recentes', icon: <IconWebhookNodes size={16} />, tile: '#FFF1F0', iconColor: '#B5101F' },
      { label: 'Chaves activas', value: keyCount === null ? '—' : nf.format(keyCount), note: 'neste projeto', icon: <IconFlask size={16} />, tile: '#FFF1F0', iconColor: '#B5101F' },
    ];
  }, [summary, events, keyCount]);

  // One bar per day of the window, including days with no traffic — a chart
  // that silently drops empty days overstates how busy a quiet project is.
  const bars = useMemo(() => {
    const counts = new Map((summary?.by_day ?? []).map((d) => [d.day, d.count]));
    const days: { day: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 3600_000).toISOString().slice(0, 10);
      days.push({ day: d, count: counts.get(d) ?? 0 });
    }
    const max = Math.max(1, ...days.map((d) => d.count));
    return days.map((d) => ({ ...d, pct: Math.round((d.count / max) * 100) }));
  }, [summary]);

  const statusMix = useMemo(() => {
    const req = summary?.requests ?? 0;
    const err = summary?.errors ?? 0;
    return { ok: req - err, err, total: req, pct: req ? ((req - err) / req) * 100 : 0 };
  }, [summary]);

  const tone = (status: number): PillKind => (status >= 500 ? 'error' : status >= 400 ? 'pending' : 'success');

  return (
    <div className="bz-view">
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, letterSpacing: '-.02em' }}>Visão geral</h1>
        <p style={{ margin: '6px 0 20px', fontSize: 14.5, color: '#8a7a7e', fontWeight: 600 }}>
          Actividade real do projeto {activeProject?.name ? `“${activeProject.name}”` : ''} em Sandbox — últimos 7 dias.
        </p>

        {state === 'loading' && <Card style={{ padding: 18, fontSize: 13.5, color: '#8a7a7e' }}>A carregar…</Card>}
        {state === 'error' && (
          <Card style={{ padding: 18, fontSize: 13.5, color: '#B5101F' }}>
            Não foi possível ler a actividade do projeto: {error}
          </Card>
        )}

        {state === 'ready' && (
          <>
            <div className="bz-kpi" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 16 }}>
              {kpis.map((k) => (
                <Card key={k.label} style={{ padding: '18px 20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12.5, fontWeight: 800, color: '#8a7a7e' }}>{k.label}</span>
                    <span style={{ width: 30, height: 30, borderRadius: 9, background: k.tile, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: k.iconColor }}>
                      {k.icon}
                    </span>
                  </div>
                  <p style={{ margin: '12px 0 0', fontSize: 28, fontWeight: 900, letterSpacing: '-.02em' }}>{k.value}</p>
                  <p style={{ margin: '4px 0 0', fontSize: 12, fontWeight: 700, color: '#a89a9e' }}>{k.note}</p>
                </Card>
              ))}
            </div>

            <div className="bz-2rail" style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
                <Card style={{ padding: 22 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>Pedidos por dia</h3>
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#a89a9e' }}>Últimos 7 dias</span>
                  </div>
                  {statusMix.total === 0 ? (
                    <p style={{ margin: 0, fontSize: 13.5, color: '#8a7a7e', fontWeight: 600 }}>
                      Ainda não há pedidos à API neste projeto. Assim que usar uma chave, aparecem aqui.
                    </p>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 170 }}>
                        {bars.map((b) => (
                          <div key={b.day} title={`${b.day}: ${b.count}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
                            <span
                              className="bz-bar"
                              style={{
                                display: 'block',
                                height: `${Math.max(b.pct, b.count > 0 ? 4 : 1)}%`,
                                background: b.count > 0
                                  ? 'linear-gradient(180deg,#B5101F,#7C1016)'
                                  : 'linear-gradient(180deg,#F3E6E4,#EEDCDA)',
                                borderRadius: '7px 7px 3px 3px',
                              }}
                            />
                          </div>
                        ))}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 10.5, fontWeight: 700, color: '#b8a4a6' }}>
                        {bars.map((b, i) => <span key={b.day}>{i === bars.length - 1 ? 'Hoje' : b.day.slice(8)}</span>)}
                      </div>
                    </>
                  )}
                </Card>

                <Card style={{ overflow: 'hidden' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 22px', borderBottom: '1px solid #F5E9E7' }}>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>Actividade recente</h3>
                    {/* minHeight/inline-flex so the link is a 24px target, not
                        just as tall as its own text. */}
                    <Link href="/logs" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 24, padding: '0 2px', fontSize: 12.5, fontWeight: 800, color: '#B5101F', textDecoration: 'none' }}>
                      Ver registos →
                    </Link>
                  </div>
                  {logs.length === 0 ? (
                    <p style={{ margin: 0, padding: '18px 22px', fontSize: 13.5, color: '#8a7a7e', fontWeight: 600 }}>
                      Sem pedidos recentes neste projeto.
                    </p>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 620 }}>
                        <thead>
                          <tr style={{ textAlign: 'left', color: '#a89a9e' }}>
                            <th style={{ ...th, padding: '10px 22px' }}>MÉTODO</th>
                            <th style={th}>CAMINHO</th>
                            <th style={th}>ESTADO</th>
                            <th style={th}>LATÊNCIA</th>
                            <th style={{ ...th, padding: '10px 22px' }}>DATA</th>
                          </tr>
                        </thead>
                        <tbody>
                          {logs.map((l) => (
                            <tr key={l.id} className="bz-row" style={{ borderTop: '1px solid #F7EDEB' }}>
                              <td style={{ padding: '13px 22px', fontFamily: mono, fontWeight: 700 }}>{l.method}</td>
                              <td style={{ padding: '13px 12px', fontFamily: mono, color: '#2a2024' }}>{l.path}</td>
                              <td style={{ padding: '13px 12px' }}><Pill kind={tone(l.status)} dot>{l.status}</Pill></td>
                              <td style={{ padding: '13px 12px', fontFamily: mono, color: '#8a7a7e' }}>
                                {typeof l.latency_ms === 'number' ? `${l.latency_ms} ms` : '—'}
                              </td>
                              <td style={{ padding: '13px 22px', color: '#a89a9e', fontWeight: 700 }}>{when(l.created_at)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <Card style={{ padding: 22 }}>
                  <h3 style={{ margin: '0 0 18px', fontSize: 16, fontWeight: 900 }}>Pedidos por resultado</h3>
                  {statusMix.total === 0 ? (
                    <p style={{ margin: 0, fontSize: 13.5, color: '#8a7a7e', fontWeight: 600 }}>Sem pedidos no período.</p>
                  ) : (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
                        <div style={{
                          width: 150, height: 150, borderRadius: '50%',
                          background: `conic-gradient(#1F8A5B 0 ${statusMix.pct}%,#C4303C ${statusMix.pct}% 100%)`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <div style={{ width: 104, height: 104, borderRadius: '50%', background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-.02em', color: '#1F8A5B' }}>
                              {statusMix.pct.toFixed(1)}%
                            </span>
                            <span style={{ fontSize: 11, fontWeight: 800, color: '#a89a9e' }}>Sucesso</span>
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                        {[['#1F8A5B', 'Sucesso', statusMix.ok], ['#C4303C', 'Com erro', statusMix.err]].map(([c, label, n]) => (
                          <div key={String(label)} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                            <span style={{ width: 10, height: 10, borderRadius: 3, background: String(c) }} />
                            <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: '#6a5a5e' }}>{String(label)}</span>
                            <span style={{ fontSize: 13, fontWeight: 800 }}>{nf.format(Number(n))}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </Card>

                <div style={{ background: 'linear-gradient(155deg,#FFF6E9,#FFF0EE)', border: '1px solid #F7E4CB', borderRadius: 18, padding: 22 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
                    <span style={{ width: 32, height: 32, borderRadius: 9, background: '#FDF0D8', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#C77A0A' }}>
                      <IconFlask size={17} />
                    </span>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 900, color: '#2a2024' }}>Ambiente atual</h3>
                  </div>
                  <p style={{ margin: 0, fontSize: 20, fontWeight: 900, color: '#B8770A' }}>Sandbox</p>
                  <p style={{ margin: '8px 0 16px', fontSize: 13, lineHeight: 1.55, color: '#8a6a4e', fontWeight: 600 }}>
                    Está num ambiente de testes. Conclua a verificação KYB para processar pagamentos reais.
                  </p>
                  <Link href="/go-live" className="bz-cta" style={{
                    display: 'block', textAlign: 'center', width: '100%', padding: 11, borderRadius: 12,
                    background: ctaGradient, color: '#fff', fontWeight: 800, fontSize: 13.5,
                    textDecoration: 'none', boxShadow: '0 12px 24px -12px rgba(181,16,31,.5)',
                  }}>
                    Saiba mais sobre Go Live
                  </Link>
                </div>
              </div>
            </div>
          </>
        )}
    </div>
  );
}
