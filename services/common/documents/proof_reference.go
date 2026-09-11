package documents

// Proof references — the ONE grammar.
//
// A proof reference is an opaque, exact identifier and a bearer capability:
// whoever holds it may read the proof. It has exactly one spelling — the one the
// generator emitted — and identity is textual identity. Nothing here, and
// nothing in front of it, lower-cases, upper-cases, trims, strips, re-hyphenates,
// Unicode-normalizes or "repairs" a look-alike character. A reference that is
// not spelled canonically is not a reference: it is refused before any lookup.
//
// The generator (api-gateway service.secureReference) draws its symbols from
// ProofRefAlphabet, and the SECURE_V1 pattern below is built from the same
// constant, so the parser accepts exactly the symbols the generator can emit.

import "regexp"

// ProofRefAlphabet is the SECURE_V1 symbol set: digits and upper-case letters
// without I, L, O and U. Those four are not in the alphabet, so a reference that
// contains one is invalid — it is never read as the digit it resembles.
const ProofRefAlphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

// ProofRefVersion is what a string is, as a proof reference.
type ProofRefVersion int

const (
	ProofRefInvalid ProofRefVersion = iota
	// ProofRefLegacyV0 is BZM-XXXX-XXXX: 8 upper-case hex digits. Sandbox
	// compatibility only, for receipts already in people's hands.
	ProofRefLegacyV0
	// ProofRefSecureV1 is BZM + six groups of four ProofRefAlphabet symbols:
	// 120 random bits.
	ProofRefSecureV1
)

var (
	proofRefLegacyV0 = regexp.MustCompile(`^BZM(?:-[0-9A-F]{4}){2}$`)
	proofRefSecureV1 = regexp.MustCompile(`^BZM(?:-[` + ProofRefAlphabet + `]{4}){6}$`)
)

// ClassifyProofReference classifies ref exactly as given. It is the only parser:
// every surface that resolves a proof by its reference calls it first, on the
// untouched input, and looks the proof up only when it is not ProofRefInvalid.
func ClassifyProofReference(ref string) ProofRefVersion {
	switch {
	case proofRefSecureV1.MatchString(ref):
		return ProofRefSecureV1
	case proofRefLegacyV0.MatchString(ref):
		return ProofRefLegacyV0
	default:
		return ProofRefInvalid
	}
}
