package backup

import (
	"fmt"
	"sort"
	"time"
	_ "time/tzdata" // the zone database inside the binary, like internal/errordigest: the image may have none
)

// The retention rule of the owner (2026-11-12): the newest copy of each of the most recent 7 days, 4 ISO weeks and 6 months
// that have one, in Mexico City time, and always the newest of all.
const (
	KeepDaily   = 7
	KeepWeekly  = 4
	KeepMonthly = 6
)

var mexicoCity = loadMexicoCity()

func loadMexicoCity() *time.Location {
	if loc, err := time.LoadLocation("America/Mexico_City"); err == nil {
		return loc
	}
	return time.FixedZone("CST", -6*60*60)
}

type dated struct {
	obj Object
	at  time.Time
}

// Keep splits the recorded copies of env into those to keep and those to remove; recorded is the set of objects backup_runs
// has as finished backups. Objects with another name format, of another environment or never recorded (a run that died after
// the upload, or whose clean-up failed) are in neither list: they never take the place of a good copy in a day, a week or a
// month, and are never touched (FR-009). A nil recorded treats every copy of env as recorded.
func Keep(objects []Object, env string, recorded map[string]bool) (keep, remove []Object) {
	var mine []dated
	for _, o := range objects {
		e, at, ok := ParseObjectKey(o.Key)
		if !ok || e != env || (recorded != nil && !recorded[o.Key]) {
			continue
		}
		mine = append(mine, dated{obj: o, at: at.In(mexicoCity)})
	}
	sort.Slice(mine, func(i, j int) bool { return mine[i].at.After(mine[j].at) }) // newest first

	kept := map[string]bool{}
	pick := func(limit int, bucket func(time.Time) string) {
		seen := map[string]bool{}
		for _, d := range mine {
			b := bucket(d.at)
			if seen[b] {
				continue // only the newest copy of each bucket
			}
			if len(seen) == limit {
				break
			}
			seen[b] = true
			kept[d.obj.Key] = true
		}
	}
	pick(KeepDaily, func(t time.Time) string { return t.Format("2006-01-02") })
	pick(KeepWeekly, func(t time.Time) string { y, w := t.ISOWeek(); return fmt.Sprintf("%d-W%02d", y, w) })
	pick(KeepMonthly, func(t time.Time) string { return t.Format("2006-01") })
	if len(mine) > 0 {
		kept[mine[0].obj.Key] = true
	}

	for _, d := range mine {
		if kept[d.obj.Key] {
			keep = append(keep, d.obj)
		} else {
			remove = append(remove, d.obj)
		}
	}
	return keep, remove
}
