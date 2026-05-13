'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import { getSession } from '@/lib/session';
import { AdminApi, type Merchant, type MerchantCompliance } from '@/lib/admin-api';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

type Action = 'approve' | 'reject' | 'suspend' | 'flag_aml';

const ACTION_CONFIG: Record<Action, { label: string; danger: boolean; confirmLabel: string; desc: string }> = {
  approve:  { label: 'Aprovar',      danger: false, confirmLabel: 'Aprovar comerciante',    desc: 'Aprovação KYC — o comerciante passará a APPROVED.' },
  reject:   { label: 'Rejeitar',     danger: true,  confirmLabel: 'Rejeitar comerciante',   desc: 'Rejeição KYC — introduza o motivo nas notas.' },
  suspend:  { label: 'Suspender',    danger: true,  confirmLabel: 'Suspender comerciante',  desc: 'Suspender acesso — introduza o motivo nas notas.' },
  flag_aml: { label: 'Sinalizar AML',danger: true,  confirmLabel: 'Sinalizar AML',          desc: 'Sinaliza suspeita de branqueamento — introduza as notas.' },
};

export default function MerchantsPage() {
  const [merchantId, setMerchantId] = useState('');
  const [merchant, setMerchant]     = useState<Merchant | null>(null);
  const [compliance, setCompliance] = useState<MerchantCompliance | null>(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [action, setAction]         = useState<Action | null>(null);

  async function lookup() {
    const id = merchantId.trim();
    if (!id) return;
    const session = getSession();
    if (!session) return;
    setLoading(true); setError(''); setMerchant(null); setCompliance(null);
    try {
      const api = new AdminApi(session.apiUrl, session.adminKey);
      const [m, c] = await Promise.all([api.getMerchant(id), api.getMerchantCompliance(id)]);
      setMerchant(m);
      setCompliance(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Comerciante não encontrado.');
    } finally {
      setLoading(false);
    }
  }

  async function executeAction(notes: string) {
    const session = getSession();
    if (!session || !action || !merchantId) return;
    const api = new AdminApi(session.apiUrl, session.adminKey);
    let result: MerchantCompliance;
    switch (action) {
      case 'approve':  result = await api.approveMerchant(merchantId); break;
      case 'reject':   result = await api.rejectMerchant(merchantId, notes); break;
      case 'suspend':  result = await api.suspendMerchant(merchantId, notes); break;
      case 'flag_aml': result = await api.flagAML(merchantId, notes); break;
    }
    setCompliance(result);
    setAction(null);
  }

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-xl">
      {/* Search */}
      <div className="flex gap-md">
        <input
          value={merchantId}
          onChange={e => setMerchantId(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && lookup()}
          className="flex-1 h-10 bg-white border border-gray-100 rounded-md px-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-gray-900/20"
          placeholder="ID do comerciante (mch_…)"
        />
        <button onClick={lookup} disabled={loading}
          className="h-10 px-lg bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-700 disabled:opacity-60 transition-colors flex items-center gap-sm">
          <Search size={15} />
          Pesquisar
        </button>
      </div>

      {loading && <div className="flex justify-center py-xl"><Spinner className="h-6 w-6" /></div>}
      {error   && <p className="text-sm text-error bg-error-bg rounded-lg px-xl py-lg">{error}</p>}

      {merchant && compliance && (
        <div className="flex flex-col gap-lg">
          {/* Merchant info */}
          <div className="bg-white rounded-lg shadow-card overflow-hidden">
            <div className="px-xl py-lg border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">{merchant.name}</h2>
              <p className="text-xs font-mono text-gray-400">{merchant.id}</p>
            </div>
            <div className="divide-y divide-gray-100">
              <Row label="Estado"            value={<Badge label={merchant.status} />} />
              <Row label="Compliance"        value={<Badge label={compliance.compliance_status} />} />
              {compliance.notes && <Row label="Notas" value={<span className="text-sm text-gray-700 max-w-xs text-right">{compliance.notes}</span>} />}
              {compliance.reviewed_at && (
                <Row label="Revisto em" value={new Date(compliance.reviewed_at).toLocaleString('pt-AO', { dateStyle: 'medium', timeStyle: 'short' })} />
              )}
            </div>
          </div>

          {/* Compliance actions */}
          <div className="bg-white rounded-lg shadow-card p-xl">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-lg">Acções de Compliance</p>
            <div className="grid grid-cols-2 gap-md">
              {(Object.entries(ACTION_CONFIG) as [Action, typeof ACTION_CONFIG[Action]][]).map(([key, cfg]) => (
                <button key={key} onClick={() => setAction(key)}
                  className={`h-9 rounded-md text-xs font-medium transition-colors ${
                    cfg.danger
                      ? 'bg-error-bg text-error hover:bg-red-100'
                      : 'bg-success-bg text-success hover:bg-green-100'
                  }`}>
                  {cfg.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {action && (
        <ConfirmDialog
          title={ACTION_CONFIG[action].label}
          description={ACTION_CONFIG[action].desc}
          confirmLabel={ACTION_CONFIG[action].confirmLabel}
          danger={ACTION_CONFIG[action].danger}
          withNotes={action !== 'approve'}
          onConfirm={executeAction}
          onClose={() => setAction(null)}
        />
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-xl py-md gap-md">
      <span className="text-sm text-gray-400 shrink-0">{label}</span>
      <span className="text-sm font-medium text-gray-900">{value}</span>
    </div>
  );
}
