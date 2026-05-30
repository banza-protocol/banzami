'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Copy, Check, X, Ban } from 'lucide-react';
import { getSession } from '@/lib/session';
import { BanzamiApi, type PaymentLink } from '@/lib/api';
import { formatMinor } from '@/lib/money';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';
import { QrDisplay } from '@/components/ui/qr-display';

const PAY_BASE = process.env.NEXT_PUBLIC_PAY_URL ?? 'https://pay.banzami.com';
const STATUSES = ['', 'ACTIVE', 'USED', 'EXPIRED', 'CANCELLED'] as const;

// Converts a user-typed Kz string to minor units (centimos).
// Returns null for invalid, non-positive, or unreasonably large values.
function parseKzToMinor(raw: string): number | null {
  const normalised = raw.replace(',', '.');
  if ((normalised.match(/\./g) ?? []).length > 1) return null; // multiple separators
  const value = parseFloat(normalised);
  if (isNaN(value) || value <= 0 || value > 10_000_000) return null;
  return Math.round(value * 100);
}

function linkUrl(slug: string) { return `${PAY_BASE}/${slug}`; }

export default function PaymentLinksPage() {
  const [rows, setRows]         = useState<PaymentLink[]>([]);
  const [cursor, setCursor]     = useState<string | undefined>();
  const [hasMore, setHasMore]   = useState(false);
  const [loading, setLoading]   = useState(true);
  const [status, setStatus]     = useState('');
  const [error, setError]       = useState('');
  const [showModal, setShowModal] = useState(false);

  const load = useCallback(async (nextCursor?: string) => {
    const session = getSession();
    if (!session) return;
    const api = new BanzamiApi(session.gatewayUrl, session.apiKey);
    setLoading(true);
    setError('');
    try {
      const page = await api.listPaymentLinks({
        merchantId: session.merchantId,
        limit:      25,
        cursor:     nextCursor,
      });
      const filtered = status
        ? page.data.filter(l => l.status === status)
        : page.data;
      setRows(prev => nextCursor ? [...prev, ...filtered] : filtered);
      setCursor(page.next_cursor);
      setHasMore(!!page.next_cursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    setRows([]);
    setCursor(undefined);
    load(undefined);
  }, [load]);

  async function handleCancel(id: string) {
    const session = getSession();
    if (!session) return;
    try {
      const api = new BanzamiApi(session.gatewayUrl, session.apiKey);
      await api.cancelPaymentLink(id);
      setRows(prev => prev.map(l => l.id === id ? { ...l, status: 'CANCELLED' } : l));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao cancelar');
    }
  }

  return (
    <div className="flex flex-col gap-lg max-w-5xl mx-auto">
      {/* Toolbar */}
      <div className="flex items-center gap-md">
        <label className="text-xs font-medium text-gray-700">Estado</label>
        <select
          value={status}
          onChange={e => setStatus(e.target.value)}
          className="h-8 bg-white border border-gray-100 rounded-md px-md text-sm text-gray-900 outline-none focus:ring-2 focus:ring-wine/30"
        >
          {STATUSES.map(s => (
            <option key={s} value={s}>{s || 'Todos'}</option>
          ))}
        </select>

        <button
          onClick={() => setShowModal(true)}
          className="ml-auto flex items-center gap-sm h-9 px-lg bg-wine text-white rounded-md text-sm font-medium hover:bg-wine-dark transition-colors"
        >
          <Plus size={16} />
          Nova cobrança
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-100 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">
                <th className="px-xl py-md">Link</th>
                <th className="px-xl py-md">Montante</th>
                <th className="px-xl py-md">Descrição</th>
                <th className="px-xl py-md">Estado</th>
                <th className="px-xl py-md">Criado em</th>
                <th className="px-xl py-md w-20" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(link => (
                <LinkRow key={link.id} link={link} onCancel={handleCancel} />
              ))}
            </tbody>
          </table>
        </div>

        {loading && (
          <div className="flex justify-center py-xl">
            <Spinner className="h-5 w-5" />
          </div>
        )}
        {!loading && !error && rows.length === 0 && (
          <EmptyState message="Nenhuma cobrança encontrada" />
        )}
        {error && <p className="px-xl py-lg text-sm text-error">{error}</p>}

        {hasMore && !loading && (
          <div className="border-t border-gray-100 px-xl py-md">
            <button
              onClick={() => load(cursor)}
              className="text-sm font-medium text-wine hover:underline"
            >
              Carregar mais
            </button>
          </div>
        )}
      </div>

      {showModal && (
        <CreateLinkModal
          onClose={() => { setShowModal(false); setRows([]); load(undefined); }}
          onCreated={() => { setRows([]); load(undefined); }}
        />
      )}

    </div>
  );
}

function LinkRow({ link, onCancel }: { link: PaymentLink; onCancel: (id: string) => void }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(linkUrl(link.slug));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <tr className="hover:bg-gray-100/50 transition-colors">
      <td className="px-xl py-md">
        <div className="flex items-center gap-sm">
          <span className="font-mono text-xs text-gray-700 max-w-[140px] truncate">
            {link.slug}
          </span>
          <button
            onClick={copy}
            title="Copiar URL"
            className="text-gray-400 hover:text-wine transition-colors shrink-0"
          >
            {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
          </button>
        </div>
      </td>
      <td className="px-xl py-md font-semibold text-gray-900 font-mono tabular-nums whitespace-nowrap">
        {link.amount_minor != null
          ? formatMinor(link.amount_minor, link.currency)
          : <span className="text-gray-400 font-normal text-xs">valor livre</span>
        }
      </td>
      <td className="px-xl py-md text-gray-700 max-w-[180px] truncate">
        {link.description ?? '—'}
      </td>
      <td className="px-xl py-md"><Badge label={link.status} /></td>
      <td className="px-xl py-md text-gray-400 whitespace-nowrap">
        {new Date(link.created_at).toLocaleString('pt-AO', { dateStyle: 'short', timeStyle: 'short' })}
      </td>
      <td className="px-xl py-md">
        {link.status === 'ACTIVE' && (
          <button
            onClick={() => onCancel(link.id)}
            title="Cancelar cobrança"
            className="text-gray-400 hover:text-error transition-colors"
          >
            <Ban size={15} />
          </button>
        )}
      </td>
    </tr>
  );
}

function CreateLinkModal({
  onClose,
  onCreated,
}: {
  onClose:   () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({ amount: '', description: '', expiresAt: '' });
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [created, setCreated]   = useState<PaymentLink | null>(null);
  const [paid, setPaid]         = useState(false);
  const pollRef                 = useRef<ReturnType<typeof setInterval> | null>(null);
  const merchantName            = getSession()?.merchantName ?? null;

  // Poll for payment when link is displayed
  useEffect(() => {
    if (!created || paid) return;
    const session = getSession();
    if (!session) return;
    const api = new BanzamiApi(session.gatewayUrl, session.apiKey);
    pollRef.current = setInterval(async () => {
      try {
        const link = await api.getPaymentLink(created.id);
        if (link.status === 'USED') {
          clearInterval(pollRef.current!);
          setCreated(link);
          setPaid(true);
        }
      } catch { /* ignore transient errors */ }
    }, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [created?.id, paid]);

  function set(k: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(prev => ({ ...prev, [k]: e.target.value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const session = getSession();
    if (!session) return;
    if (!session.walletId) {
      setError('ID de carteira não configurado. Actualize a sessão.');
      return;
    }

    // Convert Kz (major units) → centimos (minor units).
    // Reject values that can't be cleanly parsed as a positive Kz amount.
    const amountMinor = form.amount.trim()
      ? parseKzToMinor(form.amount.trim())
      : null;

    if (amountMinor === null && form.amount.trim() !== '') {
      setError('Montante inválido. Introduza o valor em Kz (ex: 250).');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const api  = new BanzamiApi(session.gatewayUrl, session.apiKey);
      const link = await api.createPaymentLink({
        merchantId:  session.merchantId,
        walletId:    session.walletId,
        amountMinor,
        description: form.description.trim() || undefined,
        expiresAt:   form.expiresAt || undefined,
      });
      setCreated(link);
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    if (pollRef.current) clearInterval(pollRef.current);
    setCreated(null);
    setPaid(false);
    setForm({ amount: '', description: '', expiresAt: '' });
    setError('');
  }

  const inputCls = 'h-10 bg-gray-100 rounded-md px-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-wine/30 focus:bg-white transition-colors';
  const url      = created ? linkUrl(created.slug) : '';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-xl">
      <div className="bg-white rounded-xl shadow-modal w-full max-w-sm p-xl">

        {/* ── Result view with QR ── */}
        {created ? (
          <>
            <div className="flex items-center justify-between mb-xl">
              <h2 className="text-base font-semibold text-gray-900">
                {paid ? 'Pagamento recebido' : 'Cobrança criada'}
              </h2>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
                <X size={18} />
              </button>
            </div>

            {/* ── Paid confirmation ── */}
            {paid ? (
              <div className="flex flex-col items-center gap-lg py-xl">
                <div className="flex items-center justify-center w-20 h-20 rounded-full bg-green-50">
                  <Check size={40} className="text-green-500" />
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-900">
                    {created.amount_minor != null ? formatMinor(created.amount_minor, created.currency) : ''}
                  </p>
                  <p className="text-sm text-gray-400 mt-xs">Pagamento confirmado</p>
                </div>
                <div className="flex gap-md w-full">
                  <button
                    onClick={resetForm}
                    className="flex-1 h-10 border border-gray-200 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                  >
                    Nova cobrança
                  </button>
                  <button
                    onClick={onClose}
                    className="flex-1 h-10 bg-wine text-white rounded-md text-sm font-medium hover:bg-wine-dark transition-colors"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            ) : (
            <div className="flex flex-col items-center gap-lg">
              {merchantName && (
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                  {merchantName}
                </p>
              )}
              <QrDisplay
                data={url}
                size={220}
                label={created.amount_minor != null ? formatMinor(created.amount_minor, created.currency) : undefined}
                sublabel={created.description ?? undefined}
                downloadName={`qr-cobranca-${created.slug}`}
                showCopy
                copyValue={url}
              />

              <div className="w-full bg-gray-100 rounded-md px-lg py-sm font-mono text-xs text-gray-700 break-all select-all">
                {url}
              </div>

              <div className="flex gap-md w-full">
                <button
                  onClick={resetForm}
                  className="flex-1 h-10 border border-gray-200 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  Nova cobrança
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 h-10 bg-wine text-white rounded-md text-sm font-medium hover:bg-wine-dark transition-colors"
                >
                  Fechar
                </button>
              </div>
            </div>
            )}
          </>
        ) : (

        /* ── Creation form ── */
        <>
          <div className="flex items-center justify-between mb-xl">
            <h2 className="text-base font-semibold text-gray-900">Nova Cobrança</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
              <X size={18} />
            </button>
          </div>

          <form onSubmit={submit} className="flex flex-col gap-lg">
            <Field label="Montante em Kz — deixe em branco para valor livre">
              <input
                type="text"
                inputMode="decimal"
                value={form.amount}
                onChange={set('amount')}
                className={inputCls}
                placeholder="ex: 250"
              />
            </Field>

            <Field label="Descrição (opcional)">
              <input
                type="text"
                value={form.description}
                onChange={set('description')}
                className={inputCls}
                placeholder="ex: Jantar para 2"
              />
            </Field>

            <Field label="Expira em (opcional)">
              <input
                type="datetime-local"
                value={form.expiresAt}
                onChange={set('expiresAt')}
                className={inputCls}
              />
            </Field>

            {error && (
              <p className="text-sm text-error bg-error-bg rounded-md px-md py-sm">{error}</p>
            )}

            <div className="flex gap-md">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 h-10 border border-gray-100 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 h-10 bg-wine text-white rounded-md text-sm font-medium hover:bg-wine-dark disabled:opacity-60 transition-colors"
              >
                {loading ? 'A criar…' : 'Criar cobrança'}
              </button>
            </div>
          </form>
        </>
        )}
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
