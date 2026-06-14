'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { getSession } from '@/lib/session';
import { BanzamiApi, type TeamMember, type TeamRole, type AccessLogEntry } from '@/lib/api';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';

const ROLE_LABEL: Record<TeamRole, string> = {
  VIEWER:   'Leitura',
  OPERATOR: 'Operação',
};

function RoleBadge({ role }: { role: TeamRole }) {
  const op = role === 'OPERATOR';
  return (
    <span className={`inline-flex items-center rounded-full px-md py-micro text-[10px] font-semibold uppercase tracking-wide ${
      op ? 'bg-info-bg text-info' : 'bg-gray-100 text-gray-700'
    }`}>
      {ROLE_LABEL[role]}
    </span>
  );
}

function actionLabel(action: string): string {
  if (action.startsWith('MEMBER_INVITED')) {
    const role = action.split(':')[1];
    return `Convite enviado${role ? ` (${ROLE_LABEL[role as TeamRole] ?? role})` : ''}`;
  }
  if (action === 'MEMBER_REMOVED') return 'Membro removido';
  return action;
}

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [log, setLog]         = useState<AccessLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [showModal, setShow]  = useState(false);

  async function load() {
    const session = getSession();
    if (!session) return;
    setLoading(true);
    setError('');
    try {
      const api = new BanzamiApi(session.gatewayUrl, session.apiKey);
      const [m, l] = await Promise.all([api.listTeamMembers(), api.listAccessLog(50)]);
      setMembers(m.data);
      setLog(l.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar a equipa');
    } finally {
      setLoading(false);
    }
  }

  async function handleRemove(id: string) {
    const session = getSession();
    if (!session) return;
    try {
      const api = new BanzamiApi(session.gatewayUrl, session.apiKey);
      await api.removeTeamMember(id);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col gap-xl max-w-2xl mx-auto">
      {/* Members */}
      <div className="bg-white rounded-lg shadow-card overflow-hidden">
        <div className="flex items-center justify-between px-xl py-lg border-b border-gray-100">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Equipa</h2>
            <p className="text-xs text-gray-400 mt-micro">
              Convide membros e defina o nível de permissão.
            </p>
          </div>
          <button
            onClick={() => setShow(true)}
            className="flex items-center gap-sm h-8 px-md bg-wine text-white rounded-md text-xs font-medium hover:bg-wine-dark transition-colors"
          >
            <Plus size={14} /> Convidar
          </button>
        </div>

        {loading && <div className="flex justify-center py-xl"><Spinner className="h-5 w-5" /></div>}
        {error && <p className="px-xl py-lg text-sm text-error">{error}</p>}
        {!loading && members.length === 0 && <EmptyState message="Ainda não há membros na equipa" />}

        {members.length > 0 && (
          <ul className="divide-y divide-gray-100">
            {members.map(m => (
              <li key={m.id} className="flex items-center gap-md px-xl py-md">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-sm">
                    <p className="text-sm text-gray-900 truncate">{m.email}</p>
                    <RoleBadge role={m.role} />
                  </div>
                  <p className="text-xs text-gray-400 mt-micro">
                    {m.status === 'INVITED' ? 'Convite pendente' : 'Activo'}
                    {' · '}Convidado {new Date(m.invited_at).toLocaleDateString('pt-AO', { dateStyle: 'medium' })}
                  </p>
                </div>
                <button
                  onClick={() => handleRemove(m.id)}
                  title="Remover membro"
                  className="text-gray-400 hover:text-error transition-colors"
                >
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Access log */}
      <div className="bg-white rounded-lg shadow-card overflow-hidden">
        <div className="px-xl py-lg border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Registo de acesso</h2>
          <p className="text-xs text-gray-400 mt-micro">Acções por membro.</p>
        </div>
        {log.length === 0 ? (
          <EmptyState message="Sem actividade registada" />
        ) : (
          <ul className="divide-y divide-gray-100">
            {log.map(e => (
              <li key={e.id} className="flex items-center justify-between gap-md px-xl py-sm">
                <div className="min-w-0">
                  <p className="text-sm text-gray-900 truncate">{actionLabel(e.action)}</p>
                  <p className="text-xs text-gray-400">{e.actor_email}</p>
                </div>
                <span className="text-xs text-gray-400 shrink-0">
                  {new Date(e.created_at).toLocaleString('pt-AO', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showModal && <InviteModal onClose={() => setShow(false)} onInvited={() => { setShow(false); load(); }} />}
    </div>
  );
}

function InviteModal({ onClose, onInvited }: { onClose: () => void; onInvited: () => void }) {
  const [email, setEmail]     = useState('');
  const [role, setRole]       = useState<TeamRole>('VIEWER');
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
      await api.inviteTeamMember(email.trim(), role);
      onInvited();
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
          <h2 className="text-base font-semibold text-gray-900">Convidar membro</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-lg">
          <div className="flex flex-col gap-xs">
            <label className="text-xs font-medium text-gray-700">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="h-10 bg-gray-100 rounded-md px-lg text-sm outline-none focus:ring-2 focus:ring-wine/30 focus:bg-white transition-colors"
              placeholder="membro@exemplo.com"
            />
          </div>
          <div className="flex flex-col gap-xs">
            <label className="text-xs font-medium text-gray-700">Permissão</label>
            <div className="inline-flex rounded-md border border-gray-200 p-0.5">
              {(['VIEWER', 'OPERATOR'] as const).map(rl => (
                <button
                  key={rl}
                  type="button"
                  onClick={() => setRole(rl)}
                  className={`flex-1 h-8 rounded text-xs font-medium transition-colors ${
                    role === rl ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  {ROLE_LABEL[rl]}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-gray-400">
              {role === 'VIEWER' ? 'Pode consultar, sem realizar operações.' : 'Pode realizar operações (reembolsos, levantamentos).'}
            </p>
          </div>

          {error && <p className="text-sm text-error bg-error-bg rounded-md px-md py-sm">{error}</p>}

          <div className="flex gap-md">
            <button type="button" onClick={onClose}
              className="flex-1 h-10 border border-gray-100 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 h-10 bg-wine text-white rounded-md text-sm font-medium hover:bg-wine-dark disabled:opacity-60 transition-colors">
              {loading ? 'A convidar…' : 'Enviar convite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
