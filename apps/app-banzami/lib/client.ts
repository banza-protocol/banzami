'use client';

// Client-side fetch to the BFF. Reads the readable CSRF mirror cookie and echoes
// it on every write, so a state-changing request carries the double-submit token
// bound to the encrypted session (WEB-APP-001 §27). Never touches the Bearer —
// that stays server-side.
function csrfToken(): string {
  const m = document.cookie.match(/(?:^|;\s*)bz_app_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

export async function apiGet<T>(path: string): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(path, { headers: { Accept: 'application/json' }, cache: 'no-store' });
  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, data };
}

export async function apiPost<T>(path: string, body: unknown): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': csrfToken() },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, data };
}
