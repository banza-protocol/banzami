package service

import (
	"context"
	"errors"
	"testing"
)

type stubMode struct{ mode string }

func (s stubMode) Mode(context.Context) string { return s.mode }

func TestNormaliseStackEnv(t *testing.T) {
	cases := map[string]string{
		"LIVE": "LIVE", "live": "LIVE", "production": "LIVE", "PROD": "LIVE",
		"SANDBOX": "SANDBOX", "sandbox": "SANDBOX", "staging": "SANDBOX", "test": "SANDBOX",
		"development": "", "": "", "weird": "",
	}
	for in, want := range cases {
		if got := NormaliseStackEnv(in); got != want {
			t.Errorf("NormaliseStackEnv(%q)=%q want %q", in, got, want)
		}
	}
}

func TestEnvGate_Verify(t *testing.T) {
	t.Run("match allows", func(t *testing.T) {
		g := NewEnvGate("SANDBOX", stubMode{mode: "SANDBOX"})
		if mode, err := g.Verify(context.Background()); err != nil || mode != "SANDBOX" {
			t.Fatalf("got mode=%q err=%v; want SANDBOX,nil", mode, err)
		}
	})

	t.Run("LIVE stack while platform SANDBOX is refused", func(t *testing.T) {
		// This is exactly the @jrm hazard: a LIVE gateway must refuse onboarding
		// while the global platform mode is SANDBOX.
		g := NewEnvGate("LIVE", stubMode{mode: "SANDBOX"})
		mode, err := g.Verify(context.Background())
		if !errors.Is(err, ErrEnvMismatch) {
			t.Fatalf("err=%v want ErrEnvMismatch", err)
		}
		if mode != "SANDBOX" {
			t.Fatalf("mode=%q want SANDBOX (the platform mode, for the message)", mode)
		}
	})

	t.Run("SANDBOX stack while platform LIVE is allowed (one-directional)", func(t *testing.T) {
		// The sandbox stack cannot create production data, so it must keep working
		// after a LIVE launch — otherwise the developer sandbox breaks.
		g := NewEnvGate("SANDBOX", stubMode{mode: "LIVE"})
		if _, err := g.Verify(context.Background()); err != nil {
			t.Fatalf("err=%v want nil (sandbox always allowed)", err)
		}
	})

	t.Run("development stack disables the gate", func(t *testing.T) {
		g := NewEnvGate("development", stubMode{mode: "LIVE"})
		if mode, err := g.Verify(context.Background()); err != nil || mode != "" {
			t.Fatalf("got mode=%q err=%v; want disabled (empty,nil)", mode, err)
		}
	})

	t.Run("nil gate allows", func(t *testing.T) {
		var g *EnvGate
		if _, err := g.Verify(context.Background()); err != nil {
			t.Fatalf("nil gate must allow, got %v", err)
		}
	})
}
