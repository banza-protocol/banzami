package documents

import (
	"strings"
	"testing"
	"unicode/utf8"
)

const (
	canonicalSecure = "BZM-7K2M-9QXR-4TWZ-H3YJ-QY5R-BYN0"
	canonicalLegacy = "BZM-5EED-0A11"
)

// The parser accepts, at every symbol position, exactly the runes the generator
// can emit — checked over the whole Unicode range, not a hand-picked list.
func TestProofReference_AlphabetParity(t *testing.T) {
	if strings.ContainsAny(ProofRefAlphabet, "ILOU") || len(ProofRefAlphabet) != 32 {
		t.Fatalf("SECURE_V1 alphabet must be 32 symbols without I, L, O, U: %q", ProofRefAlphabet)
	}
	positions := []int{4, 9, 20, len(canonicalSecure) - 1} // first, middle and last group
	for r := rune(0); r <= utf8.MaxRune; r++ {
		if !utf8.ValidRune(r) {
			continue
		}
		want := strings.ContainsRune(ProofRefAlphabet, r)
		for _, pos := range positions {
			ref := canonicalSecure[:pos] + string(r) + canonicalSecure[pos+1:]
			if got := ClassifyProofReference(ref) == ProofRefSecureV1; got != want {
				t.Fatalf("rune %U at position %d: accepted=%v, generator emits it=%v", r, pos, got, want)
			}
		}
		// Legacy: upper-case hex only.
		wantLegacy := strings.ContainsRune("0123456789ABCDEF", r)
		ref := canonicalLegacy[:len(canonicalLegacy)-1] + string(r)
		if got := ClassifyProofReference(ref) == ProofRefLegacyV0; got != wantLegacy {
			t.Fatalf("legacy rune %U: accepted=%v, want %v", r, got, wantLegacy)
		}
	}
}

func TestProofReference_CanonicalForms(t *testing.T) {
	if ClassifyProofReference(canonicalSecure) != ProofRefSecureV1 {
		t.Fatalf("canonical SECURE_V1 refused")
	}
	if ClassifyProofReference(canonicalLegacy) != ProofRefLegacyV0 {
		t.Fatalf("canonical LEGACY_V0 refused")
	}
}

// Every other spelling of a real reference is invalid — never another name for
// the same proof. This is the reproduced defect (BYN0 vs BYNO) and its family.
func TestProofReference_NoAliasIsAReference(t *testing.T) {
	for name, ref := range aliasCorpus(canonicalSecure) {
		if v := ClassifyProofReference(ref); v != ProofRefInvalid {
			t.Errorf("%s: %q classified %v, want invalid", name, ref, v)
		}
	}
	for name, ref := range aliasCorpus(canonicalLegacy) {
		if v := ClassifyProofReference(ref); v != ProofRefInvalid {
			t.Errorf("legacy %s: %q classified %v, want invalid", name, ref, v)
		}
	}
}

func aliasCorpus(c string) map[string]string {
	last := c[len(c)-1:]
	swap := func(from, to string) string { return c[:len(c)-1] + strings.Replace(last, from, to, 1) }
	m := map[string]string{
		// look-alikes of the last symbol
		"O for 0": c[:len(c)-1] + "O", "I for 1": c[:len(c)-1] + "I", "L for 1": c[:len(c)-1] + "L",
		"U":             c[:len(c)-1] + "U",
		"Greek omicron": c[:len(c)-1] + "\u039F", "Cyrillic O": c[:len(c)-1] + "\u041E",
		"fullwidth 0": c[:len(c)-1] + "\uFF10", "fullwidth O": c[:len(c)-1] + "\uFF2F",
		"math bold 0": c[:len(c)-1] + "\U0001D7CE", "math sans O": c[:len(c)-1] + "\U0001D5AE",
		// case
		"lower": strings.ToLower(c), "Bzm": "Bzm" + c[3:], "bzm": "bzm" + c[3:],
		"one lower symbol": lowerLastLetter(c),
		// hyphens
		"no hyphens": strings.ReplaceAll(c, "-", ""), "missing one hyphen": strings.Replace(c, "-", "", 1),
		"extra hyphen": c + "-", "double hyphen": strings.Replace(c, "-", "--", 1),
		"moved hyphen": "BZM" + c[4:5] + "-" + c[5:],
		"underscore":   strings.ReplaceAll(c, "-", "_"), "space sep": strings.ReplaceAll(c, "-", " "),
		"en dash": strings.ReplaceAll(c, "-", "\u2013"), "em dash": strings.ReplaceAll(c, "-", "\u2014"),
		"nb hyphen": strings.ReplaceAll(c, "-", "\u2011"), "minus": strings.ReplaceAll(c, "-", "\u2212"),
		"fullwidth hyphen": strings.ReplaceAll(c, "-", "\uFF0D"), "hyphen U+2010": strings.ReplaceAll(c, "-", "\u2010"),
		// whitespace and invisible characters
		"leading space": " " + c, "trailing space": c + " ", "tab": c + "\t", "newline": c + "\n",
		"crlf": c + "\r\n", "nbsp": c + "\u00A0", "zwsp": c + "\u200B", "zwnj": c + "\u200C",
		"zwj": c + "\u200D", "bom": "\uFEFF" + c, "inner zwsp": c[:8] + "\u200B" + c[8:],
		"fullwidth prefix": "\uFF22\uFF3A\uFF2D" + c[3:],
		// percent-encoding is not a second spelling
		"%4F": c[:len(c)-1] + "%4F", "%30": c[:len(c)-1] + "%30", "%2530": c[:len(c)-1] + "%2530",
		"%20": c + "%20",
		// structure
		"missing prefix": c[4:], "extra prefix": "XBZM" + c[3:], "duplicate prefix": "BZM-" + c,
		"suffix": c + "X", "query": c + "?x=1", "fragment": c + "#r", "path": "/r/" + c,
		"empty": "", "prefix only": "BZM", "prefix and hyphen": "BZM-",
	}
	if last == "0" {
		m["swap 0\u2192O"] = swap("0", "O")
	}
	if strings.Count(c, "-") == 6 { // SECURE_V1 structure mutations
		m["23 symbols"] = c[:len(c)-1]
		m["25 symbols"] = c + "0"
		m["five groups"] = c[:len(c)-5]
		m["seven groups"] = c + "-0000"
		m["empty group"] = c[:len(c)-5] + "-"
		m["group of 3 and 5"] = c[:7] + "-" + c[7:8] + c[9:]
	} else {
		m["three groups"] = c + "-0000"
		m["one group"] = c[:8]
		m["short group"] = c[:len(c)-1]
	}
	return m
}

// lowerLastLetter lower-cases the last letter of the payload — a real case
// change, never a no-op on a digit.
func lowerLastLetter(c string) string {
	for i := len(c) - 1; i > 3; i-- {
		if c[i] >= 'A' && c[i] <= 'Z' {
			return c[:i] + strings.ToLower(c[i:i+1]) + c[i+1:]
		}
	}
	panic("reference has no letter: " + c)
}
