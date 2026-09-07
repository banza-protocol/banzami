'use client';

import { useState } from 'react';
import { useDeveloperData } from './DeveloperData';
import { useToast } from './Toast';
import { NamePrompt } from './NamePrompt';

// Compact workspace + project switcher for the sidebar. Lists accessible
// workspaces/projects, selects the active one (persisted as a non-sensitive UI
// preference), and creates new ones. Sandbox-only — no Live/Business fields.
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

  return (
    <div style={{ margin: '0 2px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div>
        <p style={{ margin: '0 0 4px', fontSize: 9.5, fontWeight: 800, letterSpacing: '.06em', color: '#a89a9e' }}>WORKSPACE</p>
        <select aria-label="Workspace" value={activeWs?.id ?? ''} onChange={(e) => onWsChange(e.target.value)} disabled={busy} style={selStyle}>
          {!activeWs ? <option value="">Selecione…</option> : null}
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
          <option value={NEW}>+ Novo workspace…</option>
        </select>
      </div>
      {activeWs ? (
        <div>
          <p style={{ margin: '0 0 4px', fontSize: 9.5, fontWeight: 800, letterSpacing: '.06em', color: '#a89a9e' }}>PROJETO (SANDBOX)</p>
          <select aria-label="Projeto" value={activeProject?.id ?? ''} onChange={(e) => onPrjChange(e.target.value)} disabled={busy} style={selStyle}>
            {!activeProject ? <option value="">Selecione…</option> : null}
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            <option value={NEW}>+ Novo projeto…</option>
          </select>
        </div>
      ) : null}

      {creating ? (
        <NamePrompt
          title={creating === 'workspace' ? 'Novo workspace' : 'Novo projeto'}
          description={
            creating === 'workspace'
              ? 'Um workspace agrupa os seus projetos e as pessoas que lhes acedem.'
              : 'Um projeto é o que detém chaves, webhooks e contas. Este será criado em Sandbox.'
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
