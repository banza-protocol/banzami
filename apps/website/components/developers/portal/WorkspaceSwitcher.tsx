'use client';

import { useState } from 'react';
import { useDeveloperData } from './DeveloperData';
import { useToast } from './Toast';

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

  const onWsChange = async (v: string) => {
    if (v === NEW) {
      const name = window.prompt('Nome do novo workspace');
      if (!name?.trim() || busy) return;
      setBusy(true);
      try {
        await createWorkspace(name.trim());
        flash('Workspace criado');
      } catch (e) {
        flash(onApiError(e));
      } finally {
        setBusy(false);
      }
      return;
    }
    selectWorkspace(v);
  };

  const onPrjChange = async (v: string) => {
    if (v === NEW) {
      const name = window.prompt('Nome do novo projeto (Sandbox)');
      if (!name?.trim() || busy) return;
      setBusy(true);
      try {
        await createProject(name.trim());
        flash('Projeto criado');
      } catch (e) {
        flash(onApiError(e));
      } finally {
        setBusy(false);
      }
      return;
    }
    selectProject(v);
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
    </div>
  );
}
