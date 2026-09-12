'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { developerApi, ApiError, type Workspace, type Project } from '@/lib/developer-api';
import {
  getActiveWorkspaceId,
  setActiveWorkspaceId,
  getActiveProjectId,
  setActiveProjectId,
} from '@/lib/developer-prefs';
import { useDeveloperAuth } from './DeveloperAuth';

export type Load = 'loading' | 'ready' | 'error';

type DataValue = {
  csrf: string;
  onApiError: (e: unknown) => string; // maps error; clears auth on 401

  wsLoad: Load;
  wsError: string;
  workspaces: Workspace[];
  activeWs: Workspace | null;
  selectWorkspace: (id: string) => void;
  createWorkspace: (name: string) => Promise<Workspace>;
  reloadWorkspaces: () => Promise<void>;

  prjLoad: Load;
  prjError: string;
  projects: Project[];
  activeProject: Project | null;
  selectProject: (id: string) => void;
  createProject: (name: string) => Promise<Project>;
  reloadProjects: () => Promise<void>;
  /**
   * Whether `projects` also carries the archived ones.
   *
   * Off by default, and the default is the point: an archived project has no
   * keys and no financial authority left, so building against one produces 401s
   * for a reason the selector never mentioned. The Console offers it as an
   * explicit "Mostrar arquivados" and marks what comes back.
   */
  showArchivedProjects: boolean;
  setShowArchivedProjects: (v: boolean) => void;
};

/** ARCHIVED, decided in one place so the selector and the pages agree. */
export function isArchivedProject(p: Project): boolean {
  return p.status === 'ARCHIVED';
}

const Ctx = createContext<DataValue | null>(null);

export function useDeveloperData(): DataValue {
  const c = useContext(Ctx);
  if (!c) throw new Error('useDeveloperData must be used within DeveloperDataProvider');
  return c;
}

const MSG: Record<string, string> = {
  FORBIDDEN: 'Não tem acesso a este recurso.',
  RATE_LIMITED: 'Demasiados pedidos. Tente novamente daqui a pouco.',
  CONFLICT: 'Já existe.',
  VALIDATION: 'Dados inválidos.',
  NETWORK: 'Sem ligação ao serviço.',
  UNAVAILABLE: 'Serviço indisponível. Tente novamente.',
};

export function DeveloperDataProvider({ children }: { children: ReactNode }) {
  const { csrf, clear } = useDeveloperAuth();

  const [wsLoad, setWsLoad] = useState<Load>('loading');
  const [wsError, setWsError] = useState('');
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWs, setActiveWs] = useState<Workspace | null>(null);

  const [prjLoad, setPrjLoad] = useState<Load>('loading');
  const [prjError, setPrjError] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [showArchivedProjects, setShowArchivedProjects] = useState(false);

  // onApiError centralises 401 recovery (clear local state → guard returns to
  // login) and maps everything else to a safe message (never internals).
  const onApiError = useCallback(
    (e: unknown): string => {
      if (e instanceof ApiError && e.code === 'UNAUTHENTICATED') {
        clear();
        return MSG.UNAVAILABLE;
      }
      const code = e instanceof ApiError ? e.code : 'UNAVAILABLE';
      return MSG[code] ?? MSG.UNAVAILABLE;
    },
    [clear],
  );

  const reloadWorkspaces = useCallback(async () => {
    setWsLoad('loading');
    setWsError('');
    try {
      const { workspaces: ws } = await developerApi.listWorkspaces();
      const list = ws ?? [];
      setWorkspaces(list);
      setActiveWs((cur) => {
        if (cur && list.some((w) => w.id === cur.id)) return cur;
        const prefId = getActiveWorkspaceId();
        return list.find((w) => w.id === prefId) ?? list[0] ?? null;
      });
      setWsLoad('ready');
    } catch (e) {
      setWsError(onApiError(e));
      setWsLoad('error');
    }
  }, [onApiError]);

  useEffect(() => {
    void reloadWorkspaces();
  }, [reloadWorkspaces]);

  const selectWorkspace = useCallback(
    (id: string) => {
      const w = workspaces.find((x) => x.id === id);
      if (w) {
        setActiveWs(w);
        setActiveWorkspaceId(w.id);
      }
    },
    [workspaces],
  );

  const createWorkspace = useCallback(
    async (name: string) => {
      const w = await developerApi.createWorkspace(name, csrf);
      setWorkspaces((prev) => [...prev, w]);
      setActiveWs(w);
      setActiveWorkspaceId(w.id);
      return w;
    },
    [csrf],
  );

  const reloadProjects = useCallback(async () => {
    if (!activeWs) {
      setProjects([]);
      setActiveProject(null);
      setPrjLoad('ready');
      return;
    }
    setPrjLoad('loading');
    setPrjError('');
    try {
      const { projects: ps } = await developerApi.listProjects(activeWs.id, showArchivedProjects);
      const list = ps ?? [];
      setProjects(list);
      setActiveProject((cur) => {
        if (cur && list.some((p) => p.id === cur.id)) return cur;
        // Never LAND on an archived project. It can be selected deliberately —
        // that is how its settings page is reached — but a fallback that picks
        // one drops the developer into a project whose keys have all been
        // revoked, with nothing on screen saying why.
        const usable = list.filter((p) => !isArchivedProject(p));
        const prefId = getActiveProjectId(activeWs.id);
        return usable.find((p) => p.id === prefId) ?? usable[0] ?? null;
      });
      setPrjLoad('ready');
    } catch (e) {
      setPrjError(onApiError(e));
      setPrjLoad('error');
    }
  }, [activeWs, onApiError, showArchivedProjects]);

  useEffect(() => {
    void reloadProjects();
  }, [reloadProjects]);

  const selectProject = useCallback(
    (id: string) => {
      const p = projects.find((x) => x.id === id);
      if (p && activeWs) {
        setActiveProject(p);
        setActiveProjectId(activeWs.id, p.id);
      }
    },
    [projects, activeWs],
  );

  const createProject = useCallback(
    async (name: string) => {
      if (!activeWs) throw new Error('no active workspace');
      const p = await developerApi.createProject(activeWs.id, name, csrf);
      setProjects((prev) => [...prev, p]);
      setActiveProject(p);
      setActiveProjectId(activeWs.id, p.id);
      return p;
    },
    [activeWs, csrf],
  );

  return (
    <Ctx.Provider
      value={{
        csrf,
        onApiError,
        wsLoad,
        wsError,
        workspaces,
        activeWs,
        selectWorkspace,
        createWorkspace,
        reloadWorkspaces,
        prjLoad,
        prjError,
        projects,
        activeProject,
        selectProject,
        createProject,
        reloadProjects,
        showArchivedProjects,
        setShowArchivedProjects,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
