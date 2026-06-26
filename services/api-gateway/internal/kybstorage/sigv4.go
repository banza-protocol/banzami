package kybstorage

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/url"
	"sort"
	"strings"
	"time"
)

// Minimal, dependency-free AWS Signature V4 query-string presigner. It targets
// S3-compatible object stores (Cloudflare R2 uses service "s3", region "auto").
// Payloads are signed as UNSIGNED-PAYLOAD so the browser can PUT the file body
// without the gateway seeing it. Only the Host header is signed, which keeps the
// pre-signed URL usable from a browser with a simple CORS policy.

const (
	sigAlgorithm = "AWS4-HMAC-SHA256"
	sigService   = "s3"
	unsignedBody = "UNSIGNED-PAYLOAD"
)

// presign returns a pre-signed URL for method+key valid for `expires`.
// extraQuery holds additional query params that must be part of the signature
// (e.g. response-content-disposition for downloads).
func (s *s3Storage) presign(method, key string, expires time.Duration, now time.Time, extraQuery url.Values) string {
	host := s.host
	canonicalURI := "/" + s.bucket + "/" + encodePath(key)

	amzDate := now.UTC().Format("20060102T150405Z")
	dateStamp := now.UTC().Format("20060102")
	credentialScope := dateStamp + "/" + s.region + "/" + sigService + "/aws4_request"

	q := url.Values{}
	for k, vs := range extraQuery {
		for _, v := range vs {
			q.Add(k, v)
		}
	}
	q.Set("X-Amz-Algorithm", sigAlgorithm)
	q.Set("X-Amz-Credential", s.accessKeyID+"/"+credentialScope)
	q.Set("X-Amz-Date", amzDate)
	q.Set("X-Amz-Expires", itoa(int(expires.Seconds())))
	q.Set("X-Amz-SignedHeaders", "host")

	canonicalQuery := encodeQuery(q)
	canonicalHeaders := "host:" + host + "\n"
	signedHeaders := "host"

	canonicalRequest := strings.Join([]string{
		method, canonicalURI, canonicalQuery, canonicalHeaders, signedHeaders, unsignedBody,
	}, "\n")

	stringToSign := strings.Join([]string{
		sigAlgorithm, amzDate, credentialScope, hexSHA256(canonicalRequest),
	}, "\n")

	signingKey := s.signingKey(dateStamp)
	signature := hex.EncodeToString(hmacSHA256(signingKey, stringToSign))

	return s.endpoint + canonicalURI + "?" + canonicalQuery + "&X-Amz-Signature=" + signature
}

func (s *s3Storage) signingKey(dateStamp string) []byte {
	kDate := hmacSHA256([]byte("AWS4"+s.secretAccessKey), dateStamp)
	kRegion := hmacSHA256(kDate, s.region)
	kService := hmacSHA256(kRegion, sigService)
	return hmacSHA256(kService, "aws4_request")
}

func hmacSHA256(key []byte, data string) []byte {
	h := hmac.New(sha256.New, key)
	h.Write([]byte(data))
	return h.Sum(nil)
}

func hexSHA256(data string) string {
	sum := sha256.Sum256([]byte(data))
	return hex.EncodeToString(sum[:])
}

// encodeQuery sorts and RFC3986-encodes query params (AWS canonical form).
func encodeQuery(q url.Values) string {
	keys := make([]string, 0, len(q))
	for k := range q {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var parts []string
	for _, k := range keys {
		vals := append([]string(nil), q[k]...)
		sort.Strings(vals)
		for _, v := range vals {
			// Query keys/values are fully encoded (slash → %2F); only the path
			// preserves "/". This must match how the server canonicalizes.
			parts = append(parts, awsEncode(k, true)+"="+awsEncode(v, true))
		}
	}
	return strings.Join(parts, "&")
}

// encodePath encodes each path segment but preserves the "/" separators.
func encodePath(key string) string {
	segs := strings.Split(key, "/")
	for i, s := range segs {
		segs[i] = awsEncode(s, false)
	}
	return strings.Join(segs, "/")
}

// awsEncode implements RFC3986 encoding as required by SigV4. Unreserved
// characters A-Z a-z 0-9 - _ . ~ are kept; everything else is %-encoded.
// When encodeSlash is false, "/" is preserved (used for object keys).
func awsEncode(s string, encodeSlash bool) string {
	const upperhex = "0123456789ABCDEF"
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9'),
			c == '-', c == '_', c == '.', c == '~':
			b.WriteByte(c)
		case c == '/' && !encodeSlash:
			b.WriteByte(c)
		default:
			b.WriteByte('%')
			b.WriteByte(upperhex[c>>4])
			b.WriteByte(upperhex[c&0x0f])
		}
	}
	return b.String()
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}
