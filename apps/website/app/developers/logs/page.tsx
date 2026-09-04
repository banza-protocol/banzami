'use client';

import { PortalPage } from '@/components/developers/portal/PortalShell';
import { IllustrativeDataNotice } from '@/components/developers/portal/IllustrativeDataNotice';
import { Card, Pill, type PillKind } from '@/components/developers/portal/ui';
import { IconCalendar, IconChevronDown, IconDownload, IconSearch } from '@/components/developers/portal/icons';

// Logs / Eventos — dossier ecrã 8. Search + filters + export toolbar over a
// paginated event table.

const mono = "'JetBrains Mono', ui-monospace, monospace";

type Log = { id: string; event: string; ref: string; state: PillKind; label: string; date: string };
const LOGS: Log[] = [
  { id: 'evt_8kd2x1MC', event: 'payment.succeeded', ref: 'INV-2025-0518', state: 'success', label: 'Sucesso', date: '18 Mai · 14:32' },
  { id: 'evt_7bnE39Rk', event: 'transfer.created', ref: 'TRF-2025-0158', state: 'success', label: 'Sucesso', date: '18 Mai · 14:24' },
  { id: 'evt_2xcFD0T8', event: 'payment.failed', ref: 'INV-2025-0517', state: 'error', label: 'Falhou', date: '18 Mai · 14:20' },
  { id: 'evt_5mQ9Ab21', event: 'invoice.paid', ref: 'INV-2025-0514', state: 'success', label: 'Sucesso', date: '18 Mai · 13:40' },
  { id: 'evt_9pLd4Kc0', event: 'refund.processed', ref: 'REF-2025-0038', state: 'pending', label: 'Pendente', date: '18 Mai · 13:15' },
  { id: 'evt_1aZx8Vn5', event: 'webhook.delivered', ref: 'evt_8kd2x1MC', state: 'success', label: 'Sucesso', date: '18 Mai · 13:14' },
];

const th = { padding: '13px 12px', fontSize: 11, fontWeight: 800 } as const;
const selectStyle = {
  padding: '11px 34px 11px 14px',
  border: '1.5px solid #EBDBD9',
  borderRadius: 12,
  fontSize: 13.5,
  fontWeight: 800,
  color: '#2a2024',
  background: '#fff',
  outline: 'none',
  appearance: 'none',
  cursor: 'pointer',
} as const;

function FilterSelect({ options }: { options: string[] }) {
  return (
    <div style={{ position: 'relative' }}>
      <select className="bz-in" style={selectStyle}>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
      <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#b8a4a6' }}>
        <IconChevronDown size={16} />
      </span>
    </div>
  );
}

export default function LogsPage() {
  return (
    <PortalPage active="logs">
      <div className="bz-view">
        <IllustrativeDataNotice what="Os registos de pedidos" />
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, letterSpacing: '-.02em' }}>Logs / Eventos</h1>
        <p style={{ margin: '6px 0 20px', fontSize: 14.5, color: '#8a7a7e', fontWeight: 600 }}>
          Pesquise e filtre eventos e transações.
        </p>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18, alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
            <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#b8a4a6' }}>
              <IconSearch size={16} />
            </span>
            <input
              className="bz-in"
              placeholder="Pesquisar por ID, referência, evento…"
              style={{
                width: '100%',
                padding: '11px 14px 11px 40px',
                border: '1.5px solid #EBDBD9',
                borderRadius: 12,
                fontSize: 13.5,
                fontWeight: 600,
                color: '#2a2024',
                background: '#fff',
                outline: 'none',
                transition: 'border-color .16s, box-shadow .16s',
              }}
            />
          </div>
          <FilterSelect options={['Todos os eventos', 'payment.succeeded', 'payment.failed', 'transfer.created', 'webhook.delivered']} />
          <FilterSelect options={['Todos os estados', 'Sucesso', 'Falhou', 'Pendente']} />
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              padding: '11px 14px',
              border: '1.5px solid #EBDBD9',
              borderRadius: 12,
              background: '#fff',
              fontSize: 13.5,
              fontWeight: 800,
              color: '#6a5a5e',
              cursor: 'pointer',
            }}
          >
            <IconCalendar size={15} />
            15 – 18 Mai
          </span>
          <button
            className="bz-ghost"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              padding: '11px 16px',
              border: '1.5px solid #EBDBD9',
              borderRadius: 12,
              background: '#fff',
              fontSize: 13.5,
              fontWeight: 800,
              color: '#B5101F',
              cursor: 'pointer',
            }}
          >
            <IconDownload size={15} />
            Exportar
          </button>
        </div>

        <Card style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#a89a9e' }}>
                <th style={{ ...th, padding: '13px 22px' }}>EVENT ID</th>
                <th style={th}>EVENTO</th>
                <th style={th}>REFERÊNCIA</th>
                <th style={th}>STATUS</th>
                <th style={{ ...th, padding: '13px 22px' }}>DATA</th>
              </tr>
            </thead>
            <tbody>
              {LOGS.map((l) => (
                <tr key={l.id + l.ref} className="bz-row" style={{ borderTop: '1px solid #F7EDEB' }}>
                  <td style={{ padding: '13px 22px', fontFamily: mono, color: '#8a7a7e' }}>{l.id}</td>
                  <td style={{ padding: '13px 12px', fontFamily: mono, fontWeight: 600 }}>{l.event}</td>
                  <td style={{ padding: '13px 12px', fontFamily: mono, color: '#8a7a7e' }}>{l.ref}</td>
                  <td style={{ padding: '13px 12px' }}>
                    <Pill kind={l.state}>{l.label}</Pill>
                  </td>
                  <td style={{ padding: '13px 22px', color: '#a89a9e', fontWeight: 700 }}>{l.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 22px', borderTop: '1px solid #F5E9E7' }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: '#a89a9e' }}>Página 1 de 20</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {['1', '2', '3'].map((n, i) => (
                <span
                  key={n}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 9,
                    background: i === 0 ? '#B5101F' : '#fff',
                    border: i === 0 ? 'none' : '1px solid #F0E2E0',
                    color: i === 0 ? '#fff' : '#6a5a5e',
                    fontSize: 12.5,
                    fontWeight: 800,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: i === 0 ? 'default' : 'pointer',
                  }}
                >
                  {n}
                </span>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </PortalPage>
  );
}
