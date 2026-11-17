package clienterror

import (
	"sync"
	"time"
)

const (
	// groupWindow: the same error (endpoint, kind, clean message) is written once in this time; the next row says how many were left out.
	groupWindow = 5 * time.Minute
	// maxRowsPerMinute caps the rows of the whole process: a script that rotates addresses and messages cannot write more.
	maxRowsPerMinute = 30
	// maxGroups bounds the memory of the groups; past it the oldest is forgotten.
	maxGroups = 1000
)

type group struct {
	lastWritten time.Time
	suppressed  int
}

// throttle is the server's cap on how many rows the reports write (specs/072 R3). In memory and per process, like jobreport.
// What it drops is dropped in silence: the answer is the same 204.
type throttle struct {
	mu          sync.Mutex
	now         func() time.Time
	groups      map[string]*group
	minuteStart time.Time
	minuteRows  int
}

func newThrottle(now func() time.Time) *throttle {
	return &throttle{now: now, groups: map[string]*group{}}
}

// admit says whether a row may be written and, if so, how many equal reports were left out since the last one.
func (t *throttle) admit(key string) (ok bool, suppressed int) {
	t.mu.Lock()
	defer t.mu.Unlock()
	now := t.now()

	g, known := t.groups[key]
	if known && now.Sub(g.lastWritten) < groupWindow {
		g.suppressed++
		return false, 0
	}

	if now.Sub(t.minuteStart) >= time.Minute {
		t.minuteStart, t.minuteRows = now, 0
	}
	if t.minuteRows >= maxRowsPerMinute {
		// The cap leaves out the row of a group whose window already passed: it is one more left out, and the next row says so.
		if known {
			g.suppressed++
		}
		return false, 0
	}
	t.minuteRows++

	if !known {
		if len(t.groups) >= maxGroups {
			t.evict(now)
		}
		g = &group{}
		t.groups[key] = g
	}
	suppressed = g.suppressed
	g.suppressed = 0
	g.lastWritten = now
	return true, suppressed
}

// evict makes room: first the groups whose window ended, and if none, the one written longest ago.
func (t *throttle) evict(now time.Time) {
	var oldestKey string
	var oldest time.Time
	for k, g := range t.groups {
		if now.Sub(g.lastWritten) >= groupWindow {
			delete(t.groups, k)
		} else if oldestKey == "" || g.lastWritten.Before(oldest) {
			oldestKey, oldest = k, g.lastWritten
		}
	}
	if len(t.groups) >= maxGroups && oldestKey != "" {
		delete(t.groups, oldestKey)
	}
}
