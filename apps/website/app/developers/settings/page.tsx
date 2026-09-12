'use client';

import Link from 'next/link';
import { useState } from 'react';
import { PortalPage } from '@/components/developers/portal/PortalShell';
import { Card } from '@/components/developers/portal/ui';
import { useDeveloperData } from '@/components/developers/portal/DeveloperData';
import { useToast } from '@/components/developers/portal/Toast';
import { ConfirmByName, DangerAction, DangerZone } from '@/components/developers/portal/DangerZone';
import { developerApi } from '@/lib/developer-api';
import { canBuild, isManager } from '@/lib/developer-roles';
import {
  ArchivedBanner,
  EnvironmentValue,
  Field,
  FieldValue,
  Identifier,
  MONO,
  NOTE,
  RenameField,
  SettingsTabs,
  codeOf,
  footprintSentence,
  isArchived,
  messageFor,
  useProjectEnvironment,
  useProjectFootprint,
  useWorkspaceRole,
  utcStamp,
} from './settings-ui';

// Project settings — this project, and only this project.
//
// This page used to describe a project that did not exist ("Minha Loja Online"),
// beside an Editar button with no handler and a green toggle claiming that OTP
// reauthentication guarded critical actions. Those are gone and the tests below
// this file keep them gone.
//
// What replaced them was honest but stopped short: every field was read-only
// and the page ended in a paragraph explaining that closing a project was "an
// operator operation and not a button", next to an email address. That was true
// when there was no endpoint. There is one now — two, in fact, because deleting
// and archiving answer different questions — so the paragraph has become the
// actions it was standing in for.
//
// The member list that used to sit in the middle of this page is gone from it.
// It was never about this project: it governs the WORKSPACE, and removing
// someone from it removes them from every project in it. It lives at
// /settings/workspace now, under a heading that says workspace.

function ProjectSettings() {
  const { activeWs, activeProject, prjLoad, csrf, onApiError, reloadProjects } = useDeveloperData();
  const { flash } = useToast();
  const { role, load: roleLoad } = useWorkspaceRole();
  const projectID = activeProject?.id ?? null;
  const env = useProjectEnvironment(projectID);
  const { reading: footprint, reload: reloadFootprint } = useProjectFootprint(projectID);

  const [dialog, setDialog] = useState<'archive' | 'delete' | null>(null);

  const explain = (e: unknown) => messageFor(e, onApiError(e));
  const canManage = isManager(role ?? '');
  const archived = isArchived(activeProject?.status);

  // "You may not" and "we do not know yet" are different sentences. Rendering
  // the first while the members call is still open tells a Proprietário they
  // lack an authority they have, and they believe it.
  const roleUnknown = roleLoad !== 'ready';
  const denied = (what: string): string =>
    roleUnknown
      ? 'A confirmar o seu papel neste workspace…'
      : `O seu papel neste workspace não permite ${what}.`;

  if (prjLoad === 'loading' && !activeProject) {
    return <p style={{ margin: 0, fontSize: 14, color: '#a89a9e', fontWeight: 700 }}>A carregar o projeto…</p>;
  }
  if (!activeProject) {
    return (
      <Card style={{ padding: 24 }}>
        <p style={{ margin: 0, fontSize: 14, color: '#8a7a7e', fontWeight: 700 }}>
          Nenhum projeto selecionado. Escolha ou crie um projeto no seletor da barra lateral.
        </p>
      </Card>
    );
  }

  const rename = async (name: string) => {
    try {
      await developerApi.renameProject(activeProject.id, name, csrf);
      await reloadProjects();
      flash('Nome do projeto atualizado');
    } catch (e) {
      throw new Error(explain(e));
    }
  };

  const archive = async () => {
    try {
      const { keys_revoked } = await developerApi.archiveProject(activeProject.id, activeProject.name, csrf);
      await reloadProjects();
      reloadFootprint();
      flash(
        keys_revoked === 0
          ? 'Projeto arquivado. Não havia chaves ativas para revogar.'
          : `Projeto arquivado. ${keys_revoked === 1 ? '1 chave revogada' : `${keys_revoked} chaves revogadas`}.`,
      );
    } catch (e) {
      throw new Error(explain(e));
    }
  };

  const remove = async () => {
    try {
      await developerApi.deleteProject(activeProject.id, activeProject.name, csrf);
      await reloadProjects();
      flash('Projeto eliminado');
    } catch (e) {
      // The footprint was read before the dialog opened. If something was
      // written in between, the server refuses with the counts as they are NOW
      // — so re-read them rather than leaving the page asserting the old ones.
      if (codeOf(e) === 'PROJECT_NOT_EMPTY') reloadFootprint();
      throw new Error(explain(e));
    }
  };

  // What stands between this project and being deleted, as the server counts it.
  const f = footprint.state === 'read' ? footprint.footprint : null;
  const deletable = f?.deletable === true;
  const deleteUnavailable = (() => {
    if (!canManage) return denied('eliminar um projeto');
    if (footprint.state === 'loading') return 'A verificar o que este projeto já contém…';
    if (footprint.state === 'unreadable') {
      return 'Não foi possível verificar o que este projeto já contém, por isso a eliminação não é oferecida.';
    }
    if (!deletable && f) return `${footprintSentence(f)} Pode ser arquivado, não eliminado.`;
    return null;
  })();

  return (
    <>
      <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, letterSpacing: '-.02em' }}>Configurações</h1>
      <p style={{ margin: '6px 0 22px', fontSize: 14.5, color: '#8a7a7e', fontWeight: 600 }}>
        O projeto tal como a plataforma o regista. A equipa e o encerramento do workspace estão em{' '}
        <Link href="/settings/workspace" style={{ color: '#B5101F', fontWeight: 800 }}>
          Workspace
        </Link>
        .
      </p>

      <SettingsTabs active="project" />

      {archived ? <ArchivedBanner what="projeto" /> : null}

      <Card style={{ padding: 24, marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 18px', fontSize: 16, fontWeight: 900 }}>Geral</h3>

        <div className="bz-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
          <RenameField
            label="NOME DO PROJETO"
            value={activeProject.name}
            onSave={rename}
            readOnlyReason={
              archived
                ? 'Um projeto arquivado não pode ser renomeado.'
                : canBuild(role ?? '')
                  ? null
                  : denied('renomear o projeto')
            }
          />
          <Field label="ID DO PROJETO">
            <Identifier value={activeProject.id} what="o ID do projeto" />
          </Field>
          <Field label="AMBIENTE">
            <EnvironmentValue reading={env} />
          </Field>
          <Field label="CRIADO">
            <FieldValue>{utcStamp(activeProject.created_at)}</FieldValue>
          </Field>
          <Field label="WORKSPACE">
            <FieldValue>{activeWs?.name ?? '—'}</FieldValue>
          </Field>
        </div>

        <p style={NOTE}>
          O ID do projeto <strong>não muda quando renomeia o projeto</strong>. É o que a API usa para
          atribuir chaves, webhooks e registos, e alterá-lo separaria o projeto do seu próprio
          histórico — por isso é fixo. O nome é só um rótulo.
        </p>
      </Card>

      <Card style={{ padding: 24, marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 900 }}>Segurança</h3>
        <p style={{ margin: '0 0 14px', fontSize: 13.5, color: '#8a7a7e', fontWeight: 600, lineHeight: 1.55 }}>
          O acesso à consola é por código enviado para o seu email, e a sessão é um cookie
          <code style={{ fontFamily: MONO, fontSize: 12.5 }}> __Host-</code> que o navegador só
          envia para a API. As chaves são reveladas uma única vez, no momento em que são criadas
          ou rotacionadas: a plataforma guarda o hash e não consegue mostrar-lhe uma chave
          existente outra vez.
        </p>
        <p style={{ margin: 0, fontSize: 13.5, color: '#8a7a7e', fontWeight: 600, lineHeight: 1.55 }}>
          Rotacionar ou revogar uma chave faz-se na página{' '}
          <Link href="/api-keys" style={{ color: '#B5101F', fontWeight: 800 }}>API Keys</Link>,
          onde cada chave tem as suas próprias acções.
        </p>
      </Card>

      <DangerZone description="Estas ações afetam apenas este projeto. Nenhuma delas pode ser desfeita a partir da consola.">
        <DangerAction
          title="Arquivar projeto"
          description={
            <>
              Revoga <strong>todas as chaves ativas</strong> deste projeto e desativa uma ligação
              financeira que ainda não tenha emitido um documento de pagamento. O histórico e os
              registos mantêm-se. {f ? footprintSentence(f) : null}
            </>
          }
          actionLabel="Arquivar projeto"
          onAction={() => setDialog('archive')}
          unavailableReason={
            archived ? 'Este projeto já está arquivado.' : canManage ? null : denied('arquivar um projeto')
          }
        />

        <DangerAction
          title="Eliminar projeto"
          description={
            <>
              Remove o projeto definitivamente. Só é possível enquanto o projeto não tiver
              história nenhuma — nenhuma chave alguma vez emitida, nenhum pedido registado,
              nenhuma ligação financeira.
            </>
          }
          actionLabel="Eliminar projeto"
          onAction={() => setDialog('delete')}
          unavailableReason={deleteUnavailable}
        />

        <p style={{ margin: 0, fontSize: 12, color: '#a08a8c', fontWeight: 600, lineHeight: 1.6 }}>
          Um projeto arquivado não volta a ficar ativo a partir da consola. Se precisar de reverter
          um arquivo, escreva para{' '}
          <a href="mailto:developers@banzami.com" style={{ color: '#B5101F', fontWeight: 800 }}>
            developers@banzami.com
          </a>{' '}
          a partir do email da sua conta.
        </p>
      </DangerZone>

      {dialog === 'archive' ? (
        <ConfirmByName
          title="Arquivar projeto"
          body="Arquivar retira a este projeto toda a autoridade e mantém todo o histórico. Não é possível reabri-lo a partir da consola."
          consequence={
            <>
              Todas as chaves ativas deixam de funcionar no momento em que confirmar — qualquer
              integração que as use passa a receber 401.{' '}
              {f ? footprintSentence(f) : 'Não foi possível ler o que este projeto contém.'}
            </>
          }
          name={activeProject.name}
          nameLabel="Escreva o nome do projeto para confirmar"
          confirmLabel="Arquivar projeto"
          onConfirm={archive}
          onClose={() => setDialog(null)}
        />
      ) : null}

      {dialog === 'delete' ? (
        <ConfirmByName
          title="Eliminar projeto"
          body="Eliminar remove o projeto e o seu identificador definitivamente. Não há como o recuperar."
          consequence={f ? footprintSentence(f) : 'Não foi possível ler o que este projeto contém.'}
          name={activeProject.name}
          nameLabel="Escreva o nome do projeto para confirmar"
          confirmLabel="Eliminar projeto"
          onConfirm={remove}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </>
  );
}

// The hooks have to be called INSIDE PortalPage, which is what mounts the data
// provider. Calling them in the page component put them outside that provider,
// so the hook threw during static generation and the whole website build failed
// — while the deploy reported success and started the previous image.
export default function SettingsPage() {
  return (
    <PortalPage active="settings">
      <div className="bz-view" style={{ maxWidth: 860 }}>
        <ProjectSettings />
      </div>
    </PortalPage>
  );
}
