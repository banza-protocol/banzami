'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { getSession } from '@/lib/session';
import { AdminApi, type MerchantApplication } from '@/lib/admin-api';
import { Badge, statusLabelPt } from '@/components/ui/badge';
import { Card, TableWrap, Th, Td, EmptyMsg, ErrorState } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { formatDate, initials, withAt } from '@/lib/format';
import { AttentionChip } from '@/components/ui/attention-chip';
import { useAttentionView } from '@/components/layout/attention-provider';

function getApi(): AdminApi | null {
  const s = getSession();
  return s ? new AdminApi(s.token) : null;
}

// Status chips → application status codes. "Comerciantes" is backed by the
// real merchant-applications API (rich business data + KYC workflow).
const CHIPS: { label: string; value: string }[] = [
  { label: 'Todos', value: '' },
  { label: 'Submetida', value: 'SUBMITTED' },
  { label: 'Em análise', value: 'UNDER_REVIEW' },
  { label: 'Informação pedida', value: 'INFORMATION_REQUIRED' },
  { label: 'Aprovado', value: 'APPROVED' },
  { label: 'Falha no aprovisionamento', value: 'PROVISIONING_FAILED' },
  { label: 'Rejeitado', value: 'REJECTED' },
  { label: 'Cancelado', value: 'CANCELLED' },
];

export default function MerchantsPage() {
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = useState<MerchantApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  // "Requer atenção": the server's own definition (status=ATTENTION), the set
  // the sidebar badge counts.
  const [attention, setAttention] = useAttentionView();
  const effectiveStatus = attention ? 'ATTENTION' : statusFilter;

  const load = useCallback(async (status: string) => {
    const api = getApi();
    if (!api) return;
    setLoading(true);
    setError('');
    try {
      const r = await api.listApplications(status || undefined);
      setRows(r.applications);
    } catch {
      setError('Não foi possível carregar as candidaturas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(effectiveStatus);
  }, [load, effectiveStatus]);

  const term = applied.trim().toLowerCase();
  const view = term
    ? rows.filter(
        (m) =>
          m.business_name.toLowerCase().includes(term) ||
          m.desired_handle.toLowerCase().includes(term) ||
          m.email.toLowerCase().includes(term),
      )
    : rows;

  function clearFilters() {
    setSearch('');
    setApplied('');
    setStatusFilter('');
    setAttention(false);
  }

  return (
    <>
      <div className="mb-[22px] flex items-center gap-[26px] border-b border-[#f1e3e3]">
        <span className="-mb-px inline-flex items-center gap-2 border-b-[2.5px] border-[#B5101F] px-0.5 pb-[14px] text-[15px] font-extrabold text-[#2a2024]">
          <Search size={17} color="#2a2024" strokeWidth={1.8} />
          Comerciantes
        </span>
        <button
          onClick={() => toast('info', 'Criação manual de comerciante em breve.')}
          className="pb-[14px] text-[15px] font-bold text-[#9a8a8e]"
        >
          + Criar Comerciante
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && setApplied(search)}
          placeholder="Pesquisar por nome, @handle ou email..."
          className="min-w-[240px] flex-1 rounded-[14px] border-[1.5px] border-[#f1e3e3] bg-white px-[18px] py-[14px] text-[15px] font-semibold outline-none transition focus:border-[#B5101F] focus:ring-4 focus:ring-[#B5101F]/10"
        />
        <button
          onClick={() => setApplied(search)}
          className="inline-flex items-center gap-[9px] rounded-[14px] bg-[#1a1416] px-[26px] py-[14px] text-[15px] font-extrabold text-white transition hover:bg-black"
        >
          <Search size={17} color="#fff" strokeWidth={1.9} />
          Pesquisar
        </button>
      </div>

      <div className="mb-[18px] flex flex-wrap gap-2">
        <AttentionChip attentionKey="business_applications" active={attention} onToggle={setAttention} />
        {CHIPS.map((c) => {
          const active = !attention && statusFilter === c.value;
          return (
            <button
              key={c.label}
              onClick={() => { setAttention(false); setStatusFilter(c.value); }}
              className={`rounded-[30px] border-[1.5px] px-4 py-2 text-[13px] font-extrabold transition ${
                active ? 'border-[#1a1416] bg-[#1a1416] text-white' : 'border-[#f1e3e3] bg-white text-[#5a4a4e]'
              }`}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <Card>
          <div className="py-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 border-b border-[#f8f1f1] px-[22px] py-4">
                <span className="adm-skel h-[38px] w-[38px] rounded-[11px]" />
                <span className="adm-skel h-[14px] max-w-[200px] flex-1 rounded-[7px]" />
                <span className="adm-skel h-[14px] w-[120px] rounded-[7px]" />
                <span className="adm-skel h-[24px] w-20 rounded-[30px]" />
              </div>
            ))}
          </div>
        </Card>
      ) : error ? (
        <Card><ErrorState message={error} /></Card>
      ) : view.length === 0 ? (
        <Card>
          <div className="px-6 py-[60px] text-center">
            <div className="mx-auto mb-4 flex h-[60px] w-[60px] items-center justify-center rounded-full bg-[#FFF7F6]">
              <Search size={28} color="#c9a3a6" strokeWidth={1.8} />
            </div>
            <div className="text-[16px] font-extrabold text-[#5a4a4e]">Nenhum comerciante encontrado.</div>
            <div className="mt-[5px] text-[13.5px] font-semibold text-[#9a8a8e]">Tenta outro termo de pesquisa ou limpa os filtros.</div>
            <button onClick={clearFilters} className="mt-[18px] rounded-[30px] border-[1.5px] border-[#f1e3e3] bg-white px-[22px] py-[11px] text-[13.5px] font-extrabold text-[#B5101F]">
              Limpar filtros
            </button>
          </div>
        </Card>
      ) : (
        <TableWrap>
          <thead>
            <tr className="bg-[#FFF7F6]">
              <Th>Comerciante</Th>
              <Th>Origem</Th>
              <Th>Categoria</Th>
              <Th>Província</Th>
              <Th>NIF</Th>
              <Th>Estado</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {view.map((m) => (
              <tr
                key={m.id}
                onClick={() => router.push(`/merchants/${m.id}`)}
                className="adm-row cursor-pointer transition-colors"
              >
                <Td>
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] bg-[#FFF1F0] text-[13px] font-extrabold text-[#B5101F]">
                      {initials(m.business_name)}
                    </span>
                    <div>
                      <div className="text-[14px] font-extrabold">{m.business_name}</div>
                      <div className="font-mono text-[12px] font-semibold text-[#9a8a8e]">{withAt(m.desired_handle)}</div>
                    </div>
                  </div>
                </Td>
                <Td className="font-semibold text-[#5a4a4e]">{m.origin === 'DEVELOPER_PROJECT' ? 'Projeto de developer' : 'Formulário público'}</Td>
                <Td className="font-semibold text-[#5a4a4e]">{m.category || '—'}</Td>
                <Td className="font-semibold text-[#5a4a4e]">{m.country || m.city || '—'}</Td>
                <Td mono className="font-bold">{m.nif || '—'}</Td>
                <Td><Badge label={statusLabelPt(m.status)} /></Td>
                <Td right><span className="text-[13px] font-extrabold text-[#B5101F]">Abrir →</span></Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </>
  );
}
