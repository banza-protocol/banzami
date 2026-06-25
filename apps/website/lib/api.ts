// Banzami public API client for the website — Business onboarding (Track 1+4).
// Production → api.banzami.com; sandbox/dev → sandbox-api.banzami.com.
// Never logs tokens/PINs.

export const API_BASE =
  (process.env.NEXT_PUBLIC_BANZAMI_API_URL || 'https://api.banzami.com').replace(/\/+$/, '');

// The gateway environment is implied by the API host (sandbox host → SANDBOX).
export const API_ENV: 'LIVE' | 'SANDBOX' = /sandbox/i.test(API_BASE) ? 'SANDBOX' : 'LIVE';

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested)
// ---------------------------------------------------------------------------

/** Strip a leading '@' and lowercase — the DB never stores the '@'. */
export function normalizeHandle(raw: string): string {
  return raw.trim().toLowerCase().replace(/^@+/, '');
}

const HANDLE_RE = /^[a-z0-9][a-z0-9_]{1,28}[a-z0-9]$/;

/** 3-30 chars, lowercase, starts/ends alphanumeric, underscore allowed, no hyphen. */
export function isValidHandleFormat(handle: string): boolean {
  return HANDLE_RE.test(handle);
}

/** Maps a check-handle reason code to a clear PT message. */
export function handleReasonMessage(reason?: string): string {
  switch (reason) {
    case 'TAKEN':
      return 'Este @negócio já está em uso.';
    case 'RESERVED':
      return 'Este @negócio está reservado.';
    case 'PENDING':
      return 'Este @negócio já tem uma candidatura em curso.';
    case 'INVALID':
      return 'Use 3 a 30 caracteres: letras minúsculas, números ou _.';
    default:
      return 'Este @negócio não está disponível.';
  }
}

export function isValidPin(pin: string): boolean {
  return /^[0-9]{4,8}$/.test(pin);
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

export type CheckHandleResult = { available: boolean; reason?: string };

export async function checkHandle(handle: string): Promise<CheckHandleResult> {
  const res = await fetch(`${API_BASE}/v1/merchant/applications/check-handle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ handle }),
  });
  return res.json();
}

export type ApplicationInput = {
  desired_handle: string;
  business_name: string;
  category?: string;
  email: string;
  phone?: string;
  nif?: string;
  country?: string;
  city?: string;
  address?: string;
  legal_representative?: string;
  business_activity?: string;
  estimated_volume?: string;
  terms_accepted: boolean;
};

export type SubmitResult = { ok: boolean; status: number; applicationId?: string; error?: string };

export async function submitApplication(input: ApplicationInput): Promise<SubmitResult> {
  const res = await fetch(`${API_BASE}/v1/merchant/applications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, environment: API_ENV }),
  });
  if (res.ok) {
    const j = await res.json().catch(() => ({}));
    return { ok: true, status: res.status, applicationId: j.application_id };
  }
  const j = await res.json().catch(() => ({}));
  return { ok: false, status: res.status, error: j.message || j.code };
}

export type ActivationStatus = {
  valid: boolean;
  reason: string; // VALID | INVALID | EXPIRED | USED
  business_name?: string;
  handle?: string;
};

export async function validateActivation(token: string): Promise<ActivationStatus> {
  const res = await fetch(`${API_BASE}/v1/merchant/activation/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  return res.json();
}

export type CompleteResult = { ok: boolean; status: number; error?: string };

export async function completeActivation(token: string, pin: string): Promise<CompleteResult> {
  const res = await fetch(`${API_BASE}/v1/merchant/activation/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, pin }),
  });
  if (res.ok) return { ok: true, status: res.status };
  const j = await res.json().catch(() => ({}));
  return { ok: false, status: res.status, error: j.code || j.message };
}
