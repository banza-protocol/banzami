// Non-sensitive UI preferences ONLY: the active workspace/project ids so the
// console reopens where you left off. These are opaque ids, not secrets. The
// session cookie, CSRF token, OTP and API secrets are NEVER stored here or
// anywhere in web storage (ADR-033 frontend security constraints).

const WS_KEY = 'bz_dev_active_ws';

function safeGet(key: string): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string): void {
  try {
    localStorage?.setItem(key, value);
  } catch {
    /* storage unavailable — preference is best-effort */
  }
}

export function getActiveWorkspaceId(): string | null {
  return safeGet(WS_KEY);
}
export function setActiveWorkspaceId(id: string): void {
  safeSet(WS_KEY, id);
}

export function getActiveProjectId(workspaceId: string): string | null {
  return safeGet(`bz_dev_active_prj_${workspaceId}`);
}
export function setActiveProjectId(workspaceId: string, projectId: string): void {
  safeSet(`bz_dev_active_prj_${workspaceId}`, projectId);
}
