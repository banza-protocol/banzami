'use client';

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { getSession } from '@/lib/session';
import { BanzamiApi, type Wallet, type WalletBalance } from '@/lib/api';
import { formatMinor } from '@/lib/money';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';

export default function WalletsPage() {
  const [wallet, setWallet]   = useState<Wallet | null>(null);
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  async function load() {
    const session = getSession();
    if (!session?.walletId) {
      setError('Nenhum ID de carteira configurado. Actualize as definições de sessão.');
      setLoading(false);
      return;
    }
    const api = new BanzamiApi(session.gatewayUrl, session.apiKey);
    setLoading(true);
    setError('');
    try {
      const [w, b] = await Promise.all([
        api.getWallet(session.walletId),
        api.getWalletBalance(session.walletId),
      ]);
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
