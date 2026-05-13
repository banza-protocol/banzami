'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveSession } from '@/lib/session';

export default function LoginPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    gatewayUrl: process.env.NEXT_PUBLIC_GATEWAY_URL ?? 'http://localhost:8080',
    apiKey:     '',
    merchantId: '',
    walletId:   '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function set(k: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(prev => ({ ...prev, [k]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.apiKey.trim() || !form.merchantId.trim()) {
      setError('API Key e ID do comerciante são obrigatórios.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      // Verify credentials by fetching the merchant
      const res = await fetch(
        `${form.gatewayUrl.replace(/\/$/, '')}/v1/merchants/${form.merchantId}`,
        { headers: { Authorization: `Bearer ${form.apiKey}` } },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? `HTTP ${res.status}`);
      }
      saveSession({
        apiKey:     form.apiKey,
        merchantId: form.merchantId,
        walletId:   form.walletId.trim() || undefined,
        gatewayUrl: form.gatewayUrl.replace(/\/$/, ''),
      });
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Credenciais inválidas');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-off-white flex items-center justify-center p-xl">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-card p-2xl flex flex-col gap-xl">
        {/* Header */}
        <div>
          <p className="text-xs font-semibold text-wine uppercase tracking-widest mb-xs">Banzami</p>
          <h1 className="text-xl font-bold text-gray-900">Acesso ao Dashboard</h1>
          <p className="text-sm text-gray-400 mt-xs">Introduza as credenciais do comerciante.</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-lg">
          <Field label="Gateway URL">
            <input
              type="url"
              value={form.gatewayUrl}
              onChange={set('gatewayUrl')}
              className={inputCls}
              placeholder="http://localhost:8080"
              required
            />
          </Field>

          <Field label="API Key">
            <input
              type="password"
              value={form.apiKey}
              onChange={set('apiKey')}
              className={inputCls}
              placeholder="bz_live_…"
              required
              autoComplete="current-password"
            />
          </Field>

          <Field label="ID do Comerciante">
            <input
              type="text"
              value={form.merchantId}
              onChange={set('merchantId')}
              className={inputCls}
              placeholder="mch_…"
              required
            />
          </Field>

          <Field label="ID da Carteira (opcional)">
            <input
              type="text"
              value={form.walletId}
              onChange={set('walletId')}
              className={inputCls}
              placeholder="wlt_…"
            />
          </Field>

          {error && (
            <p className="text-sm text-error bg-error-bg rounded-md px-md py-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 bg-wine text-white rounded-md text-sm font-semibold hover:bg-wine-dark transition-colors disabled:opacity-60"
          >
            {loading ? 'A verificar…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-xs">
      <label className="text-xs font-medium text-gray-700">{label}</label>
      {children}
    </div>
  );
}

const inputCls =
  'w-full h-10 bg-gray-100 rounded-md px-lg text-sm text-gray-900 placeholder-gray-400 outline-none focus:ring-2 focus:ring-wine/30 focus:bg-white transition-colors';
