// Package deletionstate is the one SQL definition of "this account asked to delete itself and it isn't done yet"
// (specs/070). It has no dependencies so every package that derives something from it — the paused account
// (accountdeletion), the family's lowered level (access), the reminders it no longer gets (reminder) and /accounts/me
// (account) — can use it without import cycles, and they can never disagree.
package deletionstate

// OpenSQL is the condition of an open request on the alias d of account_deletions.
const OpenSQL = "d.canceled_at IS NULL AND d.completed_at IS NULL"

// PendingAccountSQL is true when the account whose id is the SQL expression accountExpr has an open request.
func PendingAccountSQL(accountExpr string) string {
	return "EXISTS (SELECT 1 FROM account_deletions d WHERE d.account_id = " + accountExpr + " AND " + OpenSQL + ")"
}

// ScheduledForSQL is the date the account with id accountExpr will be deleted, or NULL without an open request.
func ScheduledForSQL(accountExpr string) string {
	return "(SELECT d.scheduled_for FROM account_deletions d WHERE d.account_id = " + accountExpr + " AND " + OpenSQL + ")"
}
