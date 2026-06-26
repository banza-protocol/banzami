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
	UploadLog []string              // keys for which an upload URL was minted
	ReadLog   []string              // keys for which a read URL was minted
	Deleted   []string
	now       func() time.Time
}

func NewFakeStorage(bucket string) *FakeStorage {
	return &FakeStorage{
		bucket:  bucket,
		ttl:     300 * time.Second,
		objects: map[string]ObjectInfo{},
		now:     time.Now,
	}
}

// PutObject simulates a successful client upload so ConfirmUpload can succeed.
func (f *FakeStorage) PutObject(key string, size int64, contentType string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.objects[key] = ObjectInfo{Exists: true, SizeBytes: size, ContentType: contentType}
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
