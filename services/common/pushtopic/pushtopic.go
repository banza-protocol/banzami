// Package pushtopic names the FCM topics an account's push notifications are
// published to.
//
// A6-06. FCM does not authenticate who subscribes to a topic: any app built
// against Banzami's (public) Firebase client configuration can subscribe to
// any topic name it knows. The topics used to be `consumer_<id>` and
// `merchant_<id>`, and those ids are not secret, so anyone who learned one
// could receive "Recebeu 2 000 Kz de @payer" for every payment that account
// received.
//
// A topic name is now a keyed hash of the id: without PUSH_TOPIC_KEY the name
// cannot be derived from the id. Only the server computes it, and it tells the
// name only to the account's own authenticated session (public-api
// GET /v1/me/push-topic, gateway GET /v1/merchant/push-topic). The app
// subscribes to what it is told and never derives a topic itself.
//
// Every service that publishes to or names a topic (public-api, api-gateway)
// must hold the same key, or they would name different topics for the same
// Business. Without a key there is no topic: senders skip topic sends rather
// than fall back to a guessable name.
package pushtopic

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strings"
)

// EnvVar is the environment variable the key is read from.
const EnvVar = "PUSH_TOPIC_KEY"

// MinKeyLength is the shortest key accepted, in bytes. A short key could be
// guessed offline by anyone holding one (id, topic) pair.
const MinKeyLength = 32

// hashHexChars is how much of the HMAC names the topic: 128 bits.
const hashHexChars = 32

var (
	// ErrNoKey means PUSH_TOPIC_KEY is not set: topic pushes are disabled.
	ErrNoKey = errors.New(EnvVar + " is not set")
	// ErrShortKey means PUSH_TOPIC_KEY is set but shorter than MinKeyLength.
	ErrShortKey = errors.New(EnvVar + " is shorter than 32 bytes")
)

// Namer derives topic names. A nil *Namer names nothing: every method reports
// false, so a caller without a key cannot publish to any topic.
type Namer struct {
	key     []byte
	sandbox bool
}

// New returns the Namer for key. sandbox keeps the Sandbox stack's topics
// apart from Live's (a `sandbox_` prefix), as the old names did, for a
// Firebase project shared by both stacks. It returns (nil, ErrNoKey) when key
// is empty and (nil, ErrShortKey) when it is too short — never a Namer that
// names guessable topics.
func New(key string, sandbox bool) (*Namer, error) {
	key = strings.TrimSpace(key)
	if key == "" {
		return nil, ErrNoKey
	}
	if len(key) < MinKeyLength {
		return nil, ErrShortKey
	}
	return &Namer{key: []byte(key), sandbox: sandbox}, nil
}

// Consumer is the topic a consumer's notifications are published to.
func (n *Namer) Consumer(consumerID string) (string, bool) {
	return n.topic("consumer", "c_", consumerID)
}

// Merchant is the topic a Business's notifications are published to.
func (n *Namer) Merchant(merchantID string) (string, bool) {
	return n.topic("merchant", "m_", merchantID)
}

func (n *Namer) topic(kind, short, id string) (string, bool) {
	id = strings.ToLower(strings.TrimSpace(id))
	if n == nil || id == "" {
		return "", false
	}
	mac := hmac.New(sha256.New, n.key)
	mac.Write([]byte(kind + ":" + id))
	name := short + hex.EncodeToString(mac.Sum(nil))[:hashHexChars]
	if n.sandbox {
		name = "sandbox_" + name
	}
	return name, true
}
