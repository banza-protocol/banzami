'use client';

// One attention summary for the whole console: the sidebar badges and the
// bell read it from here, so there is a single request however many places
// show a count. It refreshes on start, every ATTENTION_POLL_MS while the tab is
// visible, when the tab regains focus, when the operator switches environment,
// and right after any successful change made through the console.
//
// On failure the last good summary stands for ATTENTION_STALE_AFTER_MS and then
// the badges disappear — a failed request never shows as "nothing to do".

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AdminApi, ATTENTION_MUTATION_EVENT } from '@/lib/admin-api';
import { ENV_CHANGE_EVENT, useAdminEnv, type Env } from '@/lib/admin-env';
import { getSession } from '@/lib/session';
import {
  ATTENTION_POLL_MS,
  usableSummary,
  type AttentionKey,
  type AttentionSummary,
} from '@/lib/attention';

type Fetcher = (env: Env) => Promise<AttentionSummary>;

interface AttentionState {
  /** The summary to show, or null (loading, failed past the stale window, or no session). */
  summary: AttentionSummary | null;
  environment: Env;
  refresh: () => void;
}

const AttentionContext = createContext<AttentionState>({ summary: null, environment: 'SANDBOX', refresh: () => {} });

const defaultFetcher: Fetcher = (env) => {
  const s = getSession();
  if (!s) return Promise.reject(new Error('no session'));
  return new AdminApi(s.token).getAttentionSummary(env);
};

export function AttentionProvider({
  children,
  fetcher = defaultFetcher,
  pollMs = ATTENTION_POLL_MS,
  now = Date.now,
}: {
  children: React.ReactNode;
  fetcher?: Fetcher;
  pollMs?: number;
  now?: () => number;
}) {
  const { env: resolvedEnv, ready } = useAdminEnv();
  const [env, setEnv] = useState<Env>(resolvedEnv);
  const [last, setLast] = useState<{ summary: AttentionSummary; at: number } | null>(null);
  const [, setTick] = useState(0); // re-evaluates staleness after a failure
  const inflight = useRef<Promise<void> | null>(null);
  const again = useRef(false);
  const envRef = useRef(env);

  useEffect(() => { setEnv(resolvedEnv); }, [resolvedEnv]);
  useEffect(() => { envRef.current = env; }, [env]);

  const load = useCallback(() => {
    // One request at a time; a refresh asked for meanwhile runs once after it.
    if (inflight.current) {
      again.current = true;
      return;
    }
    const target = envRef.current;
    inflight.current = fetcher(target)
      .then((s) => {
        if (s && s.environment === envRef.current) setLast({ summary: s, at: now() });
      })
      .catch(() => { setTick((t) => t + 1); })
      .finally(() => {
        inflight.current = null;
        if (again.current) {
          again.current = false;
          load();
        }
      });
  }, [fetcher, now]);

  // Start, and again whenever the environment changes.
  useEffect(() => {
    if (!ready) return;
    load();
  }, [ready, env, load]);

  // Poll while visible; refresh on focus / becoming visible.
  useEffect(() => {
    if (!ready) return;
    const t = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') load();
    }, pollMs);
    const onFocus = () => load();
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [ready, pollMs, load]);

  // Right after a change made through the console, and on an environment switch.
  useEffect(() => {
    const onMutation = () => load();
    const onEnv = (e: Event) => {
      const next = (e as CustomEvent<Env>).detail;
      if (next === 'LIVE' || next === 'SANDBOX') setEnv(next);
    };
    window.addEventListener(ATTENTION_MUTATION_EVENT, onMutation);
    window.addEventListener(ENV_CHANGE_EVENT, onEnv);
    return () => {
      window.removeEventListener(ATTENTION_MUTATION_EVENT, onMutation);
      window.removeEventListener(ENV_CHANGE_EVENT, onEnv);
    };
  }, [load]);

  const summary = usableSummary(last?.summary ?? null, last?.at ?? null, now(), env);
  return (
    <AttentionContext.Provider value={{ summary, environment: env, refresh: load }}>
      {children}
    </AttentionContext.Provider>
  );
}

export function useAttention(): AttentionState {
  return useContext(AttentionContext);
}

/** One category's count and states, for a page's "Requer atenção" view. */
export function useAttentionCategory(key: AttentionKey): { count: number | null; states: string[] | undefined } {
  const { summary } = useAttention();
  const c = summary?.categories[key];
  return { count: c ? c.count : null, states: c?.states };
}

/** The page's "Requer atenção" view, kept in the URL (?attention=1) so the
 *  sidebar badge opens it directly and a reload keeps it. */
export function useAttentionView(): [boolean, (on: boolean) => void] {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const on = params.get('attention') === '1';
  const set = useCallback((next: boolean) => {
    const q = new URLSearchParams(params.toString());
    if (next) q.set('attention', '1');
    else q.delete('attention');
    const qs = q.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [params, pathname, router]);
  return [on, set];
}
