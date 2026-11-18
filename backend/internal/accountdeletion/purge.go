package accountdeletion

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// The rows that hang from the account ($1), as subqueries.
const (
	ownConsultations = `SELECT id FROM consultations WHERE account_id = $1`
	ownMedications   = `SELECT m.id FROM medications m JOIN consultations c ON c.id = m.consultation_id WHERE c.account_id = $1`
	ownDoses         = `SELECT d.id FROM doses d JOIN medications m ON m.id = d.medication_id
		JOIN consultations c ON c.id = m.consultation_id WHERE c.account_id = $1`
	ownRoutines        = `SELECT id FROM supplement_routines WHERE account_id = $1`
	ownRoutineDoses    = `SELECT sd.id FROM supplement_doses sd JOIN supplement_routines r ON r.id = sd.routine_id WHERE r.account_id = $1`
	ownAppointments    = `SELECT id FROM consultation_appointments WHERE account_id = $1`
	ownNotices         = `SELECT n.id FROM appointment_notices n JOIN consultation_appointments a ON a.id = n.appointment_id WHERE a.account_id = $1`
	ownChildLinks      = `SELECT id FROM child_device_links WHERE account_id = $1`
	ownMemberships     = `SELECT id FROM family_members WHERE account_id = $1 OR family_account_id = $1`
	ownSubscriptionIDs = `SELECT id FROM subscriptions WHERE account_id = $1`
)

// purgeStep is one statement of the deletion and the table it changes (the "known tables" test reads Table).
type purgeStep struct {
	Table string
	SQL   string
}

// purgeSteps delete an account and everything of it and its children, from the leaves to the root (there are no ON DELETE
// CASCADE keys in this schema, on purpose). What the account marked or created on OTHER accounts' children stays, without
// its author (research R1). Every new table with a key towards accounts or children MUST get its step here — TestPurge_
// KnowsEveryTable fails otherwise.
var purgeSteps = []purgeStep{
	// 1. What the person wrote on other accounts' rows stays, without their name.
	{"doses", `UPDATE doses SET taken_by_account_id = NULL WHERE taken_by_account_id = $1`},
	{"supplement_doses", `UPDATE supplement_doses SET taken_by_account_id = NULL WHERE taken_by_account_id = $1`},
	{"doses", `UPDATE doses SET taken_by_child_device_id = NULL WHERE taken_by_child_device_id IN (` + ownChildLinks + `)`},
	{"supplement_doses", `UPDATE supplement_doses SET taken_by_child_device_id = NULL WHERE taken_by_child_device_id IN (` + ownChildLinks + `)`},
	{"supplement_routines", `UPDATE supplement_routines SET created_by_account_id = NULL WHERE created_by_account_id = $1 AND account_id <> $1`},
	{"consultation_appointments", `UPDATE consultation_appointments SET created_by_account_id = NULL WHERE created_by_account_id = $1`},
	{"consultation_appointments", `UPDATE consultation_appointments SET status_by_account_id = NULL WHERE status_by_account_id = $1`},
	{"vaccine_records", `UPDATE vaccine_records SET created_by_account_id = NULL WHERE created_by_account_id = $1`},
	{"vaccine_records", `UPDATE vaccine_records SET corrected_by_account_id = NULL WHERE corrected_by_account_id = $1`},
	{"vaccine_card_photos", `UPDATE vaccine_card_photos SET created_by_account_id = NULL WHERE created_by_account_id = $1`},
	{"growth_measurements", `UPDATE growth_measurements SET created_by_account_id = NULL WHERE created_by_account_id = $1`},
	{"growth_measurements", `UPDATE growth_measurements SET corrected_by_account_id = NULL WHERE corrected_by_account_id = $1`},
	{"medicine_cabinet_items", `UPDATE medicine_cabinet_items SET created_by_account_id = NULL WHERE created_by_account_id = $1`},
	{"medicine_cabinet_items", `UPDATE medicine_cabinet_items SET updated_by_account_id = NULL WHERE updated_by_account_id = $1`},
	{"child_device_links", `UPDATE child_device_links SET created_by_account_id = NULL WHERE created_by_account_id = $1`},
	{"child_device_links", `UPDATE child_device_links SET revoked_by_account_id = NULL WHERE revoked_by_account_id = $1`},
	{"children", `UPDATE children SET corrected_by_account_id = NULL WHERE corrected_by_account_id = $1`},
	{"child_records", `UPDATE child_records SET updated_by_account_id = NULL WHERE updated_by_account_id = $1`},
	{"consultations", `UPDATE consultations SET edited_by_account_id = NULL WHERE edited_by_account_id = $1`},
	{"family_members", `UPDATE family_members SET invited_by_account_id = NULL WHERE invited_by_account_id = $1`},
	{"family_members", `UPDATE family_members SET ended_by_account_id = NULL WHERE ended_by_account_id = $1`},
	{"family_members", `UPDATE family_members SET consent_by_account_id = NULL WHERE consent_by_account_id = $1`},
	{"family_invitations", `UPDATE family_invitations SET invited_by_account_id = NULL WHERE invited_by_account_id = $1`},
	{"family_invitations", `UPDATE family_invitations SET consent_by_account_id = NULL WHERE consent_by_account_id = $1`},

	// 2. Reminders, opt-ins and mutes: the account's own (as recipient) and every one on its data.
	{"dose_reminders", `DELETE FROM dose_reminders WHERE account_id = $1 OR dose_id IN (` + ownDoses + `)`},
	{"child_dose_reminders", `DELETE FROM child_dose_reminders WHERE dose_id IN (` + ownDoses + `) OR link_id IN (` + ownChildLinks + `)`},
	{"supplement_dose_reminders", `DELETE FROM supplement_dose_reminders WHERE account_id = $1 OR dose_id IN (` + ownRoutineDoses + `)`},
	{"child_supplement_dose_reminders", `DELETE FROM child_supplement_dose_reminders WHERE dose_id IN (` + ownRoutineDoses + `) OR link_id IN (` + ownChildLinks + `)`},
	{"appointment_notice_reminders", `DELETE FROM appointment_notice_reminders WHERE account_id = $1 OR notice_id IN (` + ownNotices + `)`},
	{"appointment_notices", `DELETE FROM appointment_notices WHERE appointment_id IN (` + ownAppointments + `)`},
	{"appointment_muted", `DELETE FROM appointment_muted WHERE account_id = $1 OR appointment_id IN (` + ownAppointments + `)`},
	{"supplement_muted", `DELETE FROM supplement_muted WHERE account_id = $1 OR routine_id IN (` + ownRoutines + `)`},
	{"own_consultation_reminder_optins", `DELETE FROM own_consultation_reminder_optins WHERE account_id = $1 OR consultation_id IN (` + ownConsultations + `)`},
	{"reminder_devices", `DELETE FROM reminder_devices WHERE account_id = $1 OR child_link_id IN (` + ownChildLinks + `)`},

	// 3. The account's consultations (of its children and its own), routines and records.
	{"consultation_symptoms", `DELETE FROM consultation_symptoms WHERE account_id = $1`},
	{"doses", `DELETE FROM doses WHERE id IN (` + ownDoses + `)`},
	{"medication_extensions", `DELETE FROM medication_extensions WHERE medication_id IN (` + ownMedications + `)`},
	{"medications", `DELETE FROM medications WHERE consultation_id IN (` + ownConsultations + `)`},
	{"consultation_appointments", `DELETE FROM consultation_appointments WHERE account_id = $1`},
	{"consultations", `DELETE FROM consultations WHERE account_id = $1`},
	{"supplement_doses", `DELETE FROM supplement_doses WHERE routine_id IN (` + ownRoutines + `)`},
	{"supplement_routines", `DELETE FROM supplement_routines WHERE account_id = $1`},
	{"vaccine_records", `DELETE FROM vaccine_records WHERE account_id = $1`},
	{"vaccine_card_photos", `DELETE FROM vaccine_card_photos WHERE account_id = $1`},
	{"growth_measurements", `DELETE FROM growth_measurements WHERE account_id = $1`},
	{"child_record_allergies", `DELETE FROM child_record_allergies WHERE account_id = $1`},
	{"child_record_conditions", `DELETE FROM child_record_conditions WHERE account_id = $1`},
	{"child_records", `DELETE FROM child_records WHERE account_id = $1`},
	{"child_device_links", `DELETE FROM child_device_links WHERE account_id = $1`},
	{"medicine_cabinet_items", `DELETE FROM medicine_cabinet_items WHERE account_id = $1`},
	{"personal_routine_notices", `DELETE FROM personal_routine_notices WHERE account_id = $1`},
	{"own_consultation_sharing", `DELETE FROM own_consultation_sharing WHERE account_id = $1`},

	// 4. Its family (and its membership in another one).
	{"family_invitations", `DELETE FROM family_invitations WHERE family_account_id = $1 OR member_id IN (` + ownMemberships + `)`},
	{"family_members", `DELETE FROM family_members WHERE family_account_id = $1 OR account_id = $1`},

	// 5. The account itself.
	{"disclaimer_acceptances", `DELETE FROM disclaimer_acceptances WHERE account_id = $1`},
	{"payment_events", `DELETE FROM payment_events WHERE subscription_id IN (` + ownSubscriptionIDs + `)`},
	{"subscriptions", `DELETE FROM subscriptions WHERE account_id = $1`},
	{"children", `DELETE FROM children WHERE account_id = $1`},
	{"error_logs", `UPDATE error_logs SET account_id = NULL WHERE account_id = $1`},
	{"accounts", `DELETE FROM accounts WHERE id = $1`},
}

// Purge deletes, in tx, the account and everything of it and its children (FR-013). The caller commits.
func Purge(ctx context.Context, tx pgx.Tx, accountID uuid.UUID) error {
	for i, step := range purgeSteps {
		if _, err := tx.Exec(ctx, step.SQL, accountID); err != nil {
			return fmt.Errorf("deleting the account's data (step %d, %s): %w", i+1, step.Table, err)
		}
	}
	return nil
}
