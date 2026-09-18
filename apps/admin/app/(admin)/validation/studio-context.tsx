'use client';

/**
 * One load, one source of truth, shared by every Studio route.
 *
 * Every value the Studio renders comes from admin-api, which derives it from
 * the canonical registry. Nothing is reconstructed here: a second definition of
 * what Banzami validates, written in TypeScript, is exactly the drift the
 * Studio exists to detect.
 */

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { getSession } from '@/lib/session';
import {
  AdminApi,
  type ValidationOverview, type ValidationActor, type ValidationSuiteDetail,
  type ValidationInvariant, type ValidationKnownIssue, type ValidationRun,
  type ValidationPreflight,
} from '@/lib/admin-api';

export function getApi(): AdminApi | null {
  return getSession() ? new AdminApi() : null;
}

type StudioData = {
  overview: ValidationOverview | null;
  actors: ValidationActor[];
  suites: ValidationSuiteDetail[];
  invariants: ValidationInvariant[];
  issues: ValidationKnownIssue[];
  runs: ValidationRun[];
  loading: boolean;
  error: string;
  reload: () => Promise<void>;

  /** The last preflight run in this session. Null until one is asked for — the
   *  Studio never shows a stale verdict as if it were current. */
  preflight: ValidationPreflight | null;
  preflightProfile: string;
  meetsMinimum: boolean | null;
  runPreflight: (profile: string) => Promise<void>;
  busy: boolean;
  setBusy: (b: boolean) => void;
};

const Ctx = createContext<StudioData | null>(null);

export function useStudio(): StudioData {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStudio outside StudioProvider');
  return v;
}

export function StudioProvider({ children }: { children: ReactNode }) {
  const [overview, setOverview] = useState<ValidationOverview | null>(null);
  const [actors, setActors] = useState<ValidationActor[]>([]);
  const [suites, setSuites] = useState<ValidationSuiteDetail[]>([]);
  const [invariants, setInvariants] = useState<ValidationInvariant[]>([]);
  const [issues, setIssues] = useState<ValidationKnownIssue[]>([]);
  const [runs, setRuns] = useState<ValidationRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [preflight, setPreflight] = useState<ValidationPreflight | null>(null);
  const [preflightProfile, setPreflightProfile] = useState('GOLDEN');
  const [meetsMinimum, setMeetsMinimum] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const api = getApi();
    if (!api) return;
    setError('');
    try {
      const [o, a, c, asr, r] = await Promise.all([
        api.validationOverview(),
        api.validationActors(),
        api.validationCatalogue(),
        api.validationAssurance(),
        api.validationRuns(),
      ]);
      setOverview(o); setActors(a.actors); setSuites(c.suites);
      setInvariants(asr.invariants); setIssues(asr.known_issues); setRuns(r.runs);
    } catch {
      setError('Não foi possível carregar o Validation Studio.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const runPreflight = useCallback(async (profile: string) => {
    const api = getApi();
    if (!api) return;
    setBusy(true);
    try {
      const res = await api.validationPreflight(profile);
      setPreflight(res.preflight);
      setMeetsMinimum(res.meets_minimum ?? null);
      setPreflightProfile(profile);
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <Ctx.Provider value={{
      overview, actors, suites, invariants, issues, runs, loading, error, reload,
      preflight, preflightProfile, meetsMinimum, runPreflight, busy, setBusy,
    }}>
      {children}
    </Ctx.Provider>
  );
}
