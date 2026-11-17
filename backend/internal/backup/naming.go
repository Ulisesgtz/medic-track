package backup

import (
	"regexp"
	"time"
)

// keyLayout is the date part of an object key: UTC, to the second (two runs in one minute never share a name), no separators
// that a bucket would treat as folders.
const keyLayout = "2006-01-02T150405Z"

var keyPattern = regexp.MustCompile(`^([a-z]{2,12})/([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{6}Z)\.dump\.age$`)

// ObjectKey is the name of a copy: only the environment and when it was made — never anything about a family (FR-005).
func ObjectKey(env string, at time.Time) string {
	return env + "/" + at.UTC().Format(keyLayout) + ".dump.age"
}

// ParseObjectKey reads a key made by ObjectKey; anything else (another file, another format) is not ok.
func ParseObjectKey(key string) (env string, at time.Time, ok bool) {
	m := keyPattern.FindStringSubmatch(key)
	if m == nil {
		return "", time.Time{}, false
	}
	t, err := time.Parse(keyLayout, m[2])
	if err != nil {
		return "", time.Time{}, false
	}
	return m[1], t.UTC(), true
}
