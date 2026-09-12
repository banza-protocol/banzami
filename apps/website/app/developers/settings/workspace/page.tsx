'use client';

import Link from 'next/link';
import { useState } from 'react';
import { PortalPage } from '@/components/developers/portal/PortalShell';
import { Card } from '@/components/developers/portal/ui';
import { useDeveloperData } from '@/components/developers/portal/DeveloperData';
import { useToast } from '@/components/developers/portal/Toast';
import { MembersManager } from '@/components/developers/portal/MembersManager';
import { ConfirmByName, DangerAction, DangerZone } from '@/components/developers/portal/DangerZone';
import { developerApi } from '@/lib/developer-api';
import { isManager } from '@/lib/developer-roles';
import {
  ArchivedBanner,
  Field,
  FieldValue,
  Identifier,
  NOTE,
  RenameField,
  SettingsTabs,
  codeOf,
  detailsOf,
  isArchived,
  messageFor,
  useWorkspaceFootprint,
  useWorkspaceRole,
  utcStamp,
  workspaceFootprintSentence,
} from '../settings-ui';

// Workspace settings — the container, not the project.
//
// There was no page for this. A workspace could be created and never renamed,
// never left and never closed, and its member list was folded into the middle
// of the PROJECT settings page under a heading that named a project. That is
// how "Remover" came to mean "remove this person from every project in the
// workspace" while the text above it said the name of one of them.
//
// The one thing missing here is an invite list: the API has
// DELETE /workspaces/{id}/invites/{inviteID} but no GET, so nothing can
// enumerate the invites that are pending. What MembersManager can honestly
// offer is revocation of the invites created in front of it — see the note
// there, and the report.

function WorkspaceSettings() {
  const { activeWs, wsLoad, csrf, onApiError, reloadWorkspaces, projects } = useDeveloperData();
  const { flash } = useToast();
  const { role, load: roleLoad } = useWorkspaceRole();

  const [dialog, setDialog] = useState<'leave' | 'archive' | 'delete' | null>(null);
  const { reading: footprint, reload: reloadFootprint } = useWorkspaceFootprint(activeWs?.id ?? null);
  // The count the server sent back with a WORKSPACE_NOT_EMPTY refusal. Held so
  // the dialog can say "ainda tem 3 projetos ativos" instead of "conflito".
  const [activeProjectsBlocking, setActiveProjectsBlocking] = useState<number | null>(null);

  const explain = (e: unknown) => messageFor(e, onApiError(e));
  const roleUnknown = roleLoad !== 'ready';
  const denied = (what: string): string =>
    roleUnknown
      ? 'A confirmar o seu papel neste workspace…'
      : `O seu papel neste workspace não permite ${what}.`;

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

  const archived = isArchived(activeWs.status);
  const canManage = isManager(role ?? '');
  const isOwner = role === 'OWNER';
  // What stands between this workspace and being deleted, as the server counts
  // it. Read before either ending is offered, so the danger zone names the
  // operation that will actually happen.
  const wf = footprint.state === 'read' ? footprint.footprint : null;
  const deletable = wf?.deletable === true;

  const rename = async (name: string) => {
    try {
      await developerApi.renameWorkspace(activeWs.id, name, csrf);
      await reloadWorkspaces();
      flash('Nome do workspace atualizado');
    } catch (e) {
      throw new Error(explain(e));
    }
  };

  const leave = async () => {
    try {
      await developerApi.leaveWorkspace(activeWs.id, csrf);
      await reloadWorkspaces();
      flash('Saiu do workspace');
    } catch (e) {
      throw new Error(explain(e));
    }
  };

  const remove = async () => {
    try {
      await developerApi.deleteWorkspace(activeWs.id, activeWs.name, csrf);
      await reloadWorkspaces();
      flash('Workspace eliminado');
    } catch (e) {
      // The footprint was read before the dialog opened. If a project was
      // created in between, the server refuses with the counts as they are NOW —
      // so re-read them rather than leaving the page offering the wrong ending.
      if (codeOf(e) === 'WORKSPACE_NOT_EMPTY') reloadFootprint();
      throw new Error(explain(e));
    }
  };

  const archive = async () => {
    setActiveProjectsBlocking(null);
    try {
      await developerApi.archiveWorkspace(activeWs.id, activeWs.name, csrf);
      await reloadWorkspaces();
      flash('Workspace arquivado');
    } catch (e) {
      if (codeOf(e) === 'WORKSPACE_NOT_EMPTY') {
        const n = detailsOf(e).active_projects;
        setActiveProjectsBlocking(typeof n === 'number' ? n : null);
      }
      throw new Error(explain(e));
    }
  };

  // What the reader has to deal with before the workspace can close. The count
  // from a refusal wins when there is one — it is the server's, and it counts
  // projects across the whole workspace rather than the page the selector holds.
  const activeHere = projects.filter((p) => !isArchived(p.status)).length;
  const blocking = activeProjectsBlocking ?? activeHere;

  return (
    <>
      <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, letterSpacing: '-.02em' }}>Configurações</h1>
      <p style={{ margin: '6px 0 22px', fontSize: 14.5, color: '#8a7a7e', fontWeight: 600 }}>
        O workspace agrupa os seus projetos e as pessoas que lhes acedem. As definições de um
        projeto em concreto estão em{' '}
        <Link href="/settings" style={{ color: '#B5101F', fontWeight: 800 }}>
          Projeto
        </Link>
        .
      </p>

      <SettingsTabs active="workspace" />

      {archived ? <ArchivedBanner what="workspace" /> : null}

      <Card style={{ padding: 24, marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 18px', fontSize: 16, fontWeight: 900 }}>Geral</h3>

        <div className="bz-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
          <RenameField
            label="NOME DO WORKSPACE"
            value={activeWs.name}
            onSave={rename}
            readOnlyReason={
              archived
                ? 'Um workspace arquivado não pode ser renomeado.'
                : canManage
                  ? null
                  : denied('renomear o workspace')
            }
          />
          <Field label="ID DO WORKSPACE">
            <Identifier value={activeWs.id} what="o ID do workspace" />
          </Field>
          <Field label="IDENTIFICADOR">
            <FieldValue>{activeWs.slug}</FieldValue>
          </Field>
          <Field label="CRIADO">
            <FieldValue>{utcStamp(activeWs.created_at)}</FieldValue>
          </Field>
        </div>

        <p style={NOTE}>
          Renomear o workspace não altera o seu identificador nem afeta os projetos, as chaves ou
          os registos que lhe pertencem.
        </p>
      </Card>

      <Card style={{ padding: 24, marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 900 }}>Membros</h3>
        <p style={{ margin: '0 0 8px', fontSize: 13.5, color: '#8a7a7e', fontWeight: 600, lineHeight: 1.55 }}>
          Quem entra aqui entra em <strong>todos os projetos deste workspace</strong>, e quem sai
          perde acesso a todos eles. Não há permissões por projeto.
        </p>
        <MembersManager />
      </Card>

      <DangerZone description="A primeira ação afeta apenas o seu acesso. A segunda encerra o workspace para toda a equipa.">
        <DangerAction
          title="Sair do workspace"
          description={
            <>
              Perde acesso a este workspace e a todos os seus projetos. Para voltar a entrar precisa
              de um convite novo de um Proprietário ou Administrador. Nada é apagado.
            </>
          }
          actionLabel="Sair do workspace"
          onAction={() => setDialog('leave')}
        />

        {/* One ending is offered, and it is the true one for this workspace's
            state: a workspace that never held a project is DELETED; one that
            held anything is ARCHIVED, because its projects carry history. */}
        {deletable ? (
          <DangerAction
            title="Eliminar workspace"
            description={
              <>
                Este workspace nunca teve projetos, por isso pode ser eliminado — deixa de existir
                e sai do seletor. Os membros e os convites pendentes desaparecem com ele. O registo
                de auditoria guarda que foi eliminado, e esse registo sobrevive ao workspace.
              </>
            }
            actionLabel="Eliminar workspace"
            onAction={() => setDialog('delete')}
            unavailableReason={
              archived
                ? 'Este workspace está arquivado.'
                : isOwner
                  ? null
                  : roleUnknown
                    ? 'A confirmar o seu papel neste workspace…'
                    : 'Só o Proprietário do workspace o pode eliminar.'
            }
          />
        ) : (
          <DangerAction
            title="Arquivar workspace"
            description={
              <>
                Encerra o workspace. {wf ? workspaceFootprintSentence(wf) : ''} Um projeto que já
                teve chaves, pedidos ou uma configuração financeira é arquivado e não eliminado, e
                o workspace que o contém segue a mesma regra. Só é possível depois de todos os
                projetos ativos estarem arquivados.
              </>
            }
            actionLabel="Arquivar workspace"
            onAction={() => {
              setActiveProjectsBlocking(null);
              setDialog('archive');
            }}
            unavailableReason={
              archived
                ? 'Este workspace já está arquivado.'
                : footprint.state === 'loading'
                  ? 'A verificar o que este workspace já contém…'
                  : footprint.state === 'unreadable'
                    ? 'Não foi possível verificar o que este workspace já contém.'
                    : isOwner
                      ? null
                      : roleUnknown
                        ? 'A confirmar o seu papel neste workspace…'
                        : 'Só o Proprietário do workspace o pode arquivar.'
            }
          />
        )}
      </DangerZone>

      {dialog === 'leave' ? (
        <ConfirmByName
          title="Sair do workspace"
          body="Deixa de ver este workspace, os seus projetos, chaves e registos. Nada é apagado e nenhum projeto é afetado."
          consequence={
            <>
              Se for o último Proprietário, o servidor recusa: um workspace não pode ficar sem
              ninguém responsável. Nesse caso promova outra pessoa a Proprietário primeiro, na
              lista de membros acima.
            </>
          }
          name={activeWs.name}
          nameLabel="Escreva o nome do workspace para confirmar"
          confirmLabel="Sair"
          onConfirm={leave}
          onClose={() => setDialog(null)}
        />
      ) : null}

      {dialog === 'delete' ? (
        <ConfirmByName
          title="Eliminar workspace"
          body="Eliminar remove o workspace definitivamente. Não fica arquivado: deixa de existir e sai do seletor de toda a equipa."
          consequence={
            <>
              Este workspace nunca teve projetos, por isso não há histórico financeiro a preservar.
              Os membros e os convites pendentes são removidos com ele. O registo de auditoria
              guarda que foi eliminado — esse registo não desaparece.
            </>
          }
          name={activeWs.name}
          nameLabel="Escreva o nome do workspace para confirmar"
          confirmLabel="Eliminar workspace"
          onConfirm={remove}
          onClose={() => setDialog(null)}
        />
      ) : null}

      {dialog === 'archive' ? (
        <ConfirmByName
          title="Arquivar workspace"
          body="Arquivar encerra o workspace para toda a equipa. É um arquivo, não uma eliminação: o histórico mantém-se e não há forma de o reabrir a partir da consola."
          consequence={
            blocking > 0 ? (
              <>
                {blocking === 1
                  ? 'Este workspace ainda tem 1 projeto ativo.'
                  : `Este workspace ainda tem ${blocking} projetos ativos.`}{' '}
                Arquive cada um em{' '}
                <Link href="/settings" style={{ color: '#B5101F', fontWeight: 800 }}>
                  Configurações · Projeto
                </Link>{' '}
                — selecionando-o primeiro no seletor da barra lateral — e volte aqui.
              </>
            ) : (
              <>Nenhum projeto ativo neste workspace. Os membros perdem o acesso assim que confirmar.</>
            )
          }
          name={activeWs.name}
          nameLabel="Escreva o nome do workspace para confirmar"
          confirmLabel="Arquivar workspace"
          onConfirm={archive}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </>
  );
}

// The hooks run INSIDE PortalPage, which is what mounts the data provider —
// calling them in the exported page component puts them outside it and the
// website build fails during static generation.
export default function WorkspaceSettingsPage() {
  return (
    <PortalPage active="settings">
      <div className="bz-view" style={{ maxWidth: 860 }}>
        <WorkspaceSettings />
      </div>
    </PortalPage>
  );
}
