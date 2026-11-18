package dataexport

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

func testPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping test that requires a live database")
	}
	pool, err := pgxpool.New(context.Background(), dsn)
	require.NoError(t, err)
	t.Cleanup(pool.Close)
	return pool
}

// A JPEG and a PNG by their first bytes: what the export names "jpg" and "png".
var (
	jpegBytes = []byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 'J', 'F', 'I', 'F', 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0xAA}
	pngBytes  = []byte("\x89PNG\r\n\x1a\n" + "rest-of-the-image")
)

type family struct {
	Owner, Tutor, Child, Other, OtherChild, Consultation, OwnConsultation, Medication, Routine, Cabinet, CardPhoto uuid.UUID
}

// seedFamily creates an owner with one child and a record of every kind, a Tutor who marked a dose, and another account
// with data that must never appear in the owner's export.
func seedFamily(t *testing.T, pool *pgxpool.Pool) family {
	t.Helper()
	ctx := context.Background()
	f := family{Owner: uuid.New(), Tutor: uuid.New(), Child: uuid.New(), Other: uuid.New(), OtherChild: uuid.New(),
		Consultation: uuid.New(), OwnConsultation: uuid.New(), Medication: uuid.New(), Routine: uuid.New(), Cabinet: uuid.New(),
		CardPhoto: uuid.New()}
	exec := func(sql string, args ...any) {
		t.Helper()
		_, err := pool.Exec(ctx, sql, args...)
		require.NoError(t, err, sql)
	}
	exec(`INSERT INTO accounts (id, first_name, last_name, email, plan) VALUES
		($1, 'Ana', 'Export', $4, 'free'), ($2, 'Beto', 'Export', $5, 'free'), ($3, 'Otra', 'Export', $6, 'free')`,
		f.Owner, f.Tutor, f.Other, f.Owner.String()+"@export.test", f.Tutor.String()+"@export.test", f.Other.String()+"@export.test")
	exec(`INSERT INTO children (id, account_id, first_name, last_name, birth_date, height, weight) VALUES
		($1, $2, 'Mateo', 'Ñúñez', '2020-01-01', 90.5, 13.2), ($3, $4, 'Ajeno', 'Export', '2019-01-01', NULL, NULL)`,
		f.Child, f.Owner, f.OtherChild, f.Other)
	exec(`INSERT INTO family_members (family_account_id, account_id, role, invited_by_account_id) VALUES ($1, $2, 'tutor', $1)`, f.Owner, f.Tutor)
	exec(`INSERT INTO consultations (id, child_id, account_id, doctor_name, consult_date, photo, notes) VALUES
		($1, $2, $3, 'Dra. López', '2026-10-01', $4, 'Fiebre de noche 🌙, "toser"'),
		($5, NULL, $3, 'Dr. Propio', '2026-10-02', ''::bytea, ''),
		(gen_random_uuid(), $6, $7, 'Dr. Ajeno', '2026-10-03', $4, 'no debe salir')`,
		f.Consultation, f.Child, f.Owner, jpegBytes, f.OwnConsultation, f.OtherChild, f.Other)
	exec(`INSERT INTO consultation_symptoms (consultation_id, child_id, account_id, symptom_code) VALUES ($1, $2, $3, 'fever')`,
		f.Consultation, f.Child, f.Owner)
	exec(`INSERT INTO medications (id, consultation_id, name, frequency_hours, duration_days, start_time) VALUES ($1, $2, 'Amoxicilina', 8, 1, '08:00')`,
		f.Medication, f.Consultation)
	now := time.Date(2026, 11, 12, 18, 0, 0, 0, time.UTC)
	exec(`INSERT INTO doses (medication_id, scheduled_at, taken, taken_by_account_id, taken_at) VALUES
		($1, $2, true, $3, $2), ($1, $4, false, NULL, NULL), ($1, $5, false, NULL, NULL)`,
		f.Medication, now.Add(-20*time.Hour), f.Tutor, now.Add(-1*time.Hour), now.Add(5*time.Hour))
	exec(`INSERT INTO consultation_appointments (consultation_id, child_id, account_id, starts_at, utc_offset_minutes, created_by_account_id, location)
		VALUES ($1, $2, $3, $4, -360, $3, 'Hospital Ángeles')`, f.Consultation, f.Child, f.Owner, now.Add(48*time.Hour))
	exec(`INSERT INTO vaccine_records (child_id, account_id, custom_name, applied_on, created_by_account_id) VALUES ($1, $2, 'BCG', '2020-01-02', $2)`,
		f.Child, f.Owner)
	exec(`INSERT INTO vaccine_card_photos (id, child_id, account_id, photo, created_by_account_id) VALUES ($1, $2, $3, $4, $3)`,
		f.CardPhoto, f.Child, f.Owner, pngBytes)
	exec(`INSERT INTO growth_measurements (child_id, account_id, measured_on, weight_kg, created_by_account_id) VALUES ($1, $2, '2026-01-01', 12.5, $2)`,
		f.Child, f.Owner)
	exec(`INSERT INTO child_records (child_id, account_id, blood_type, general_note, pediatrician_name, version, updated_by_account_id)
		VALUES ($1, $2, 'unknown', 'Usa lentes', 'Dra. Ruiz', 1, $3)`, f.Child, f.Owner, f.Tutor)
	exec(`INSERT INTO child_record_allergies (child_id, account_id, position, name, kind) VALUES ($1, $2, 0, 'Penicilina', 'medication'), ($1, $2, 1, 'Cacahuate', NULL)`,
		f.Child, f.Owner)
	exec(`INSERT INTO child_record_conditions (child_id, account_id, position, name) VALUES ($1, $2, 0, 'Asma')`, f.Child, f.Owner)
	exec(`INSERT INTO supplement_routines (id, account_id, child_id, name, period, times, first_date, utc_offset_minutes, generated_until, created_by_account_id)
		VALUES ($1, $2, $3, 'Vitamina D', 'daily', '{08:00,20:00}', '2026-10-01', -360, now(), $2),
		       (gen_random_uuid(), $2, NULL, 'Hierro propio', 'daily', '{09:00}', '2026-10-01', -360, now(), $2)`,
		f.Routine, f.Owner, f.Child)
	exec(`INSERT INTO supplement_doses (routine_id, scheduled_at, taken, taken_by_account_id, taken_at) VALUES ($1, $2, true, $3, $2), ($1, $4, false, NULL, NULL)`,
		f.Routine, now.Add(-30*time.Hour), f.Owner, now.Add(2*time.Hour))
	exec(`INSERT INTO medicine_cabinet_items (id, account_id, name, strength, quantity, unit, expires_year, expires_month, photo, created_by_account_id)
		VALUES ($1, $2, 'Paracetamol', '500 mg', 2, 'box', 2027, 3, $3, $2)`, f.Cabinet, f.Owner, jpegBytes)

	t.Cleanup(func() {
		for _, sql := range []string{
			`DELETE FROM child_record_allergies WHERE account_id = ANY($1)`,
			`DELETE FROM child_record_conditions WHERE account_id = ANY($1)`,
			`DELETE FROM child_records WHERE account_id = ANY($1)`,
			`DELETE FROM supplement_doses WHERE routine_id IN (SELECT id FROM supplement_routines WHERE account_id = ANY($1))`,
			`DELETE FROM supplement_routines WHERE account_id = ANY($1)`,
			`DELETE FROM medicine_cabinet_items WHERE account_id = ANY($1)`,
			`DELETE FROM growth_measurements WHERE account_id = ANY($1)`,
			`DELETE FROM vaccine_card_photos WHERE account_id = ANY($1)`,
			`DELETE FROM vaccine_records WHERE account_id = ANY($1)`,
			`DELETE FROM consultation_appointments WHERE account_id = ANY($1)`,
			`DELETE FROM doses WHERE medication_id IN (SELECT m.id FROM medications m JOIN consultations c ON c.id = m.consultation_id WHERE c.account_id = ANY($1))`,
			`DELETE FROM medications WHERE consultation_id IN (SELECT id FROM consultations WHERE account_id = ANY($1))`,
			`DELETE FROM consultation_symptoms WHERE account_id = ANY($1)`,
			`DELETE FROM consultations WHERE account_id = ANY($1)`,
			`DELETE FROM family_members WHERE family_account_id = ANY($1)`,
			`DELETE FROM children WHERE account_id = ANY($1)`,
			`DELETE FROM accounts WHERE id = ANY($1)`,
		} {
			_, _ = pool.Exec(context.Background(), sql, []uuid.UUID{f.Owner, f.Tutor, f.Other})
		}
	})
	return f
}

func table(t *testing.T, e *Export, name string) Table {
	t.Helper()
	for _, tb := range e.Tables {
		if tb.Name == name {
			return tb
		}
	}
	t.Fatalf("no table %s", name)
	return Table{}
}

func column(t *testing.T, tb Table, row int, name string) *string {
	t.Helper()
	for i, c := range tb.Columns {
		if c == name {
			return tb.Rows[row][i]
		}
	}
	t.Fatalf("no column %s in %s", name, tb.Name)
	return nil
}

var exportNow = time.Date(2026, 11, 12, 18, 0, 0, 0, time.UTC)

func TestCollect_EverythingOfTheAccountAndNothingElse(t *testing.T) {
	pool := testPool(t)
	f := seedFamily(t, pool)

	e, err := Collect(context.Background(), pool, Own(f.Owner), exportNow)
	require.NoError(t, err)

	counts := map[string]int{}
	for _, tb := range e.Tables {
		counts[tb.Name] = len(tb.Rows)
	}
	require.Equal(t, map[string]int{
		"hijos": 1, "consultas": 2, "medicamentos": 1, "tomas": 3, "citas": 1, "vacunas": 1, "fotos_de_la_cartilla": 1,
		"crecimiento": 1, "suplementos_y_actividades": 2, "tomas_de_rutinas": 2, "botiquin": 1,
		"ficha": 1, "ficha_alergias": 2, "ficha_padecimientos": 1,
	}, counts, "every kind, and nothing of the other account")

	require.Equal(t, "Ñúñez", *column(t, table(t, e, "hijos"), 0, "apellido"))
	consultations := table(t, e, "consultas")
	require.Equal(t, "Fiebre", *column(t, consultations, 0, "sintomas"))
	require.Equal(t, "fotos/recetas/"+f.Consultation.String()+".jpg", *column(t, consultations, 0, "foto"))
	require.Nil(t, column(t, consultations, 1, "foto"), "the consultation saved without a photo")
	require.Equal(t, "titular", *column(t, consultations, 1, "de"))

	doses := table(t, e, "tomas")
	require.Equal(t, "dada", *column(t, doses, 0, "estado"))
	require.Equal(t, "Beto", *column(t, doses, 0, "marcada_por"), "only the first name of who marked")
	require.Equal(t, "por marcar", *column(t, doses, 1, "estado"))
	require.Equal(t, "programada", *column(t, doses, 2, "estado"))
	require.Contains(t, *column(t, doses, 0, "hora"), "-06", "hours in Mexico City time")

	require.ElementsMatch(t, []Photo{
		{Kind: "recetas", ID: f.Consultation, Ext: "jpg"},
		{Kind: "cartilla", ID: f.CardPhoto, Ext: "png"},
		{Kind: "botiquin", ID: f.Cabinet, Ext: "jpg"},
	}, e.Photos)
	require.Equal(t, "2027-03", *column(t, table(t, e, "botiquin"), 0, "caducidad"))

	record := table(t, e, "ficha")
	require.Equal(t, "No lo sé", *column(t, record, 0, "tipo_de_sangre"))
	require.Equal(t, "Beto", *column(t, record, 0, "actualizada_por"), "only the first name")
	allergies := table(t, e, "ficha_alergias")
	require.Equal(t, "Penicilina", *column(t, allergies, 0, "nombre"))
	require.Equal(t, "medicamento", *column(t, allergies, 0, "tipo"))
	require.Nil(t, column(t, allergies, 1, "tipo"))
	require.Equal(t, "Asma", *column(t, table(t, e, "ficha_padecimientos"), 0, "nombre"))
}

func TestCollect_FamilyChildrenLeavesOutTheOwnersOwnData(t *testing.T) {
	pool := testPool(t)
	f := seedFamily(t, pool)

	e, err := Collect(context.Background(), pool, FamilyChildren(f.Owner), exportNow)
	require.NoError(t, err)
	for _, tb := range e.Tables {
		require.NotEqual(t, "botiquin", tb.Name, "the medicine cabinet is the owner's, not the children's")
	}
	require.Len(t, table(t, e, "ficha").Rows, 1, "the children's record sheets are included")
	require.Len(t, table(t, e, "consultas").Rows, 1, "not her own consultation")
	require.Len(t, table(t, e, "suplementos_y_actividades").Rows, 1, "not her personal routine")
	for _, p := range e.Photos {
		require.NotEqual(t, "botiquin", p.Kind)
	}
}

func TestCollect_ATutorsOwnExportHasNotTheFamilysChildren(t *testing.T) {
	pool := testPool(t)
	f := seedFamily(t, pool)
	e, err := Collect(context.Background(), pool, Own(f.Tutor), exportNow)
	require.NoError(t, err)
	for _, tb := range e.Tables {
		require.Empty(t, tb.Rows, tb.Name)
	}
	require.Empty(t, e.Photos)
}

func unzip(t *testing.T, b []byte) map[string][]byte {
	t.Helper()
	zr, err := zip.NewReader(bytes.NewReader(b), int64(len(b)))
	require.NoError(t, err)
	out := map[string][]byte{}
	for _, f := range zr.File {
		rc, err := f.Open()
		require.NoError(t, err)
		data, err := io.ReadAll(rc)
		require.NoError(t, err)
		_ = rc.Close()
		out[f.Name] = data
	}
	return out
}

func TestWrite_AZipThatOpensWithoutPediTrack(t *testing.T) {
	pool := testPool(t)
	f := seedFamily(t, pool)
	h := NewHandler(nil, pool, nil)
	e, err := Collect(context.Background(), pool, Own(f.Owner), exportNow)
	require.NoError(t, err)

	var buf bytes.Buffer
	require.NoError(t, Write(context.Background(), &buf, e, h.photo(f.Owner)))
	files := unzip(t, buf.Bytes())

	require.Contains(t, string(files["LEEME.txt"]), "Ciudad de México")
	require.Contains(t, string(files["LEEME.txt"]), "consultas.csv (2)")

	var data map[string]any
	require.NoError(t, json.Unmarshal(files["datos.json"], &data), "datos.json is valid JSON")
	require.Len(t, data["tomas"], 3)
	require.Len(t, data["hijos"], 1)

	csvBytes := files["consultas.csv"]
	require.True(t, bytes.HasPrefix(csvBytes, utf8BOM), "UTF-8 with a BOM, for Excel")
	records, err := csv.NewReader(bytes.NewReader(csvBytes[len(utf8BOM):])).ReadAll()
	require.NoError(t, err)
	require.Equal(t, "Fiebre de noche 🌙, \"toser\"", records[1][6], "commas, quotes and emojis survive")

	require.Equal(t, jpegBytes, files["fotos/recetas/"+f.Consultation.String()+".jpg"])
	require.Equal(t, pngBytes, files["fotos/cartilla/"+f.CardPhoto.String()+".png"])
	require.Equal(t, jpegBytes, files["fotos/botiquin/"+f.Cabinet.String()+".jpg"])

	// Only what was recorded: none of the words that would judge it (Principio I).
	all := strings.ToLower(string(files["datos.json"]) + string(files["LEEME.txt"]))
	for _, word := range []string{"alerta", "atraso", "peligro", "anormal", "percentil", "riesgo", "olvid"} {
		require.NotContains(t, all, word)
	}
}

func TestWrite_APhotoThatFailsStopsTheFile(t *testing.T) {
	e := &Export{GeneratedAt: exportNow, Photos: []Photo{{Kind: "recetas", ID: uuid.New(), Ext: "jpg"}}}
	err := Write(context.Background(), io.Discard, e, func(context.Context, Photo) ([]byte, error) {
		return nil, io.ErrUnexpectedEOF
	})
	require.Error(t, err)

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	require.Error(t, Write(ctx, io.Discard, e, nil), "a canceled request stops before reading photos")
}

func TestWrite_APhotoDeletedMeanwhileIsSkippedAndSaidSo(t *testing.T) {
	gone, kept := uuid.New(), uuid.New()
	e := &Export{GeneratedAt: exportNow, Photos: []Photo{
		{Kind: "recetas", ID: gone, Ext: "jpg"}, {Kind: "recetas", ID: kept, Ext: "jpg"}}}
	var buf bytes.Buffer
	err := Write(context.Background(), &buf, e, func(_ context.Context, p Photo) ([]byte, error) {
		if p.ID == gone {
			return nil, fmt.Errorf("reading: %w", ErrPhotoGone)
		}
		return jpegBytes, nil
	})
	require.NoError(t, err)
	files := unzip(t, buf.Bytes())
	require.Contains(t, files, "fotos/recetas/"+kept.String()+".jpg")
	require.NotContains(t, files, "fotos/recetas/"+gone.String()+".jpg")
	require.Contains(t, string(files["fotos/OMITIDAS.txt"]), gone.String())
}

func TestExtension(t *testing.T) {
	require.Equal(t, "jpg", Extension(jpegBytes))
	require.Equal(t, "png", Extension(pngBytes))
	require.Equal(t, "gif", Extension([]byte("GIF89a....")))
	require.Equal(t, "webp", Extension([]byte("RIFF\x00\x00\x00\x00WEBPVP8 ")))
	require.Equal(t, "heic", Extension([]byte("\x00\x00\x00\x18ftypheic")))
	require.Equal(t, "bin", Extension([]byte("hello")))
	require.Equal(t, "bin", Extension(nil))
}
