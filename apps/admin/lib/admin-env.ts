'use client';

import { useEffect, useState } from 'react';
import { AdminApi } from '@/lib/admin-api';
import { getSession } from '@/lib/session';

// Single source of truth for the BANZADMIN environment.
//
// Rule: while the operator is SANDBOX-only (platform mode = SANDBOX), EVERY page
// opens and operates in SANDBOX by default. LIVE is only selectable when the
// platform mode is actually LIVE. No page may hardcode a LIVE default.

export type Env = 'LIVE' | 'SANDBOX';

const STORAGE_KEY = 'banzadmin.env';

/** Message shown when someone tries to use LIVE on a SANDBOX-only server. */
export const LIVE_UNAVAILABLE_MSG =
  'LIVE não está ativo neste servidor. Este ambiente opera apenas em SANDBOX.';

function readSaved(): Env | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === 'LIVE' || v === 'SANDBOX' ? v : null;
  } catch {
    return null;
  }
}

function persist(env: Env) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, env);
  } catch {
    /* ignore */
  }
}

function clearSaved() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function urlEnv(): Env | null {
  if (typeof window === 'undefined') return null;
  const v = new URLSearchParams(window.location.search).get('env');
  if (!v) return null;
  const up = v.toUpperCase();
  return up === 'LIVE' || up === 'SANDBOX' ? (up as Env) : null;
}

/**
 * Resolve the environment a page should open in, given whether LIVE is available.
 * Order: URL ?env → saved preference → SANDBOX. LIVE is only honoured when
 * available; an invalid saved LIVE is cleared. Pure + unit-testable.
 */
export function resolveEnv(
  liveAvailable: boolean,
  opts?: { saved?: Env | null; url?: Env | null },
): Env {
  const url = opts?.url ?? null;
  const saved = opts?.saved ?? null;
  if (url === 'LIVE' || saved === 'LIVE') {
    if (liveAvailable) return 'LIVE';
    // Requested LIVE but it isn't available → SANDBOX.
    return 'SANDBOX';
  }
  if (url === 'SANDBOX' || saved === 'SANDBOX') return 'SANDBOX';
  return 'SANDBOX';
}

/**
 * React hook: the resolved environment for the current page, whether LIVE is
 * available, and a guarded setter. Initialises to SANDBOX (fail-safe) and, once
 * the platform mode is known, reconciles the saved/URL preference — clearing a
 * stale saved LIVE when the server is SANDBOX-only.
 */
export function useAdminEnv(): {
  env: Env;
  setEnv: (e: Env) => boolean;
  liveAvailable: boolean;
  ready: boolean;
} {
  const [env, setEnvState] = useState<Env>('SANDBOX');
  const [liveAvailable, setLiveAvailable] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    const s = getSession();
    if (!s) {
      setReady(true);
      return;
    }
    new AdminApi(s.token)
      .getPlatformMode()
      .then((m) => {
        if (!active) return;
        const live = m.mode === 'LIVE';
        setLiveAvailable(live);
        const saved = readSaved();
        if (saved === 'LIVE' && !live) clearSaved(); // drop stale LIVE preference
        setEnvState(resolveEnv(live, { saved, url: urlEnv() }));
        setReady(true);
      })
      .catch(() => {
        // Fail-safe: LIVE unavailable, SANDBOX default.
        if (!active) return;
        setLiveAvailable(false);
        if (readSaved() === 'LIVE') clearSaved();
        setEnvState('SANDBOX');
        setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const setEnv = (e: Env): boolean => {
    if (e === 'LIVE' && !liveAvailable) return false; // rejected
    setEnvState(e);
    persist(e);
    return true;
  };

  return { env, setEnv, liveAvailable, ready };
}
