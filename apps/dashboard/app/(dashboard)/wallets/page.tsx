'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, FlaskConical } from 'lucide-react';
import { getSession } from '@/lib/session';
import { BanzamiApi, type Wallet, type WalletBalance } from '@/lib/api';
import { formatMinor } from '@/lib/money';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';

const SANDBOX_PRESETS = [
  { label: '5.000 AOA',    minor: 500_000 },
  { label: '10.000 AOA',   minor: 1_000_000 },
  { label: '50.000 AOA',   minor: 5_000_000 },
  { label: '100.000 AOA',  minor: 10_000_000 },
];

function SandboxFundPanel({ onFunded }: { onFunded: () => void }) {
  const [funding, setFunding] = useState(false);
  const [last, setLast]       = useState<string | null>(null);
  const [err, setErr]         = useState<string | null>(null);

  async function fund(amountMinor: number) {
    const session = getSession();
    if (!session) return;
    const api = new BanzamiApi(session.gatewayUrl, session.apiKey);
    setFunding(true);
    setErr(null);
    try {
      const res = await api.sandboxFund(amountMinor);
      setLast(`+${formatMinor(res.credited_minor, 'AOA')} adicionados`);
      onFunded();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro ao adicionar fundos');
    } finally {
      setFunding(false);
    }
  }

  return (
    <div className="border border-amber-300 bg-amber-50 rounded-lg p-xl flex flex-col gap-md">
      <div className="flex items-center gap-sm">
        <FlaskConical size={16} className="text-amber-700 shrink-0" />
        <span className="text-sm font-semibold text-amber-800">Adicionar fundos de teste</span>
      </div>
      <div className="flex flex-wrap gap-sm">
        {SANDBOX_PRESETS.map(({ label, minor }) => (
          <button
            key={minor}
            disabled={funding}
            onClick={() => fund(minor)}
            className="px-md py-sm text-xs font-semibold rounded-md bg-amber-200 text-amber-900 hover:bg-amber-300 disabled:opacity-50 transition-colors"
          >
            {label}
          </button>
        ))}
      </div>
      {funding && <p className="text-xs text-amber-700">A processar…</p>}
      {last    && <p className="text-xs text-green-700 font-medium">{last}</p>}
      {err     && <p className="text-xs text-red-700">{err}</p>}
    </div>
  );
}

export default function WalletsPage() {
  const [wallet, setWallet]   = useState<Wallet | null>(null);
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [isSandbox, setIsSandbox] = useState(false);

  async function load() {
    const session = getSession();
    if (!session) { setLoading(false); return; }
    setIsSandbox(session.environment === 'sandbox');
    const api = new BanzamiApi(session.gatewayUrl, session.apiKey);
    setLoading(true);
    setError('');
    try {
      const w = session.walletId
        ? await api.getWallet(session.walletId)
        : await api.getMerchantWallet();
      const b = await api.getWalletBalance(w.id);
      setWallet(w);
      setBalance(b);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="flex justify-center py-page">
        <Spinner className="h-7 w-7" />
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-error bg-error-bg rounded-lg px-xl py-lg">{error}</p>;
  }

  if (!wallet || !balance) return null;

  return (
    <div className="flex flex-col gap-xl max-w-lg">
      <div className="rounded-xl p-xl text-white" style={{ background: 'linear-gradient(135deg, #990011 0%, #6B000B 100%)' }}>
        <p className="text-xs font-medium text-white/60 uppercase tracking-wide mb-xs">
          Saldo disponível
        </p>
        <p className="text-4xl font-bold font-mono tabular-nums">
          {formatMinor(balance.available_minor, balance.currency)}
        </p>
        {balance.reserved_minor > 0 && (
          <p className="mt-sm text-sm text-white/60">
            {formatMinor(balance.reserved_minor, balance.currency)} reservados
          </p>
        )}
      </div>

      {isSandbox && <SandboxFundPanel onFunded={load} />}

      <div className="bg-white rounded-lg shadow-card divide-y divide-gray-100">
        <Row label="ID da Carteira" value={<span className="font-mono text-xs">{wallet.id}</span>} />
        <Row label="Moeda"          value={wallet.currency} />
        <Row label="Estado"         value={<Badge label={wallet.status} />} />
        <Row
          label="Criada em"
          value={new Date(wallet.created_at).toLocaleDateString('pt-AO', { dateStyle: 'long' })}
        />
      </div>

      <button
        onClick={load}
        className="self-start flex items-center gap-sm text-sm font-medium text-wine hover:underline"
      >
        <RefreshCw size={14} />
        Actualizar saldo
      </button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-xl py-md">
      <span className="text-sm text-gray-400">{label}</span>
      <span className="text-sm font-medium text-gray-900">{value}</span>
    </div>
  );
}
