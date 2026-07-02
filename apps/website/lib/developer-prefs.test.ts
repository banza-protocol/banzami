import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getActiveWorkspaceId,
  setActiveWorkspaceId,
  getActiveProjectId,
  setActiveProjectId,
} from './developer-prefs';

// A controlled localStorage stub — deterministic, no jsdom dependency.
function makeStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    keys: () => [...m.keys()],
    values: () => [...m.values()],
  };
}

// Only non-sensitive UI preferences (active workspace/project ids) are stored.
// Sessions, CSRF, OTP and API secrets are never written to web storage.
describe('developer UI preferences', () => {
  let store: ReturnType<typeof makeStorage>;
  beforeEach(() => {
    store = makeStorage();
    vi.stubGlobal('localStorage', store);
  });

  it('persists and reads the active workspace id', () => {
    expect(getActiveWorkspaceId()).toBeNull();
    setActiveWorkspaceId('ws_1');
    expect(getActiveWorkspaceId()).toBe('ws_1');
  });

  it('persists the active project id per workspace', () => {
    setActiveProjectId('ws_1', 'prj_a');
    setActiveProjectId('ws_2', 'prj_b');
    expect(getActiveProjectId('ws_1')).toBe('prj_a');
    expect(getActiveProjectId('ws_2')).toBe('prj_b');
  });

  it('only ever writes the two non-sensitive preference keys', () => {
    setActiveWorkspaceId('ws_1');
    setActiveProjectId('ws_1', 'prj_a');
    expect(store.keys().sort()).toEqual(['bz_dev_active_prj_ws_1', 'bz_dev_active_ws']);
    for (const v of store.values()) {
      expect(v.startsWith('bz_test_sk_')).toBe(false);
      expect(v.startsWith('__Host-')).toBe(false);
    }
  });
});
