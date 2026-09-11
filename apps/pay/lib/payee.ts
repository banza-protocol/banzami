// How the payer sees who they are paying.
//
// The gateway's payer view names the Business by its PUBLIC identity — the name
// it presents (merchant_name) and the @banza it owns (merchant_handle) — never
// by the account name a Project gave it. The name leads; the @banza sits under
// it; the confirmation names the @banza, because that is the address a payer
// recognises and can check.

export interface Payee {
  /** The line shown first: the Business's name, else its @banza. */
  primary: string | null;
  /** The @banza under the name, when both exist. */
  secondary: string | null;
}

function atHandle(handle: string | null | undefined): string | null {
  const h = (handle ?? '').trim().replace(/^@/, '');
  return h === '' ? null : `@${h}`;
}

export function payeeDisplay(name: string | null | undefined, handle: string | null | undefined): Payee {
  const n = (name ?? '').trim();
  const at = atHandle(handle);
  if (n !== '') return { primary: n, secondary: at };
  return { primary: at, secondary: null };
}

/** "Pago a @doa" — or "Pago a Doa" for a Business with no @banza. */
export function paidToLabel(name: string | null | undefined, handle: string | null | undefined): string | null {
  const at = atHandle(handle);
  if (at) return `Pago a ${at}`;
  const n = (name ?? '').trim();
  return n === '' ? null : `Pago a ${n}`;
}
