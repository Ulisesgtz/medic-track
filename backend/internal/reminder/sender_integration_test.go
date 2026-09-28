package reminder_test

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/reminder"
)

type pushServiceRequest struct {
	header http.Header
	body   []byte
}

// fakePushService stands in for FCM/Mozilla/Apple: it records what the backend posts and answers
// with the status the test sets.
func fakePushService(t *testing.T, status int) (*httptest.Server, func() []pushServiceRequest) {
	t.Helper()
	var (
		mu   sync.Mutex
		reqs []pushServiceRequest
	)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		mu.Lock()
		reqs = append(reqs, pushServiceRequest{header: r.Header.Clone(), body: body})
		mu.Unlock()
		w.WriteHeader(status)
	}))
	t.Cleanup(srv.Close)
	return srv, func() []pushServiceRequest {
		mu.Lock()
		defer mu.Unlock()
		return append([]pushServiceRequest(nil), reqs...)
	}
}

// realConfig has real VAPID keys, so the library can sign.
func realConfig(t *testing.T) reminder.Config {
	t.Helper()
	priv, pub, err := webpush.GenerateVAPIDKeys()
	require.NoError(t, err)
	return reminder.Config{VAPIDPublicKey: pub, VAPIDPrivateKey: priv, VAPIDSubject: "test@example.com", ActionSecret: "s"}
}

func TestWebPush_EndToEnd_OneEncryptedPushPerDose(t *testing.T) {
	pool := testPool(t)
	srv, requests := fakePushService(t, http.StatusCreated)
	config := realConfig(t)
	repo := reminder.NewRepository(pool)
	svc := reminder.NewService(repo, reminder.NewWebPushSender(config, srv.Client()), config)
	reminder.AllowLocalEndpoints(svc)
	now := uniqueNow()
	reminder.SetNow(svc, func() time.Time { return now })

	f := newFamily(t, pool, strPtr("detailed"))
	p256dh, auth := browserKeys(t)
	device, created, err := svc.ActivateDevice(context.Background(), f.accountID, srv.URL+"/push/"+t.Name(), p256dh, auth)
	require.NoError(t, err)
	require.True(t, created)
	activatedAt(t, pool, device.ID, now.Add(-time.Hour))
	_ = f.dose(t, pool, now.Add(-time.Minute), false)

	delivered, err := svc.Tick(context.Background())
	require.NoError(t, err)
	require.Equal(t, 1, delivered)

	got := requests()
	require.Len(t, got, 1)
	require.Equal(t, "aes128gcm", got[0].header.Get("Content-Encoding"))
	require.Equal(t, "3600", got[0].header.Get("TTL"))
	require.Equal(t, "high", got[0].header.Get("Urgency"))
	require.Contains(t, got[0].header.Get("Authorization"), "vapid ")
	require.NotContains(t, string(got[0].body), "Amoxicilina", "the body is encrypted")

	_, err = svc.Tick(context.Background())
	require.NoError(t, err)
	require.Len(t, requests(), 1, "never twice for the same dose")
}

func TestWebPush_GoneAndFailures(t *testing.T) {
	config := realConfig(t)
	p256dh, auth := browserKeys(t)
	for status, want := range map[int]reminder.SendResult{
		http.StatusGone:                reminder.Gone,
		http.StatusNotFound:            reminder.Gone,
		http.StatusTooManyRequests:     reminder.Failed,
		http.StatusInternalServerError: reminder.Failed,
		http.StatusOK:                  reminder.Delivered,
	} {
		srv, _ := fakePushService(t, status)
		sender := reminder.NewWebPushSender(config, srv.Client())
		got, err := sender.Send(context.Background(), reminder.Device{Endpoint: srv.URL, P256dh: p256dh, Auth: auth}, []byte(`{}`))
		require.NoError(t, err)
		require.Equal(t, want, got, status)
	}

	// Network error / bad keys: Failed, with the error.
	sender := reminder.NewWebPushSender(config, nil)
	got, err := sender.Send(context.Background(), reminder.Device{Endpoint: "http://127.0.0.1:1/x", P256dh: "not-a-key", Auth: auth}, []byte(`{}`))
	require.Error(t, err)
	require.Equal(t, reminder.Failed, got)
}

func TestWebPushSender_DefaultClientHasATimeout(t *testing.T) {
	client, ok := reminder.SenderClient(reminder.NewWebPushSender(realConfig(t), nil)).(*http.Client)
	require.True(t, ok)
	require.Equal(t, 10*time.Second, client.Timeout, "a push service that never answers must not hold the tick")
}
