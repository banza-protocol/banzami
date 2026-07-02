'use client';

import { useCallback, useEffect, useState } from 'react';
import { developerApi, type Member } from '@/lib/developer-api';
import { useDeveloperAuth } from './DeveloperAuth';
import { useDeveloperData } from './DeveloperData';
import { useToast, copyText } from './Toast';
import { Card, Pill } from './ui';
import { assignableRoles, canModifyTarget, isManager, ROLE_LABELS } from '@/lib/developer-roles';

const ctaGradient = 'linear-gradient(160deg,#B5101F,#7C1016)';

export function MembersManager() {
  const { user } = useDeveloperAuth();
  const { activeWs, wsLoad, csrf, onApiError } = useDeveloperData();
  const { flash } = useToast();

  const [members, setMembers] = useState<Member[]>([]);
  const [load, setLoad] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('DEVELOPER');
  const [busy, setBusy] = useState(false);

  const wsID = activeWs?.id ?? null;
  const myRole = members.find((m) => m.user_id === user?.id)?.role ?? 'VIEWER';
  const canManage = isManager(myRole);
  const roleChoices = assignableRoles(myRole);

  const loadMembers = useCallback(async () => {
    if (!wsID) return;
    setLoad('loading');
    setError('');
    try {
      const { members: m } = await developerApi.listMembers(wsID);
      setMembers(m ?? []);
      setLoad('ready');
    } catch (e) {
      setError(onApiError(e));
      setLoad('error');
    }
  }, [wsID, onApiError]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  const invite = async () => {
    if (!wsID || busy) return;
    setBusy(true);
    try {
      const inv = await developerApi.invite(wsID, inviteEmail, inviteRole, csrf);
      setInviteEmail('');
      // Show the invite link once so the manager can share it.
      void copyText(`${window.location.origin}/invites/accept?token=${inv.token}`);
      flash('Convite criado — link copiado');
      await loadMembers();
    } catch (e) {
      flash(onApiError(e));
    } finally {
      setBusy(false);
    }
  };

  const changeRole = async (m: Member, role: string) => {
    if (!wsID || role === m.role) return;
    setBusy(true);
    try {
      await developerApi.setRole(wsID, m.user_id, role, csrf);
      await loadMembers();
      flash('Papel atualizado');
    } catch (e) {
      flash(onApiError(e)); // FORBIDDEN or LAST_OWNER surfaced clearly
    } finally {
      setBusy(false);
    }
  };

  const remove = async (m: Member) => {
    if (!wsID) return;
    if (!window.confirm('Remover este membro do workspace?')) return;
    setBusy(true);
    try {
      await developerApi.removeMember(wsID, m.user_id, csrf);
      await loadMembers();
      flash('Membro removido');
    } catch (e) {
      flash(onApiError(e));
    } finally {
      setBusy(false);
    }
  };

  if (wsLoad === 'loading' || load === 'loading') {
    return <p style={{ padding: '16px 0', color: '#8a7a7e', fontWeight: 700, fontSize: 14 }}>A carregar membros…</p>;
  }
  if (!activeWs) {
    return <p style={{ padding: '16px 0', color: '#8a7a7e', fontWeight: 700, fontSize: 14 }}>Selecione ou crie um workspace.</p>;
  }
  if (load === 'error') {
    return <p style={{ padding: '16px 0', color: '#C4303C', fontWeight: 800, fontSize: 14 }}>{error}</p>;
  }

  return (
    <div>
      {members.map((m) => {
        const self = m.user_id === user?.id;
        const modifiable = canManage && !self && canModifyTarget(myRole, m.role);
        return (
          <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid #F5E9E7' }}>
            <span style={{ width: 36, height: 36, borderRadius: '50%', background: '#FBD2D0', color: '#9A1B22', fontWeight: 900, fontSize: 13, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              {m.user_id.slice(0, 2).toUpperCase()}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 800, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>
                {self ? 'Você' : m.user_id.slice(0, 12) + '…'}
              </p>
              <p style={{ margin: '1px 0 0', fontSize: 12, color: '#a89a9e', fontWeight: 700 }}>
                {m.status === 'ACTIVE' ? 'Membro ativo' : m.status}
              </p>
            </div>
            {modifiable ? (
              <select
                value={m.role}
                onChange={(e) => changeRole(m, e.target.value)}
                disabled={busy}
                aria-label={`Papel de ${m.user_id}`}
                style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid #EBDBD9', background: '#fff', fontSize: 12.5, fontWeight: 800, color: '#2a2024', cursor: 'pointer' }}
              >
                {/* current role + roles this actor may assign */}
                {[m.role, ...roleChoices.filter((r) => r !== m.role)].map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r] ?? r}
                  </option>
                ))}
              </select>
            ) : (
              <span style={{ padding: '4px 11px', borderRadius: 30, background: m.role === 'OWNER' ? '#FFF1F0' : '#F3EDEC', fontSize: 12, fontWeight: 800, color: m.role === 'OWNER' ? '#B5101F' : '#6a5a5e' }}>
                {ROLE_LABELS[m.role] ?? m.role}
              </span>
            )}
            {modifiable ? (
              <button
                onClick={() => remove(m)}
                disabled={busy}
                style={{ padding: '6px 11px', border: '1.5px solid #EBC7C4', borderRadius: 9, background: '#fff', color: '#B5101F', fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}
              >
                Remover
              </button>
            ) : null}
          </div>
        );
      })}

      {canManage ? (
        <Card style={{ padding: 16, marginTop: 16 }}>
          <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 800, color: '#6a5a5e' }}>Convidar membro</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="email@empresa.co.ao"
              className="bz-in"
              style={{ flex: 1, minWidth: 200, padding: '10px 12px', border: '1.5px solid #EBDBD9', borderRadius: 10, fontSize: 13.5, fontWeight: 600, background: '#FFFDFD', outline: 'none' }}
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              style={{ padding: '10px 12px', borderRadius: 10, border: '1.5px solid #EBDBD9', background: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}
            >
              {roleChoices.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r] ?? r}
                </option>
              ))}
            </select>
            <button
              onClick={invite}
              disabled={busy || !inviteEmail}
              className="bz-cta"
              style={{ padding: '10px 16px', border: 'none', borderRadius: 10, background: ctaGradient, color: '#fff', fontWeight: 800, fontSize: 13, cursor: busy || !inviteEmail ? 'not-allowed' : 'pointer', opacity: busy || !inviteEmail ? 0.6 : 1 }}
            >
              Convidar
            </button>
          </div>
          <p style={{ margin: '10px 0 0', fontSize: 11.5, color: '#a89a9e', fontWeight: 700 }}>
            Um link de convite é gerado e copiado. Expira em 7 dias e pode ser revogado.
          </p>
        </Card>
      ) : (
        <p style={{ margin: '14px 0 0', fontSize: 12.5, color: '#a89a9e', fontWeight: 700 }}>
          Só Owners e Admins podem convidar ou gerir membros.
        </p>
      )}
    </div>
  );
}
