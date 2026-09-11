// Proof references — exact identifiers.
//
// A proof reference has one spelling: the one the operator's generator emitted
// (api-gateway service.secureReference). It is a bearer capability and an exact
// identifier, so nothing here corrects it. No trimming, no case change, no
// look-alike repair (an O is not a 0), no dash or Unicode normalization, no
// percent-decoding, no fishing a reference out of surrounding text. A reference
// that is not spelled exactly is refused with a format error, and it is never
// sent to the verifier.
//
// The grammar is the operator's (services/common/documents/proof_reference.go):
//
//   SECURE_V1  BZM + six groups of four symbols from PROOF_REF_ALPHABET
//   LEGACY_V0  BZM + two groups of four upper-case hex digits (Sandbox only)
//
// The server enforces the same grammar independently; this is the UX copy of it.

export const PROOF_REF_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const SECURE_V1 = new RegExp(`^BZM(?:-[${PROOF_REF_ALPHABET}]{4}){6}$`);
const LEGACY_V0 = /^BZM(?:-[0-9A-F]{4}){2}$/;

// The canonical verification link as it is printed and encoded in the QR:
// https://banzami.com/r/<reference> (the PDF prints it without the scheme).
// Only the path segment is taken, exactly as written — it is not decoded.
const VERIFICATION_LINK = /^(?:https:\/\/)?banzami\.com\/r\/([^/?#]*)$/;

export const PROOF_REF_FORMAT = 'BZM-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX';

export function isProofRef(ref: string): boolean {
  return SECURE_V1.test(ref) || LEGACY_V0.test(ref);
}

export type ProofInput =
  | { ok: true; ref: string }
  | { ok: false; reason: 'empty' | 'whitespace' | 'format' };

// Any whitespace or invisible character — reported, never removed.
const WHITESPACE_OR_INVISIBLE = /[\s\u00AD\u180E\u200B-\u200F\u2028-\u202F\u2060-\u2064\uFEFF]/;

export function parseProofInput(input: string): ProofInput {
  if (input === '') return { ok: false, reason: 'empty' };
  if (WHITESPACE_OR_INVISIBLE.test(input)) return { ok: false, reason: 'whitespace' };
  if (isProofRef(input)) return { ok: true, ref: input };
  const link = input.match(VERIFICATION_LINK);
  if (link && isProofRef(link[1])) return { ok: true, ref: link[1] };
  return { ok: false, reason: 'format' };
}
