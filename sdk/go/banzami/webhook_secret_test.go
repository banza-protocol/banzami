package banzami

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"testing"
	"time"
)

// A2-03. An integration that never configured its secret verified against "",
// so an event signed with the empty key was accepted. It is now refused.
func TestVerifySignature_RefusesAnEmptySecret(t *testing.T) {
	body := []byte(`{"id":"evt_1","type":"payment_link.paid","data":{}}`)
	ts := time.Now().Unix()
	mac := hmac.New(sha256.New, []byte(""))
	fmt.Fprintf(mac, "%d.", ts)
	mac.Write(body)
	forged := fmt.Sprintf("t=%d,v1=%s", ts, hex.EncodeToString(mac.Sum(nil)))
	for _, secret := range []string{"", "   "} {
		if err := VerifySignature(body, forged, secret, 5*time.Minute); err == nil {
			t.Fatalf("secret %q: an event signed with the empty key was accepted", secret)
		}
	}
}
