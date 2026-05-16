'use client';

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { getSession } from '@/lib/session';
import { BanzamiApi } from '@/lib/api';
import { QrDisplay } from '@/components/ui/qr-display';
import { Spinner } from '@/components/ui/spinner';

export default function ReceivePage() {
  const [payload, setPayload]   = useState<string | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [merchantName, setMerchantName] = useState('');

  async function load() {
    const session = getSession();
    if (!session) return;
    setLoading(true);
    setError('');
    try {
      const api = new BanzamiApi(session.gatewayUrl, session.apiKey);
      const [qrRes, merchant] = await Promise.all([
        api.createStaticQr({ ownerId: session.merchantId, ownerType: 'MERCHANT' }),
        api.getMerchant(session.merchantId).catch(() => null),
      ]);
      setPayload(qrRes.payload);
      if (merchant) setMerchantName(merchant.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao gerar QR');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col items-center gap-xl max-w-md mx-auto py-xl">
      <div className="w-full flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">QR de recebimento</h2>
          <p className="text-sm text-gray-400 mt-xs">
            Apresente este código ao cliente para receber pagamentos.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          title="Regenerar QR"
          className="flex items-center gap-sm h-9 px-md border border-gray-200 text-gray-700 rounded-md text-sm hover:bg-gray-100 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          Regenerar
        </button>
      </div>

      {loading && !payload && (
        <div className="flex justify-center py-section">
          <Spinner className="h-6 w-6" />
        </div>
      )}

      {error && (
        <div className="w-full text-sm text-error bg-error-bg rounded-md px-lg py-md">
          {error}
        </div>
      )}

      {payload && !loading && (
        <QrDisplay
          data={payload}
          size={280}
          label={merchantName || undefined}
          sublabel="Qualquer valor · AOA"
          downloadName={`qr-banzami-${getSession()?.merchantId ?? 'merchant'}`}
        />
      )}

      {payload && loading && (
        <div className="relative">
          <QrDisplay
            data={payload}
            size={280}
            label={merchantName || undefined}
            sublabel="Qualquer valor · AOA"
            downloadName={`qr-banzami-${getSession()?.merchantId ?? 'merchant'}`}
          />
          <div className="absolute inset-0 bg-white/60 rounded-xl flex items-center justify-center">
            <Spinner className="h-6 w-6" />
          </div>
        </div>
      )}

      <div className="w-full bg-white rounded-lg shadow-card p-lg border border-gray-100">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-sm">Merchant ID</p>
        <p className="text-sm font-mono text-gray-700 break-all">{getSession()?.merchantId}</p>
      </div>
    </div>
  );
}
