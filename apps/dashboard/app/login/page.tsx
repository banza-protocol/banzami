'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveSession } from '@/lib/session';

export default function LoginPage() {
  const router = useRouter();

  const [form, setForm] = useState({ merchantId: '', apiKey: '' });
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);

  function set(k: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(prev => ({ ...prev, [k]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.apiKey.trim() || !form.merchantId.trim()) {
      setError('Merchant ID e API Key são obrigatórios.');
      return;
    }
    setLoading(true);
    setError('');

    const base = (process.env.NEXT_PUBLIC_GATEWAY_URL ?? 'https://api.banzami.org').replace(/\/$/, '');

    try {
      // Exchange API key for a short-lived JWT
      const tokenRes = await fetch(`${base}/v1/auth/token`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ api_key: form.apiKey }),
      });
      if (!tokenRes.ok) {
        const body = await tokenRes.json().catch(() => ({}));
        throw new Error(body.message ?? 'Credenciais inválidas. Verifique o Merchant ID e a API Key.');
      }
      const { token } = await tokenRes.json() as { token: string };

      // Fetch merchant name and wallet ID in parallel (both optional — non-fatal)
      let walletId:    string | undefined;
      let merchantName = form.merchantId.trim();
      await Promise.allSettled([
        fetch(`${base}/v1/merchants/${form.merchantId.trim()}`, {
          headers: { Authorization: `Bearer ${token}` },
        }).then(async r => {
          if (r.ok) {
            const m = await r.json() as { name: string };
            merchantName = m.name;
          }
        }),
        fetch(`${base}/v1/wallets?currency=AOA`, {
          headers: { Authorization: `Bearer ${token}` },
        }).then(async r => {
          if (r.ok) {
            const w = await r.json() as { id: string };
            walletId = w.id;
          }
        }),
      ]);

      saveSession({
        apiKey:       token,
        merchantId:   form.merchantId.trim(),
        merchantName,
        walletId,
        gatewayUrl:   base,
        environment:  form.apiKey.startsWith('bz_test_') ? 'sandbox' : 'live',
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
          <h1 className="text-xl font-bold text-gray-900">Acesso ao Business</h1>
          <p className="text-sm text-gray-400 mt-xs">
            Introduza as credenciais fornecidas pelo Banzami.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-lg">
          <Field label="Merchant ID">
            <input
              type="text"
              value={form.merchantId}
              onChange={set('merchantId')}
              className={inputCls}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              autoComplete="username"
              required
            />
          </Field>

          <Field label="API Key">
            <input
              type="password"
              value={form.apiKey}
              onChange={set('apiKey')}
              className={inputCls}
              placeholder="bz_live_… ou bz_test_…"
              autoComplete="current-password"
              required
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

        <p className="text-xs text-center text-gray-400">
          Não tem credenciais? Contacte{' '}
          <a href="mailto:contact@banzami.org" className="text-wine hover:underline">
            contact@banzami.org
          </a>
        </p>
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
