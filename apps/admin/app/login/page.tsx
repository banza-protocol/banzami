'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveSession } from '@/lib/session';

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    apiUrl:   process.env.NEXT_PUBLIC_ADMIN_API_URL ?? 'https://api.banzami.com/admin',
    adminKey: '',
  });
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  function set(k: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, [k]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.adminKey.trim()) { setError('Admin Key é obrigatória.'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch(`${form.apiUrl.replace(/\/$/, '')}/health`, {
        headers: { Authorization: `Bearer ${form.adminKey}` },
      });
      if (res.status === 401) throw new Error('Chave inválida.');
      if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`);
      saveSession({ adminKey: form.adminKey, apiUrl: form.apiUrl.replace(/\/$/, '') });
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro de ligação.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-xl">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-modal p-2xl flex flex-col gap-xl">
        <div>
          <p className="text-xs font-semibold text-error uppercase tracking-widest mb-xs">Banzami</p>
          <h1 className="text-xl font-bold text-gray-900">Painel de Operações</h1>
          <p className="text-sm text-gray-400 mt-xs">Acesso restrito — operadores Banzami.</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-lg">
          <div className="flex flex-col gap-xs">
            <label className="text-xs font-medium text-gray-700">Admin API URL</label>
            <input type="url" value={form.apiUrl} onChange={set('apiUrl')} required
              className={cls} placeholder="https://api.banzami.com/admin" />
          </div>
          <div className="flex flex-col gap-xs">
            <label className="text-xs font-medium text-gray-700">Admin Key</label>
            <input type="password" value={form.adminKey} onChange={set('adminKey')} required
              autoComplete="current-password" className={cls} placeholder="••••••••••••••••" />
          </div>

          {error && <p className="text-sm text-error bg-error-bg rounded-md px-md py-sm">{error}</p>}

          <button type="submit" disabled={loading}
            className="w-full h-12 bg-gray-900 text-white rounded-md text-sm font-semibold hover:bg-gray-700 transition-colors disabled:opacity-60">
            {loading ? 'A verificar…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}

const cls = 'w-full h-10 bg-gray-100 rounded-md px-lg text-sm text-gray-900 placeholder-gray-400 outline-none focus:ring-2 focus:ring-gray-900/20 focus:bg-white transition-colors';
