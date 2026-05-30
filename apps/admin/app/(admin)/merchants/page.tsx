'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search, Plus, Copy, Check, ArrowLeft, Mail, RefreshCw, Trash2, ShieldCheck, ShieldOff, Wallet } from 'lucide-react';
import { getSession } from '@/lib/session';
import { AdminApi, type Merchant, type MerchantCompliance, type Wallet as MerchantWallet } from '@/lib/admin-api';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

type Action = 'approve' | 'reject' | 'suspend' | 'flag_aml' | 'delete';

const ACTION_CONFIG: Record<Action, { label: string; danger: boolean; confirmLabel: string; desc: string }> = {
  approve:  { label: 'Aprovar',       danger: false, confirmLabel: 'Aprovar comerciante',   desc: 'Aprovação KYC — o comerciante passará a APPROVED.' },
  reject:   { label: 'Rejeitar',      danger: true,  confirmLabel: 'Rejeitar comerciante',  desc: 'Rejeição KYC — introduza o motivo nas notas.' },
  suspend:  { label: 'Suspender',     danger: true,  confirmLabel: 'Suspender comerciante', desc: 'Suspender acesso — introduza o motivo nas notas.' },
  flag_aml: { label: 'Sinalizar AML', danger: true,  confirmLabel: 'Sinalizar AML',         desc: 'Sinaliza suspeita de branqueamento — introduza as notas.' },
  delete:   { label: 'Apagar',        danger: true,  confirmLabel: 'Apagar definitivamente', desc: 'Apaga o comerciante e todas as suas chaves API. Irreversível.' },
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
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMsg, setResendMsg]         = useState('');
  const [verifiedSaving, setVerifiedSaving] = useState(false);
  const [verifiedError, setVerifiedError]   = useState('');

  // Wallet + admin credit state
  const [wallet, setWallet]               = useState<MerchantWallet | null>(null);
  const [creditAmount, setCreditAmount]   = useState('');
  const [creditReason, setCreditReason]   = useState('');
  const [crediting, setCrediting]         = useState(false);
  const [creditMsg, setCreditMsg]         = useState('');
  const [lastBalance, setLastBalance]     = useState<number | null>(null);

  // Create state
  const [createName, setCreateName]         = useState('');
  const [createEmail, setCreateEmail]       = useState('');
  const [createCurrency, setCreateCurrency] = useState('AOA');
  const [createSandbox, setCreateSandbox]   = useState(false);
  const [creating, setCreating]             = useState(false);
  const [createError, setCreateError]       = useState('');
  const [credentials, setCredentials]       = useState<CreatedCredentials | null>(null);

  const loadMerchants = useCallback(async (q?: string) => {
    const session = getSession();
    if (!session) return;
    setListLoading(true); setListError('');
    try {
      const api = new AdminApi(session.apiUrl, session.adminKey);
      const res  = await api.listMerchants(q);
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
    setDetailLoading(true); setDetailError('');
    setMerchant(null); setCompliance(null); setWallet(null);
    setCreditMsg(''); setCreditAmount(''); setCreditReason(''); setLastBalance(null);
    try {
      const api = new AdminApi(session.apiUrl, session.adminKey);
      const [m, c] = await Promise.all([api.getMerchant(id), api.getMerchantCompliance(id)]);
      setMerchant(m); setCompliance(c);
      // Fetch wallet in background — non-fatal if missing
      api.getWallet(id, 'AOA').then(setWallet).catch(() => {});
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
      const result = await api.createMerchant(createName.trim(), createEmail.trim(), createCurrency, createSandbox);
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

  async function handleSetVerified(verified: boolean) {
    const session = getSession();
    if (!session || !merchant) return;
    setVerifiedSaving(true); setVerifiedError('');
    try {
      const api = new AdminApi(session.apiUrl, session.adminKey);
      const updated = await api.setMerchantVerified(merchant.id, verified);
      setMerchant(updated);
    } catch (e) {
      setVerifiedError(e instanceof Error ? e.message : 'Erro ao atualizar verificação.');
    } finally {
      setVerifiedSaving(false);
    }
  }

  async function handleAdminCredit() {
    if (!wallet) return;
    const session = getSession();
    if (!session) return;
    const amountKz = parseFloat(creditAmount);
    if (!amountKz || amountKz <= 0) { setCreditMsg('Valor inválido.'); return; }
    if (!creditReason.trim()) { setCreditMsg('Motivo obrigatório.'); return; }
    const amountMinor = Math.round(amountKz * 100);
    setCrediting(true); setCreditMsg('');
    try {
      const api = new AdminApi(session.apiUrl, session.adminKey);
      const result = await api.adminCreditWallet(wallet.id, amountMinor, creditReason.trim());
      setLastBalance(result.new_balance);
      setCreditMsg(`✓ Crédito aplicado. Saldo disponível: ${(result.new_balance / 100).toLocaleString('pt-AO', { minimumFractionDigits: 2 })} ${result.currency}`);
      setCreditAmount(''); setCreditReason('');
    } catch (e) {
      setCreditMsg(e instanceof Error ? e.message : 'Erro ao aplicar crédito.');
    } finally {
      setCrediting(false);
    }
  }

  async function resendCredentials(merchantId: string) {
    const session = getSession();
    if (!session) return;
    setResendLoading(true); setResendMsg('');
    try {
      const api = new AdminApi(session.apiUrl, session.adminKey);
      const result = await api.resendCredentials(merchantId);
      const newKey = result.api_key.secret;
      setResendMsg(`✓ Email enviado. Nova API Key: ${newKey}`);
    } catch (e) {
      setResendMsg(e instanceof Error ? e.message : 'Erro ao reenviar.');
    } finally {
      setResendLoading(false);
    }
  }

  async function executeAction(notes: string) {
    const session = getSession();
    if (!session || !action || !merchant) return;
    const api = new AdminApi(session.apiUrl, session.adminKey);
    if (action === 'delete') {
      await api.deleteMerchant(merchant.id);
      setMerchant(null);
      setCompliance(null);
      setAction(null);
      loadMerchants();
      return;
    }
    let compliance: MerchantCompliance;
    switch (action) {
      case 'approve':  compliance = await api.approveMerchant(merchant.id); break;
      case 'reject':   compliance = await api.rejectMerchant(merchant.id, notes); break;
      case 'suspend':  compliance = await api.suspendMerchant(merchant.id, notes); break;
      case 'flag_aml': compliance = await api.flagAML(merchant.id, notes); break;
      default: return;
    }
    // Re-fetch merchant to pick up status changes driven by compliance actions
    // (e.g. suspend → merchant.status becomes SUSPENDED).
    const updated = await api.getMerchant(merchant.id);
    setMerchant(updated);
    setCompliance(compliance);
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
          <button onClick={() => { setMerchant(null); setCompliance(null); setAction(null); setWallet(null); setCreditMsg(''); setLastBalance(null); }}
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
                  <Row label="KYB" value={<Badge label={compliance.kyb_status} />} />
                  <Row label="AML" value={<Badge label={compliance.aml_status} />} />
                  {compliance.notes && <Row label="Notas" value={<span className="text-sm text-gray-700 max-w-xs text-right">{compliance.notes}</span>} />}
                  {compliance.reviewed_at && (
                    <Row label="Revisto em" value={new Date(compliance.reviewed_at).toLocaleString('pt-AO', { dateStyle: 'medium', timeStyle: 'short' })} />
                  )}
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-card p-xl">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-lg">Acções de Compliance</p>
                <div className="grid grid-cols-2 gap-md">
                  {((['approve', 'reject', 'suspend', 'flag_aml'] as Action[]).map(key => {
                    const cfg = ACTION_CONFIG[key];
                    return (
                      <button key={key} onClick={() => setAction(key)}
                        className={`h-9 rounded-md text-xs font-medium transition-colors ${
                          cfg.danger ? 'bg-error-bg text-error hover:bg-red-100' : 'bg-success-bg text-success hover:bg-green-100'
                        }`}>
                        {cfg.label}
                      </button>
                    );
                  }))}
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-card p-xl">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-lg">Verificação</p>
                <div className="flex items-center gap-md mb-lg">
                  {merchant.verified ? (
                    <span className="flex items-center gap-xs text-sm font-medium text-blue-700">
                      <ShieldCheck size={16} />Verificado
                    </span>
                  ) : (
                    <span className="flex items-center gap-xs text-sm text-gray-400">
                      <ShieldOff size={16} />Não verificado
                    </span>
                  )}
                </div>
                <div className="flex gap-md flex-wrap">
                  <button
                    onClick={() => handleSetVerified(true)}
                    disabled={verifiedSaving || merchant.verified}
                    className="h-9 px-lg rounded-md text-xs font-medium transition-colors bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50 flex items-center gap-xs"
                  >
                    <ShieldCheck size={13} />Verificar
                  </button>
                  <button
                    onClick={() => handleSetVerified(false)}
                    disabled={verifiedSaving || !merchant.verified}
                    className="h-9 px-lg rounded-md text-xs font-medium transition-colors bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50 flex items-center gap-xs"
                  >
                    <ShieldOff size={13} />Remover verificação
                  </button>
                </div>
                {verifiedError && <p className="mt-md text-xs text-error">{verifiedError}</p>}
              </div>

              <div className="bg-white rounded-lg shadow-card p-xl border border-red-100">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-lg">Zona de Perigo</p>
                <p className="text-xs text-gray-400 mb-lg">Apaga o comerciante, todas as chaves API e o registo de compliance. Só é possível se não existirem dados financeiros associados.</p>
                <button
                  onClick={() => setAction('delete')}
                  className="h-9 px-lg bg-error-bg text-error rounded-md text-xs font-medium hover:bg-red-100 transition-colors flex items-center gap-xs"
                >
                  <Trash2 size={12} />
                  Apagar Comerciante
                </button>
              </div>

              {/* Admin credit — shown only when wallet is loaded */}
              {wallet && (
                <div className="bg-white rounded-lg shadow-card p-xl">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-lg flex items-center gap-xs">
                    <Wallet size={13} />Crédito Manual
                  </p>
                  {lastBalance !== null && (
                    <p className="text-xs text-gray-500 mb-md">
                      Saldo disponível: <span className="font-medium text-gray-900">{(lastBalance / 100).toLocaleString('pt-AO', { minimumFractionDigits: 2 })} AOA</span>
                    </p>
                  )}
                  <div className="flex flex-col gap-md">
                    <div className="flex gap-md">
                      <input
                        type="number"
                        min="1"
                        step="0.01"
                        value={creditAmount}
                        onChange={e => setCreditAmount(e.target.value)}
                        placeholder="Valor em Kz (ex: 50000)"
                        className="flex-1 h-9 bg-gray-50 border border-gray-100 rounded-md px-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-gray-900/20"
                      />
                    </div>
                    <input
                      value={creditReason}
                      onChange={e => setCreditReason(e.target.value)}
                      placeholder="Motivo (obrigatório) — ex: TestFlight beta funding"
                      className="h-9 bg-gray-50 border border-gray-100 rounded-md px-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-gray-900/20"
                    />
                    <button
                      onClick={handleAdminCredit}
                      disabled={crediting || !creditAmount || !creditReason.trim()}
                      className="h-9 px-lg bg-gray-900 text-white rounded-md text-xs font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors flex items-center gap-sm self-start"
                    >
                      {crediting && <Spinner className="h-3 w-3" />}
                      Aplicar crédito
                    </button>
                    {creditMsg && (
                      <p className={`text-xs font-mono break-all ${creditMsg.startsWith('✓') ? 'text-success' : 'text-error'}`}>
                        {creditMsg}
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div className="bg-white rounded-lg shadow-card p-xl">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-lg">Credenciais</p>
                <p className="text-xs text-gray-400 mb-lg">Gera uma nova API Key e envia-a por email para <strong>{merchant.email}</strong>. A chave anterior continua válida até ser revogada.</p>
                <button
                  onClick={() => resendCredentials(merchant.id)}
                  disabled={resendLoading}
                  className="h-9 px-lg bg-gray-100 text-gray-700 rounded-md text-xs font-medium hover:bg-gray-200 disabled:opacity-60 transition-colors flex items-center gap-xs"
                >
                  <RefreshCw size={12} />
                  {resendLoading ? 'A enviar…' : 'Gerar nova chave e reenviar email'}
                </button>
                {resendMsg && (
                  <p className={`mt-md text-xs font-mono break-all ${resendMsg.startsWith('✓') ? 'text-success' : 'text-error'}`}>
                    {resendMsg}
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
                <p className="text-xs font-mono text-gray-600">Gateway URL: https://api.banzami.com</p>
                <p className="text-xs font-mono text-gray-600">API Key: {credentials.apiKey}</p>
                <p className="text-xs font-mono text-gray-600">Merchant ID: {credentials.merchantId}</p>
              </div>
              <div className="px-xl py-lg flex flex-col gap-md">
                <div className="flex gap-md items-center flex-wrap">
                  <button onClick={() => setCredentials(null)}
                    className="h-9 px-lg bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-700 transition-colors">
                    Criar outro
                  </button>
                  <button
                    onClick={() => resendCredentials(credentials.merchantId)}
                    disabled={resendLoading}
                    className="h-9 px-lg bg-gray-100 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-200 disabled:opacity-60 transition-colors flex items-center gap-xs"
                  >
                    <Mail size={13} />
                    {resendLoading ? 'A enviar…' : 'Reenviar email'}
                  </button>
                </div>
                {resendMsg && (
                  <p className={`text-xs font-mono break-all ${resendMsg.startsWith('✓') ? 'text-success' : 'text-error'}`}>
                    {resendMsg}
                  </p>
                )}
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

              <label className="flex items-center gap-md cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={createSandbox}
                  onChange={e => setCreateSandbox(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900/20"
                />
                <div>
                  <p className="text-sm font-medium text-gray-900">Conta sandbox</p>
                  <p className="text-xs text-gray-400">KYB e AML aprovados automaticamente — apenas para testes.</p>
                </div>
              </label>

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
