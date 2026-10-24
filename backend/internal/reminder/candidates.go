package reminder

// The rules of which doses are due for a reminder, written once and used by the accounts' claims (ClaimDueDoses,
// ClaimDueSupplementDoses) and by the child phones' (specs/047): a dose is a candidate only if it is not taken, its time has come
// inside the window, it is not «sin registrar» and it was not canceled by ending the treatment. $1 is `now`, $2 the window in seconds.

// medicationCandidates is the body of the `cand` CTE of a consultation's doses.
const medicationCandidates = `	SELECT d.id, d.scheduled_at, c.id AS consultation_id, m.name, ch.id AS child_id, ch.first_name, ch.account_id AS owner_id
			FROM doses d
			JOIN medications m ON m.id = d.medication_id
			JOIN consultations c ON c.id = m.consultation_id
			JOIN children ch ON ch.id = c.child_id
			WHERE d.taken = false
			  AND d.scheduled_at <= $1
			  AND d.scheduled_at > $1 - make_interval(secs => $2)
			  -- Never a dose already "sin registrar": its medication's next dose came (specs/013).
			  AND d.scheduled_at + make_interval(hours => m.frequency_hours) > $1
			  -- Never a dose canceled by ending the treatment early (specs/016).
			  AND (m.ended_at IS NULL OR d.scheduled_at <= m.ended_at)`

// supplementCandidates is the body of the `cand` CTE of a routine's doses (an activity's too; a person's own routine has no child).
const supplementCandidates = `	SELECT d.id, d.scheduled_at, d.routine_id, sr.name, sr.kind, ch.id AS child_id, COALESCE(ch.first_name, '') AS first_name,
			       COALESCE(ch.account_id, sr.account_id) AS owner_id
			FROM supplement_doses d
			JOIN supplement_routines sr ON sr.id = d.routine_id AND sr.status = 'active'
			LEFT JOIN children ch ON ch.id = sr.child_id
			WHERE d.taken = false
			  AND d.scheduled_at <= $1
			  AND d.scheduled_at > $1 - make_interval(secs => $2)
			  -- Never a dose already "sin registrar": the routine's next dose came.
			  AND NOT EXISTS (
				SELECT 1 FROM supplement_doses n
				WHERE n.routine_id = d.routine_id AND n.scheduled_at > d.scheduled_at AND n.scheduled_at <= $1
			  )`
