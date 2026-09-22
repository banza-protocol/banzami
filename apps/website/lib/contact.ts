// The public contact form (PUBLIC-WEBSITE-CONTACT-001), client side.
//
// A visitor's message is delivered by email to the team (contact@banzami.com);
// the endpoint (POST /v1/contact on the gateway) needs no account and no auth,
// stores nothing, and is rate-limited per IP. A filled honeypot is treated as a
// bot and silently succeeds.

import { API_BASE } from '@/lib/api';

export type ContactMessage = {
  name: string;
  email: string;
  subject?: string;
  message: string;
  // Honeypot: the client always sends it empty; a filled value is a bot.
  website?: string;
};

export type ContactResult = { ok: true } | { ok: false; message: string };

/**
 * Send a contact message. A 200 is success. A 4xx is a validation problem the
 * person can fix; anything else (including a delivery failure) is a try-again.
 */
export async function submitContact(input: ContactMessage): Promise<ContactResult> {
  try {
    const res = await fetch(`${API_BASE}/v1/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ website: '', ...input }),
    });
    if (res.ok) return { ok: true };
    const j = await res.json().catch(() => ({}) as { message?: string });
    if (res.status >= 400 && res.status < 500 && j.message) {
      return { ok: false, message: j.message };
    }
    return { ok: false, message: 'default' };
  } catch {
    return { ok: false, message: 'default' };
  }
}
