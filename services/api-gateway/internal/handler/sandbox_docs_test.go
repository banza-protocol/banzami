package handler

import (
	"reflect"
	"testing"
)

// The Sandbox rehearsal logs only the two canonical KYB document types, never
// arbitrary values, and never duplicates — so a Sandbox record can be trusted as
// synthetic evidence without leaking whatever a client sent.
func TestCanonicalSandboxDocs(t *testing.T) {
	cases := []struct {
		in   []string
		want []string
	}{
		{nil, []string{}},
		{[]string{"BUSINESS_REGISTRATION", "REPRESENTATIVE_ID"}, []string{"BUSINESS_REGISTRATION", "REPRESENTATIVE_ID"}},
		{[]string{"REPRESENTATIVE_ID"}, []string{"REPRESENTATIVE_ID"}},
		// Dedup + drop anything not canonical (e.g. an injected type).
		{[]string{"BUSINESS_REGISTRATION", "BUSINESS_REGISTRATION", "TAX_ID", "../../etc"}, []string{"BUSINESS_REGISTRATION"}},
	}
	for _, c := range cases {
		got := canonicalSandboxDocs(c.in)
		if len(got) == 0 && len(c.want) == 0 {
			continue
		}
		if !reflect.DeepEqual(got, c.want) {
			t.Errorf("canonicalSandboxDocs(%v) = %v, want %v", c.in, got, c.want)
		}
	}
}
