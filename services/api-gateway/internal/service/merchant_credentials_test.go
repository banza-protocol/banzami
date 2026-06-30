package service

import "testing"

func TestValidateHandle(t *testing.T) {
	valid := []string{"doa_sandbox", "ab1", "a_b", "cantina_alex", "farmacia_luanda", "abc123"}
	for _, h := range valid {
		if err := ValidateHandle(h); err != nil {
			t.Errorf("ValidateHandle(%q) = %v, want nil", h, err)
		}
	}
	invalid := []string{
		"ab",                              // too short (<3)
		"_abc",                            // starts with underscore
		"abc_",                            // ends with underscore
		"Doa",                             // uppercase
		"doa-sandbox",                     // hyphen not allowed
		"doa sandbox",                     // space
		"doação",                          // accent
		"a234567890123456789012345678901", // >30
		"",                                // empty
	}
	for _, h := range invalid {
		if err := ValidateHandle(h); err == nil {
			t.Errorf("ValidateHandle(%q) = nil, want error", h)
		}
	}
}

func TestValidatePin(t *testing.T) {
	valid := []string{"1234", "12345", "12345678"}
	for _, p := range valid {
		if err := ValidatePin(p); err != nil {
			t.Errorf("ValidatePin(%q) = %v, want nil", p, err)
		}
	}
	invalid := []string{"123", "123456789", "12a4", "", "abcd"}
	for _, p := range invalid {
		if err := ValidatePin(p); err == nil {
			t.Errorf("ValidatePin(%q) = nil, want error", p)
		}
	}
}

func TestNormaliseHandle(t *testing.T) {
	cases := map[string]string{
		"@Doa_Sandbox ": "doa_sandbox",
		"  CANTINA  ":   "cantina",
		"@fm65":         "fm65",
		"doa":           "doa",
	}
	for in, want := range cases {
		if got := NormaliseHandle(in); got != want {
			t.Errorf("NormaliseHandle(%q) = %q, want %q", in, got, want)
		}
	}
}
