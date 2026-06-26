'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { UserPlus, X } from 'lucide-react';
import { getSession } from '@/lib/session';
import { AdminApi, AdminApiError, type Operator, type OperatorRole } from '@/lib/admin-api';
import { Badge, statusLabelPt } from '@/components/ui/badge';
import { Card, TableWrap, Th, Td, EmptyMsg, ErrorState } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { formatDate, initials } from '@/lib/format';

const ROLES: OperatorRole[] = ['SUPER_ADMIN', 'OPERATIONS', 'COMPLIANCE', 'SUPPORT', 'READ_ONLY'];

function getApi(): AdminApi | null {
  const s = getSession();
  return s ? new AdminApi(s.token) : null;
}

function isLocked(o: Operator): boolean {
  return !!o.locked_until && new Date(o.locked_until).getTime() > Date.now();
}

export default function OperatorsPage() {
  const toast = useToast();
  const [rows, setRows] = useState<Operator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const isSuperAdmin = getSession()?.user.role === 'SUPER_ADMIN';

  const load = useCallback(async () => {
    const api = getApi();
    if (!api) return;
    setLoading(true);
    setError('');
    try {
      const r = await api.listOperators();
      setRows(r.operators);
    } catch {
      setError('Não foi possível carregar os operadores.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function errMsg(e: unknown, fallback: string): string {
    if (e instanceof AdminApiError) {
      if (e.code === 'LAST_SUPER_ADMIN') return 'Não pode suspender/despromover o último SUPER_ADMIN.';
      if (e.code === 'EMAIL_EXISTS') return 'Já existe um operador com esse email.';
      if (e.code === 'INVALID_ROLE') return 'Função inválida.';
      if (e.code === 'FORBIDDEN') return 'Apenas o SUPER_ADMIN pode gerir operadores.';
    }
    return fallback;
  }

  async function changeRole(o: Operator, role: OperatorRole) {
    if (role === o.role) return;
    const api = getApi();
    if (!api) return;
    setBusy(o.id);
    try {
      await api.setOperatorRole(o.id, role);
      toast('success', 'Função atualizada.');
      await load();
    } catch (e) {
      toast('danger', errMsg(e, 'Não foi possível alterar a função.'));
    } finally {
      setBusy(null);
    }
  }

  // INVITED / no-password operators get a (re)invite; active ones get a reset.
  async function sendInviteOrReset(o: Operator) {
    const api = getApi();
    if (!api) return;
    const invite = o.status === 'INVITED' || !o.password_set;
    setBusy(o.id);
    try {
      const r = invite ? await api.resendOperatorInvite(o.id) : await api.requestOperatorPasswordReset(o.id);
      const url = invite ? (r as { invite_url?: string }).invite_url : (r as { reset_url?: string }).reset_url;
      if (url) {
        toast('info', invite ? 'Convite gerado — copie o link do ecrã.' : 'Link de redefinição gerado — copie o link do ecrã.');
        window.prompt(invite ? 'Link de convite (uso único):' : 'Link de redefinição (uso único):', url);
      } else {
        toast('success', invite ? `Convite enviado a ${r.email_sent_to}.` : `Link de redefinição enviado a ${r.email_sent_to}.`);
      }
    } catch (e) {
      toast('danger', errMsg(e, 'Não foi possível gerar o link.'));
    } finally {
      setBusy(null);
    }
  }

  async function toggleStatus(o: Operator) {
    const api = getApi();
    if (!api) return;
    const suspend = o.status === 'ACTIVE';
    if (suspend && !window.confirm(`Suspender o acesso de ${o.full_name}?`)) return;
    setBusy(o.id);
    try {
      if (suspend) await api.suspendOperator(o.id);
      else await api.activateOperator(o.id);
      toast('success', suspend ? 'Operador suspenso.' : 'Operador ativado.');
      await load();
    } catch (e) {
      toast('danger', errMsg(e, 'Não foi possível alterar o estado.'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="mb-[18px] flex items-center justify-between gap-4">
        <p className="m-0 text-[14px] font-semibold text-[#9a8a8e]">
          Operadores com acesso ao BANZADMIN. A gestão é exclusiva do SUPER_ADMIN.
        </p>
        {isSuperAdmin && (
          <button
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-2 rounded-[14px] bg-[#1a1416] px-5 py-3 text-[14px] font-extrabold text-white transition hover:bg-black"
          >
            <UserPlus size={17} strokeWidth={1.9} /> Criar operador
          </button>
        )}
      </div>

      {loading ? (
        <Card><div className="adm-skel m-6 h-[200px] rounded-[14px]" /></Card>
      ) : error ? (
        <Card><ErrorState message={error} /></Card>
      ) : rows.length === 0 ? (
        <Card><EmptyMsg title="Ainda não há operadores." /></Card>
      ) : (
        <TableWrap>
          <thead>
            <tr className="bg-[#FFF7F6]">
              <Th>Operador</Th>
              <Th>Função</Th>
              <Th>Estado</Th>
              <Th>Último login / convite</Th>
              {isSuperAdmin && <Th />}
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id} className="adm-row transition-colors">
                <Td>
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-[#1a1416] text-[12px] font-extrabold text-white">
                      {initials(o.full_name)}
                    </span>
                    <div>
                      <div className="text-[14px] font-extrabold">{o.full_name}</div>
                      <div className="font-mono text-[12px] font-semibold text-[#9a8a8e]">{o.email}</div>
                    </div>
                  </div>
                </Td>
                <Td>
                  {isSuperAdmin ? (
                    <select
                      value={o.role}
                      disabled={busy === o.id}
                      onChange={(e) => changeRole(o, e.target.value as OperatorRole)}
                      className="cursor-pointer rounded-[10px] border-[1.5px] border-[#f1e3e3] bg-white px-2.5 py-1.5 text-[12.5px] font-extrabold text-[#5a4a4e] outline-none focus:border-[#B5101F]"
                    >
                      {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  ) : (
                    <span className="font-mono text-[12.5px] font-extrabold text-[#5a4a4e]">{o.role}</span>
                  )}
                </Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <Badge label={statusLabelPt(o.status)} />
                    {isLocked(o) && <Badge label="Bloqueado" variant="danger" />}
                    {!o.password_set && o.status !== 'INVITED' && <Badge label="Sem password" variant="warning" />}
                  </div>
                </Td>
                <Td mono className="font-semibold text-[#5a4a4e]">
                  {o.last_login_at
                    ? formatDate(o.last_login_at)
                    : o.status === 'INVITED' && o.invited_at
                      ? `Convidado ${formatDate(o.invited_at)}`
                      : '—'}
                </Td>
                {isSuperAdmin && (
                  <Td right>
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => sendInviteOrReset(o)}
                        disabled={busy === o.id}
                        className="rounded-[30px] border-[1.5px] border-[#f1e3e3] bg-white px-[14px] py-2 text-[13px] font-extrabold text-[#5a4a4e] transition hover:bg-[#FFF7F6] disabled:opacity-50"
                      >
                        {o.status === 'INVITED' || !o.password_set ? 'Reenviar convite' : 'Reset password'}
                      </button>
                      <button
                        onClick={() => toggleStatus(o)}
                        disabled={busy === o.id}
                        className={`rounded-[30px] px-[14px] py-2 text-[13px] font-extrabold transition disabled:opacity-50 ${
                          o.status === 'ACTIVE' ? 'bg-[#FFF1F0] text-[#B5101F]' : 'bg-[#eafaf0] text-[#1f9d57]'
                        }`}
                      >
                        {o.status === 'ACTIVE' ? 'Suspender' : 'Ativar'}
                      </button>
                    </div>
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      {createOpen && (
        <CreateOperatorModal
          onClose={() => setCreateOpen(false)}
          onCreated={() => { setCreateOpen(false); void load(); }}
        />
      )}
    </>
  );
}

function CreateOperatorModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<OperatorRole>('OPERATIONS');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const inputCls =
    'w-full rounded-[14px] border-[1.5px] border-[#f1e3e3] bg-[#FFF7F6] px-4 py-3 text-[15px] font-semibold text-[#2a2024] outline-none transition focus:border-[#B5101F] focus:ring-4 focus:ring-[#B5101F]/10';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !fullName.trim()) {
      setError('Preencha o email e o nome completo.');
      return;
    }
    const api = getApi();
    if (!api) return;
    setLoading(true);
    setError('');
    try {
      const r = await api.createOperator(email.trim(), fullName.trim(), role);
      if (r.invite_url) {
        toast('info', 'Operador criado — copie o link de convite do ecrã.');
        window.prompt('Link de convite (uso único, expira em 72h):', r.invite_url);
      } else {
        toast('success', `Convite enviado a ${r.email_sent_to}.`);
      }
      onCreated();
    } catch (err) {
      if (err instanceof AdminApiError && err.code === 'EMAIL_EXISTS') setError('Já existe um operador com esse email.');
      else setError('Não foi possível criar o operador.');
    } finally {
      setLoading(false);
    }
  }

  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-[440px] rounded-[20px] border border-[#f1e3e3] bg-white p-7 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.4)]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="m-0 text-[18px] font-black tracking-[-0.01em]">Criar operador</h2>
          <button onClick={onClose} aria-label="Fechar" className="text-[#9a8a8e] hover:text-[#2a2024]"><X size={20} strokeWidth={1.8} /></button>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div>
            <label className="mb-1.5 block text-[13px] font-extrabold">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} autoCapitalize="none" required />
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] font-extrabold">Nome completo</label>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputCls} required />
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] font-extrabold">Função</label>
            <select value={role} onChange={(e) => setRole(e.target.value as OperatorRole)} className={`${inputCls} cursor-pointer`}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <p className="m-0 text-[12.5px] font-semibold text-[#9a8a8e]">
            O operador é criado sem palavra-passe (estado Convidado) e recebe um link de convite para a definir. Só fica ativo depois disso.
          </p>
          {error && <div className="rounded-[12px] border border-[#f6d3d1] bg-[#FFF1F0] px-[14px] py-2.5 text-[13px] font-bold text-[#B5101F]">{error}</div>}
          <button type="submit" disabled={loading} className="mt-2 w-full rounded-[14px] bg-[#1a1416] py-3.5 text-[15px] font-extrabold text-white transition hover:bg-black disabled:opacity-60">
            {loading ? 'A criar…' : 'Criar operador'}
          </button>
        </form>
      </div>
    </div>,
    document.body,
  );
}
