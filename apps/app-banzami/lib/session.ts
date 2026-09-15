import 'server-only';
import { cookies } from 'next/headers';
import crypto from 'node:crypto';

// The BFF session (WEB-APP-001 §25/§32).
//
// The Consumer API issues a Bearer token. That token is a financial credential
// and MUST NOT reach the browser. It lives here: AES-256-GCM-encrypted inside an
// HttpOnly, Secure, SameSite=Lax cookie, opened only on the server. The browser
// holds an opaque blob it cannot read or use against the Consumer API directly;
// every Consumer call goes through a BFF route that re-attaches the Bearer
// server-side. A per-session CSRF token is minted here too, for state-changing
// routes.

const COOKIE = 'bz_app_session';
const ALG = 'aes-256-gcm';

export type Session = {
  token: string; // Consumer API Bearer — server-only
  exp: number; // token expiry (unix seconds)
  consumerId: string;
  handle: string;
  displayName?: string;
  csrf: string; // per-session CSRF secret
};

function key(): Buffer {
  const raw = process.env.SESSION_SECRET;
  if (raw && raw.length >= 32) return crypto.createHash('sha256').update(raw).digest();
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET is required in production');
  }
  // Development only: a stable, non-secret dev key so local sessions survive a
  // reload. Never used in production (guarded above).
  return crypto.createHash('sha256').update('app-banzami-dev-session-key').digest();
}

function seal(s: Session): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALG, key(), iv);
  const pt = Buffer.from(JSON.stringify(s), 'utf8');
  const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString('base64url');
}

function open(blob: string): Session | null {
  try {
    const buf = Buffer.from(blob, 'base64url');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ct = buf.subarray(28);
    const decipher = crypto.createDecipheriv(ALG, key(), iv);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    const s = JSON.parse(pt.toString('utf8')) as Session;
    if (!s.token || !s.consumerId) return null;
    return s;
  } catch {
    return null;
  }
}

export function newCsrf(): string {
  return crypto.randomBytes(24).toString('base64url');
}

const CSRF_COOKIE = 'bz_app_csrf';

export async function createSession(s: Session): Promise<void> {
  const jar = await cookies();
  const maxAge = Math.max(60, s.exp - Math.floor(Date.now() / 1000));
  const secure = process.env.NODE_ENV === 'production';
  jar.set(COOKIE, seal(s), { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge });
  // A readable mirror of the CSRF secret so the app can echo it in the
  // X-CSRF-Token header (double-submit, bound to the encrypted session's copy).
  // Not HttpOnly by design — it is not a credential, only the anti-CSRF nonce.
  jar.set(CSRF_COOKIE, s.csrf, { httpOnly: false, secure, sameSite: 'lax', path: '/', maxAge });
}

export async function readSession(): Promise<Session | null> {
  const jar = await cookies();
  const c = jar.get(COOKIE);
  if (!c) return null;
  const s = open(c.value);
  if (!s) return null;
  // A session whose Bearer has expired is dead — treat as signed out.
  if (s.exp && s.exp <= Math.floor(Date.now() / 1000)) return null;
  return s;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
  jar.delete(CSRF_COOKIE);
}
