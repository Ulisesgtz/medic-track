package backup

import (
	"bytes"
	"context"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

// fakeS3 is the smallest S3 the client needs: multipart upload, get/head, list (v2) and delete, all in one bucket.
type fakeS3 struct {
	mu      sync.Mutex
	objects map[string][]byte
	parts   map[string]map[int][]byte
	failAll bool
}

func newFakeS3() *fakeS3 {
	return &fakeS3{objects: map[string][]byte{}, parts: map[string]map[int][]byte{}}
}

func (f *fakeS3) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.failAll {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = io.WriteString(w, `<Error><Code>InternalError</Code><Message>boom</Message></Error>`)
		return
	}
	path := strings.TrimPrefix(r.URL.Path, "/")
	bucket, key, _ := strings.Cut(path, "/")
	_ = bucket
	q := r.URL.Query()
	switch {
	case r.Method == http.MethodGet && key == "" && q.Get("list-type") == "2":
		type content struct {
			Key  string `xml:"Key"`
			Size int64  `xml:"Size"`
		}
		type result struct {
			XMLName  xml.Name  `xml:"ListBucketResult"`
			Name     string    `xml:"Name"`
			Prefix   string    `xml:"Prefix"`
			KeyCount int       `xml:"KeyCount"`
			Contents []content `xml:"Contents"`
		}
		res := result{Name: bucket, Prefix: q.Get("prefix")}
		var ks []string
		for k := range f.objects {
			if strings.HasPrefix(k, q.Get("prefix")) {
				ks = append(ks, k)
			}
		}
		sort.Strings(ks)
		for _, k := range ks {
			res.Contents = append(res.Contents, content{Key: k, Size: int64(len(f.objects[k]))})
		}
		res.KeyCount = len(res.Contents)
		w.Header().Set("Content-Type", "application/xml")
		_ = xml.NewEncoder(w).Encode(res)
	case r.Method == http.MethodPost && q.Has("uploads"):
		id := fmt.Sprintf("up%d", len(f.parts)+1)
		f.parts[id] = map[int][]byte{}
		_, _ = fmt.Fprintf(w, `<InitiateMultipartUploadResult><Bucket>%s</Bucket><Key>%s</Key><UploadId>%s</UploadId></InitiateMultipartUploadResult>`, bucket, key, id)
	case r.Method == http.MethodPut && q.Get("uploadId") != "":
		var n int
		_, _ = fmt.Sscan(q.Get("partNumber"), &n)
		b, _ := io.ReadAll(r.Body)
		f.parts[q.Get("uploadId")][n] = b
		w.Header().Set("ETag", fmt.Sprintf(`"etag%d"`, n))
	case r.Method == http.MethodPost && q.Get("uploadId") != "":
		parts := f.parts[q.Get("uploadId")]
		var nums []int
		for n := range parts {
			nums = append(nums, n)
		}
		sort.Ints(nums)
		var buf bytes.Buffer
		for _, n := range nums {
			buf.Write(parts[n])
		}
		f.objects[key] = buf.Bytes()
		_, _ = fmt.Fprintf(w, `<CompleteMultipartUploadResult><Bucket>%s</Bucket><Key>%s</Key><ETag>"done"</ETag></CompleteMultipartUploadResult>`, bucket, key)
	case r.Method == http.MethodDelete && q.Get("uploadId") != "":
		w.WriteHeader(http.StatusNoContent)
	case r.Method == http.MethodPut:
		b, _ := io.ReadAll(r.Body)
		f.objects[key] = b
		w.Header().Set("ETag", `"single"`)
	case r.Method == http.MethodGet || r.Method == http.MethodHead:
		b, ok := f.objects[key]
		if !ok {
			w.WriteHeader(http.StatusNotFound)
			if r.Method == http.MethodGet {
				_, _ = io.WriteString(w, `<Error><Code>NoSuchKey</Code><Message>no</Message></Error>`)
			}
			return
		}
		w.Header().Set("Content-Length", fmt.Sprint(len(b)))
		w.Header().Set("ETag", `"x"`)
		w.Header().Set("Last-Modified", time.Now().UTC().Format(http.TimeFormat))
		if r.Method == http.MethodGet {
			_, _ = w.Write(b)
		}
	case r.Method == http.MethodDelete:
		delete(f.objects, key)
		w.WriteHeader(http.StatusNoContent)
	default:
		w.WriteHeader(http.StatusNotImplemented)
	}
}

func fakeStore(t *testing.T) (*R2Store, *fakeS3) {
	t.Helper()
	fake := newFakeS3()
	srv := httptest.NewTLSServer(fake)
	t.Cleanup(srv.Close)
	u, _ := url.Parse(srv.URL)
	s, err := newS3Store(u.Host, "AK", "SK", "peditrack-backups", srv.Client().Transport)
	require.NoError(t, err)
	s.wait = time.Millisecond
	return s, fake
}

func TestR2Store_PutGetListDelete(t *testing.T) {
	s, fake := fakeStore(t)
	ctx := context.Background()

	size, err := s.Put(ctx, "dev/2026-11-12T090000Z.dump.age", "dev", strings.NewReader("age-encryption.org/v1 …"))
	require.NoError(t, err)
	require.EqualValues(t, len("age-encryption.org/v1 …"), size)
	_, err = s.Put(ctx, "prod/2026-11-12T090000Z.dump.age", "prod", strings.NewReader("p"))
	require.NoError(t, err)

	list, err := s.List(ctx, "dev/")
	require.NoError(t, err)
	require.Equal(t, []Object{{Key: "dev/2026-11-12T090000Z.dump.age", Size: size}}, list)

	r, err := s.Get(ctx, "dev/2026-11-12T090000Z.dump.age")
	require.NoError(t, err)
	b, _ := io.ReadAll(r)
	_ = r.Close()
	require.Equal(t, "age-encryption.org/v1 …", string(b))

	_, err = s.Get(ctx, "dev/none")
	require.Error(t, err)

	require.NoError(t, s.Delete(ctx, "dev/2026-11-12T090000Z.dump.age"))
	list, err = s.List(ctx, "dev/")
	require.NoError(t, err)
	require.Empty(t, list)

	fake.failAll = true
	_, err = s.Put(ctx, "dev/x", "dev", strings.NewReader("x"))
	require.Error(t, err)
	require.NotContains(t, err.Error(), "boom", "the storage's own text never comes back")
	_, err = s.List(ctx, "")
	require.Error(t, err)
	require.Error(t, s.Delete(ctx, "dev/x"))
}

func TestSleepCtx(t *testing.T) {
	require.True(t, sleepCtx(context.Background(), time.Millisecond))
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	require.False(t, sleepCtx(ctx, time.Hour))
}

func TestR2Store_GetGivesUpWhenCanceled(t *testing.T) {
	s, _ := fakeStore(t)
	s.wait = time.Hour
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := s.Get(ctx, "dev/none")
	require.Error(t, err)
	require.False(t, errors.Is(err, context.Canceled), "a fixed message, not the client's error")
}
