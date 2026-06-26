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
  subcategory?: string;
  email: string;
  phone?: string;
  nif?: string;
  country?: string;
  province?: string;
  municipality?: string;
  city?: string;
  address?: string;
  address_reference?: string;
  legal_representative?: string;
  representative_role?: string;
  representative_email?: string;
  representative_phone?: string;
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

// ---------------------------------------------------------------------------
// KYB documents (Track 3) — direct-to-storage upload via short-lived signed URLs
// ---------------------------------------------------------------------------

export type KybDocumentType =
  | 'BUSINESS_REGISTRATION'
  | 'TAX_ID'
  | 'REPRESENTATIVE_ID'
  | 'BANK_PROOF';

/** Required company documents for a Business application (MVP). Three only —
 *  no proof-of-address, to reduce onboarding friction. BANK_PROOF is optional
 *  and collected later for payout/settlement, so it is not listed here. */
export const REQUIRED_KYB_DOCUMENTS: KybDocumentType[] = [
  'BUSINESS_REGISTRATION',
  'TAX_ID',
  'REPRESENTATIVE_ID',
];

type UploadUrlResponse = {
  document_id: string;
  upload_url: string;
  method: string;
  headers: Record<string, string>;
  expires_at: string;
};

/** Outcome of a single document upload. NOT_CONFIGURED ≠ failure of the
 *  application — storage simply isn't provisioned yet; never fake success. */
export type DocUploadResult =
  | { ok: true; documentId: string }
  | { ok: false; reason: 'NOT_CONFIGURED'; message: string }
  | { ok: false; reason: 'ERROR'; message: string };

async function requestUploadUrl(
  applicationId: string,
  body: { document_type: KybDocumentType; filename: string; mime_type: string; size_bytes: number },
): Promise<{ ok: true; data: UploadUrlResponse } | { ok: false; status: number; code?: string }> {
  const res = await fetch(
    `${API_BASE}/v1/merchant/applications/${encodeURIComponent(applicationId)}/documents/upload-url`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  );
  if (res.ok) return { ok: true, data: (await res.json()) as UploadUrlResponse };
  const j = await res.json().catch(() => ({}));
  return { ok: false, status: res.status, code: j.error?.code || j.code };
}

async function confirmUpload(applicationId: string, documentId: string): Promise<boolean> {
  const res = await fetch(
    `${API_BASE}/v1/merchant/applications/${encodeURIComponent(applicationId)}/documents/${encodeURIComponent(documentId)}/confirm`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
  );
  return res.ok;
}

/** Full upload of one KYB document: request signed URL → PUT to storage →
 *  confirm. Returns NOT_CONFIGURED (no fake success) when storage is absent. */
export async function uploadKybDocument(
  applicationId: string,
  documentType: KybDocumentType,
  file: File,
): Promise<DocUploadResult> {
  const mime = file.type || 'application/octet-stream';
  const reqRes = await requestUploadUrl(applicationId, {
    document_type: documentType,
    filename: file.name,
    mime_type: mime,
    size_bytes: file.size,
  });
  if (!reqRes.ok) {
    if (reqRes.status === 503 && reqRes.code === 'STORAGE_NOT_CONFIGURED') {
      return { ok: false, reason: 'NOT_CONFIGURED', message: 'Armazenamento de documentos ainda não está disponível.' };
    }
    return { ok: false, reason: 'ERROR', message: 'Não foi possível preparar o envio. Tente novamente.' };
  }

  const { document_id, upload_url, headers } = reqRes.data;
  let putRes: Response;
  try {
    putRes = await fetch(upload_url, { method: 'PUT', headers, body: file });
  } catch {
    return { ok: false, reason: 'ERROR', message: 'Falha de rede ao enviar o ficheiro. Tente novamente.' };
  }
  if (!putRes.ok) return { ok: false, reason: 'ERROR', message: 'O envio do ficheiro falhou. Tente novamente.' };

  const confirmed = await confirmUpload(applicationId, document_id);
  if (!confirmed) return { ok: false, reason: 'ERROR', message: 'Não foi possível confirmar o envio. Tente novamente.' };
  return { ok: true, documentId: document_id };
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
