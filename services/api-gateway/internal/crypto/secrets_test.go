package crypto

import (
	"crypto/rand"
	"encoding/base64"
	"strings"
	"testing"
)

func newKey(t *testing.T) string {
	t.Helper()
	k := make([]byte, 32)
	if _, err := rand.Read(k); err != nil {
		t.Fatal(err)
	}
	return base64.StdEncoding.EncodeToString(k)
}

func TestEncryptDecrypt_RoundTrip(t *testing.T) {
	c, err := NewSecretCipher(newKey(t))
	if err != nil {
		t.Fatal(err)
	}
	const secret = "whsec_super_secret_value"

	enc, err := c.Encrypt(secret)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(enc, "enc:v1:") {
		t.Fatalf("ciphertext must be prefixed: %q", enc)
	}
	if strings.Contains(enc, secret) {
		t.Fatal("plaintext must not appear in ciphertext")
	}
	got, err := c.Decrypt(enc)
	if err != nil {
		t.Fatal(err)
	}
	if got != secret {
		t.Fatalf("round-trip mismatch: %q != %q", got, secret)
	}
}

func TestDecrypt_LegacyPlaintextPassthrough(t *testing.T) {
	c, _ := NewSecretCipher(newKey(t))
	got, err := c.Decrypt("legacy_plaintext_secret")
	if err != nil || got != "legacy_plaintext_secret" {
		t.Fatalf("legacy plaintext must pass through: got %q err %v", got, err)
	}
}

func TestDecrypt_RejectsTamperedCiphertext(t *testing.T) {
	c, _ := NewSecretCipher(newKey(t))
	enc, _ := c.Encrypt("x")
	// Flip a character in the base64 body.
	tampered := enc[:len(enc)-1] + "A"
	if _, err := c.Decrypt(tampered); err == nil {
		t.Fatal("tampered ciphertext must fail authentication")
	}
}

func TestNilCipher_Passthrough(t *testing.T) {
	c, err := NewSecretCipher("") // no key
	if err != nil || c != nil {
		t.Fatalf("empty key yields nil cipher: c=%v err=%v", c, err)
	}
	enc, _ := c.Encrypt("plain")
	if enc != "plain" {
		t.Fatalf("nil cipher must passthrough, got %q", enc)
	}
}

func TestNewSecretCipher_RejectsBadKeyLength(t *testing.T) {
	if _, err := NewSecretCipher(base64.StdEncoding.EncodeToString([]byte("short"))); err == nil {
		t.Fatal("a non-32-byte key must be rejected")
	}
}
