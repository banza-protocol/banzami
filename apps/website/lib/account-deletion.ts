// The public account-deletion request form (supressão de conta), client side.
//
// Someone who cannot use the in-app "Suprimir conta" flow (e.g. already
// uninstalled the app) files a request here. Two steps against the gateway:
//
//   1. POST /v1/account-deletion-requests         → emails a 6-digit code
//   2. POST /v1/account-deletion-requests/verify   → confirms the code
//
// Both are public, rate-limited per IP, and never accept a PIN. A verified email
// only proves control of the email: the team verifies account ownership before
// anything is processed. A filled honeypot is treated as a bot and silently
// succeeds.

import { API_BASE } from '@/lib/api';

export type DeletionSubject = 'CONSUMER' | 'BUSINESS';

export type DeletionRequestInput = {
  subjectType: DeletionSubject;
  handle: string;
  email: string;
  // Honeypot: the client always sends it empty; a filled value is a bot.
  website?: string;
};

export type DeletionRequestResult =
  | { ok: true; requestId: string }
  | { ok: false; message: string };

export type DeletionVerifyResult = { ok: true } | { ok: false; message: string };

/**
 * Step 1 — file the request and trigger the verification email. A 200 returns
 * the opaque request id to carry into step 2. A 4xx is a validation problem the
 * person can fix; anything else is a try-again.
 */
export async function submitDeletionRequest(
  input: DeletionRequestInput,
): Promise<DeletionRequestResult> {
  try {
    const res = await fetch(`${API_BASE}/v1/account-deletion-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        website: '',
        subject_type: input.subjectType,
        handle: input.handle,
        email: input.email,
      }),
    });
    if (res.ok) {
      const j = (await res.json().catch(() => ({}))) as { request_id?: string };
      return { ok: true, requestId: j.request_id ?? '' };
    }
    const j = (await res.json().catch(() => ({}))) as { message?: string };
    if (res.status >= 400 && res.status < 500 && j.message) {
      return { ok: false, message: j.message };
    }
    return { ok: false, message: 'default' };
  } catch {
    return { ok: false, message: 'default' };
  }
}

/**
 * Step 2 — confirm the 6-digit code for a filed request. Success means the email
 * is verified and the request moves to operator review; it does NOT mean the
 * account is deleted.
 */
export async function verifyDeletionRequest(
  requestId: string,
  code: string,
): Promise<DeletionVerifyResult> {
  try {
    const res = await fetch(`${API_BASE}/v1/account-deletion-requests/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_id: requestId, code }),
    });
    if (res.ok) return { ok: true };
    const j = (await res.json().catch(() => ({}))) as { message?: string };
    if (res.status >= 400 && res.status < 500 && j.message) {
      return { ok: false, message: j.message };
    }
    return { ok: false, message: 'default' };
  } catch {
    return { ok: false, message: 'default' };
  }
}
