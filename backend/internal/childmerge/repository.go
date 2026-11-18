package childmerge

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Ulisesgtz/medic-track/backend/internal/access"
	"github.com/Ulisesgtz/medic-track/backend/internal/childdevice"
	"github.com/Ulisesgtz/medic-track/backend/internal/childrecord"
	"github.com/Ulisesgtz/medic-track/backend/internal/deletionstate"
)

// Repository runs the SQL of the union. Inside the transaction only the transaction is used (never the pool).
type Repository struct {
	pool *pgxpool.Pool
	now  func() time.Time
}

// NewRepository creates a Repository.
func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool, now: time.Now}
}

// SetNow replaces the clock (tests).
func (r *Repository) SetNow(now func() time.Time) { r.now = now }

// querier is a pool or a transaction.
type querier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

// loaded is a child with everything the pairing, the preview and the union read of it.
type loaded struct {
	ChildData
	Hidden            bool
	Counts            ChildCounts
	Allergies         int
	Conditions        int
	ActiveSupplements int
	ActiveActivities  int
	// Photos is how many of its consultations keep a prescription photo.
	Photos int
}

const childSelect = `
	SELECT c.id, c.hidden_at IS NOT NULL, c.first_name, c.last_name, c.birth_date, c.height, c.weight, c.growth_reference_sex, c.created_at,
	       r.child_id IS NOT NULL, r.blood_type, r.general_note, r.pediatrician_name, r.pediatrician_phone, r.pediatrician_office,
	       (SELECT count(*) FROM child_record_allergies x WHERE x.child_id = c.id),
	       (SELECT count(*) FROM child_record_conditions x WHERE x.child_id = c.id),
	       (SELECT count(*) FROM consultations x WHERE x.child_id = c.id),
	       (SELECT count(*) FROM vaccine_records x WHERE x.child_id = c.id),
	       (SELECT count(*) FROM vaccine_card_photos x WHERE x.child_id = c.id),
	       (SELECT count(*) FROM growth_measurements x WHERE x.child_id = c.id),
	       (SELECT count(*) FROM supplement_routines x WHERE x.child_id = c.id AND x.kind = 'supplement'),
	       (SELECT count(*) FROM supplement_routines x WHERE x.child_id = c.id AND x.kind = 'activity'),
	       (SELECT count(*) FROM supplement_routines x WHERE x.child_id = c.id AND x.kind = 'supplement' AND x.status = 'active'),
	       (SELECT count(*) FROM supplement_routines x WHERE x.child_id = c.id AND x.kind = 'activity' AND x.status = 'active'),
	       (SELECT count(*) FROM child_device_links x WHERE x.child_id = c.id AND x.status <> 'revoked'),
	       (SELECT count(*) FROM consultations x WHERE x.child_id = c.id AND octet_length(x.photo) > 0)
	FROM children c LEFT JOIN child_records r ON r.child_id = c.id`

func scanChild(row pgx.Row) (*loaded, error) {
	var l loaded
	var hasRecord bool
	var blood, note, name, phone, office *string
	if err := row.Scan(&l.ID, &l.Hidden, &l.FirstName, &l.LastName, &l.BirthDate, &l.Height, &l.Weight, &l.GrowthReferenceSex, &l.CreatedAt,
		&hasRecord, &blood, &note, &name, &phone, &office,
		&l.Allergies, &l.Conditions,
		&l.Counts.Consultations, &l.Counts.Vaccines, &l.Counts.CardPhotos, &l.Counts.Measurements,
		&l.Counts.Supplements, &l.Counts.Activities, &l.ActiveSupplements, &l.ActiveActivities, &l.Counts.ActiveDevices, &l.Photos); err != nil {
		return nil, err
	}
	if hasRecord {
		rec := &RecordData{BloodType: blood, GeneralNote: note}
		if name != nil || phone != nil || office != nil {
			rec.Pediatrician = &childrecord.Pediatrician{Name: name, Phone: phone, Office: office}
		}
		l.Record = rec
	}
	return &l, nil
}

// childrenOf reads every child of an account, oldest first.
func childrenOf(ctx context.Context, q querier, accountID uuid.UUID) ([]*loaded, error) {
	rows, err := q.Query(ctx, childSelect+` WHERE c.account_id = $1 ORDER BY c.created_at, c.id`, accountID)
	if err != nil {
		return nil, fmt.Errorf("reading the children: %w", err)
	}
	defer rows.Close()
	out := []*loaded{}
	for rows.Next() {
		l, err := scanChild(rows)
		if err != nil {
			return nil, fmt.Errorf("reading a child: %w", err)
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

// childOf reads one child of an account; ErrNotFound if it is not that account's.
func childOf(ctx context.Context, q querier, accountID, childID uuid.UUID) (*loaded, error) {
	l, err := scanChild(q.QueryRow(ctx, childSelect+` WHERE c.account_id = $1 AND c.id = $2`, accountID, childID))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("reading a child: %w", err)
	}
	return l, nil
}

// membership is the family an active Tutor or Caregiver belongs to.
func membership(ctx context.Context, q querier, actor uuid.UUID) (familyID uuid.UUID, ownerFirstName string, err error) {
	err = q.QueryRow(ctx, `
		SELECT m.family_account_id, o.first_name
		FROM family_members m JOIN accounts o ON o.id = m.family_account_id
		WHERE m.account_id = $1 AND m.status = 'active' AND m.role IN ('tutor', 'caregiver')`, actor).Scan(&familyID, &ownerFirstName)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, "", ErrNoFamily
	}
	if err != nil {
		return uuid.Nil, "", fmt.Errorf("reading the family: %w", err)
	}
	return familyID, ownerFirstName, nil
}

func (l *loaded) view() ChildView {
	v := ChildView{
		ID: l.ID.String(), Hidden: l.Hidden, FirstName: l.FirstName, LastName: l.LastName,
		BirthDate: l.BirthDate.Format("2006-01-02"), Height: l.Height, Weight: l.Weight, GrowthReferenceSex: l.GrowthReferenceSex,
		Counts: l.Counts,
	}
	if l.Record != nil {
		v.Record = RecordView{Exists: true, BloodType: l.Record.BloodType, GeneralNote: l.Record.GeneralNote, Allergies: l.Allergies, Conditions: l.Conditions}
		if p := l.Record.Pediatrician; p != nil {
			v.Record.Pediatrician = &PediatricianView{Name: p.Name, Phone: p.Phone, Office: p.Office}
		}
	}
	return v
}

// Options is what the pairing screen needs: the person's own children (hidden ones too), the family's, whether the person
// can merge and the suggestion by name. ErrNoFamily if the person is not an active Tutor or Caregiver.
func (r *Repository) Options(ctx context.Context, actor uuid.UUID) (*Options, error) {
	familyID, ownerName, err := membership(ctx, r.pool, actor)
	if err != nil {
		return nil, err
	}
	level, err := access.LevelOnAccountIn(ctx, r.pool, actor, familyID)
	if err != nil {
		return nil, err
	}
	own, err := childrenOf(ctx, r.pool, actor)
	if err != nil {
		return nil, err
	}
	fam, err := childrenOf(ctx, r.pool, familyID)
	if err != nil {
		return nil, err
	}
	out := &Options{
		CanMerge: level >= access.Full, FamilyOwnerFirstName: ownerName,
		OwnChildren: []ChildView{}, FamilyChildren: []ChildView{}, SuggestedPairs: []SuggestedPair{},
	}
	ownData, famData := []ChildData{}, []ChildData{}
	for _, c := range own {
		out.OwnChildren = append(out.OwnChildren, c.view())
		ownData = append(ownData, c.ChildData)
	}
	for _, c := range fam {
		out.FamilyChildren = append(out.FamilyChildren, c.view())
		famData = append(famData, c.ChildData)
	}
	for _, p := range SuggestPairs(ownData, famData) {
		out.SuggestedPairs = append(out.SuggestedPairs, SuggestedPair{OwnChildID: p.OwnChildID.String(), FamilyChildID: p.FamilyChildID.String(), Reason: p.Reason})
	}
	return out, nil
}

func moveCounts(l *loaded, recordMoves bool) MoveCounts {
	return MoveCounts{
		Consultations: l.Counts.Consultations, Vaccines: l.Counts.Vaccines, CardPhotos: l.Counts.CardPhotos, Measurements: l.Counts.Measurements,
		Supplements: l.Counts.Supplements, Activities: l.Counts.Activities, Record: recordMoves, DevicesRemoved: l.Counts.ActiveDevices,
	}
}

// Preview says what each union would do — what moves, which fields differ, which caps it would pass — without writing
// anything. ErrNoFamily, ErrMergeNotAllowed (the person cannot do everything with the family's children) or ErrNotFound.
func (r *Repository) Preview(ctx context.Context, actor uuid.UUID, pairs []PairInput) ([]PairPreview, error) {
	familyID, _, err := membership(ctx, r.pool, actor)
	if err != nil {
		return nil, err
	}
	level, err := access.LevelOnAccountIn(ctx, r.pool, actor, familyID)
	if err != nil {
		return nil, err
	}
	if level < access.Full {
		return nil, ErrMergeNotAllowed
	}
	var accountPhotos int
	if err := r.pool.QueryRow(ctx, `SELECT count(*) FROM consultations WHERE account_id = $1 AND octet_length(photo) > 0`, familyID).Scan(&accountPhotos); err != nil {
		return nil, fmt.Errorf("counting the family's photos: %w", err)
	}
	recs := childrecord.NewRepository(r.pool)
	out := make([]PairPreview, 0, len(pairs))
	for _, p := range pairs {
		src, err := childOf(ctx, r.pool, actor, p.OwnChildID)
		if err != nil {
			return nil, err
		}
		dst, err := childOf(ctx, r.pool, familyID, p.FamilyChildID)
		if err != nil {
			return nil, err
		}
		pv := PairPreview{
			OwnChildID: src.ID.String(), FamilyChildID: dst.ID.String(), Differences: Differences(src.ChildData, dst.ChildData),
			Moves: moveCounts(src, src.Record != nil), OverLimits: []OverLimit{},
		}
		add := func(kind string, resulting, limit int) {
			if resulting > limit {
				pv.OverLimits = append(pv.OverLimits, OverLimit{Kind: kind, Resulting: resulting, Limit: limit})
			}
		}
		add("supplements", dst.ActiveSupplements+src.ActiveSupplements, LimitActiveRoutines)
		add("activities", dst.ActiveActivities+src.ActiveActivities, LimitActiveRoutines)
		add("cardPhotos", dst.Counts.CardPhotos+src.Counts.CardPhotos, LimitCardPhotos)
		add("measurements", dst.Counts.Measurements+src.Counts.Measurements, LimitMeasurements)
		accountPhotos += src.Photos
		add("consultationPhotos", accountPhotos, LimitConsultationPics)

		if src.Record != nil && dst.Record != nil {
			sr, err := recs.Get(ctx, src.ID)
			if err != nil {
				return nil, err
			}
			dr, err := recs.Get(ctx, dst.ID)
			if err != nil {
				return nil, err
			}
			al, co := childrecord.MergeLists(sr.Content, dr.Content)
			switch {
			case len(al) > childrecord.MaxEntries:
				pv.RecordTooLong = &TooLong{List: "allergies", Resulting: len(al), Limit: childrecord.MaxEntries}
			case len(co) > childrecord.MaxEntries:
				pv.RecordTooLong = &TooLong{List: "conditions", Resulting: len(co), Limit: childrecord.MaxEntries}
			}
		}
		out = append(out, pv)
	}
	return out, nil
}

// The four foreign keys the union defers (migration 0040): a symptom or an appointment points at its consultation by (id,
// child_id) and (id, account_id), and the consultations move before their symptoms and appointments do.
var deferredConstraints = []string{
	"consultation_symptoms_consultation_id_child_id_fkey",
	"consultation_symptoms_consultation_account_fkey",
	"consultation_appointments_consultation_id_child_id_fkey",
	"consultation_appointments_consultation_account_fkey",
}

// Merge joins the person's own child (source) into the family's (target) in ONE transaction: all or nothing. Every row that hung
// from the source is moved with an UPDATE to the target (ids, authors, marks and corrections stay as they were); the source's
// phones are removed; the sheets are merged; the chosen data is written on the target; the source, empty by now, is deleted
// and the union is recorded with numbers only. Errors: ErrNoFamily, ErrMergeNotAllowed, ErrNotFound, *ChoicesMissingError,
// *childrecord.RecordTooLongError, ErrBirthDateConflict.
func (r *Repository) Merge(ctx context.Context, actor uuid.UUID, p PairInput) (*MoveCounts, error) {
	if p.OwnChildID == p.FamilyChildID {
		return nil, ErrMergeNotAllowed
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("starting transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// The family is the account of the target child (read before locking: the account row is what serializes).
	var familyID uuid.UUID
	err = tx.QueryRow(ctx, `SELECT account_id FROM children WHERE id = $1`, p.FamilyChildID).Scan(&familyID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("reading the target child: %w", err)
	}
	if _, err := tx.Exec(ctx, `SELECT 1 FROM accounts WHERE id = $1 FOR UPDATE`, familyID); err != nil {
		return nil, fmt.Errorf("locking the family's account: %w", err)
	}
	ids := []string{p.OwnChildID.String(), p.FamilyChildID.String()}
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
	if _, err := tx.Exec(ctx, `SELECT 1 FROM children WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`, ids); err != nil {
		return nil, fmt.Errorf("locking the children: %w", err)
	}

	src, err := childOf(ctx, tx, actor, p.OwnChildID)
	if err != nil {
		return nil, err
	}
	dst, err := childOf(ctx, tx, familyID, p.FamilyChildID)
	if err != nil {
		return nil, err
	}
	if familyID == actor {
		return nil, ErrMergeNotAllowed
	}
	if _, _, err := membership(ctx, tx, actor); err != nil {
		if errors.Is(err, ErrNoFamily) {
			return nil, ErrMergeNotAllowed
		}
		return nil, err
	}
	level, err := access.LevelOnAccountIn(ctx, tx, actor, familyID)
	if err != nil {
		return nil, err
	}
	var paused bool
	if err := tx.QueryRow(ctx, `SELECT `+deletionstate.PendingAccountSQL("$1::uuid")+` OR `+deletionstate.PendingAccountSQL("$2::uuid"), actor, familyID).Scan(&paused); err != nil {
		return nil, fmt.Errorf("reading the accounts' state: %w", err)
	}
	if level < access.Full || paused {
		return nil, ErrMergeNotAllowed
	}
	// A child that is somebody's family role (a Child-role member or its invitation) cannot disappear under it.
	var inRole bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM family_members WHERE child_id = $1) OR EXISTS (SELECT 1 FROM family_invitations WHERE child_id = $1)`,
		src.ID).Scan(&inRole); err != nil {
		return nil, fmt.Errorf("checking the child's roles: %w", err)
	}
	if inRole {
		return nil, ErrMergeNotAllowed
	}

	diffs := Differences(src.ChildData, dst.ChildData)
	picks := map[string]bool{} // field -> take the own (source) value
	for _, f := range diffs {
		switch p.Choices[f] {
		case ChoiceOwn:
			picks[f] = true
		case ChoiceFamily:
			picks[f] = false
		default:
			return nil, &ChoicesMissingError{Field: f}
		}
	}

	if _, err := tx.Exec(ctx, `SET CONSTRAINTS `+strings.Join(deferredConstraints, ", ")+` DEFERRED`); err != nil {
		return nil, fmt.Errorf("deferring the constraints: %w", err)
	}

	now := r.now()
	removed, err := childdevice.RevokeAllInTx(ctx, tx, src.ID, actor, now)
	if err != nil {
		return nil, err
	}

	moves := MoveCounts{DevicesRemoved: removed}
	for _, m := range []struct {
		table string
		into  *int
	}{
		{"consultations", &moves.Consultations},
		{"consultation_symptoms", nil},
		{"consultation_appointments", nil},
		{"vaccine_records", &moves.Vaccines},
		{"vaccine_card_photos", &moves.CardPhotos},
		{"growth_measurements", &moves.Measurements},
		{"child_device_links", nil},
	} {
		tag, err := tx.Exec(ctx, `UPDATE `+m.table+` SET child_id = $1, account_id = $2 WHERE child_id = $3`, dst.ID, familyID, src.ID)
		if err != nil {
			return nil, fmt.Errorf("moving %s: %w", m.table, err)
		}
		if m.into != nil {
			*m.into = int(tag.RowsAffected())
		}
	}
	// medication_extensions.account_id is the account that owns the consultation, and it has no child column: it follows the
	// consultations to the family (otherwise purging the source account would fail on it or delete the family's extension).
	if _, err := tx.Exec(ctx, `
		UPDATE medication_extensions SET account_id = $1
		WHERE account_id <> $1 AND medication_id IN (
			SELECT m.id FROM medications m JOIN consultations c ON c.id = m.consultation_id WHERE c.child_id = $2)`, familyID, dst.ID); err != nil {
		return nil, fmt.Errorf("moving the treatment extensions: %w", err)
	}
	rows, err := tx.Query(ctx, `
		WITH u AS (UPDATE supplement_routines SET child_id = $1, account_id = $2 WHERE child_id = $3 RETURNING kind)
		SELECT kind, count(*) FROM u GROUP BY kind`, dst.ID, familyID, src.ID)
	if err != nil {
		return nil, fmt.Errorf("moving the routines: %w", err)
	}
	for rows.Next() {
		var kind string
		var n int
		if err := rows.Scan(&kind, &n); err != nil {
			rows.Close()
			return nil, fmt.Errorf("reading the moved routines: %w", err)
		}
		if kind == "activity" {
			moves.Activities = n
		} else {
			moves.Supplements = n
		}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("moving the routines: %w", err)
	}

	moves.Record, err = childrecord.MergeInto(ctx, tx, src.ID, dst.ID, actor, childrecord.MergeChoices{
		BloodTypeFromSource: picks[FieldBloodType], PediatricianFromSource: picks[FieldPediatrician], GeneralNoteFromSource: picks[FieldGeneralNote],
	})
	if err != nil {
		return nil, err
	}

	// The data of the registry: the chosen value of every field that differs (the target's by default).
	final := dst.ChildData
	for _, f := range diffs {
		if !picks[f] {
			continue
		}
		switch f {
		case FieldFirstName:
			final.FirstName = src.FirstName
		case FieldLastName:
			final.LastName = src.LastName
		case FieldBirthDate:
			final.BirthDate = src.BirthDate
		case FieldHeight:
			final.Height = src.Height
		case FieldWeight:
			final.Weight = src.Weight
		case FieldGrowthReferenceSex:
			final.GrowthReferenceSex = src.GrowthReferenceSex
		}
	}
	if _, err := tx.Exec(ctx, `
		UPDATE children SET first_name = $2, last_name = $3, birth_date = $4, height = $5, weight = $6, growth_reference_sex = $7
		WHERE id = $1`, dst.ID, final.FirstName, final.LastName, final.BirthDate, final.Height, final.Weight, final.GrowthReferenceSex); err != nil {
		return nil, fmt.Errorf("writing the chosen data: %w", err)
	}
	var conflict bool
	if err := tx.QueryRow(ctx, `
		SELECT EXISTS (SELECT 1 FROM growth_measurements WHERE child_id = $1 AND measured_on < $2)
		    OR EXISTS (SELECT 1 FROM vaccine_records WHERE child_id = $1 AND applied_on < $2)`, dst.ID, final.BirthDate).Scan(&conflict); err != nil {
		return nil, fmt.Errorf("checking the birth date: %w", err)
	}
	if conflict {
		return nil, ErrBirthDateConflict
	}

	if _, err := tx.Exec(ctx, `DELETE FROM children WHERE id = $1`, src.ID); err != nil {
		return nil, fmt.Errorf("removing the merged child: %w", err)
	}
	counts, err := json.Marshal(moves)
	if err != nil {
		return nil, fmt.Errorf("encoding the counts: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO child_merges (family_account_id, target_child_id, source_account_id, merged_by_account_id, merged_at, counts)
		VALUES ($1, $2, $3, $3, $4, $5)`, familyID, dst.ID, actor, now, counts); err != nil {
		return nil, fmt.Errorf("recording the union: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("committing the union: %w", err)
	}
	return &moves, nil
}

// AccountByClerkUser is the account a verified Clerk session belongs to; uuid.Nil if it has none.
func (r *Repository) AccountByClerkUser(ctx context.Context, clerkUserID string) (uuid.UUID, error) {
	var id uuid.UUID
	err := r.pool.QueryRow(ctx, `SELECT id FROM accounts WHERE clerk_user_id = $1`, clerkUserID).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, nil
	}
	if err != nil {
		return uuid.Nil, fmt.Errorf("reading the account: %w", err)
	}
	return id, nil
}

// RequireFamily is ErrNoFamily unless the account is an active Tutor or Caregiver of a family.
func (r *Repository) RequireFamily(ctx context.Context, actor uuid.UUID) error {
	_, _, err := membership(ctx, r.pool, actor)
	return err
}
