// Package childhidden is the one SQL definition of "this child is hidden" (specs/074-unir-hijo-duplicado, research R8): the
// owner marked it hidden (children.hidden_at) AND she is an active Tutor or Caregiver of somebody's family. If she leaves the
// family or is removed, the child shows again by itself. It has no dependencies so account (the lists), reminder (the notices)
// and the rest use the same rule and can never disagree. «Hidden» is a presentation matter: the routes by child keep answering
// the owner, and the child still counts for the plan's limits.
package childhidden

// HiddenSQL is true when the child whose row is aliased `alias` in the query is hidden.
func HiddenSQL(alias string) string {
	return alias + `.hidden_at IS NOT NULL AND EXISTS (
		SELECT 1 FROM family_members hm
		WHERE hm.account_id = ` + alias + `.account_id AND hm.status = 'active' AND hm.role IN ('tutor', 'caregiver'))`
}

// NotHiddenChildSQL is true when the child whose id is the SQL expression childExpr is not hidden, or there is no child (NULL:
// a person's own consultation).
func NotHiddenChildSQL(childExpr string) string {
	return `NOT EXISTS (SELECT 1 FROM children hc WHERE hc.id = ` + childExpr + ` AND ` + HiddenSQL("hc") + `)`
}
