package backup

import (
	"context"
	"log"
	"runtime"
	"time"

	"github.com/Ulisesgtz/medic-track/backend/internal/errorlog"
	"github.com/Ulisesgtz/medic-track/backend/internal/jobreport"
)

// Failure is the step of a run that failed. It is stored in backup_runs.failure and decides the fixed message of the row in
// error_logs.
type Failure string

const (
	FailConfig    Failure = "config"
	FailLock      Failure = "lock"
	FailSnapshot  Failure = "snapshot"
	FailDump      Failure = "dump"
	FailEncrypt   Failure = "encrypt"
	FailUpload    Failure = "upload"
	FailRetention Failure = "retention"
	FailDownload  Failure = "download"
	FailDecrypt   Failure = "decrypt"
	FailRestore   Failure = "restore"
	FailVerify    Failure = "verify"
	FailRecord    Failure = "record"
)

// messages are fixed: never the text of the original error, which can carry an address, a key or a bucket name (FR-014).
var messages = map[Failure]string{
	FailConfig:    "The backup configuration is incomplete",
	FailLock:      "The backup lock could not be taken",
	FailSnapshot:  "The database snapshot could not be taken",
	FailDump:      "The database dump failed",
	FailEncrypt:   "The backup could not be encrypted",
	FailUpload:    "The backup could not be uploaded to the storage",
	FailRetention: "Old backups could not be removed",
	FailDownload:  "The backup could not be downloaded for the weekly check",
	FailDecrypt:   "The backup could not be decrypted for the weekly check",
	FailRestore:   "The backup could not be restored for the weekly check",
	FailVerify:    "The restored backup does not match its table counts",
	FailRecord:    "The backup run could not be recorded in the database",
}

// Message is the fixed text of a failure.
func (f Failure) Message() string {
	if m, ok := messages[f]; ok {
		return m
	}
	return "The backup failed"
}

// Recorder persists an error log entry (*errorlog.Repository).
type Recorder interface {
	Create(ctx context.Context, e *errorlog.Entry) error
}

// Reporter writes the failures of the backup process to error_logs as `job:backup`, synchronously: the process ends seconds
// later and jobreport's background write would be lost. A failure to write is only printed.
type Reporter struct {
	recorder Recorder
}

// NewReporter writes through recorder; nil prints only.
func NewReporter(recorder Recorder) *Reporter {
	return &Reporter{recorder: recorder}
}

// Endpoint is the endpoint of every row of this process.
const Endpoint = jobreport.EndpointPrefix + "backup"

// Report records one failure with its fixed message and the caller's file and line.
func (r *Reporter) Report(ctx context.Context, f Failure) {
	_, file, line, _ := runtime.Caller(1)
	msg := f.Message()
	log.Printf("backup: %s", msg)
	if r == nil || r.recorder == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer cancel()
	if err := r.recorder.Create(ctx, &errorlog.Entry{Message: msg, Endpoint: Endpoint, File: file, Line: line}); err != nil {
		log.Printf("backup: the failure could not be written to error_logs")
	}
}
