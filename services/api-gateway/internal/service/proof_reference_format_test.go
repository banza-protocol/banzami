// The public reference format is a security parameter, so it is asserted rather
// than assumed — and the two generations must stay structurally distinguishable
// without a stored column.
package service

import (
	"strings"
	"testing"
)

func TestSecureReference_Is120Bits(t *testing.T) {
	if SecureRefEntropyBits != 120 {
		t.Fatalf("SECURE_V1 must be 120 bits, got %d", SecureRefEntropyBits)
	}
	ref, err := secureReference()
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	if ClassifyReference(ref) != ReferenceSecureV1 {
		t.Fatalf("a freshly minted reference must classify as SECURE_V1: %q", ref)
	}
	// BZM + six groups of four.
	parts := strings.Split(ref, "-")
	if len(parts) != 7 || parts[0] != "BZM" {
		t.Fatalf("want BZM + 6 groups, got %q", ref)
	}
	for _, g := range parts[1:] {
		if len(g) != 4 {
			t.Fatalf("group %q is not 4 symbols in %q", g, ref)
		}
		for _, c := range g {
			if !strings.ContainsRune(refAlphabet, c) {
				t.Fatalf("symbol %q is outside the unambiguous alphabet in %q", c, ref)
			}
		}
	}
	// No I, L, O or U: a reference read aloud must not become a different one.
	for _, bad := range []string{"I", "L", "O", "U"} {
		if strings.Contains(refAlphabet, bad) {
			t.Fatalf("alphabet must exclude the ambiguous %q", bad)
		}
	}
}

// Distinctness is what lets a 40-bit generation be treated differently from a
// 120-bit one without a schema change. Cheap sanity that it is actually random.
func TestSecureReference_DoesNotRepeat(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 200; i++ {
		r, err := secureReference()
		if err != nil {
			t.Fatalf("generate: %v", err)
		}
		if seen[r] {
			t.Fatalf("secureReference repeated %q within 200 draws", r)
		}
		seen[r] = true
	}
}

func TestClassifyReference(t *testing.T) {
	for _, tc := range []struct {
		in   string
		want ReferenceVersion
	}{
		// The receipt already in a user's hands.
		{"BZM-F993-38E2", ReferenceLegacyV0},
		{"BZM-0000-0000", ReferenceLegacyV0},
		{"BZM-FFFF-FFFF", ReferenceLegacyV0},

		{"BZM-ABCD-2345-6789-JKMN-PQRS-TVWX", ReferenceSecureV1},
		{"BZM-0000-0000-0000-0000-0000-0000", ReferenceSecureV1},

		// Legacy is hex only — a UUID prefix cannot contain these.
		{"BZM-GHJK-MNPQ", ReferenceInvalid},

		// Wrong group counts.
		{"BZM-ABCD", ReferenceInvalid},
		{"BZM-ABCD-2345-6789", ReferenceInvalid},
		{"BZM-ABCD-2345-6789-JKMN-PQRS", ReferenceInvalid},
		{"BZM-ABCD-2345-6789-JKMN-PQRS-TVWX-YZ23", ReferenceInvalid},

		// Ambiguous symbols are not in the alphabet.
		{"BZM-ILOU-2345-6789-JKMN-PQRS-TVWX", ReferenceInvalid},

		// Prefix, garbage, whitespace, case.
		{"BZX-F993-38E2", ReferenceInvalid},
		{"F993-38E2", ReferenceInvalid},
		{"BZM-F993-38E2X", ReferenceInvalid},
		{"XBZM-F993-38E2", ReferenceInvalid},
		{" BZM-F993-38E2", ReferenceInvalid},
		{"BZM-F993-38E2 ", ReferenceInvalid},
		{"BZM-F993 38E2", ReferenceInvalid},
		{"bzm-f993-38e2", ReferenceInvalid},
		{"BZMF99338E2", ReferenceInvalid},
		{"", ReferenceInvalid},
	} {
		t.Run(tc.in, func(t *testing.T) {
			if got := ClassifyReference(tc.in); got != tc.want {
				t.Fatalf("ClassifyReference(%q) = %v, want %v", tc.in, got, tc.want)
			}
		})
	}
}

// NEW_LEGACY_REFERENCE_GENERATION = 0. The generator must be structurally
// incapable of producing a legacy reference, not merely unlikely to.
func TestGeneratorNeverEmitsLegacyFormat(t *testing.T) {
	for i := 0; i < 500; i++ {
		r, err := secureReference()
		if err != nil {
			t.Fatalf("generate: %v", err)
		}
		if ClassifyReference(r) == ReferenceLegacyV0 {
			t.Fatalf("generator emitted a LEGACY_HEX_V0 reference: %q", r)
		}
	}
}
