package kycstorage

import (
	"context"
	"sync"
	"time"
)

// Fake is an in-memory KycEvidenceStorage for tests. It records which keys were
// "uploaded" so HeadObject can simulate R2 verification without network calls.
type Fake struct {
	mu      sync.Mutex
	objects map[string]ObjectInfo
	bucket  string
}

// NewFake returns an in-memory storage. Call MarkUploaded to make HeadObject
// report an object as present.
func NewFake() *Fake {
	return &Fake{objects: map[string]ObjectInfo{}, bucket: "kyc-test"}
}

func (f *Fake) Bucket() string { return f.bucket }

func (f *Fake) BuildStorageKey(consumerID, caseID, slot string) (string, error) {
	return buildKey(consumerID, caseID, slot)
}

func (f *Fake) CreateUploadURL(_ context.Context, key, contentType string) (UploadURL, error) {
	headers := map[string]string{}
	if contentType != "" {
		headers["content-type"] = contentType
	}
	return UploadURL{
		URL:       "https://fake-r2.local/" + key + "?X-Amz-Signature=test",
		Method:    "PUT",
		Headers:   headers,
		ExpiresAt: time.Unix(0, 0).Add(300 * time.Second),
	}, nil
}

func (f *Fake) CreateReadURL(_ context.Context, key, _ string) (ReadURL, error) {
	return ReadURL{URL: "https://fake-r2.local/" + key + "?X-Amz-Signature=test"}, nil
}

func (f *Fake) HeadObject(_ context.Context, key string) (ObjectInfo, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if info, ok := f.objects[key]; ok {
		return info, nil
	}
	return ObjectInfo{Exists: false}, nil
}

func (f *Fake) DeleteObject(_ context.Context, key string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	delete(f.objects, key)
	return nil
}

// MarkUploaded simulates a successful client PUT to R2.
func (f *Fake) MarkUploaded(key string, sizeBytes int64, contentType string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.objects[key] = ObjectInfo{Exists: true, SizeBytes: sizeBytes, ContentType: contentType}
}
