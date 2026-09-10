package kybstorage

import (
	"context"
	"sync"
	"time"
)

// FakeStorage is an in-memory KybDocumentStorage for tests. It records minted
// URLs and lets tests simulate an object existing (or not) without any network.
type FakeStorage struct {
	mu        sync.Mutex
	bucket    string
	ttl       time.Duration
	objects   map[string]ObjectInfo // key -> info (presence = "uploaded")
	contents  map[string][]byte     // key -> bytes, when a test supplies them
	UploadLog []string              // keys for which an upload URL was minted
	ReadLog   []string              // keys for which a read URL was minted
	Deleted   []string
	now       func() time.Time
}

func NewFakeStorage(bucket string) *FakeStorage {
	return &FakeStorage{
		bucket:   bucket,
		ttl:      300 * time.Second,
		objects:  map[string]ObjectInfo{},
		contents: map[string][]byte{},
		now:      time.Now,
	}
}

// PutObject simulates a successful client upload so ConfirmUpload can succeed.
func (f *FakeStorage) PutObject(key string, size int64, contentType string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.objects[key] = ObjectInfo{Exists: true, SizeBytes: size, ContentType: contentType}
}

// PutObjectBytes simulates an upload with real content, so signature checks
// see what a client actually sent.
func (f *FakeStorage) PutObjectBytes(key string, body []byte, contentType string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.objects[key] = ObjectInfo{Exists: true, SizeBytes: int64(len(body)), ContentType: contentType}
	f.contents[key] = body
}

// ReadPrefix returns the leading bytes of a PutObjectBytes upload. An object
// put without content (PutObject) reads as a valid file of its recorded type,
// so tests that only simulate presence keep describing a genuine upload.
func (f *FakeStorage) ReadPrefix(_ context.Context, key string, n int) ([]byte, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	b, ok := f.contents[key]
	if !ok {
		switch f.objects[key].ContentType {
		case "image/png":
			b = []byte("\x89PNG\r\n\x1a\n")
		case "image/jpeg":
			b = []byte{0xFF, 0xD8, 0xFF, 0xE0}
		default:
			b = []byte("%PDF-1.7\n")
		}
	}
	if len(b) > n {
		b = b[:n]
	}
	return append([]byte(nil), b...), nil
}

func (f *FakeStorage) Bucket() string { return f.bucket }

func (f *FakeStorage) BuildStorageKey(environment, applicationID, documentID string) (string, error) {
	return buildKey(environment, applicationID, documentID)
}

func (f *FakeStorage) CreateUploadURL(_ context.Context, key, contentType string) (UploadURL, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.UploadLog = append(f.UploadLog, key)
	headers := map[string]string{}
	if contentType != "" {
		headers["content-type"] = contentType
	}
	return UploadURL{
		URL:       "https://fake-r2.local/" + f.bucket + "/" + key + "?sig=upload",
		Method:    "PUT",
		Headers:   headers,
		ExpiresAt: f.now().Add(f.ttl),
	}, nil
}

func (f *FakeStorage) CreateReadURL(_ context.Context, key, _ string) (ReadURL, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.ReadLog = append(f.ReadLog, key)
	return ReadURL{
		URL:       "https://fake-r2.local/" + f.bucket + "/" + key + "?sig=read",
		ExpiresAt: f.now().Add(f.ttl),
	}, nil
}

func (f *FakeStorage) HeadObject(_ context.Context, key string) (ObjectInfo, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if info, ok := f.objects[key]; ok {
		return info, nil
	}
	return ObjectInfo{Exists: false}, nil
}

func (f *FakeStorage) DeleteObject(_ context.Context, key string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	delete(f.objects, key)
	f.Deleted = append(f.Deleted, key)
	return nil
}
