'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search, Plus, Copy, Check, ArrowLeft } from 'lucide-react';
import { getSession } from '@/lib/session';
import { AdminApi, type Merchant, type MerchantCompliance } from '@/lib/admin-api';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

type Action = 'approve' | 'reject' | 'suspend' | 'flag_aml';

const ACTION_CONFIG: Record<Action, { label: string; danger: boolean; confirmLabel: string; desc: string }> = {
  approve:  { label: 'Aprovar',       danger: false, confirmLabel: 'Aprovar comerciante',   desc: 'Aprovação KYC — o comerciante passará a APPROVED.' },
  reject:   { label: 'Rejeitar',      danger: true,  confirmLabel: 'Rejeitar comerciante',  desc: 'Rejeição KYC — introduza o motivo nas notas.' },
  suspend:  { label: 'Suspender',     danger: true,  confirmLabel: 'Suspender comerciante', desc: 'Suspender acesso — introduza o motivo nas notas.' },
  flag_aml: { label: 'Sinalizar AML', danger: true,  confirmLabel: 'Sinalizar AML',         desc: 'Sinaliza suspeita de branqueamento — introduza as notas.' },
};

interface CreatedCredentials {
  merchantId: string;
  merchantName: string;
  apiKey: string;
  walletId: string;
  currency: string;
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button onClick={copy} className="ml-sm text-gray-400 hover:text-gray-700 transition-colors">
      {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
    </button>
  );
}

function CredentialRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between px-xl py-md gap-md border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-400 shrink-0">{label}</span>
      <span className={`text-sm font-medium text-gray-900 flex items-center ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
        <CopyButton value={value} />
      </span>
    </div>
  );
}

export default function MerchantsPage() {
  const [tab, setTab] = useState<'list' | 'create'>('list');

  // List + search state
  const [search, setSearch]         = useState('');
  const [merchants, setMerchants]   = useState<Merchant[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError]   = useState('');

  // Detail state
  const [merchant, setMerchant]     = useState<Merchant | null>(null);
  const [compliance, setCompliance] = useState<MerchantCompliance | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError]     = useState('');
  const [action, setAction]         = useState<Action | null>(null);
  const [creditAmount, setCreditAmount] = useState('500');
  const [creditLoading, setCreditLoading] = useState(false);
  const [creditMsg, setCreditMsg]   = useState('');

  // Create state
  const [createName, setCreateName]         = useState('');
  const [createEmail, setCreateEmail]       = useState('');
  const [createCurrency, setCreateCurrency] = useState('AOA');
  const [creating, setCreating]             = useState(false);
  const [createError, setCreateError]       = useState('');
  const [credentials, setCredentials]       = useState<CreatedCredentials | null>(null);

  const loadMerchants = useCallback(async (q?: string) => {
    const session = getSession();
    if (!session) return;
    setListLoading(true); setListError('');
    try {
      const api = new AdminApi(session.apiUrl, session.adminKey);
      const res = await api.listMerchants(q);
      setMerchants(res.data ?? []);
    } catch (e) {
      setListError(e instanceof Error ? e.message : 'Erro ao carregar.');
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => { loadMerchants(); }, [loadMerchants]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    loadMerchants(search.trim() || undefined);
  }

  async function openDetail(id: string) {
    const session = getSession();
    if (!session) return;
    setDetailLoading(true); setDetailError(''); setMerchant(null); setCompliance(null);
    try {
      const api = new AdminApi(session.apiUrl, session.adminKey);
      const [m, c] = await Promise.all([api.getMerchant(id), api.getMerchantCompliance(id)]);
      setMerchant(m); setCompliance(c);
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : 'Erro.');
    } finally {
      setDetailLoading(false);
    }
  }

  async function createMerchant() {
    if (!createName.trim() || !createEmail.trim()) {
      setCreateError('Nome e email são obrigatórios.');
      return;
    }
    const session = getSession();
    if (!session) return;
    setCreating(true); setCreateError(''); setCredentials(null);
    try {
      const api = new AdminApi(session.apiUrl, session.adminKey);
      const result = await api.createMerchant(createName.trim(), createEmail.trim(), createCurrency);
      setCredentials({
        merchantId:   result.merchant.id,
        merchantName: result.merchant.name,
        apiKey:       result.api_key.secret,
        walletId:     result.wallet.id,
        currency:     result.wallet.currency,
      });
      setCreateName(''); setCreateEmail(''); setCreateCurrency('AOA');
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Erro ao criar comerciante.');
    } finally {
      setCreating(false);
    }
  }

  async function applyTestCredit() {
    const session = getSession();
    if (!session || !merchant) return;
    const kz = Math.round(parseFloat(creditAmount));
    if (!kz || kz <= 0) { setCreditMsg('Montante inválido.'); return; }
    setCreditLoading(true); setCreditMsg('');
    try {
      const api = new AdminApi(session.apiUrl, session.adminKey);
      await api.testCredit(merchant.id, kz * 100); // convert Kz → minor units
      setCreditMsg(`✓ ${kz.toLocaleString('pt-AO')} Kz creditados com sucesso.`);
    } catch (e) {
      setCreditMsg(e instanceof Error ? e.message : 'Erro ao creditar.');
    } finally {
      setCreditLoading(false);
    }
  }

  async function executeAction(notes: string) {
    const session = getSession();
    if (!session || !action || !merchant) return;
    const api = new AdminApi(session.apiUrl, session.adminKey);
    let result: MerchantCompliance;
    switch (action) {
      case 'approve':  result = await api.approveMerchant(merchant.id); break;
      case 'reject':   result = await api.rejectMerchant(merchant.id, notes); break;
      case 'suspend':  result = await api.suspendMerchant(merchant.id, notes); break;
      case 'flag_aml': result = await api.flagAML(merchant.id, notes); break;
    }
    setCompliance(result);
    setAction(null);
  }

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-xl">

      {/* Tabs */}
      <div className="flex gap-xs border-b border-gray-100">
        {(['list', 'create'] as const).map(t => (
          <button key={t} onClick={() => { setTab(t); setMerchant(null); }}
            className={`px-lg py-sm text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-700'
            }`}>
            {t === 'list' ? <><Search size={13} className="inline mr-xs" />Comerciantes</> : <><Plus size={13} className="inline mr-xs" />Criar Comerciante</>}
          </button>
        ))}
      </div>

      {/* ── List tab ───────────────────────────────────────────────────── */}
      {tab === 'list' && !merchant && (
        <>
          <form onSubmit={handleSearch} className="flex gap-md">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 h-10 bg-white border border-gray-100 rounded-md px-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-gray-900/20"
              placeholder="Pesquisar por nome ou email…"
            />
            <button type="submit" disabled={listLoading}
              className="h-10 px-lg bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-700 disabled:opacity-60 transition-colors flex items-center gap-sm">
              <Search size={15} />Pesquisar
            </button>
          </form>

          {listLoading && <div className="flex justify-center py-xl"><Spinner className="h-6 w-6" /></div>}
          {listError   && <p className="text-sm text-error bg-error-bg rounded-lg px-xl py-lg">{listError}</p>}

          {!listLoading && merchants.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-xl">Nenhum comerciante encontrado.</p>
          )}

          {merchants.length > 0 && (
            <div className="bg-white rounded-lg shadow-card overflow-hidden divide-y divide-gray-100">
              {merchants.map(m => (
                <button key={m.id} onClick={() => openDetail(m.id)}
                  className="w-full flex items-center justify-between px-xl py-lg hover:bg-gray-50 transition-colors text-left">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{m.name}</p>
                    <p className="text-xs text-gray-400 font-mono mt-xs">{m.id}</p>
                  </div>
                  <Badge label={m.status} />
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Detail view ────────────────────────────────────────────────── */}
      {tab === 'list' && (merchant || detailLoading || detailError) && (
        <>
          <button onClick={() => { setMerchant(null); setCompliance(null); setAction(null); }}
            className="flex items-center gap-sm text-sm text-gray-400 hover:text-gray-900 transition-colors self-start">
            <ArrowLeft size={14} /> Voltar à lista
          </button>

          {detailLoading && <div className="flex justify-center py-xl"><Spinner className="h-6 w-6" /></div>}
          {detailError   && <p className="text-sm text-error bg-error-bg rounded-lg px-xl py-lg">{detailError}</p>}

          {merchant && compliance && (
            <div className="flex flex-col gap-lg">
              <div className="bg-white rounded-lg shadow-card overflow-hidden">
                <div className="px-xl py-lg border-b border-gray-100">
                  <h2 className="text-sm font-semibold text-gray-900">{merchant.name}</h2>
                  <p className="text-xs font-mono text-gray-400">{merchant.id}</p>
                </div>
                <div className="divide-y divide-gray-100">
                  <Row label="Email"      value={merchant.email} />
                  <Row label="Estado"     value={<Badge label={merchant.status} />} />
                  <Row label="Compliance" value={<Badge label={compliance.compliance_status} />} />
                  {compliance.notes && <Row label="Notas" value={<span className="text-sm text-gray-700 max-w-xs text-right">{compliance.notes}</span>} />}
                  {compliance.reviewed_at && (
                    <Row label="Revisto em" value={new Date(compliance.reviewed_at).toLocaleString('pt-AO', { dateStyle: 'medium', timeStyle: 'short' })} />
                  )}
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-card p-xl">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-lg">Acções de Compliance</p>
                <div className="grid grid-cols-2 gap-md">
                  {(Object.entries(ACTION_CONFIG) as [Action, typeof ACTION_CONFIG[Action]][]).map(([key, cfg]) => (
                    <button key={key} onClick={() => setAction(key)}
                      className={`h-9 rounded-md text-xs font-medium transition-colors ${
                        cfg.danger ? 'bg-error-bg text-error hover:bg-red-100' : 'bg-success-bg text-success hover:bg-green-100'
                      }`}>
                      {cfg.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-card p-xl border border-dashed border-warning/40">
                <p className="text-xs font-medium text-warning uppercase tracking-wide mb-xs">Crédito de Teste</p>
                <p className="text-xs text-gray-400 mb-lg">Cria uma transacção PAYMENT completa para adicionar saldo à carteira AOA do comerciante. Apenas para desenvolvimento.</p>
                <div className="flex gap-md items-center">
                  <div className="flex items-center gap-xs flex-1">
                    <input
                      type="number"
                      min="1"
                      value={creditAmount}
                      onChange={e => setCreditAmount(e.target.value)}
                      className="w-32 h-9 bg-gray-50 border border-gray-100 rounded-md px-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-warning/30"
                    />
                    <span className="text-sm text-gray-400">Kz</span>
                  </div>
                  <button
                    onClick={applyTestCredit}
                    disabled={creditLoading}
                    className="h-9 px-lg bg-warning/10 text-warning rounded-md text-xs font-medium hover:bg-warning/20 disabled:opacity-60 transition-colors whitespace-nowrap"
                  >
                    {creditLoading ? 'A creditar…' : 'Usar dados de teste'}
                  </button>
                </div>
                {creditMsg && (
                  <p className={`mt-md text-xs ${creditMsg.startsWith('✓') ? 'text-success' : 'text-error'}`}>
                    {creditMsg}
                  </p>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Create tab ─────────────────────────────────────────────────── */}
      {tab === 'create' && (
        <>
          {credentials ? (
            <div className="bg-white rounded-lg shadow-card overflow-hidden">
              <div className="px-xl py-lg border-b border-gray-100 bg-success-bg">
                <p className="text-sm font-semibold text-success">Comerciante criado com sucesso</p>
                <p className="text-xs text-gray-500 mt-xs">Guarda a API Key — não volta a ser mostrada.</p>
              </div>
              <div className="divide-y divide-gray-100">
                <CredentialRow label="Nome"        value={credentials.merchantName} />
                <CredentialRow label="Merchant ID" value={credentials.merchantId}   mono />
                <CredentialRow label="API Key"     value={credentials.apiKey}       mono />
                <CredentialRow label="Wallet ID"   value={credentials.walletId}     mono />
                <CredentialRow label="Moeda"       value={credentials.currency} />
              </div>
              <div className="px-xl py-lg border-t border-gray-100">
                <p className="text-xs text-gray-400 mb-sm">Dashboard do comerciante:</p>
                <p className="text-xs font-mono text-gray-600">Gateway URL: http://localhost:8080</p>
                <p className="text-xs font-mono text-gray-600">API Key: {credentials.apiKey}</p>
                <p className="text-xs font-mono text-gray-600">Merchant ID: {credentials.merchantId}</p>
              </div>
              <div className="px-xl py-lg">
                <button onClick={() => setCredentials(null)}
                  className="h-9 px-lg bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-700 transition-colors">
                  Criar outro
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-card p-xl flex flex-col gap-lg">
              <div className="flex flex-col gap-sm">
                <label className="text-xs font-medium text-gray-700">Nome</label>
                <input value={createName} onChange={e => setCreateName(e.target.value)}
                  className="h-10 bg-gray-50 border border-gray-100 rounded-md px-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-gray-900/20"
                  placeholder="Ex: Farmácia Central" />
              </div>
              <div className="flex flex-col gap-sm">
                <label className="text-xs font-medium text-gray-700">Email</label>
                <input value={createEmail} onChange={e => setCreateEmail(e.target.value)}
                  type="email"
                  className="h-10 bg-gray-50 border border-gray-100 rounded-md px-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-gray-900/20"
                  placeholder="comerciante@empresa.ao" />
              </div>
              <div className="flex flex-col gap-sm">
                <label className="text-xs font-medium text-gray-700">Moeda</label>
                <select value={createCurrency} onChange={e => setCreateCurrency(e.target.value)}
                  className="h-10 bg-gray-50 border border-gray-100 rounded-md px-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-gray-900/20">
                  <option value="AOA">AOA — Kwanza Angolano</option>
                  <option value="USD">USD — Dólar Americano</option>
                  <option value="EUR">EUR — Euro</option>
                </select>
              </div>

              {createError && <p className="text-sm text-error bg-error-bg rounded-lg px-lg py-md">{createError}</p>}

              <button onClick={createMerchant} disabled={creating}
                className="h-10 px-xl bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-sm self-start">
                {creating ? <><Spinner className="h-4 w-4 text-white" /> A criar…</> : <><Plus size={15} /> Criar Comerciante</>}
              </button>
            </div>
          )}
        </>
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
