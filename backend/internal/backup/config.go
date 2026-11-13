// Package backup makes the daily backup of the database and its weekly restore check (specs/069-respaldos-base). It runs in a
// process of its own (cmd/backup, a cron service in Railway), never in the API: the storage credentials and the check key live
// only there. A copy is encrypted for two age recipients — the owner's key, whose private half is in no system, and the check
// key — before it leaves the process, and is stored in Cloudflare R2.
package backup

import (
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"filippo.io/age"
)

// DefaultBucket is the R2 bucket when R2_BUCKET is not set.
const DefaultBucket = "peditrack-backups"

var envPattern = regexp.MustCompile(`^[a-z]{2,12}$`)

// Config is the configuration of the backup process. Its String never prints a secret.
type Config struct {
	DatabaseURL      string
	Env              string
	R2AccountID      string
	R2AccessKeyID    string
	R2SecretKey      string
	Bucket           string
	OwnerRecipient   age.Recipient
	CheckIdentity    *age.X25519Identity
	CheckWeekday     int // 0 = Sunday … 6 = Saturday, in Mexico City time
	ownerRecipientID string
}

// Recipients are the two keys every copy is encrypted for: the owner's and the check key's.
func (c Config) Recipients() []age.Recipient {
	return []age.Recipient{c.OwnerRecipient, c.CheckIdentity.Recipient()}
}

// String describes the configuration without any secret: the environment, the bucket and the owner's PUBLIC key.
func (c Config) String() string {
	return fmt.Sprintf("backup{env=%s bucket=%s owner=%s check-weekday=%d}", c.Env, c.Bucket, c.ownerRecipientID, c.CheckWeekday)
}

// ConfigError names the variables that are missing or invalid — by name, never with their value.
type ConfigError struct {
	Missing []string
	Invalid []string
}

func (e *ConfigError) Error() string {
	var parts []string
	if len(e.Missing) > 0 {
		parts = append(parts, "missing "+strings.Join(e.Missing, ", "))
	}
	if len(e.Invalid) > 0 {
		parts = append(parts, "invalid "+strings.Join(e.Invalid, ", "))
	}
	return "backup configuration: " + strings.Join(parts, "; ")
}

// LoadReadConfig is the configuration of `list` and `restore`, which the owner runs on their own computer: the environment and
// R2 only. It never asks for the keys (the owner's private key comes from a file; the check key stays in the backup service),
// and DATABASE_URL is optional: with the live database gone, the copies are still listed and restored from R2 alone.
func LoadReadConfig(getenv func(string) string) (Config, error) {
	cfg := Config{Bucket: DefaultBucket, CheckWeekday: 1}
	cerr := &ConfigError{}
	cfg.DatabaseURL = strings.TrimSpace(getenv("DATABASE_URL"))
	readStorage(getenv, &cfg, cerr)
	if len(cerr.Missing) > 0 || len(cerr.Invalid) > 0 {
		sort.Strings(cerr.Missing)
		sort.Strings(cerr.Invalid)
		return cfg, cerr
	}
	return cfg, nil
}

// readStorage reads the environment and the R2 variables; both configurations need them.
func readStorage(getenv func(string) string, cfg *Config, cerr *ConfigError) {
	required := func(name string) string {
		v := strings.TrimSpace(getenv(name))
		if v == "" {
			cerr.Missing = append(cerr.Missing, name)
		}
		return v
	}
	cfg.Env = required("BACKUP_ENV")
	if cfg.Env != "" && !envPattern.MatchString(cfg.Env) {
		cerr.Invalid = append(cerr.Invalid, "BACKUP_ENV")
	}
	cfg.R2AccountID = required("R2_ACCOUNT_ID")
	cfg.R2AccessKeyID = required("R2_ACCESS_KEY_ID")
	cfg.R2SecretKey = required("R2_SECRET_ACCESS_KEY")
	if b := strings.TrimSpace(getenv("R2_BUCKET")); b != "" {
		cfg.Bucket = b
	}
}

// LoadConfig reads the configuration from the environment (getenv = os.Getenv). Every missing or invalid variable is named in
// the one error it returns.
func LoadConfig(getenv func(string) string) (Config, error) {
	cfg := Config{Bucket: DefaultBucket, CheckWeekday: 1}
	cerr := &ConfigError{}
	required := func(name string) string {
		v := strings.TrimSpace(getenv(name))
		if v == "" {
			cerr.Missing = append(cerr.Missing, name)
		}
		return v
	}

	cfg.DatabaseURL = required("DATABASE_URL")
	readStorage(getenv, &cfg, cerr)

	if owner := required("BACKUP_OWNER_RECIPIENT"); owner != "" {
		r, err := ParseRecipient(owner)
		if err != nil {
			cerr.Invalid = append(cerr.Invalid, "BACKUP_OWNER_RECIPIENT")
		} else {
			cfg.OwnerRecipient = r
			cfg.ownerRecipientID = owner
		}
	}
	if check := required("BACKUP_CHECK_IDENTITY"); check != "" {
		id, err := ParseIdentity(check)
		if err != nil {
			cerr.Invalid = append(cerr.Invalid, "BACKUP_CHECK_IDENTITY")
		} else {
			cfg.CheckIdentity = id
		}
	}
	if w := strings.TrimSpace(getenv("BACKUP_CHECK_WEEKDAY")); w != "" {
		n, err := strconv.Atoi(w)
		if err != nil || n < 0 || n > 6 {
			cerr.Invalid = append(cerr.Invalid, "BACKUP_CHECK_WEEKDAY")
		} else {
			cfg.CheckWeekday = n
		}
	}

	if len(cerr.Missing) > 0 || len(cerr.Invalid) > 0 {
		sort.Strings(cerr.Missing)
		sort.Strings(cerr.Invalid)
		return cfg, cerr
	}
	return cfg, nil
}
