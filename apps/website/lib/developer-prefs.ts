// Non-sensitive UI preferences ONLY: the active workspace/project ids so the
// console reopens where you left off, and the documentation's example language. These are opaque ids, not secrets. The
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

// The language a reader last chose in a documentation code example (cURL,
// TypeScript…), so the next example opens in it. A language name, nothing more.
const DOCS_CODE_LANG_KEY = 'bz-docs-code-lang';
export function getDocsCodeLang(): string | null {
  return safeGet(DOCS_CODE_LANG_KEY);
}
export function setDocsCodeLang(lang: string): void {
  safeSet(DOCS_CODE_LANG_KEY, lang);
}
