package errordigest

import (
	"context"
	"fmt"
	"time"
)

// BackupStatus says when the database was last backed up and checked (specs/069; *backup.Repository). Optional: without it the
// digest has no backups line, as before.
type BackupStatus interface {
	LastOK(ctx context.Context, kind string) (*time.Time, error)
	HasAny(ctx context.Context) (bool, error)
}

// backupsStale is how old the last backup may be before the line says there was none: two days (it runs every day).
const backupsStale = 48 * time.Hour

// Backups is the state of the backups the digest reports. Only dates: never a file, a size or a key.
type Backups struct {
	Recorded   bool
	LastBackup *time.Time
	LastCheck  *time.Time
	Unreadable bool
	Now        time.Time
}

func readBackups(ctx context.Context, bs BackupStatus, now time.Time) *Backups {
	b := &Backups{Now: now}
	var err error
	if b.Recorded, err = bs.HasAny(ctx); err != nil {
		return &Backups{Unreadable: true, Now: now}
	}
	if b.LastBackup, err = bs.LastOK(ctx, "backup"); err != nil {
		return &Backups{Unreadable: true, Now: now}
	}
	if b.LastCheck, err = bs.LastOK(ctx, "check"); err != nil {
		return &Backups{Unreadable: true, Now: now}
	}
	return b
}

// at is «12 nov a las 03:00» in Mexico City time.
func at(t time.Time) string {
	l := t.In(location)
	return fmt.Sprintf("%s a las %02d:%02d", dayMonth(t), l.Hour(), l.Minute())
}

// Line is the digest's sentence about the backups.
func (b Backups) Line() string {
	switch {
	case b.Unreadable:
		return "Respaldos: no se pudo leer su registro"
	case !b.Recorded:
		return "Respaldos: sin registros"
	case b.LastBackup == nil || b.Now.Sub(*b.LastBackup) > backupsStale:
		return "Respaldos: ninguno en los últimos 2 días"
	}
	line := "Respaldos: último el " + at(*b.LastBackup)
	if b.LastCheck != nil {
		return line + " · comprobación el " + at(*b.LastCheck)
	}
	return line + " · sin comprobación todavía"
}
