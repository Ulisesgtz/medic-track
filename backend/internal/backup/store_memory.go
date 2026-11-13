package backup

import (
	"bytes"
	"context"
	"io"
	"sort"
	"strings"
	"sync"
)

// MemoryStore keeps the copies in memory: for tests and the local integration run. Like R2, a failed upload leaves nothing.
type MemoryStore struct {
	mu      sync.Mutex
	objects map[string][]byte
	// FailPut, FailGet, FailList and FailDelete make the next calls fail (tests).
	FailPut, FailGet, FailList, FailDelete error
}

// NewMemoryStore is an empty store.
func NewMemoryStore() *MemoryStore {
	return &MemoryStore{objects: map[string][]byte{}}
}

func (m *MemoryStore) Put(_ context.Context, key, _ string, r io.Reader) (int64, error) {
	data, err := io.ReadAll(r)
	if err != nil {
		return 0, err
	}
	if m.FailPut != nil {
		return 0, m.FailPut
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	m.objects[key] = data
	return int64(len(data)), nil
}

func (m *MemoryStore) Get(_ context.Context, key string) (io.ReadCloser, error) {
	if m.FailGet != nil {
		return nil, m.FailGet
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	data, ok := m.objects[key]
	if !ok {
		return nil, ErrNotFound
	}
	return io.NopCloser(bytes.NewReader(data)), nil
}

func (m *MemoryStore) List(_ context.Context, prefix string) ([]Object, error) {
	if m.FailList != nil {
		return nil, m.FailList
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []Object
	for k, v := range m.objects {
		if strings.HasPrefix(k, prefix) {
			out = append(out, Object{Key: k, Size: int64(len(v))})
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Key < out[j].Key })
	return out, nil
}

func (m *MemoryStore) Delete(_ context.Context, key string) error {
	if m.FailDelete != nil {
		return m.FailDelete
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.objects, key)
	return nil
}

// Bytes returns an object's content (tests).
func (m *MemoryStore) Bytes(key string) ([]byte, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	b, ok := m.objects[key]
	return b, ok
}

// SetObject puts raw bytes under a key (tests).
func (m *MemoryStore) SetObject(key string, data []byte) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.objects[key] = data
}
