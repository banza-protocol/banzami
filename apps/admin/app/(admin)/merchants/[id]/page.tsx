'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Check, Flag } from 'lucide-react';
import { getSession } from '@/lib/session';
import { AdminApi, type MerchantApplication } from '@/lib/admin-api';
import { Badge, statusLabelPt } from '@/components/ui/badge';
import { Card, ErrorState } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { KybDocumentsSection } from '@/components/applications/KybDocumentsSection';
import { formatDate, initials, withAt } from '@/lib/format';

function getApi(): AdminApi | null {
  const s = getSession();
  return s ? new AdminApi(s.apiUrl, s.adminKey) : null;
}

const REVIEWER = 'admin-console';
type Tab = 'dados' | 'docs' | 'tx';

export default function MerchantDetailPage() {
  const router = useRouter();
  const toast = useToast();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [api] = useState<AdminApi | null>(() => getApi());
  const [m, setM] = useState<MerchantApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('dados');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!api) return;
    setLoading(true);
    setError('');
    try {
      setM(await api.getApplication(id));
    } catch {
      setError('Não foi possível carregar a candidatura.');
    } finally {
      setLoading(false);
    }
  }, [api, id]);

  useEffect(() => {
    void load();
  }, [load]);

  const open = m && (m.status === 'SUBMITTED' || m.status === 'UNDER_REVIEW');
  const approvedMerchant = m?.created_merchant_id;

  async function approve() {
    if (!api || !m) return;
    setBusy('approve');
    try {
      await api.approveApplication(m.id, REVIEWER);
      toast('success', 'Candidatura aprovada. Email de ativação enviado.');
      await load();
    } catch {
      toast('danger', 'Não foi possível aprovar a candidatura.');
    } finally {
      setBusy(null);
    }
  }

  async function reject() {
    if (!api || !m) return;
    const message = window.prompt('Motivo a comunicar ao comerciante (será enviado por email):');
    if (!message || !message.trim()) return;
    setBusy('reject');
    try {
      await api.rejectApplication(m.id, REVIEWER, '', message.trim());
      toast('success', 'Candidatura rejeitada. Email enviado ao comerciante.');
      await load();
    } catch {
      toast('danger', 'Não foi possível rejeitar a candidatura.');
    } finally {
      setBusy(null);
    }
  }

  async function flagAml() {
    if (!api || !approvedMerchant) return;
    const notes = window.prompt('Nota AML (interna):') ?? '';
    setBusy('aml');
    try {
      await api.flagAML(approvedMerchant, notes);
      toast('warning', 'Comerciante sinalizado para AML.');
    } catch {
      toast('danger', 'Não foi possível sinalizar AML.');
    } finally {
      setBusy(null);
    }
  }

  async function suspend() {
    if (!api || !approvedMerchant) return;
    const notes = window.prompt('Motivo da suspensão (interna):') ?? '';
    setBusy('suspend');
    try {
      await api.suspendMerchant(approvedMerchant, notes);
      toast('info', 'Conta suspensa.');
    } catch {
      toast('danger', 'Não foi possível suspender a conta.');
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return <Card><div className="adm-skel m-6 h-[120px] rounded-[16px]" /></Card>;
  }
  if (error || !m) {
    return (
      <>
        <BackLink onClick={() => router.push('/merchants')} />
        <Card><ErrorState message={error || 'Candidatura não encontrada.'} /></Card>
      </>
    );
  }

  return (
    <>
      <BackLink onClick={() => router.push('/merchants')} />

      {/* Header card */}
      <div className="mb-4 rounded-[20px] border border-[#f1e3e3] bg-white p-[26px]">
        <div className="flex flex-wrap items-start gap-[18px]">
          <span className="flex h-[60px] w-[60px] flex-none items-center justify-center rounded-[16px] bg-[#FFF1F0] text-[24px] font-black text-[#B5101F]">
            {initials(m.business_name)}
          </span>
          <div className="min-w-[200px] flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="m-0 text-[23px] font-black tracking-[-0.01em]">{m.business_name}</h2>
              <Badge label={statusLabelPt(m.status)} />
            </div>
            <div className="mt-1.5 font-mono text-[14px] font-semibold text-[#9a8a8e]">{withAt(m.desired_handle)}</div>
            <div className="mt-2 text-[13.5px] font-bold text-[#7a6a6e]">
              {[m.category, [m.city, m.country].filter(Boolean).join(', '), m.nif && `NIF ${m.nif}`, `desde ${formatDate(m.created_at)}`]
                .filter(Boolean)
                .join(' · ')}
            </div>
          </div>
        </div>

        <div className="mt-[22px] flex flex-wrap gap-[10px]">
          <button
            onClick={approve}
            disabled={!open || busy !== null}
            className="inline-flex items-center gap-2 rounded-[12px] bg-[#1f9d57] px-5 py-3 text-[14px] font-extrabold text-white transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Check size={16} strokeWidth={2.4} /> Aprovar KYC
          </button>
          <button
            onClick={reject}
            disabled={!open || busy !== null}
            className="inline-flex items-center gap-2 rounded-[12px] border-[1.5px] border-[#f1c4c4] bg-white px-5 py-3 text-[14px] font-extrabold text-[#B5101F] transition hover:bg-[#FFF1F0] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Rejeitar
          </button>
          <button
            onClick={flagAml}
            disabled={!approvedMerchant || busy !== null}
            title={!approvedMerchant ? 'Disponível após aprovação' : undefined}
            className="inline-flex items-center gap-2 rounded-[12px] bg-[#fbe3e1] px-5 py-3 text-[14px] font-extrabold text-[#9A1B22] transition disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Flag size={16} strokeWidth={1.8} /> Sinalizar AML
          </button>
          <button
            onClick={suspend}
            disabled={!approvedMerchant || busy !== null}
            title={!approvedMerchant ? 'Disponível após aprovação' : undefined}
            className="inline-flex items-center gap-2 rounded-[12px] border-[1.5px] border-[#f1e3e3] bg-white px-5 py-3 text-[14px] font-extrabold text-[#7a6a6e] transition hover:bg-[#FFF7F6] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Suspender
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex w-fit gap-1.5 rounded-[14px] border border-[#f1e3e3] bg-white p-1.5">
        {([['dados', 'Dados'], ['docs', 'Documentos'], ['tx', 'Transações']] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-[10px] px-5 py-[9px] text-[14px] font-extrabold transition ${
              tab === key ? 'bg-[#FFF1F0] text-[#B5101F]' : 'bg-transparent text-[#7a6a6e]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'dados' && (
        <div className="grid grid-cols-2 gap-4 max-[1040px]:grid-cols-1">
          <DataCard
            title="Dados do negócio"
            rows={[
              ['Nome legal', m.business_name],
              ['@negócio', withAt(m.desired_handle), true],
              ['NIF', m.nif || '—', true],
              ['Categoria', m.category || '—'],
              ['Atividade', m.business_activity || '—'],
            ]}
          />
          <DataCard
            title="Responsável & contacto"
            rows={[
              ['Responsável', m.legal_representative || '—'],
              ['Email', m.email || '—'],
              ['Telefone', m.phone || '—', true],
              ['Cidade', m.city || '—'],
              ['País', m.country || '—'],
            ]}
          />
          {m.merchant_message && (
            <DataCard title="Mensagem ao comerciante" rows={[['Mensagem', m.merchant_message]]} />
          )}
          {m.admin_notes && <DataCard title="Notas internas" rows={[['Nota', m.admin_notes]]} />}
        </div>
      )}

      {tab === 'docs' && api && <KybDocumentsSection api={api} applicationId={m.id} reviewedBy={REVIEWER} />}

      {tab === 'tx' && (
        <Card>
          <div className="px-6 py-[60px] text-center">
            <div className="text-[15px] font-extrabold text-[#5a4a4e]">Transações</div>
            <div className="mt-1.5 text-[13.5px] font-semibold text-[#9a8a8e]">
              Funcionalidade em preparação — sem endpoint de transações por comerciante no admin.
            </div>
          </div>
        </Card>
      )}
    </>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="mb-4 inline-flex items-center gap-[7px] text-[14px] font-extrabold text-[#9a8a8e] transition hover:text-[#B5101F]">
      ← Comerciantes
    </button>
  );
}

function DataCard({ title, rows }: { title: string; rows: [string, string, boolean?][] }) {
  return (
    <div className="rounded-[18px] border border-[#f1e3e3] bg-white p-6">
      <h3 className="m-0 mb-4 text-[15px] font-black">{title}</h3>
      <div className="flex flex-col gap-3">
        {rows.map(([label, value, mono], i) => (
          <div key={i} className="flex justify-between gap-4 text-[14px]">
            <span className="font-bold text-[#9a8a8e]">{label}</span>
            <span className={`text-right font-extrabold ${mono ? 'font-mono text-[#B5101F]' : 'text-[#2a2024]'}`}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
