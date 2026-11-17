package backup

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"sort"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// Object is one copy in the storage.
type Object struct {
	Key  string
	Size int64
}

// Store is where the copies live (Cloudflare R2; MemoryStore in tests).
type Store interface {
	// Put uploads r under key, streaming, with an unknown size. A failed upload leaves no object.
	Put(ctx context.Context, key, env string, r io.Reader) (size int64, err error)
	Get(ctx context.Context, key string) (io.ReadCloser, error)
	// List returns the objects under prefix, sorted by key.
	List(ctx context.Context, prefix string) ([]Object, error)
	Delete(ctx context.Context, key string) error
}

// R2Endpoint is the S3-compatible address of an account's R2.
func R2Endpoint(accountID string) string {
	return accountID + ".r2.cloudflarestorage.com"
}

// R2Store talks to Cloudflare R2 through its S3-compatible API. The credentials are a token limited to the bucket.
type R2Store struct {
	client *minio.Client
	bucket string
	tries  int
	wait   time.Duration
}

// NewR2Store builds the client; it makes no request.
func NewR2Store(cfg Config) (*R2Store, error) {
	return newS3Store(R2Endpoint(cfg.R2AccountID), cfg.R2AccessKeyID, cfg.R2SecretKey, cfg.Bucket, nil)
}

// newS3Store talks to any S3-compatible endpoint (R2 in production, a local fake in tests).
// Always over https; transport is nil in production (the default one).
func newS3Store(endpoint, accessKey, secretKey, bucket string, transport http.RoundTripper) (*R2Store, error) {
	client, err := minio.New(endpoint, &minio.Options{
		Creds:     credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure:    true,
		Region:    "auto",
		Transport: transport,
	})
	if err != nil {
		return nil, fmt.Errorf("building the storage client")
	}
	return &R2Store{client: client, bucket: bucket, tries: 3, wait: 5 * time.Second}, nil
}

// Put streams r to the bucket (multipart; the object only exists once the upload finished).
func (s *R2Store) Put(ctx context.Context, key, env string, r io.Reader) (int64, error) {
	info, err := s.client.PutObject(ctx, s.bucket, key, r, -1, minio.PutObjectOptions{
		ContentType:  "application/octet-stream",
		UserMetadata: map[string]string{"env": env},
		PartSize:     16 << 20,
	})
	if err != nil {
		return 0, fmt.Errorf("uploading a backup")
	}
	return info.Size, nil
}

// Get opens an object for reading, trying again a few times on a failure to reach it.
func (s *R2Store) Get(ctx context.Context, key string) (io.ReadCloser, error) {
	for i := 0; i < s.tries; i++ {
		obj, err := s.client.GetObject(ctx, s.bucket, key, minio.GetObjectOptions{})
		if err == nil {
			if _, err = obj.Stat(); err == nil {
				return obj, nil
			}
			_ = obj.Close()
		}
		if !sleepCtx(ctx, s.wait) {
			break
		}
	}
	return nil, fmt.Errorf("downloading a backup")
}

// List lists the objects under prefix.
func (s *R2Store) List(ctx context.Context, prefix string) ([]Object, error) {
	var out []Object
	for o := range s.client.ListObjects(ctx, s.bucket, minio.ListObjectsOptions{Prefix: prefix, Recursive: true}) {
		if o.Err != nil {
			return nil, fmt.Errorf("listing the backups")
		}
		out = append(out, Object{Key: o.Key, Size: o.Size})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Key < out[j].Key })
	return out, nil
}

// Delete removes an object.
func (s *R2Store) Delete(ctx context.Context, key string) error {
	if err := s.client.RemoveObject(ctx, s.bucket, key, minio.RemoveObjectOptions{}); err != nil {
		return fmt.Errorf("removing a backup")
	}
	return nil
}

func sleepCtx(ctx context.Context, d time.Duration) bool {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-t.C:
		return true
	}
}

// ErrNotFound is what MemoryStore answers for a key it doesn't have.
var ErrNotFound = errors.New("backup object not found")
