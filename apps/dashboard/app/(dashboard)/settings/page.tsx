'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2, Eye, EyeOff, Copy, X } from 'lucide-react';
import { getSession } from '@/lib/session';
import { BanzamiApi, type ApiKey, type NewApiKey } from '@/lib/api';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';

export default function SettingsPage() {
  const [keys, setKeys]           = useState<ApiKey[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [showModal, setShowModal] = useState(false);
  const [newKey, setNewKey]       = useState<NewApiKey | null>(null);

  async function load() {
    const session = getSession();
    if (!session) return;
    setLoading(true);
    setError('');
    try {
      const api  = new BanzamiApi(session.gatewayUrl, session.apiKey);
      const list = await api.listApiKeys(session.merchantId);
      setKeys(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
    } finally {
      setLoading(false);
    }
  }

  async function handleRevoke(keyId: string) {
    const session = getSession();
    if (!session) return;
    try {
      const api = new BanzamiApi(session.gatewayUrl, session.apiKey);
      await api.revokeApiKey(session.merchantId, keyId);
      setKeys(prev => prev.filter(k => k.id !== keyId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col gap-xl max-w-2xl mx-auto">
      {/* API Keys section */}
      <div className="bg-white rounded-lg shadow-card overflow-hidden">
        <div className="flex items-center justify-between px-xl py-lg border-b border-gray-100">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Chaves de API</h2>
            <p className="text-xs text-gray-400 mt-micro">
              Use estas chaves para autenticar pedidos ao gateway.
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-sm h-8 px-md bg-banzami text-white rounded-md text-xs font-medium hover:bg-banzami-dark transition-colors"
          >
            <Plus size={14} />
            Nova chave
          </button>
        </div>

        {loading && <div className="flex justify-center py-xl"><Spinner className="h-5 w-5" /></div>}
        {!loading && keys.length === 0 && <EmptyState message="Nenhuma chave criada ainda" />}
        {error && <p className="px-xl py-lg text-sm text-error">{error}</p>}

        {keys.length > 0 && (
          <div>
            <KeyGroup
              title="Produção"
              hint="Chaves bz_live_ — movem dinheiro real."
              keys={keys.filter(k => k.environment === 'LIVE')}
              onRevoke={handleRevoke}
            />
            <KeyGroup
              title="Sandbox"
              hint="Chaves bz_test_ — universo de testes isolado, sem dinheiro real."
              keys={keys.filter(k => k.environment === 'SANDBOX')}
              onRevoke={handleRevoke}
            />
          </div>
        )}
      </div>

      {/* Merchant info section */}
      <MerchantInfo />

      {showModal && (
        <CreateKeyModal
          onClose={() => setShowModal(false)}
          onCreated={k => { setNewKey(k); setShowModal(false); load(); }}
        />
      )}

      {newKey && (
        <NewKeyReveal key={newKey.id} apiKey={newKey} onDismiss={() => setNewKey(null)} />
      )}
    </div>
  );
}

function MerchantInfo() {
  const session = getSession();
  if (!session) return null;

  return (
    <div className="bg-white rounded-lg shadow-card overflow-hidden">
      <div className="px-xl py-lg border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-900">Sessão Actual</h2>
      </div>
      <div className="divide-y divide-gray-100">
        <Row label="ID do Comerciante" value={session.merchantId} mono />
        <Row label="ID da Carteira"    value={session.walletId ?? '—'} mono />
        <Row label="Gateway"           value={session.gatewayUrl} />
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between px-xl py-md gap-md">
      <span className="text-sm text-gray-400 shrink-0">{label}</span>
      <span className={`text-sm text-gray-900 truncate ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </div>
  );
}

function EnvBadge({ environment }: { environment: 'LIVE' | 'SANDBOX' }) {
  const live = environment === 'LIVE';
  return (
    <span className={`inline-flex items-center rounded-full px-md py-micro text-[10px] font-semibold uppercase tracking-wide ${
      live ? 'bg-success-bg text-success' : 'bg-warning-bg text-warning'
    }`}>
      {live ? 'Produção' : 'Sandbox'}
    </span>
  );
}

function KeyGroup({
  title, hint, keys, onRevoke,
}: {
  title: string;
  hint: string;
  keys: ApiKey[];
  onRevoke: (id: string) => void;
}) {
  if (keys.length === 0) return null;
  return (
    <div className="border-t border-gray-100 first:border-t-0">
      <div className="px-xl pt-md pb-xs">
        <p className="text-xs font-semibold text-gray-700">{title}</p>
        <p className="text-[11px] text-gray-400">{hint}</p>
      </div>
      <ul className="divide-y divide-gray-100">
        {keys.map(k => (
          <li key={k.id} className="flex items-center gap-md px-xl py-md">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-sm">
                <p className="text-sm font-mono text-gray-900">{k.prefix}••••••••</p>
                <EnvBadge environment={k.environment} />
              </div>
              {k.label && <p className="text-xs text-gray-400 mt-micro">{k.label}</p>}
              <p className="text-xs text-gray-400">
                Criada {new Date(k.created_at).toLocaleDateString('pt-AO', { dateStyle: 'medium' })}
                {k.last_used_at && ` · Última utilização ${new Date(k.last_used_at).toLocaleDateString('pt-AO', { dateStyle: 'medium' })}`}
              </p>
            </div>
            <button
              onClick={() => onRevoke(k.id)}
              title="Revogar chave"
              className="text-gray-400 hover:text-error transition-colors"
            >
              <Trash2 size={15} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CreateKeyModal({
  onClose,
  onCreated,
}: {
  onClose:   () => void;
  onCreated: (k: NewApiKey) => void;
}) {
  const [label, setLabel]     = useState('');
  const [environment, setEnvironment] = useState<'LIVE' | 'SANDBOX'>('LIVE');
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const session = getSession();
    if (!session) return;
    setLoading(true);
    setError('');
    try {
      const api = new BanzamiApi(session.gatewayUrl, session.apiKey);
      const k   = await api.createApiKey(session.merchantId, label.trim() || undefined, environment);
      onCreated(k);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-xl">
      <div className="bg-white rounded-xl shadow-modal w-full max-w-sm p-xl">
        <div className="flex items-center justify-between mb-xl">
          <h2 className="text-base font-semibold text-gray-900">Nova Chave de API</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-lg">
          <div className="flex flex-col gap-xs">
            <label className="text-xs font-medium text-gray-700">Ambiente</label>
            <div className="inline-flex rounded-md border border-gray-200 p-0.5">
              {(['LIVE', 'SANDBOX'] as const).map(env => (
                <button
                  key={env}
                  type="button"
                  onClick={() => setEnvironment(env)}
                  className={`flex-1 h-8 rounded text-xs font-medium transition-colors ${
                    environment === env ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  {env === 'LIVE' ? 'Produção (bz_live_)' : 'Sandbox (bz_test_)'}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-gray-400">
              {environment === 'LIVE'
                ? 'Move dinheiro real. Use apenas em produção.'
                : 'Universo de testes isolado — sem dinheiro real.'}
            </p>
          </div>
          <div className="flex flex-col gap-xs">
            <label className="text-xs font-medium text-gray-700">Etiqueta (opcional)</label>
            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              className="h-10 bg-gray-100 rounded-md px-lg text-sm outline-none focus:ring-2 focus:ring-banzami/30 focus:bg-white transition-colors"
              placeholder="ex: Produção"
            />
          </div>

          {error && <p className="text-sm text-error bg-error-bg rounded-md px-md py-sm">{error}</p>}

          <div className="flex gap-md">
            <button type="button" onClick={onClose}
              className="flex-1 h-10 border border-gray-100 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 h-10 bg-banzami text-white rounded-md text-sm font-medium hover:bg-banzami-dark disabled:opacity-60 transition-colors">
              {loading ? 'A criar…' : 'Criar chave'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function NewKeyReveal({ apiKey, onDismiss }: { apiKey: NewApiKey; onDismiss: () => void }) {
  const [visible, setVisible]  = useState(false);
  const [copied, setCopied]    = useState(false);

  function copy() {
    navigator.clipboard.writeText(apiKey.key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-xl">
      <div className="bg-white rounded-xl shadow-modal w-full max-w-sm p-xl flex flex-col gap-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-sm">
            <h2 className="text-base font-semibold text-gray-900">Chave Criada</h2>
            <EnvBadge environment={apiKey.environment} />
          </div>
          <button onClick={onDismiss} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>

        <p className="text-sm text-gray-700">
          Guarde esta chave agora — não será mostrada novamente.
        </p>

        <div className="bg-gray-100 rounded-md p-md flex items-center gap-sm">
          <code className={`flex-1 text-xs font-mono text-gray-900 break-all ${visible ? '' : 'blur-sm select-none'}`}>
            {apiKey.key}
          </code>
          <button onClick={() => setVisible(v => !v)} className="text-gray-400 hover:text-gray-700 shrink-0">
            {visible ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
          <button onClick={copy} className="text-gray-400 hover:text-banzami shrink-0" title="Copiar">
            <Copy size={16} />
          </button>
        </div>

        {copied && <p className="text-xs text-success text-center">Copiado!</p>}

        <button
          onClick={onDismiss}
          className="h-10 bg-banzami text-white rounded-md text-sm font-medium hover:bg-banzami-dark transition-colors"
        >
          Guardei a chave
        </button>
      </div>
    </div>
  );
}
