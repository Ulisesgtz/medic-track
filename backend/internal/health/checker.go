// Package health answers GET /healthz: whether the process is alive and the database answers
// (specs/072-monitoreo-errores-frontend). It is what Railway and the external monitor ask, so it must be cheap
// (the result is kept for 5 s and simultaneous requests share one ping), honest (a database that does not answer in
// 2 s is "unavailable") and silent (it never writes to error_logs: a monitor asks every few minutes).
package health

import (
	"context"
	"strings"
	"sync"
	"time"
)

const (
	// PingTimeout is how long the database has to answer before the service counts as unavailable.
	PingTimeout = 2 * time.Second
	// CacheTTL is how long a result is reused, so a flood of requests costs at most one ping every 5 s.
	CacheTTL = 5 * time.Second
	// versionLength is how many characters of the commit are shown.
	versionLength = 12
)

// Pinger is what the checker needs from the database; *pgxpool.Pool satisfies it.
type Pinger interface {
	Ping(ctx context.Context) error
}

// call is one ping in flight: whoever arrives meanwhile waits for it instead of starting another.
type call struct {
	done chan struct{}
	ok   bool
}

// Checker keeps the last result of the ping and shares the one in flight.
type Checker struct {
	pinger  Pinger
	version string

	mu       sync.Mutex
	now      func() time.Time
	last     bool
	lastAt   time.Time
	haveLast bool
	inflight *call
}

// NewChecker builds a checker. commit is RAILWAY_GIT_COMMIT_SHA (empty = "dev").
func NewChecker(p Pinger, commit string) *Checker {
	commit = strings.TrimSpace(commit)
	if commit == "" {
		commit = "dev"
	}
	if len(commit) > versionLength {
		commit = commit[:versionLength]
	}
	return &Checker{pinger: p, version: commit, now: time.Now}
}

// Version is the commit shown in the 200 answer, shortened.
func (c *Checker) Version() string { return c.version }

// SetClock replaces the clock; only for tests.
func (c *Checker) SetClock(now func() time.Time) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.now = now
}

// Healthy says whether the database answered within PingTimeout, reusing the result of the last 5 s.
func (c *Checker) Healthy(ctx context.Context) bool {
	c.mu.Lock()
	if c.haveLast && c.now().Sub(c.lastAt) < CacheTTL {
		ok := c.last
		c.mu.Unlock()
		return ok
	}
	if cl := c.inflight; cl != nil {
		c.mu.Unlock()
		select {
		case <-cl.done:
			return cl.ok
		case <-ctx.Done():
			return false
		}
	}
	cl := &call{done: make(chan struct{})}
	c.inflight = cl
	c.mu.Unlock()

	cl.ok = c.ping()

	c.mu.Lock()
	c.last, c.lastAt, c.haveLast = cl.ok, c.now(), true
	c.inflight = nil
	c.mu.Unlock()
	close(cl.done)
	return cl.ok
}

// ping asks the database with its own deadline (not the request's: the ping is shared). It also stops waiting when the
// deadline passes even if the driver ignores the context.
func (c *Checker) ping() bool {
	ctx, cancel := context.WithTimeout(context.Background(), PingTimeout)
	defer cancel()
	res := make(chan error, 1)
	go func() { res <- c.pinger.Ping(ctx) }()
	select {
	case err := <-res:
		return err == nil
	case <-ctx.Done():
		return false
	}
}
