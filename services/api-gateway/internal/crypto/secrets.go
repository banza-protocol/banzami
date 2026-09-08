package crypto

// The secret cipher moved to services/common/webhookprov when the Developers
// Console had to write webhook endpoints too: the gateway and developer-api
// must encrypt with the same construction and the same key, and two copies of
// an AEAD wrapper is how they drift.
//
// These aliases keep every existing caller and test in the gateway reading the
// same names.

import "github.com/banzami/banzami/services/common/webhookprov"

// SecretCipher encrypts secrets at rest (SEC-002).
type SecretCipher = webhookprov.SecretCipher

// NewSecretCipher builds a cipher from a base64 32-byte key.
func NewSecretCipher(keyB64 string) (*SecretCipher, error) {
	return webhookprov.NewSecretCipher(keyB64)
}
