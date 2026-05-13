'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { getSession } from '@/lib/session';
import { BanzamiApi, type WebhookEndpoint, type WebhookEvent } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';

const ALL_EVENTS = [
  'transaction.completed',
  'transaction.failed',
  'transaction.refunded',
  'payout.completed',
  'payout.failed',
];

export default function WebhooksPage() {
  const [tab, setTab] = useState<'endpoints' | 'events'>('endpoints');

  return (
    <div className="flex flex-col gap-lg max-w-4xl mx-auto">
      <div className="flex gap-xs border-b border-gray-100">
        {(['endpoints', 'events'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-lg py-sm text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t
                ? 'border-wine text-wine'
                : 'border-transparent text-gray-400 hover:text-gray-700'
            }`}
          >
            {t === 'endpoints' ? 'Endpoints' : 'Eventos'}
          </button>
        ))}
      </div>

      {tab === 'endpoints' ? <EndpointsTab /> : <EventsTab />}
    </div>
  );
}

function EndpointsTab() {
  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [showModal, setShowModal] = useState(false);

  async function load() {
    const session = getSession();
    if (!session) return;
    setLoading(true);
    try {
      const api  = new BanzamiApi(session.gatewayUrl, session.apiKey);
      const list = await api.listWebhookEndpoints();
      setEndpoints(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    const session = getSession();
    if (!session) return;
    try {
      const api = new BanzamiApi(session.gatewayUrl, session.apiKey);
      await api.deleteWebhookEndpoint(id);
      setEndpoints(prev => prev.filter(e => e.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col gap-lg">
      <div className="flex justify-end">
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-sm h-9 px-lg bg-wine text-white rounded-md text-sm font-medium hover:bg-wine-dark transition-colors"
        >
          <Plus size={16} />
          Registar endpoint
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-card overflow-hidden">
        {loading && <div className="flex justify-center py-xl"><Spinner className="h-5 w-5" /></div>}
        {!loading && endpoints.length === 0 && <EmptyState message="Nenhum endpoint registado" />}
        {error && <p className="px-xl py-lg text-sm text-error">{error}</p>}

        {endpoints.length > 0 && (
          <ul className="divide-y divide-gray-100">
            {endpoints.map(ep => (
              <li key={ep.id} className="flex items-start gap-md px-xl py-lg">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{ep.url}</p>
                  <p className="text-xs text-gray-400 mt-xs">
                    {ep.events.join(', ')}
                  </p>
                </div>
                <div className="flex items-center gap-md shrink-0">
                  <Badge label={ep.status} />
                  <button
                    onClick={() => handleDelete(ep.id)}
                    className="text-gray-400 hover:text-error transition-colors"
                    title="Remover"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showModal && (
        <RegisterEndpointModal
          onClose={() => setShowModal(false)}
          onRegistered={() => { setShowModal(false); load(); }}
        />
      )}
    </div>
  );
}

function EventsTab() {
  const [events, setEvents]   = useState<WebhookEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [cursor, setCursor]   = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);

  async function load(nextCursor?: string) {
    const session = getSession();
    if (!session) return;
    setLoading(true);
    try {
      const api  = new BanzamiApi(session.gatewayUrl, session.apiKey);
      const page = await api.listWebhookEvents({ limit: 25, cursor: nextCursor });
      setEvents(prev => nextCursor ? [...prev, ...page.data] : page.data);
      setCursor(page.next_cursor);
      setHasMore(!!page.next_cursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="bg-white rounded-lg shadow-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-100 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">
              <th className="px-xl py-md">Tipo</th>
              <th className="px-xl py-md">ID</th>
              <th className="px-xl py-md">Data</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {events.map(ev => (
              <tr key={ev.id} className="hover:bg-gray-100/50">
                <td className="px-xl py-md font-medium text-gray-900">{ev.type}</td>
                <td className="px-xl py-md font-mono text-xs text-gray-400">{ev.id.slice(-12)}</td>
                <td className="px-xl py-md text-gray-400 whitespace-nowrap">
                  {new Date(ev.created_at).toLocaleString('pt-AO', { dateStyle: 'short', timeStyle: 'short' })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {loading && <div className="flex justify-center py-xl"><Spinner className="h-5 w-5" /></div>}
      {!loading && events.length === 0 && <EmptyState message="Nenhum evento ainda" />}
      {error && <p className="px-xl py-lg text-sm text-error">{error}</p>}

      {hasMore && !loading && (
        <div className="border-t border-gray-100 px-xl py-md">
          <button onClick={() => load(cursor)} className="text-sm font-medium text-wine hover:underline">
            Carregar mais
          </button>
        </div>
      )}
    </div>
  );
}

function RegisterEndpointModal({
  onClose,
  onRegistered,
}: {
  onClose:      () => void;
  onRegistered: () => void;
}) {
  const [url, setUrl]           = useState('');
  const [events, setEvents]     = useState<string[]>([]);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  function toggleEvent(ev: string) {
    setEvents(prev => prev.includes(ev) ? prev.filter(e => e !== ev) : [...prev, ev]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) { setError('URL é obrigatório.'); return; }
    if (events.length === 0) { setError('Seleccione pelo menos um evento.'); return; }
    const session = getSession();
    if (!session) return;
    setLoading(true);
    setError('');
    try {
      const api = new BanzamiApi(session.gatewayUrl, session.apiKey);
      await api.registerWebhookEndpoint(url.trim(), events);
      onRegistered();
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
          <h2 className="text-base font-semibold text-gray-900">Registar Endpoint</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-lg">
          <div className="flex flex-col gap-xs">
            <label className="text-xs font-medium text-gray-700">URL</label>
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              className="h-10 bg-gray-100 rounded-md px-lg text-sm outline-none focus:ring-2 focus:ring-wine/30 focus:bg-white transition-colors"
              placeholder="https://meu-site.com/webhook"
              required
            />
          </div>

          <div className="flex flex-col gap-sm">
            <label className="text-xs font-medium text-gray-700">Eventos</label>
            {ALL_EVENTS.map(ev => (
              <label key={ev} className="flex items-center gap-sm text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={events.includes(ev)}
                  onChange={() => toggleEvent(ev)}
                  className="accent-wine"
                />
                {ev}
              </label>
            ))}
          </div>

          {error && (
            <p className="text-sm text-error bg-error-bg rounded-md px-md py-sm">{error}</p>
          )}

          <div className="flex gap-md">
            <button type="button" onClick={onClose}
              className="flex-1 h-10 border border-gray-100 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 h-10 bg-wine text-white rounded-md text-sm font-medium hover:bg-wine-dark disabled:opacity-60 transition-colors">
              {loading ? 'A registar…' : 'Registar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
