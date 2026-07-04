package config

import "testing"

// Fail-closed activation invariants for the ADR-046 developer-key path (RT02.1).
// A URL variable alone must never activate developer-key authentication.
func TestDeveloperKeyAuthActive(t *testing.T) {
	base := func() *Config {
		return &Config{
			Environment:             "SANDBOX",
			DeveloperKeyAuthEnabled: true,
			DeveloperInternalKey:    "s3cret",
			DeveloperAPIURL:         "http://developer-api:8086",
		}
	}
	cases := []struct {
		name   string
		mutate func(*Config)
		want   bool
	}{
		{"fully valid sandbox", func(c *Config) {}, true},
		{"flag off (URL present)", func(c *Config) { c.DeveloperKeyAuthEnabled = false }, false},
		{"not sandbox (live)", func(c *Config) { c.Environment = "LIVE" }, false},
		{"not sandbox (production)", func(c *Config) { c.Environment = "production" }, false},
		{"empty internal key", func(c *Config) { c.DeveloperInternalKey = "" }, false},
		{"missing URL", func(c *Config) { c.DeveloperAPIURL = "" }, false},
		{"malformed URL", func(c *Config) { c.DeveloperAPIURL = "://nope" }, false},
		{"wrong/public host", func(c *Config) { c.DeveloperAPIURL = "https://evil.example.com" }, false},
		{"live-ish public gateway host", func(c *Config) { c.DeveloperAPIURL = "https://api.banzami.com" }, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			c := base()
			tc.mutate(c)
			got, reason := c.DeveloperKeyAuthActive()
			if got != tc.want {
				t.Fatalf("active=%v want %v (reason: %s)", got, tc.want, reason)
			}
		})
	}
}
