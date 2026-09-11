package pushtopic

import (
	"errors"
	"regexp"
	"strings"
	"testing"
)

const (
	testKey = "test-push-topic-key-0123456789abcdef"
	testID  = "3f0c9a52-1b2d-4e6f-8a9b-0c1d2e3f4a5b"
)

// fcmTopic is the character set FCM accepts in a topic name.
var fcmTopic = regexp.MustCompile(`^[a-zA-Z0-9\-_.~%]{1,900}$`)

func mustNew(t *testing.T, key string, sandbox bool) *Namer {
	t.Helper()
	n, err := New(key, sandbox)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	return n
}

// A fixed vector (HMAC-SHA256 computed independently): every service that
// names a topic — public-api and the gateway — names the same one.
func TestKnownVector(t *testing.T) {
	n := mustNew(t, testKey, false)
	if got, _ := n.Consumer(testID); got != "c_60fb69fab79d6d3c7a3ac844cc4712f7" {
		t.Fatalf("consumer topic = %q", got)
	}
	if got, _ := n.Merchant(testID); got != "m_9db3b08df4b8f6f166e9052ffb76810f" {
		t.Fatalf("merchant topic = %q", got)
	}
	s := mustNew(t, testKey, true)
	if got, _ := s.Consumer(testID); got != "sandbox_c_60fb69fab79d6d3c7a3ac844cc4712f7" {
		t.Fatalf("sandbox consumer topic = %q", got)
	}
}

// The topic is not the id-derived name anyone could compute (A6-06).
func TestTopicIsNotTheIDDerivedName(t *testing.T) {
	for _, sandbox := range []bool{false, true} {
		n := mustNew(t, testKey, sandbox)
		c, _ := n.Consumer(testID)
		m, _ := n.Merchant(testID)
		for _, legacy := range []string{
			"consumer_" + testID, "sandbox_consumer_" + testID,
			"merchant_" + testID, "sandbox_merchant_" + testID,
		} {
			if c == legacy || m == legacy {
				t.Fatalf("topic is the legacy name %q", legacy)
			}
		}
		if strings.Contains(c, testID) || strings.Contains(m, testID) {
			t.Fatalf("topic contains the id: %q %q", c, m)
		}
		if !fcmTopic.MatchString(c) || !fcmTopic.MatchString(m) {
			t.Fatalf("not a valid FCM topic name: %q %q", c, m)
		}
	}
}

// Knowing the id is not enough: another key names another topic.
func TestTopicDependsOnTheKey(t *testing.T) {
	a := mustNew(t, testKey, false)
	b := mustNew(t, testKey+"-other", false)
	ac, _ := a.Consumer(testID)
	bc, _ := b.Consumer(testID)
	if ac == bc {
		t.Fatalf("two keys named the same topic %q", ac)
	}
}

func TestConsumerAndMerchantTopicsDiffer(t *testing.T) {
	n := mustNew(t, testKey, false)
	c, _ := n.Consumer(testID)
	m, _ := n.Merchant(testID)
	if c == m {
		t.Fatal("a consumer and a Business with the same id share a topic")
	}
	other, _ := n.Consumer("0a0a0a0a-0000-4000-8000-000000000000")
	if other == c {
		t.Fatal("two consumers share a topic")
	}
}

func TestIDSpellingDoesNotSplitATopic(t *testing.T) {
	n := mustNew(t, testKey, false)
	a, _ := n.Merchant(testID)
	b, _ := n.Merchant("  " + strings.ToUpper(testID) + " ")
	if a != b {
		t.Fatalf("%q != %q", a, b)
	}
}

// Without a key there is no Namer, and a nil Namer names nothing — never a
// fallback to the guessable name.
func TestNoKeyNamesNothing(t *testing.T) {
	n, err := New("", false)
	if !errors.Is(err, ErrNoKey) || n != nil {
		t.Fatalf("New(\"\") = %v, %v", n, err)
	}
	n, err = New("   ", true)
	if !errors.Is(err, ErrNoKey) || n != nil {
		t.Fatalf("New(blank) = %v, %v", n, err)
	}
	if topic, ok := n.Consumer(testID); ok || topic != "" {
		t.Fatalf("nil Namer named %q", topic)
	}
	if topic, ok := n.Merchant(testID); ok || topic != "" {
		t.Fatalf("nil Namer named %q", topic)
	}
}

func TestShortKeyIsRefused(t *testing.T) {
	n, err := New(strings.Repeat("k", MinKeyLength-1), false)
	if !errors.Is(err, ErrShortKey) || n != nil {
		t.Fatalf("New(short) = %v, %v", n, err)
	}
	if _, err := New(strings.Repeat("k", MinKeyLength), false); err != nil {
		t.Fatalf("New(min length): %v", err)
	}
}

func TestEmptyIDNamesNothing(t *testing.T) {
	n := mustNew(t, testKey, false)
	if topic, ok := n.Consumer(" "); ok || topic != "" {
		t.Fatalf("empty id named %q", topic)
	}
}
