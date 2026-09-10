// Proof references, as the verifier form accepts them.
//
// The operator issues two shapes (api-gateway service/proof.go,
// ClassifyReference) and looks a proof up by its exact canonical spelling:
//
//   SECURE_V1  BZM-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX  24 symbols, Crockford base32
//   LEGACY_V0  BZM-XXXX-XXXX                       8 hex digits (Sandbox only)
//
// A person pastes whatever they have: the reference alone, the verification
// link, or the comprovativo's copied details. normalizeProofRef finds the
// reference in it and returns its canonical spelling, or null.

const SECURE_V1 = /^BZM(?:-[0-9A-HJKMNP-TV-Z]{4}){6}$/;
const LEGACY_V0 = /^BZM(?:-[0-9A-F]{4}){2}$/;

// A reference written with its hyphens, anywhere in the text.
const HYPHENATED = [
  /BZM(?:-[0-9A-Z]{4}){6}(?![0-9A-Z])/,
  /BZM(?:-[0-9A-Z]{4}){2}(?![0-9A-Z]|-[0-9A-Z])/,
];

export const PROOF_REF_PLACEHOLDER = 'BZM-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX';

export function isProofRef(ref: string): boolean {
  return SECURE_V1.test(ref) || LEGACY_V0.test(ref);
}

export function normalizeProofRef(input: string): string | null {
  const text = input
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[‐-―−]/g, '-') // typographic dashes a PDF or phone may add
    .trim();

  let body = '';
  for (const re of HYPHENATED) {
    const m = text.match(re);
    if (m) { body = m[0].slice(3).replace(/-/g, ''); break; }
  }
  if (!body) {
    // Only the reference, typed without (or with odd) separators.
    const bare = text.replace(/[\s-]/g, '');
    if (!bare.startsWith('BZM')) return null;
    body = bare.slice(3);
  }
  if (body.length !== 24 && body.length !== 8) return null;

  // Crockford base32 reads the letters it never issues as the digits they
  // resemble; U is never issued and has no reading.
  body = body.replace(/O/g, '0').replace(/[IL]/g, '1');
  const ref = ['BZM', ...(body.match(/.{4}/g) ?? [])].join('-');
  return isProofRef(ref) ? ref : null;
}
