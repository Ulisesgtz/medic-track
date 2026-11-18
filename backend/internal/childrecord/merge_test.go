package childrecord_test

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/childrecord"
)

func saveSheet(t *testing.T, pool *pgxpool.Pool, f family, c childrecord.Content) {
	t.Helper()
	cc, errs := childrecord.Validate(c)
	require.Empty(t, errs)
	_, err := childrecord.NewRepository(pool).Save(context.Background(), f.childID, f.accountID, cc, 0)
	require.NoError(t, err)
}

func runMerge(t *testing.T, pool *pgxpool.Pool, src, dst family, ch childrecord.MergeChoices) (bool, error) {
	t.Helper()
	ctx := context.Background()
	tx, err := pool.Begin(ctx)
	require.NoError(t, err)
	defer func() { _ = tx.Rollback(ctx) }()
	moved, err := childrecord.MergeInto(ctx, tx, src.childID, dst.childID, src.accountID, ch)
	if err != nil {
		return moved, err
	}
	require.NoError(t, tx.Commit(ctx))
	return moved, nil
}

func TestMergeInto_NoSourceRecordDoesNothing(t *testing.T) {
	pool := testPool(t)
	src, dst := newAccount(t, pool, "Laura", true), newAccount(t, pool, "Ana", true)
	saveSheet(t, pool, dst, content("Penicilina"))
	moved, err := runMerge(t, pool, src, dst, childrecord.MergeChoices{})
	require.NoError(t, err)
	require.False(t, moved)
	rec, err := childrecord.NewRepository(pool).Get(context.Background(), dst.childID)
	require.NoError(t, err)
	require.Equal(t, 1, rec.Version)
	require.Len(t, rec.Allergies, 2)
}

func TestMergeInto_OnlySourceMovesTheSheet(t *testing.T) {
	pool := testPool(t)
	src, dst := newAccount(t, pool, "Laura", true), newAccount(t, pool, "Ana", true)
	saveSheet(t, pool, src, content("Penicilina"))
	moved, err := runMerge(t, pool, src, dst, childrecord.MergeChoices{})
	require.NoError(t, err)
	require.True(t, moved)
	repo := childrecord.NewRepository(pool)
	rec, err := repo.Get(context.Background(), dst.childID)
	require.NoError(t, err)
	require.True(t, rec.Exists)
	require.Equal(t, "O+", *rec.BloodType)
	require.Equal(t, "Penicilina", rec.Allergies[0].Name)
	require.Len(t, rec.Allergies, 2)
	require.Len(t, rec.Conditions, 1)
	gone, err := repo.Get(context.Background(), src.childID)
	require.NoError(t, err)
	require.False(t, gone.Exists)
	var n int
	require.NoError(t, pool.QueryRow(context.Background(), `SELECT count(*) FROM child_record_allergies WHERE child_id = $1 AND account_id = $2`, dst.childID, dst.accountID).Scan(&n))
	require.Equal(t, 2, n)
}

func TestMergeInto_BothMergeListsAndChooseFields(t *testing.T) {
	pool := testPool(t)
	src, dst := newAccount(t, pool, "Laura", true), newAccount(t, pool, "Ana", true)
	// target: Penicilina + Cacahuate + Asma, O+; source: Polen, Cacahuate (identical), Rinitis, A+, other pediatrician
	saveSheet(t, pool, dst, content("Penicilina"))
	saveSheet(t, pool, src, childrecord.Content{
		BloodType:    s("A+"),
		GeneralNote:  s("nota de Laura"),
		Pediatrician: &childrecord.Pediatrician{Name: s("Dr. Paz")},
		Allergies:    []childrecord.Allergy{{Name: " Polen "}, {Name: "Cacahuate"}},
		Conditions:   []childrecord.Condition{{Name: "Rinitis"}},
	})
	moved, err := runMerge(t, pool, src, dst, childrecord.MergeChoices{BloodTypeFromSource: true, GeneralNoteFromSource: true})
	require.NoError(t, err)
	require.True(t, moved)
	rec, err := childrecord.NewRepository(pool).Get(context.Background(), dst.childID)
	require.NoError(t, err)
	require.Equal(t, 2, rec.Version)
	require.Equal(t, "A+", *rec.BloodType)
	require.Equal(t, "nota de Laura", *rec.GeneralNote)
	require.Equal(t, "Dra. Ruiz", *rec.Pediatrician.Name, "the pediatrician stays the target's")
	names := []string{}
	for _, a := range rec.Allergies {
		names = append(names, a.Name)
	}
	require.Equal(t, []string{"Penicilina", "Cacahuate", "Polen"}, names)
	require.Len(t, rec.Conditions, 2)
	require.Equal(t, "Asma", rec.Conditions[0].Name)
	require.Equal(t, "Rinitis", rec.Conditions[1].Name)
	require.NotNil(t, rec.UpdatedBy)
	require.Equal(t, "Laura", *rec.UpdatedBy)

	gone, err := childrecord.NewRepository(pool).Get(context.Background(), src.childID)
	require.NoError(t, err)
	require.False(t, gone.Exists)
}

func TestMergeInto_PediatricianFromSource(t *testing.T) {
	pool := testPool(t)
	src, dst := newAccount(t, pool, "Laura", true), newAccount(t, pool, "Ana", true)
	saveSheet(t, pool, dst, content("Penicilina"))
	saveSheet(t, pool, src, childrecord.Content{Pediatrician: &childrecord.Pediatrician{Name: s("Dr. Paz")}})
	_, err := runMerge(t, pool, src, dst, childrecord.MergeChoices{PediatricianFromSource: true})
	require.NoError(t, err)
	rec, err := childrecord.NewRepository(pool).Get(context.Background(), dst.childID)
	require.NoError(t, err)
	require.Equal(t, "Dr. Paz", *rec.Pediatrician.Name)
	require.Equal(t, "O+", *rec.BloodType)
}

func TestMergeInto_TooLongWritesNothing(t *testing.T) {
	pool := testPool(t)
	src, dst := newAccount(t, pool, "Laura", true), newAccount(t, pool, "Ana", true)
	mk := func(prefix string, n int) []childrecord.Allergy {
		out := []childrecord.Allergy{}
		for i := 0; i < n; i++ {
			out = append(out, childrecord.Allergy{Name: prefix + uuid.NewString()[:8]})
		}
		return out
	}
	saveSheet(t, pool, dst, childrecord.Content{Allergies: mk("t", 20)})
	saveSheet(t, pool, src, childrecord.Content{Allergies: mk("s", 13)})
	_, err := runMerge(t, pool, src, dst, childrecord.MergeChoices{})
	var tooLong *childrecord.RecordTooLongError
	require.True(t, errors.As(err, &tooLong))
	require.Equal(t, "allergies", tooLong.List)
	require.Equal(t, 33, tooLong.Resulting)
	require.NotEmpty(t, tooLong.Error())
	repo := childrecord.NewRepository(pool)
	rec, _ := repo.Get(context.Background(), dst.childID)
	require.Len(t, rec.Allergies, 20)
	rec, _ = repo.Get(context.Background(), src.childID)
	require.True(t, rec.Exists)
	require.Len(t, rec.Allergies, 13)
}

func TestMergeInto_ConditionsTooLong(t *testing.T) {
	pool := testPool(t)
	src, dst := newAccount(t, pool, "Laura", true), newAccount(t, pool, "Ana", true)
	mk := func(prefix string, n int) []childrecord.Condition {
		out := []childrecord.Condition{}
		for i := 0; i < n; i++ {
			out = append(out, childrecord.Condition{Name: prefix + uuid.NewString()[:8]})
		}
		return out
	}
	saveSheet(t, pool, dst, childrecord.Content{Conditions: mk("t", 25)})
	saveSheet(t, pool, src, childrecord.Content{Conditions: mk("s", 6)})
	_, err := runMerge(t, pool, src, dst, childrecord.MergeChoices{})
	var tooLong *childrecord.RecordTooLongError
	require.True(t, errors.As(err, &tooLong))
	require.Equal(t, "conditions", tooLong.List)
}
