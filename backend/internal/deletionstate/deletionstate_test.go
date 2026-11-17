package deletionstate

import (
	"strings"
	"testing"
)

func TestSQL(t *testing.T) {
	for _, sql := range []string{PendingAccountSQL("a.id"), ScheduledForSQL("a.id")} {
		if !strings.Contains(sql, "d.account_id = a.id") || !strings.Contains(sql, OpenSQL) {
			t.Fatalf("unexpected SQL: %s", sql)
		}
	}
}
