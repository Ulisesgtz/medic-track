// Package jobreport records what fails in the background processes of the API (the reminders ticker, specs/011) in
// error_logs, next to the HTTP errors of specs/002-registro-log-errores. A process has no request, so its rows carry
// `endpoint = job:<name>` and no HTTP status. specs/018-errores-procesos-segundo-plano.
package jobreport

import (
	"context"
	"fmt"
	"log"
	"runtime"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/Ulisesgtz/medic-track/backend/internal/errorlog"
)

// Recorder persists an error log entry; satisfied by *errorlog.Repository (the same contract as httpx.Recorder).
type Recorder interface {
	Create(ctx context.Context, e *errorlog.Entry) error
}

// GroupWindow: the same kind of failure is written at most once in this time — a ticker that fails every 30 s must not
// fill the table. The next row says how many times it was left out.
const GroupWindow = 15 * time.Minute

// recordTimeout bounds the background write so a slow or unavailable database never piles up goroutines.
const recordTimeout = 2 * time.Second

// kindState is what is remembered about one kind of failure.
type kindState struct {
	written     bool
	lastWritten time.Time
	suppressed  int  // times left out since the last row
	recovered   bool // a clean cycle happened since the last row: the next failure is written right away
}

// Reporter writes the failures of one background process. Safe for concurrent use.
type Reporter struct {
	recorder Recorder
	endpoint string
	now      func() time.Time
	spawn    func(func())

	mu    sync.Mutex
	kinds map[string]*kindState
}

// New creates the Reporter of the process `job` (its rows get `endpoint = "job:<job>"`).
func New(recorder Recorder, job string) *Reporter {
	return &Reporter{
		recorder: recorder,
		endpoint: "job:" + job,
		now:      time.Now,
		spawn:    func(f func()) { go f() },
		kinds:    map[string]*kindState{},
	}
}

// Report records a failure of the given kind. `message` describes it with counts only — never text of a third party's
// error, an address, a key or a token. The file and line are those of the caller. It returns at once: the row is
// written in the background, and if that fails the failure stays in the console and the next one is tried again.
func (r *Reporter) Report(kind, message string, accountID *uuid.UUID) {
	_, file, line, ok := runtime.Caller(1)
	if !ok {
		file, line = "unknown", 0
	}

	now := r.now()
	r.mu.Lock()
	state, known := r.kinds[kind]
	if !known {
		state = &kindState{}
		r.kinds[kind] = state
	}
	if state.written && !state.recovered && now.Sub(state.lastWritten) < GroupWindow {
		state.suppressed++
		r.mu.Unlock()
		return
	}
	previous := *state
	state.written, state.recovered, state.lastWritten, state.suppressed = true, false, now, 0
	r.mu.Unlock()

	if previous.suppressed > 0 {
		message += fmt.Sprintf(" (repeated %d more times since the last entry)", previous.suppressed)
	}
	entry := &errorlog.Entry{Message: message, Endpoint: r.endpoint, File: file, Line: line, AccountID: accountID}
	r.spawn(func() {
		ctx, cancel := context.WithTimeout(context.Background(), recordTimeout)
		defer cancel()
		if err := r.recorder.Create(ctx, entry); err != nil {
			log.Printf("jobreport: failed to record %s entry: %v", r.endpoint, err)
			r.undo(kind, previous)
		}
	})
}

// undo forgets a row that could not be written, so the next failure of the kind is tried again without waiting.
func (r *Reporter) undo(kind string, previous kindState) {
	r.mu.Lock()
	defer r.mu.Unlock()
	state := r.kinds[kind]
	state.written, state.recovered, state.lastWritten = previous.written, previous.recovered, previous.lastWritten
	state.suppressed += previous.suppressed
}

// Recovered says the kind ran clean this cycle: if it fails again it is written at once, carrying the times that were
// left out.
func (r *Reporter) Recovered(kind string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if state, ok := r.kinds[kind]; ok {
		state.recovered = true
	}
}
