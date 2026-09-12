'use client';

import { useState } from 'react';
import { isArchivedProject, useDeveloperData } from './DeveloperData';
import { useToast } from './Toast';
import { NamePrompt } from './NamePrompt';
import type { Project } from '@/lib/developer-api';

// Compact workspace + project switcher for the sidebar. Lists accessible
// workspaces/projects, selects the active one (persisted as a non-sensitive UI
// preference), and creates new ones.
//
// The project field used to be labelled "PROJETO (SANDBOX)". The environment is
// not a property of a project — developer-api has no such column, and says so —
// so that parenthesis was a deployment-wide constant printed next to a per-row
// value, where it read as data about the row. The environment is now stated
// once, from a reading, on Configurações · Projeto. The shell's own SANDBOX
// chip covers the at-a-glance case.
const selStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 10px',
  border: '1.5px solid #F0E2E0',
  borderRadius: 11,
  background: '#FFFAF9',
  fontSize: 13,
  fontWeight: 800,
  color: '#2a2024',
  cursor: 'pointer',
  outline: 'none',
};
const NEW = '__new__';

const toggleStyle: React.CSSProperties = {
  padding: 0,
  border: 'none',
  background: 'none',
  color: '#a89a9e',
  fontSize: 10.5,
  fontWeight: 800,
  letterSpacing: '.02em',
  cursor: 'pointer',
  textDecoration: 'underline',
};

/**
 * The options the project selector offers.
 *
 * Archived projects are excluded server-side by default, and excluded again
 * here. Both are needed: the server decides what arrives, and this decides what
 * is shown while a list fetched under the previous setting is still in state —
 * the moment right after "Ocultar arquivados" is pressed, when the old list is
 * the only one there is.
 *
 * The active project is always offered, archived or not. It is how its own
 * settings page is reached, and a selector that cannot represent its own
 * current value shows the wrong project as selected.
 */
export function projectOptions(
  projects: Project[],
  activeProject: Project | null,
  showArchived: boolean,
): Project[] {
  return projects.filter(
    (p) => showArchived || !isArchivedProject(p) || p.id === activeProject?.id,
  );
}

/** How a project is named in the list — archived projects say so. */
export function projectOptionLabel(p: Project): string {
  return isArchivedProject(p) ? `${p.name} (arquivado)` : p.name;
}

export function WorkspaceSwitcher() {
  const {
    workspaces,
    activeWs,
    selectWorkspace,
    createWorkspace,
    projects,
    activeProject,
    selectProject,
    createProject,
    showArchivedProjects,
    setShowArchivedProjects,
    onApiError,
  } = useDeveloperData();
  const { flash } = useToast();
  const [busy, setBusy] = useState(false);
  // Which creation dialog is open, if any. These were window.prompt() calls —
  // see NamePrompt for why that was the wrong control for the first two actions
  // a new developer performs.
  const [creating, setCreating] = useState<'workspace' | 'project' | null>(null);

  const onWsChange = (v: string) => {
    if (v === NEW) { setCreating('workspace'); return; }
    selectWorkspace(v);
  };

  const onPrjChange = (v: string) => {
    if (v === NEW) { setCreating('project'); return; }
    selectProject(v);
  };

  // The dialog surfaces the failure against the field; the toast confirms the
  // success. A rejected promise keeps the dialog open with the reason on it.
  const submitNew = async (name: string) => {
    setBusy(true);
    try {
      if (creating === 'workspace') {
        await createWorkspace(name);
        flash('Workspace criado');
      } else {
        await createProject(name);
        flash('Projeto criado');
      }
    } catch (e) {
      throw new Error(onApiError(e));
    } finally {
      setBusy(false);
    }
  };

  const options = projectOptions(projects, activeProject, showArchivedProjects);
  const archivedHidden = projects.some((p) => isArchivedProject(p) && !options.includes(p));

  return (
    <div style={{ margin: '0 2px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div>
        <p style={{ margin: '0 0 4px', fontSize: 9.5, fontWeight: 800, letterSpacing: '.06em', color: '#a89a9e' }}>WORKSPACE</p>
        <select aria-label="Workspace ativo" value={activeWs?.id ?? ''} onChange={(e) => onWsChange(e.target.value)} disabled={busy} style={selStyle}>
          {!activeWs ? <option value="">Selecione…</option> : null}
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.status === 'ARCHIVED' ? `${w.name} (arquivado)` : w.name}
            </option>
          ))}
          <option value={NEW}>+ Novo workspace…</option>
        </select>
      </div>
      {activeWs ? (
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, margin: '0 0 4px' }}>
            <p style={{ margin: 0, fontSize: 9.5, fontWeight: 800, letterSpacing: '.06em', color: '#a89a9e' }}>PROJETO</p>
            <button
              type="button"
              onClick={() => setShowArchivedProjects(!showArchivedProjects)}
              style={toggleStyle}
            >
              {showArchivedProjects ? 'Ocultar arquivados' : 'Mostrar arquivados'}
            </button>
          </div>
          <select aria-label="Projeto ativo" value={activeProject?.id ?? ''} onChange={(e) => onPrjChange(e.target.value)} disabled={busy} style={selStyle}>
            {!activeProject ? <option value="">Selecione…</option> : null}
            {options.map((p) => (
              <option key={p.id} value={p.id}>
                {projectOptionLabel(p)}
              </option>
            ))}
            <option value={NEW}>+ Novo projeto…</option>
          </select>
          {archivedHidden ? (
            <p style={{ margin: '5px 0 0', fontSize: 10.5, color: '#b8a4a6', fontWeight: 700 }}>
              Há projetos arquivados que não estão listados.
            </p>
          ) : null}
        </div>
      ) : null}

      {creating ? (
        <NamePrompt
          title={creating === 'workspace' ? 'Novo workspace' : 'Novo projeto'}
          description={
            creating === 'workspace'
              ? 'Um workspace agrupa os seus projetos e as pessoas que lhes acedem.'
              : 'Um projeto é o que detém chaves, webhooks e contas. Fica no ambiente desta instalação — não se escolhe um ambiente por projeto.'
          }
          label="Nome"
          placeholder={creating === 'workspace' ? 'A minha empresa' : 'Integração de pagamentos'}
          submitLabel="Criar"
          onSubmit={submitNew}
          onClose={() => setCreating(null)}
        />
      ) : null}
    </div>
  );
}
