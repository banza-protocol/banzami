'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { PortalPage } from '@/components/developers/portal/PortalShell';
import { Card } from '@/components/developers/portal/ui';
import { useDeveloperData } from '@/components/developers/portal/DeveloperData';
import { developerApi, type ActivityEvent, type Member } from '@/lib/developer-api';
import { isManager } from '@/lib/developer-roles';
import { NOTE, SettingsTabs, messageFor, useWorkspaceRole, utcStamp } from '../settings-ui';
import {
  FILTERS,
  actorLabel,
  applyFilters,
  describe,
  type ActivityFilter,
} from './activity-ui';

// Atividade do workspace — quem mudou o quê, a quem, e quando.
//
// developer.audit_events já registava cada convite, cada mudança de papel e cada
// remoção desde que o domínio existe, e nenhuma rota alguma vez o leu. O registo
// existia e não havia forma de lhe chegar, o que é pior do que não registar: a
// pergunta "quem removeu esta pessoa" tinha resposta e ninguém lhe acedia.
//
// Esta página é o lado da leitura. Só Proprietários e Administradores — ver
// quem tem autoridade num workspace é uma questão de gestão — e só deste
// workspace: o servidor filtra pelo workspace do qual o leitor já é membro.
//
// Não é a página de Registos. Essa mostra o tráfego de integração (os pedidos
// que uma chave fez à API). Esta responde a outra pergunta.

function WorkspaceActivity() {
  const { activeWs, wsLoad, onApiError } = useDeveloperData();
  const { role, load: roleLoad } = useWorkspaceRole();

  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [load, setLoad] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [more, setMore] = useState(false);
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const [query, setQuery] = useState('');
  // The per-member view is asked of the SERVER, not of the rows on screen: a
  // person's history is usually older than the page you happen to be looking at.
  const [member, setMember] = useState('');
  const [members, setMembers] = useState<Member[]>([]);

  const wsID = activeWs?.id ?? null;
  const canRead = isManager(role ?? '');

  // The first page is read fresh whenever the selected workspace changes. It is
  // not merged with what was already on screen: two workspaces' histories in
  // one list is exactly the confusion this surface must never create.
  useEffect(() => {
    if (!wsID || roleLoad !== 'ready' || !canRead) return;
    let live = true;
    developerApi.listMembers(wsID).then(
      ({ members: ms }) => live && setMembers(ms ?? []),
      // The member picker is a convenience. Losing it must not take the
      // activity list with it.
      () => live && setMembers([]),
    );
    return () => {
      live = false;
    };
  }, [wsID, roleLoad, canRead]);

  useEffect(() => {
    if (!wsID || roleLoad !== 'ready' || !canRead) return;
    let live = true;
    setLoad('loading');
    setEvents([]);
    developerApi.workspaceActivity(wsID, { member: member || undefined }).then(
      (page) => {
        if (!live) return;
        setEvents(page.events ?? []);
        setCursor(page.next_cursor ?? null);
        setLoad('ready');
      },
      (e) => {
        if (!live) return;
        setError(messageFor(e, onApiError(e)));
        setLoad('error');
      },
    );
    return () => {
      live = false;
    };
  }, [wsID, roleLoad, canRead, member, onApiError]);

  const loadMore = useCallback(async () => {
    if (!wsID || !cursor) return;
    setMore(true);
    try {
      const page = await developerApi.workspaceActivity(wsID, { member: member || undefined, cursor });
      setEvents((prev) => [...prev, ...(page.events ?? [])]);
      setCursor(page.next_cursor ?? null);
    } catch (e) {
      setError(messageFor(e, onApiError(e)));
    } finally {
      setMore(false);
    }
  }, [wsID, cursor, member, onApiError]);

  if (wsLoad === 'loading' && !activeWs) {
    return <p style={{ margin: 0, fontSize: 14, color: '#a89a9e', fontWeight: 700 }}>A carregar o workspace…</p>;
  }
  if (!activeWs) {
    return (
      <Card style={{ padding: 24 }}>
        <p style={{ margin: 0, fontSize: 14, color: '#8a7a7e', fontWeight: 700 }}>
          Nenhum workspace selecionado. Escolha ou crie um workspace no seletor da barra lateral.
        </p>
      </Card>
    );
  }

  const shown = applyFilters(events, filter, query);

  return (
    <>
      <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, letterSpacing: '-.02em' }}>Configurações</h1>
      <p style={{ margin: '6px 0 22px', fontSize: 14.5, color: '#8a7a7e', fontWeight: 600 }}>
        O que mudou neste workspace, por quem e quando. Para os pedidos que as suas chaves fizeram
        à API, veja{' '}
        <Link href="/logs" style={{ color: '#B5101F', fontWeight: 800 }}>
          Registos
        </Link>
        .
      </p>

      <SettingsTabs active="activity" />

      <Card style={{ padding: 24 }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 900 }}>Atividade do workspace</h3>
        <p style={{ margin: '0 0 16px', fontSize: 13.5, color: '#8a7a7e', fontWeight: 600, lineHeight: 1.55 }}>
          Convites, entradas e saídas, mudanças de papel, e as alterações ao workspace, aos seus
          projetos e às suas chaves. Este registo é <strong>deste workspace</strong> e de mais
          nenhum, e não inclui o histórico de segurança da conta pessoal de ninguém.
        </p>

        {roleLoad !== 'ready' ? (
          <p style={{ margin: 0, fontSize: 14, color: '#a89a9e', fontWeight: 700 }}>
            A confirmar o seu papel neste workspace…
          </p>
        ) : !canRead ? (
          <p style={{ margin: 0, fontSize: 14, color: '#8a7a7e', fontWeight: 700, lineHeight: 1.6 }}>
            O seu papel neste workspace não permite ver a atividade. Ver quem tem acesso e quem o
            concedeu está reservado a Proprietários e Administradores.
          </p>
        ) : (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 14 }}>
              {FILTERS.map((f) => {
                const on = f.key === filter;
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFilter(f.key)}
                    aria-pressed={on}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 999,
                      border: `1px solid ${on ? '#B5101F' : '#F2E2E0'}`,
                      background: on ? '#B5101F' : '#fff',
                      color: on ? '#fff' : '#8a7a7e',
                      fontSize: 12.5,
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    {f.label}
                  </button>
                );
              })}
              <select
                value={member}
                onChange={(e) => setMember(e.target.value)}
                aria-label="Ver a atividade de um membro"
                style={{
                  padding: '7px 10px',
                  borderRadius: 8,
                  border: '1px solid #F2E2E0',
                  background: '#fff',
                  fontSize: 12.5,
                  fontWeight: 800,
                  color: member ? '#B5101F' : '#8a7a7e',
                }}
              >
                <option value="">Todos os membros</option>
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.name || m.email || m.user_id.slice(0, 8)}
                  </option>
                ))}
              </select>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Procurar por pessoa ou ação"
                aria-label="Procurar na atividade por pessoa ou ação"
                style={{
                  flex: '1 1 200px',
                  minWidth: 0,
                  padding: '7px 12px',
                  borderRadius: 8,
                  border: '1px solid #F2E2E0',
                  fontSize: 13.5,
                  fontWeight: 600,
                  color: '#2a2024',
                }}
              />
            </div>

            {load === 'loading' ? (
              <p style={{ margin: 0, fontSize: 14, color: '#a89a9e', fontWeight: 700 }}>A carregar a atividade…</p>
            ) : load === 'error' ? (
              <p style={{ margin: 0, fontSize: 14, color: '#B5101F', fontWeight: 700 }}>{error}</p>
            ) : shown.length === 0 ? (
              <p style={{ margin: 0, fontSize: 14, color: '#8a7a7e', fontWeight: 700 }}>
                {events.length === 0
                  ? member
                    ? 'Não há atividade registada para este membro neste workspace.'
                    : 'Ainda não há atividade registada neste workspace.'
                  : 'Nenhuma atividade corresponde ao que procura.'}
              </p>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {shown.map((ev) => (
                  <li
                    key={ev.id}
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '2px 10px',
                      alignItems: 'baseline',
                      padding: '11px 0',
                      borderTop: '1px solid #F7EEEC',
                    }}
                  >
                    <span style={{ fontSize: 14, fontWeight: 800, color: '#2a2024' }}>{actorLabel(ev)}</span>
                    <span style={{ flex: '1 1 240px', minWidth: 0, fontSize: 14, color: '#5a4a4e', fontWeight: 600 }}>
                      {describe(ev)}
                    </span>
                    <time
                      dateTime={ev.created_at}
                      style={{ fontSize: 12.5, color: '#a89a9e', fontWeight: 700, whiteSpace: 'nowrap' }}
                    >
                      {utcStamp(ev.created_at)}
                    </time>
                  </li>
                ))}
              </ul>
            )}

            {cursor ? (
              <button
                type="button"
                onClick={loadMore}
                disabled={more}
                style={{
                  marginTop: 14,
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: '1px solid #F2E2E0',
                  background: '#fff',
                  color: '#B5101F',
                  fontSize: 13.5,
                  fontWeight: 800,
                  cursor: more ? 'default' : 'pointer',
                }}
              >
                {more ? 'A carregar…' : 'Ver atividade mais antiga'}
              </button>
            ) : null}

            <p style={NOTE}>
              Os registos são permanentes e não podem ser editados nem apagados a partir da consola.
              Sobrevivem ao que descrevem: um projeto eliminado continua a aparecer aqui.
            </p>
          </>
        )}
      </Card>
    </>
  );
}

// As hooks correm DENTRO do PortalPage, que é quem monta o provider de dados.
export default function WorkspaceActivityPage() {
  return (
    <PortalPage active="settings">
      <div className="bz-view" style={{ maxWidth: 860 }}>
        <WorkspaceActivity />
      </div>
    </PortalPage>
  );
}
