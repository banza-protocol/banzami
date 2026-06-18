// Package crypto provides AES-256-GCM encryption at rest for recoverable
// secrets (e.g. webhook signing secrets, which — unlike API keys — must be
// retrievable to sign outgoing requests and therefore cannot be hashed).
//
// Ciphertext format: "enc:v1:" + base64(nonce || ciphertext||tag).
// Values without the "enc:v1:" prefix are treated as legacy plaintext on
// decrypt, so the column can be migrated lazily without a backfill.
package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
)

const encPrefix = "enc:v1:"

// SecretCipher encrypts and decrypts at-rest secrets with AES-256-GCM.
type SecretCipher struct {
	aead cipher.AEAD
}

// NewSecretCipher builds a cipher from a base64-encoded 32-byte (256-bit) key.
// An empty key yields a nil cipher, in which case Encrypt/Decrypt are no-ops
// (plaintext passthrough) — acceptable for local dev, never for production.
func NewSecretCipher(keyB64 string) (*SecretCipher, error) {
	if keyB64 == "" {
		return nil, nil
	}
	key, err := base64.StdEncoding.DecodeString(strings.TrimSpace(keyB64))
	if err != nil {
		return nil, fmt.Errorf("crypto: invalid base64 key: %w", err)
	}
	if len(key) != 32 {
		return nil, fmt.Errorf("crypto: key must be 32 bytes (got %d)", len(key))
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("crypto: %w", err)
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("crypto: %w", err)
	}
	return &SecretCipher{aead: aead}, nil
}

// Encrypt returns the encrypted, prefixed, base64 form of plaintext. With a nil
// cipher it returns plaintext unchanged.
func (c *SecretCipher) Encrypt(plaintext string) (string, error) {
	if c == nil {
		return plaintext, nil
	}
	nonce := make([]byte, c.aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", fmt.Errorf("crypto: nonce: %w", err)
	}
	ct := c.aead.Seal(nonce, nonce, []byte(plaintext), nil)
	return encPrefix + base64.StdEncoding.EncodeToString(ct), nil
}

// Decrypt reverses Encrypt. Values without the encryption prefix are returned
// unchanged (legacy plaintext), so existing rows keep working.
func (c *SecretCipher) Decrypt(stored string) (string, error) {
	if !strings.HasPrefix(stored, encPrefix) {
		return stored, nil // legacy plaintext
	}
	if c == nil {
		return "", errors.New("crypto: encrypted value but no key configured")
	}
	raw, err := base64.StdEncoding.DecodeString(stored[len(encPrefix):])
	if err != nil {
		return "", fmt.Errorf("crypto: base64: %w", err)
	}
	ns := c.aead.NonceSize()
	if len(raw) < ns {
		return "", errors.New("crypto: ciphertext too short")
	}
	nonce, ct := raw[:ns], raw[ns:]
	pt, err := c.aead.Open(nil, nonce, ct, nil)
	if err != nil {
		return "", fmt.Errorf("crypto: decrypt: %w", err)
	}
	return string(pt), nil
}
