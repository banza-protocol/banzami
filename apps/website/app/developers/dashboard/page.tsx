'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { PortalPage } from '@/components/developers/portal/PortalShell';
import { Card, Pill, type PillKind } from '@/components/developers/portal/ui';
import {
  IconChart,
  IconCheck,
  IconCode,
  IconFlask,
  IconSwap,
  IconUsers2,
  IconWebhookNodes,
} from '@/components/developers/portal/icons';

// Dashboard / Visão geral — dossier ecrã 5. All data is mocked, ready to be
// wired to real endpoints.

const ctaGradient = 'linear-gradient(160deg,#B5101F,#7C1016)';

type Kpi = {
  label: string;
  value: string;
  main: string;
  trail: string;
  icon: ReactNode;
  tile: string;
  iconColor: string;
};

const KPIS: Kpi[] = [
  { label: 'Transações', value: '1.482', main: '▲ 12.4%', trail: 'vs. 7 dias', icon: <IconSwap size={16} />, tile: '#FFF1F0', iconColor: '#B5101F' },
  { label: 'Volume (AOA)', value: '12.450.000', main: '▲ 6.1%', trail: 'vs. 7 dias', icon: <IconChart size={16} />, tile: '#FFF1F0', iconColor: '#B5101F' },
  { label: 'Comerciantes', value: '128', main: '▲ 5.2%', trail: 'vs. 7 dias', icon: <IconUsers2 size={16} />, tile: '#FFF1F0', iconColor: '#B5101F' },
  { label: 'Taxa de sucesso', value: '98.7%', main: '▲ 0.4%', trail: 'vs. 7 dias', icon: <IconCheck size={16} />, tile: '#EAF7F0', iconColor: '#1F8A5B' },
  { label: 'API requests', value: '24.9k', main: '▲ 18%', trail: 'vs. 7 dias', icon: <IconCode size={16} />, tile: '#FFF1F0', iconColor: '#B5101F' },
  { label: 'Webhook deliveries', value: '3.204', main: '99.1%', trail: 'entregues', icon: <IconWebhookNodes size={16} />, tile: '#FFF1F0', iconColor: '#B5101F' },
];

// height %, and whether it's a highlighted (red-gradient) bar
const BARS: [number, boolean][] = [
  [42, false], [55, false], [38, false], [64, false], [52, false], [73, true],
  [60, false], [81, true], [69, false], [88, true], [76, false], [96, true],
];

type Row = { event: string; ref: string; value: string; state: PillKind; label: string; date: string };
const ACTIVITY: Row[] = [
  { event: 'payment.succeeded', ref: 'INV-2025-0518', value: 'AOA 25.000', state: 'success', label: 'Sucesso', date: '12 Mai · 14:32' },
  { event: 'payment.failed', ref: 'INV-2025-0517', value: 'AOA 8.500', state: 'error', label: 'Falhou', date: '12 Mai · 14:20' },
  { event: 'transfer.created', ref: 'TRF-2025-0091', value: 'AOA 40.000', state: 'success', label: 'Sucesso', date: '12 Mai · 13:58' },
  { event: 'invoice.paid', ref: 'INV-2025-0514', value: 'AOA 12.300', state: 'success', label: 'Sucesso', date: '12 Mai · 13:40' },
  { event: 'webhook.delivered', ref: 'evt_8kd2x1', value: '—', state: 'success', label: 'Entregue', date: '12 Mai · 13:39' },
];

const mono = "'JetBrains Mono', ui-monospace, monospace";
const th = { padding: '10px 12px', fontSize: 11, fontWeight: 800, letterSpacing: '.04em' } as const;

export default function DashboardPage() {
  return (
    <PortalPage active="dashboard">
      <div className="bz-view">
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, letterSpacing: '-.02em' }}>Visão geral</h1>
        <p style={{ margin: '6px 0 20px', fontSize: 14.5, color: '#8a7a7e', fontWeight: 600 }}>
          Resumo do seu projeto em Sandbox — últimos 7 dias.
        </p>

        <div className="bz-kpi" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 16 }}>
          {KPIS.map((k) => (
            <Card key={k.label} style={{ padding: '18px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: '#8a7a7e' }}>{k.label}</span>
                <span
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 9,
                    background: k.tile,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: k.iconColor,
                  }}
                >
                  {k.icon}
                </span>
              </div>
              <p style={{ margin: '12px 0 0', fontSize: 28, fontWeight: 900, letterSpacing: '-.02em' }}>{k.value}</p>
              <p style={{ margin: '4px 0 0', fontSize: 12, fontWeight: 800, color: '#1F8A5B' }}>
                {k.main} <span style={{ color: '#a89a9e', fontWeight: 700 }}>{k.trail}</span>
              </p>
            </Card>
          ))}
        </div>

        <div className="bz-2rail" style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
            {/* volume chart */}
            <Card style={{ padding: 22 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>Volume (AOA)</h3>
                <span style={{ fontSize: 12, fontWeight: 800, color: '#a89a9e' }}>Últimos 12 dias</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 170 }}>
                {BARS.map(([h, hot], i) => (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
                    <span
                      className="bz-bar"
                      style={{
                        display: 'block',
                        height: `${h}%`,
                        background: hot ? 'linear-gradient(180deg,#B5101F,#7C1016)' : 'linear-gradient(180deg,#FBD2D0,#F5A9A5)',
                        borderRadius: '7px 7px 3px 3px',
                      }}
                    />
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 10.5, fontWeight: 700, color: '#b8a4a6' }}>
                <span>01</span><span>03</span><span>05</span><span>07</span><span>09</span><span>11</span><span>Hoje</span>
              </div>
            </Card>

            {/* atividade recente */}
            <Card style={{ overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 22px', borderBottom: '1px solid #F5E9E7' }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>Atividade recente</h3>
                <Link href="/developers/logs" style={{ fontSize: 12.5, fontWeight: 800, color: '#B5101F', textDecoration: 'none' }}>
                  Ver logs →
                </Link>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: '#a89a9e' }}>
                    <th style={{ ...th, padding: '10px 22px' }}>EVENTO</th>
                    <th style={th}>REFERÊNCIA</th>
                    <th style={th}>VALOR</th>
                    <th style={th}>ESTADO</th>
                    <th style={{ ...th, padding: '10px 22px' }}>DATA</th>
                  </tr>
                </thead>
                <tbody>
                  {ACTIVITY.map((r) => (
                    <tr key={r.ref} className="bz-row" style={{ borderTop: '1px solid #F7EDEB' }}>
                      <td style={{ padding: '13px 22px', fontFamily: mono, fontWeight: 600, color: '#2a2024' }}>{r.event}</td>
                      <td style={{ padding: '13px 12px', fontFamily: mono, color: '#8a7a7e' }}>{r.ref}</td>
                      <td style={{ padding: '13px 12px', fontWeight: 800, color: r.value === '—' ? '#c2a8aa' : undefined }}>{r.value}</td>
                      <td style={{ padding: '13px 12px' }}>
                        <Pill kind={r.state} dot>
                          {r.label}
                        </Pill>
                      </td>
                      <td style={{ padding: '13px 22px', color: '#a89a9e', fontWeight: 700 }}>{r.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* donut */}
            <Card style={{ padding: 22 }}>
              <h3 style={{ margin: '0 0 18px', fontSize: 16, fontWeight: 900 }}>Transações por status</h3>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
                <div
                  style={{
                    width: 150,
                    height: 150,
                    borderRadius: '50%',
                    background: 'conic-gradient(#1F8A5B 0 95.3%,#E0930F 95.3% 97.3%,#C4303C 97.3% 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <div
                    style={{
                      width: 104,
                      height: 104,
                      borderRadius: '50%',
                      background: '#fff',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <span style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-.02em', color: '#1F8A5B' }}>95.3%</span>
                    <span style={{ fontSize: 11, fontWeight: 800, color: '#a89a9e' }}>Sucesso</span>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {[
                  ['#1F8A5B', 'Sucesso', '1.412'],
                  ['#E0930F', 'Pendente', '29'],
                  ['#C4303C', 'Falhou', '41'],
                ].map(([c, label, n]) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: c }} />
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: '#6a5a5e' }}>{label}</span>
                    <span style={{ fontSize: 13, fontWeight: 800 }}>{n}</span>
                  </div>
                ))}
              </div>
            </Card>

            {/* ambiente atual */}
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
              <Link
                href="/developers/go-live"
                className="bz-cta"
                style={{
                  display: 'block',
                  textAlign: 'center',
                  width: '100%',
                  padding: 11,
                  borderRadius: 12,
                  background: ctaGradient,
                  color: '#fff',
                  fontWeight: 800,
                  fontSize: 13.5,
                  textDecoration: 'none',
                  boxShadow: '0 12px 24px -12px rgba(181,16,31,.5)',
                }}
              >
                Saiba mais sobre Go Live
              </Link>
            </div>
          </div>
        </div>
      </div>
    </PortalPage>
  );
}
