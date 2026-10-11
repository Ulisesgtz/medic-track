// Package ratelimit limits how many requests one client address can make in a window (specs/037). It is in memory and per
// process: enough to stop a script from hammering the public routes (the "Tomada" button, the invitation preview) or
// from filling the database, without a new service. A deployment with several API instances limits each one apart.
package ratelimit

import (
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
)

// maxClients bounds the memory: past it, the expired windows are swept before a new client is counted.
const maxClients = 100_000

type window struct {
	start time.Time
	count int
}

// Limiter allows `limit` requests per client in each fixed window.
type Limiter struct {
	mu      sync.Mutex
	limit   int
	span    time.Duration
	now     func() time.Time
	clients map[string]*window
}

// New returns a Limiter that allows limit requests per client every span.
func New(limit int, span time.Duration) *Limiter {
	return &Limiter{limit: limit, span: span, now: time.Now, clients: map[string]*window{}}
}

// Allow counts one request of key. When it is over the limit it says how long until the window ends.
func (l *Limiter) Allow(key string) (bool, time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	w, ok := l.clients[key]
	if !ok || now.Sub(w.start) >= l.span {
		if !ok && len(l.clients) >= maxClients {
			l.sweep(now)
		}
		l.clients[key] = &window{start: now, count: 1}
		return true, 0
	}
	if w.count >= l.limit {
		return false, w.start.Add(l.span).Sub(now)
	}
	w.count++
	return true, 0
}

func (l *Limiter) sweep(now time.Time) {
	for k, w := range l.clients {
		if now.Sub(w.start) >= l.span {
			delete(l.clients, k)
		}
	}
}

// ClientIP is the address the request really came from. Behind a proxy the client's own X-Forwarded-For can be forged, but
// the proxy appends what it saw at the END of the list: with `hops` trusted proxies, the entry `hops` from the end is the
// client. With no header (a direct connection, local development) it is the connection's address.
func ClientIP(r *http.Request, hops int) string {
	if hops > 0 {
		var entries []string
		for _, h := range r.Header.Values("X-Forwarded-For") {
			for _, e := range strings.Split(h, ",") {
				if e = strings.TrimSpace(e); e != "" {
					entries = append(entries, e)
				}
			}
		}
		if len(entries) > 0 {
			i := len(entries) - hops
			if i < 0 {
				i = 0
			}
			return entries[i]
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// Middleware answers 429 (with Retry-After) to a client over the limiter's limit. Loopback addresses are never limited:
// they are the developer's own machine and the E2E suite. The 429 is NOT written to error_logs: anyone can provoke it,
// and logging it would give a script another way to fill the table.
func Middleware(l *Limiter, responder *httpx.Responder, hops int) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := ClientIP(r, hops)
			if parsed := net.ParseIP(ip); parsed != nil && parsed.IsLoopback() {
				next.ServeHTTP(w, r)
				return
			}
			ok, wait := l.Allow(ip)
			if ok {
				next.ServeHTTP(w, r)
				return
			}
			seconds := int(wait.Seconds()) + 1
			w.Header().Set("Retry-After", strconv.Itoa(seconds))
			responder.WriteJSONErrorUnlogged(w, http.StatusTooManyRequests, "too_many_requests", "Too many requests, try again in a moment")
		})
	}
}
