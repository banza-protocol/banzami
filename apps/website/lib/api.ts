// Banzami public API client for the website — Business onboarding (Track 1+4).
// Production → api.banzami.com; sandbox/dev → sandbox-api.banzami.com.
// Never logs tokens/PINs.

import { isProofRef } from './proof-ref';

export const API_BASE =
  (process.env.NEXT_PUBLIC_BANZAMI_API_URL || 'https://api.banzami.com').replace(/\/+$/, '');

// The gateway environment is implied by the API host (sandbox host → SANDBOX).
export const API_ENV: 'LIVE' | 'SANDBOX' = /sandbox/i.test(API_BASE) ? 'SANDBOX' : 'LIVE';

// The two production gateway stacks. Onboarding MUST reach the stack that matches
// the current Platform Mode (ADR-025): while the platform is SANDBOX, a merchant
// is provisioned in the SANDBOX stack — where the SANDBOX apps look it up — and at
// launch (LIVE) in the LIVE stack. The server EnvGate is the guarantee; this
// routing is the ergonomics that keeps the two ends from diverging.
const LIVE_API_BASE = 'https://api.banzami.com';
const SANDBOX_API_BASE = 'https://sandbox-api.banzami.com';

// A custom/localhost API_BASE (dev) is a single stack and is never rewritten.
const KNOWN_PROD_BASE = API_BASE === LIVE_API_BASE || /sandbox-api\.banzami\.com$/.test(API_BASE);

function baseForMode(mode: 'LIVE' | 'SANDBOX'): string {
  if (!KNOWN_PROD_BASE) return API_BASE;
  return mode === 'SANDBOX' ? SANDBOX_API_BASE : LIVE_API_BASE;
}

// Short-lived memo so a candidatura flow (debounced check-handle + submit +
// uploads) doesn't refetch the mode on every call. Mode changes are rare and
// operator-driven; a few seconds of staleness is harmless.
let _modeMemo: { at: number; v: { base: string; env: 'LIVE' | 'SANDBOX' } } | null = null;

/**
 * Resolve the gateway stack + environment from the live Platform Mode.
 *
 * Every public call has to go through this, not through API_BASE. API_BASE is
 * the LIVE rail by default, and while the platform is SANDBOX that rail is
 * fail-closed: it answers 503 with an HTML error page. getPlatformMode() itself
 * still calls it and that is fine — it treats any failure as SANDBOX, and a
 * fail-closed LIVE rail is precisely evidence of not being LIVE — but a caller
 * that reads a response body needs the stack that can actually answer.
 */
export async function platformTarget(): Promise<{ base: string; env: 'LIVE' | 'SANDBOX' }> {
  const now = Date.now();
  if (_modeMemo && now - _modeMemo.at < 30_000) return _modeMemo.v;
  const { mode } = await getPlatformMode();
  const v = { base: baseForMode(mode), env: mode };
  _modeMemo = { at: now, v };
  return v;
}

/** @deprecated Use platformTarget — the resolution is not onboarding-specific. */
export const onboardingTarget = platformTarget;

export interface PlatformModeInfo {
  mode: 'SANDBOX' | 'LIVE';
  public_banner: boolean;
  message: string;
}

export interface ProofResult {
  exists: boolean;
  status: string;
  /** Set only when the verifier could not reach a conclusion. Never shown raw. */
  unavailable_reason?: string;
  amount?: number;
  currency?: string;
  payer_display?: string;
  payer_handle?: string;
  payee_display?: string;
  payee_handle?: string;
  payee_kind?: 'PERSON' | 'BUSINESS';
  /** PAYMENT | P2P_TRANSFER — what the operation was (absent on a legacy proof). */
  operation_kind?: string | null;
  /** PAYMENT_LINK | QR | HANDLE — how it was started. */
  channel?: string | null;
  /** BANZAMI_BALANCE — where the money came from. */
  funding_source?: string | null;
  /** The Business's own reference for the payment. Display context only. */
  merchant_reference?: string | null;
  /** What the payment was for, in the Business's public words. Display context only. */
  display_context?: string | null;
  /** Legacy method line; ignored when operation_kind is present. */
  method?: string;
  description?: string;
  confirmed_at?: string | null;
  issued_at?: string;
  verification_url?: string;
  network?: string;
  operator?: string;
  message?: string;
}

// Public transaction-proof verification (BANZA ADR-023). The receipt is not the
// proof — this confirms the real ledger record. A not-found / error response is a
// safe "invalid" outcome, never an exception that leaks internals.
/**
 * Three outcomes, not two.
 *
 * "This receipt may be forged" is an accusation, and it must only ever follow a
 * DEFINITIVE answer from the verifier. An outage, a timeout, a 5xx or a body we
 * cannot parse all mean we do not know — and telling a holder of a genuine
 * receipt that it might be fake because our own backend is unwell is the worst
 * failure this page has.
 *
 * The API already distinguishes 200 / 404 / 503 / 500. This function had been
 * collapsing everything unparseable into NOT_FOUND, which is how an operational
 * failure became a forgery claim.
 */
export async function getProof(ref: string): Promise<ProofResult> {
  // A reference that is not spelled exactly as issued is not a reference: it is
  // refused here, definitively and without asking the verifier. The operator
  // refuses it too (it never reaches its database); this keeps the page from
  // even sending it. Nothing is corrected — see lib/proof-ref.ts.
  if (!isProofRef(ref)) {
    return {
      exists: false,
      status: 'INVALID_REFERENCE',
      message: 'Referência inválida. A referência tem de estar escrita exatamente como aparece no comprovativo.',
    };
  }
  const unavailable = (why: string): ProofResult => ({
    exists: false,
    status: 'UNAVAILABLE',
    message: 'Não foi possível verificar este comprovativo neste momento.',
    unavailable_reason: why,
  });
  try {
    // The stack that matches Platform Mode, not API_BASE. Pinned to API_BASE
    // this asked the LIVE rail, which is fail-closed and answers 503 with an
    // HTML page — json() threw, and the page told the reader their genuine
    // Sandbox proof "does not exist or may have been forged". A verification
    // feature that calls a real record a forgery is worse than one that errors.
    const { base } = await platformTarget();
    const res = await fetch(`${base}/v1/public/proofs/${encodeURIComponent(ref)}`, { cache: 'no-store' });

    // 5xx and 503 are OUR failure, never the receipt's.
    if (res.status >= 500) return unavailable(`upstream_${res.status}`);

    const j = (await res.json().catch(() => null)) as ProofResult | null;

    // A body we cannot read is an unknown, not a verdict.
    if (!j || typeof j.exists !== 'boolean') return unavailable('unparseable_response');

    // A definitive 404 is the one case that may say "invalid".
    if (res.status === 404) {
      return { ...j, exists: false, status: j.status || 'NOT_FOUND' };
    }
    if (res.status !== 200) return unavailable(`unexpected_status_${res.status}`);
    return j;
  } catch {
    // Network failure, DNS, TLS, timeout — all unknowns.
    return unavailable('network_error');
  }
}

// Reads the central platform mode (no rebuild needed to flip it). Production is
// silent: only SANDBOX is communicated. On ANY failure it resolves to SANDBOX —
// the site never assumes LIVE on error.
export async function getPlatformMode(): Promise<PlatformModeInfo> {
  const fallback: PlatformModeInfo = {
    mode: 'SANDBOX', public_banner: true,
    message: 'Esta plataforma encontra-se em ambiente de testes.',
  };
  try {
    const res = await fetch(`${API_BASE}/v1/platform-mode`, { cache: 'no-store' });
    if (!res.ok) return fallback;
    const j = (await res.json()) as Partial<PlatformModeInfo>;
    if (j.mode !== 'LIVE' && j.mode !== 'SANDBOX') return fallback;
    return { mode: j.mode, public_banner: !!j.public_banner, message: j.message || '' };
  } catch {
    return fallback;
  }
}

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
    case 'BUSINESS':
      return 'Este @negócio pertence a uma Business Account existente.';
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
  const { base } = await onboardingTarget();
  const res = await fetch(`${base}/v1/merchant/applications/check-handle`, {
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
  /** The requested @handle is already this applicant's Business Account. */
  existing_business?: boolean;
};

export type SubmitResult = {
  ok: boolean;
  status: number;
  applicationId?: string;
  code?: string;
  error?: string;
};

export async function submitApplication(input: ApplicationInput, idempotencyKey?: string): Promise<SubmitResult> {
  // Route to the stack matching the current Platform Mode and tag the request
  // with that environment. The gateway stamps the environment authoritatively
  // (ADR-025); sending the resolved env keeps the client honest too.
  const { base, env } = await onboardingTarget();
  const res = await fetch(`${base}/v1/merchant/applications`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: JSON.stringify({ ...input, environment: env }),
  });
  if (res.ok) {
    const j = await res.json().catch(() => ({}));
    return { ok: true, status: res.status, applicationId: j.application_id };
  }
  const j = await res.json().catch(() => ({}));
  return { ok: false, status: res.status, code: j.code, error: j.message || j.code };
}

// ---------------------------------------------------------------------------
// KYB documents (Track 3) — direct-to-storage upload via short-lived signed URLs
// ---------------------------------------------------------------------------

export type KybDocumentType =
  | 'BUSINESS_REGISTRATION'
  | 'TAX_ID'
  | 'REPRESENTATIVE_ID'
  | 'OTHER';

/** Required company documents for a Business application. The company NIF is a
 *  form field (text), NOT a document upload, so TAX_ID is not required here.
 *  An optional "additional document" (OTHER) may be attached. No proof-of-address
 *  and no bank proof: banking/settlement details are collected later. */
export const REQUIRED_KYB_DOCUMENTS: KybDocumentType[] = [
  'BUSINESS_REGISTRATION',
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
  const { base } = await onboardingTarget();
  const res = await fetch(
    `${base}/v1/merchant/applications/${encodeURIComponent(applicationId)}/documents/upload-url`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  );
  if (res.ok) return { ok: true, data: (await res.json()) as UploadUrlResponse };
  const j = await res.json().catch(() => ({}));
  return { ok: false, status: res.status, code: j.error?.code || j.code };
}

async function confirmUpload(applicationId: string, documentId: string): Promise<boolean> {
  const { base } = await onboardingTarget();
  const res = await fetch(
    `${base}/v1/merchant/applications/${encodeURIComponent(applicationId)}/documents/${encodeURIComponent(documentId)}/confirm`,
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

/** One document attached to an application, as the applicant may see it. */
export type ApplicationDocument = {
  document_id: string;
  document_type: KybDocumentType | string;
  original_filename: string;
  /** PENDING_UPLOAD · UPLOADED · ACCEPTED · REJECTED */
  status: string;
  size_bytes: number;
  uploaded_at: string | null;
  rejection_reason: string | null;
};

/** The documents attached to an application, by its reference. Null when the
 *  list could not be read — which is not the same as "none attached". */
export async function listApplicationDocuments(applicationId: string): Promise<ApplicationDocument[] | null> {
  try {
    const { base } = await platformTarget();
    const res = await fetch(
      `${base}/v1/merchant/applications/${encodeURIComponent(applicationId)}/documents`,
      { cache: 'no-store' },
    );
    if (!res.ok) return null;
    const j = (await res.json().catch(() => null)) as { data?: ApplicationDocument[] } | null;
    return Array.isArray(j?.data) ? j!.data : null;
  } catch {
    return null;
  }
}

/** One item of the Business requirements policy — the list every onboarding
 *  surface renders. The Gateway is the authority; a form only mirrors it. */
export type RequirementPolicyItem = {
  code: string;
  kind: 'field' | 'document';
  label: string;
  capability: string;
};

export type RequirementPolicy = { policy_version: string; items: RequirementPolicyItem[] };

/** GET /v1/merchant/application-requirements. Null when it cannot be read. */
export async function getApplicationRequirements(): Promise<RequirementPolicy | null> {
  try {
    const { base } = await platformTarget();
    const res = await fetch(`${base}/v1/merchant/application-requirements`, { cache: 'no-store' });
    if (!res.ok) return null;
    const j = (await res.json().catch(() => null)) as RequirementPolicy | null;
    return j && Array.isArray(j.items) ? j : null;
  } catch {
    return null;
  }
}

export type ResubmitResult =
  | { ok: true }
  | { ok: false; status: number; code?: string; message?: string };

/** The applicant answered the reviewer's request: back to review.
 *  422 REQUIREMENTS_NOT_MET, 409 NOT_WAITING_FOR_INFORMATION. */
export async function resubmitApplication(applicationId: string): Promise<ResubmitResult> {
  try {
    const { base } = await platformTarget();
    const res = await fetch(
      `${base}/v1/merchant/applications/${encodeURIComponent(applicationId)}/resubmit`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
    );
    if (res.ok) return { ok: true };
    const j = await res.json().catch(() => ({}));
    return { ok: false, status: res.status, code: j.error?.code ?? j.code, message: j.error?.message ?? j.message };
  } catch {
    return { ok: false, status: 0, code: 'NETWORK' };
  }
}

export type ActivationStatus = {
  valid: boolean;
  reason: string; // VALID | INVALID | EXPIRED | USED
  business_name?: string;
  handle?: string;
};

export async function validateActivation(token: string): Promise<ActivationStatus> {
  const { base } = await onboardingTarget();
  const res = await fetch(`${base}/v1/merchant/activation/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  return res.json();
}

export type CompleteResult = { ok: boolean; status: number; error?: string };

export async function completeActivation(token: string, pin: string): Promise<CompleteResult> {
  const { base } = await onboardingTarget();
  const res = await fetch(`${base}/v1/merchant/activation/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, pin }),
  });
  if (res.ok) return { ok: true, status: res.status };
  const j = await res.json().catch(() => ({}));
  return { ok: false, status: res.status, error: j.code || j.message };
}
