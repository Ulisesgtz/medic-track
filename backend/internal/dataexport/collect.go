// Package dataexport builds «Descargar todos mis datos» (specs/070, research R8): every row of an account (or of the
// children of a family) as a ZIP the person can open without PediTrack — LEEME.txt, datos.json, one CSV per kind and the
// photos as images. It is built on every request and never stored. Only what was recorded, as it was recorded (Principio I):
// no alerts, percentiles or judgements; a dose's state is the word the app shows.
package dataexport

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Ulisesgtz/medic-track/backend/internal/consultation"
	"github.com/Ulisesgtz/medic-track/backend/internal/supplement"
)

// Scope is whose data is exported.
type Scope struct {
	// AccountID: the account whose rows are exported.
	AccountID uuid.UUID
	// ChildrenOnly exports only the account's children (a Tutor downloading the children of an owner who asked to delete
	// her account, FR-004): no own consultations, personal routines or medicine cabinet.
	ChildrenOnly bool
}

// Own is an account's own export.
func Own(accountID uuid.UUID) Scope { return Scope{AccountID: accountID} }

// FamilyChildren is the export of the children of a family's owner.
func FamilyChildren(ownerID uuid.UUID) Scope { return Scope{AccountID: ownerID, ChildrenOnly: true} }

// Table is one kind of record: its file name, its columns and its rows (text; nil = empty).
type Table struct {
	Name    string
	Columns []string
	Rows    [][]*string
}

// Photo is one image to put in the ZIP: fotos/<Kind>/<ID>.<Ext>.
type Photo struct {
	Kind string // recetas, cartilla, botiquin
	ID   uuid.UUID
	Ext  string
}

// Path is the photo's place in the ZIP.
func (p Photo) Path() string { return "fotos/" + p.Kind + "/" + p.ID.String() + "." + p.Ext }

// Export is everything of a scope, without the photos' bytes (they are read one at a time while writing).
type Export struct {
	GeneratedAt time.Time
	Tables      []Table
	Photos      []Photo
}

// Querier is what Collect reads with (a transaction).
type Querier interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

// The state words the app shows for a dose (contracts of specs/013, 016 and 022).
var stateWords = map[string]string{
	string(consultation.DoseStatusTaken):        "dada",
	string(consultation.DoseStatusDue):          "por marcar",
	string(consultation.DoseStatusUnregistered): "sin registrar",
	string(consultation.DoseStatusPending):      "programada",
	string(consultation.DoseStatusCanceled):     "cancelada",
}

// Collect reads a scope in a read-only transaction whose time zone is Mexico City's, so every date and hour comes out as
// the app shows it ("2026-10-01 08:00:00-06").
func Collect(ctx context.Context, pool *pgxpool.Pool, scope Scope, now time.Time) (*Export, error) {
	tx, err := pool.BeginTx(ctx, pgx.TxOptions{AccessMode: pgx.ReadOnly, IsoLevel: pgx.RepeatableRead})
	if err != nil {
		return nil, fmt.Errorf("starting the export: %w", err)
	}
	defer func() { _ = tx.Rollback(context.WithoutCancel(ctx)) }()
	if _, err := tx.Exec(ctx, `SET LOCAL TIME ZONE 'America/Mexico_City'`); err != nil {
		return nil, fmt.Errorf("setting the export's time zone: %w", err)
	}
	return collect(ctx, tx, scope, now)
}

func collect(ctx context.Context, q Querier, scope Scope, now time.Time) (*Export, error) {
	e := &Export{GeneratedAt: now}
	// The consultations of the scope: of the account's children, and the person's own unless only the children go.
	consultationsOf := `c.account_id = $1`
	routinesOf := `r.account_id = $1`
	appointmentsOf := `a.account_id = $1`
	if scope.ChildrenOnly {
		consultationsOf += ` AND c.child_id IS NOT NULL`
		routinesOf += ` AND r.child_id IS NOT NULL`
		appointmentsOf += ` AND a.child_id IS NOT NULL`
	}

	textTables := []struct {
		name, sql string
		columns   []string
	}{
		{"hijos", `SELECT ch.id::text, ch.first_name, ch.last_name, ch.birth_date::text, ch.height::text, ch.weight::text
			FROM children ch WHERE ch.account_id = $1 ORDER BY ch.birth_date, ch.id`,
			[]string{"id", "nombre", "apellido", "fecha_de_nacimiento", "talla_cm", "peso_kg"}},
		{"consultas", `SELECT c.id::text, c.child_id::text, CASE WHEN c.child_id IS NULL THEN 'titular' ELSE 'hijo' END,
				c.doctor_name, c.consult_date::text,
				(SELECT string_agg(s.name, ', ' ORDER BY s.sort_order) FROM consultation_symptoms cs JOIN symptoms s ON s.code = cs.symptom_code
					WHERE cs.consultation_id = c.id),
				nullif(c.notes, ''), CASE WHEN c.record_only THEN 'sí' ELSE 'no' END,
				CASE WHEN octet_length(c.photo) > 0 THEN 'fotos/recetas/' || c.id::text ELSE NULL END,
				c.created_at::text
			FROM consultations c WHERE ` + consultationsOf + ` ORDER BY c.consult_date, c.created_at, c.id`,
			[]string{"id", "hijo_id", "de", "doctor", "fecha", "sintomas", "notas", "solo_registro", "foto", "registrada_el"}},
		{"medicamentos", `SELECT m.id::text, m.consultation_id::text, m.name, m.frequency_hours::text, m.duration_days::text,
				to_char(m.start_time, 'HH24:MI'), m.ended_at::text
			FROM medications m JOIN consultations c ON c.id = m.consultation_id WHERE ` + consultationsOf + `
			ORDER BY c.consult_date, m.created_at, m.id`,
			[]string{"id", "consulta_id", "nombre", "cada_horas", "dias", "primera_toma", "terminado_el"}},
		{"citas", `SELECT a.id::text, a.child_id::text, a.consultation_id::text, a.starts_at::text,
				nullif(COALESCE(nullif(a.doctor_name, ''), co.doctor_name, ''), ''), nullif(a.location, ''), nullif(a.location_url, ''),
				nullif(a.note, ''), CASE a.status WHEN 'scheduled' THEN 'programada' WHEN 'done' THEN 'realizada' ELSE 'cancelada' END
			FROM consultation_appointments a LEFT JOIN consultations co ON co.id = a.consultation_id
			WHERE ` + appointmentsOf + ` ORDER BY a.starts_at, a.id`,
			[]string{"id", "hijo_id", "consulta_id", "fecha_y_hora", "doctor", "lugar", "liga_del_lugar", "nota", "estado"}},
		{"vacunas", `SELECT v.id::text, v.child_id::text, COALESCE(vc.name, v.custom_name), v.applied_on::text,
				v.dose_number::text, v.lot, v.place, v.notes
			FROM vaccine_records v LEFT JOIN vaccine_catalog vc ON vc.code = v.vaccine_code
			WHERE v.account_id = $1 ORDER BY v.applied_on, v.id`,
			[]string{"id", "hijo_id", "vacuna", "fecha", "dosis", "lote", "lugar", "notas"}},
		{"fotos_de_la_cartilla", `SELECT p.id::text, p.child_id::text, 'fotos/cartilla/' || p.id::text, p.created_at::text
			FROM vaccine_card_photos p WHERE p.account_id = $1 ORDER BY p.created_at, p.id`,
			[]string{"id", "hijo_id", "foto", "guardada_el"}},
		{"crecimiento", `SELECT g.id::text, g.child_id::text, g.measured_on::text, g.weight_kg::text, g.height_cm::text, g.note
			FROM growth_measurements g WHERE g.account_id = $1 ORDER BY g.measured_on, g.id`,
			[]string{"id", "hijo_id", "fecha", "peso_kg", "talla_cm", "nota"}},
		{"ficha", `SELECT r.child_id::text, CASE r.blood_type WHEN 'unknown' THEN 'No lo sé' ELSE r.blood_type END, r.general_note,
				r.pediatrician_name, r.pediatrician_phone, r.pediatrician_office, r.updated_at::text, a.first_name
			FROM child_records r LEFT JOIN accounts a ON a.id = r.updated_by_account_id
			WHERE r.account_id = $1 ORDER BY r.child_id`,
			[]string{"hijo_id", "tipo_de_sangre", "nota_general", "pediatra", "telefono_del_pediatra", "consultorio_del_pediatra", "actualizada_el", "actualizada_por"}},
		{"ficha_alergias", `SELECT al.id::text, al.child_id::text, al.position::text, al.name,
				CASE al.kind WHEN 'medication' THEN 'medicamento' WHEN 'food' THEN 'alimento' WHEN 'other' THEN 'otra' END, al.note
			FROM child_record_allergies al WHERE al.account_id = $1 ORDER BY al.child_id, al.position`,
			[]string{"id", "hijo_id", "orden", "nombre", "tipo", "nota"}},
		{"ficha_padecimientos", `SELECT co.id::text, co.child_id::text, co.position::text, co.name, co.note
			FROM child_record_conditions co WHERE co.account_id = $1 ORDER BY co.child_id, co.position`,
			[]string{"id", "hijo_id", "orden", "nombre", "nota"}},
		{"suplementos_y_actividades", `SELECT r.id::text, r.child_id::text,
				CASE r.kind WHEN 'supplement' THEN 'suplemento' ELSE 'actividad' END, r.name, nullif(r.note, ''),
				CASE r.period WHEN 'daily' THEN 'todos los días' WHEN 'weekdays' THEN 'ciertos días' ELSE 'varias veces al día' END,
				nullif(array_to_string(ARRAY(SELECT to_char(t, 'HH24:MI') FROM unnest(r.times) t), ' '), ''),
				nullif(array_to_string(r.weekdays, ' '), ''),
				to_char(r.window_start, 'HH24:MI'), to_char(r.window_end, 'HH24:MI'), r.interval_minutes::text,
				r.first_date::text, r.end_date::text,
				CASE r.status WHEN 'active' THEN 'activa' WHEN 'paused' THEN 'en pausa' ELSE 'finalizada' END
			FROM supplement_routines r WHERE ` + routinesOf + ` ORDER BY r.created_at, r.id`,
			[]string{"id", "hijo_id", "tipo", "nombre", "nota", "periodo", "horas", "dias_de_la_semana", "desde", "hasta",
				"cada_minutos", "inicio", "fin", "estado"}},
	}
	if !scope.ChildrenOnly {
		textTables = append(textTables, struct {
			name, sql string
			columns   []string
		}{"botiquin", `SELECT b.id::text, b.name, nullif(b.strength, ''), b.quantity::text,
				CASE b.unit WHEN 'box' THEN 'cajas' WHEN 'tablet' THEN 'tabletas' WHEN 'bottle' THEN 'frascos' ELSE 'ml' END,
				b.expires_year::text || '-' || lpad(b.expires_month::text, 2, '0') || COALESCE('-' || lpad(b.expires_day::text, 2, '0'), ''),
				nullif(b.note, ''), CASE WHEN b.photo IS NOT NULL THEN 'fotos/botiquin/' || b.id::text ELSE NULL END
			FROM medicine_cabinet_items b WHERE b.account_id = $1 ORDER BY lower(b.name), b.id`,
			[]string{"id", "nombre", "concentracion", "cantidad", "unidad", "caducidad", "nota", "foto"}})
	}

	for _, t := range textTables {
		table, err := readText(ctx, q, t.name, t.columns, t.sql, scope.AccountID)
		if err != nil {
			return nil, err
		}
		e.Tables = append(e.Tables, table)
	}

	doses, err := readDoses(ctx, q, consultationsOf, scope.AccountID, now)
	if err != nil {
		return nil, err
	}
	routineDoses, err := readRoutineDoses(ctx, q, routinesOf, scope.AccountID, now)
	if err != nil {
		return nil, err
	}
	// Doses right after their medications, routine doses right after their routines.
	e.Tables = insertAfter(e.Tables, "medicamentos", doses)
	e.Tables = insertAfter(e.Tables, "suplementos_y_actividades", routineDoses)

	photos, err := readPhotos(ctx, q, consultationsOf, scope)
	if err != nil {
		return nil, err
	}
	e.Photos = photos
	// The CSVs name each photo without its extension until it is known: add it now.
	ext := map[string]string{}
	for _, p := range photos {
		ext["fotos/"+p.Kind+"/"+p.ID.String()] = p.Ext
	}
	for _, t := range e.Tables {
		for col, name := range t.Columns {
			if name != "foto" {
				continue
			}
			for _, row := range t.Rows {
				if row[col] != nil {
					path := *row[col] + "." + ext[*row[col]]
					row[col] = &path
				}
			}
		}
	}
	return e, nil
}

func insertAfter(tables []Table, name string, t Table) []Table {
	for i := range tables {
		if tables[i].Name == name {
			out := append([]Table{}, tables[:i+1]...)
			out = append(out, t)
			return append(out, tables[i+1:]...)
		}
	}
	return append(tables, t)
}

func readText(ctx context.Context, q Querier, name string, columns []string, sql string, id uuid.UUID) (Table, error) {
	rows, err := q.Query(ctx, sql, id)
	if err != nil {
		return Table{}, fmt.Errorf("reading %s: %w", name, err)
	}
	defer rows.Close()
	t := Table{Name: name, Columns: columns}
	for rows.Next() {
		row := make([]*string, len(columns))
		dest := make([]any, len(columns))
		for i := range row {
			dest[i] = &row[i]
		}
		if err := rows.Scan(dest...); err != nil {
			return Table{}, fmt.Errorf("reading %s: %w", name, err)
		}
		t.Rows = append(t.Rows, row)
	}
	if err := rows.Err(); err != nil {
		return Table{}, fmt.Errorf("reading %s: %w", name, err)
	}
	return t, nil
}

func str(s string) *string { return &s }

func optStr(s *string) *string {
	if s == nil || *s == "" {
		return nil
	}
	return s
}

// readDoses reads every dose of the scope's medications; its state is the app's own rule (consultation.StatusAt).
func readDoses(ctx context.Context, q Querier, consultationsOf string, id uuid.UUID, now time.Time) (Table, error) {
	rows, err := q.Query(ctx, `SELECT d.id::text, d.medication_id::text, d.scheduled_at, d.scheduled_at::text, d.taken,
			m.frequency_hours, m.ended_at, COALESCE(a.first_name, l.name), d.taken_at::text
		FROM doses d JOIN medications m ON m.id = d.medication_id JOIN consultations c ON c.id = m.consultation_id
		LEFT JOIN accounts a ON a.id = d.taken_by_account_id
		LEFT JOIN child_device_links l ON l.id = d.taken_by_child_device_id
		WHERE `+consultationsOf+` ORDER BY d.scheduled_at, d.id`, id)
	if err != nil {
		return Table{}, fmt.Errorf("reading the doses: %w", err)
	}
	defer rows.Close()
	t := Table{Name: "tomas", Columns: []string{"id", "medicamento_id", "hora", "estado", "marcada_por", "marcada_el"}}
	for rows.Next() {
		var doseID, medID, at string
		var scheduled time.Time
		var taken bool
		var freq int
		var ended *time.Time
		var by, takenAt *string
		if err := rows.Scan(&doseID, &medID, &scheduled, &at, &taken, &freq, &ended, &by, &takenAt); err != nil {
			return Table{}, fmt.Errorf("reading the doses: %w", err)
		}
		state := stateWords[string(consultation.StatusAt(scheduled, taken, freq, ended, now))]
		t.Rows = append(t.Rows, []*string{str(doseID), str(medID), str(at), str(state), optStr(by), takenAt})
	}
	return t, rows.Err()
}

// readRoutineDoses reads every dose of the scope's routines; its state is supplement.StatusAt with the routine's next dose.
func readRoutineDoses(ctx context.Context, q Querier, routinesOf string, id uuid.UUID, now time.Time) (Table, error) {
	rows, err := q.Query(ctx, `SELECT sd.id::text, sd.routine_id::text, sd.scheduled_at, sd.scheduled_at::text, sd.taken,
			lead(sd.scheduled_at) OVER (PARTITION BY sd.routine_id ORDER BY sd.scheduled_at),
			COALESCE(a.first_name, l.name), sd.taken_at::text
		FROM supplement_doses sd JOIN supplement_routines r ON r.id = sd.routine_id
		LEFT JOIN accounts a ON a.id = sd.taken_by_account_id
		LEFT JOIN child_device_links l ON l.id = sd.taken_by_child_device_id
		WHERE `+routinesOf+` ORDER BY sd.scheduled_at, sd.id`, id)
	if err != nil {
		return Table{}, fmt.Errorf("reading the routine doses: %w", err)
	}
	defer rows.Close()
	t := Table{Name: "tomas_de_rutinas", Columns: []string{"id", "rutina_id", "hora", "estado", "marcada_por", "marcada_el"}}
	for rows.Next() {
		var doseID, routineID, at string
		var scheduled time.Time
		var taken bool
		var next *time.Time
		var by, takenAt *string
		if err := rows.Scan(&doseID, &routineID, &scheduled, &at, &taken, &next, &by, &takenAt); err != nil {
			return Table{}, fmt.Errorf("reading the routine doses: %w", err)
		}
		state := stateWords[string(supplement.StatusAt(scheduled, taken, next, now))]
		t.Rows = append(t.Rows, []*string{str(doseID), str(routineID), str(at), str(state), optStr(by), takenAt})
	}
	return t, rows.Err()
}

// readPhotos lists the photos of the scope with the first bytes of each (to name its extension), never the whole image.
func readPhotos(ctx context.Context, q Querier, consultationsOf string, scope Scope) ([]Photo, error) {
	sql := `SELECT 'recetas', c.id, substring(c.photo FROM 1 FOR 16) FROM consultations c
			WHERE ` + consultationsOf + ` AND octet_length(c.photo) > 0
		UNION ALL
		SELECT 'cartilla', p.id, substring(p.photo FROM 1 FOR 16) FROM vaccine_card_photos p WHERE p.account_id = $1`
	if !scope.ChildrenOnly {
		sql += `
		UNION ALL
		SELECT 'botiquin', b.id, substring(b.photo FROM 1 FOR 16) FROM medicine_cabinet_items b
			WHERE b.account_id = $1 AND b.photo IS NOT NULL`
	}
	rows, err := q.Query(ctx, sql, scope.AccountID)
	if err != nil {
		return nil, fmt.Errorf("listing the photos: %w", err)
	}
	defer rows.Close()
	var out []Photo
	for rows.Next() {
		var p Photo
		var head []byte
		if err := rows.Scan(&p.Kind, &p.ID, &head); err != nil {
			return nil, fmt.Errorf("listing the photos: %w", err)
		}
		p.Ext = Extension(head)
		out = append(out, p)
	}
	return out, rows.Err()
}

// Extension names an image by its first bytes (the formats internal/imagecheck accepts). Anything else is "bin".
func Extension(head []byte) string {
	switch {
	case len(head) >= 3 && head[0] == 0xFF && head[1] == 0xD8 && head[2] == 0xFF:
		return "jpg"
	case len(head) >= 8 && string(head[:8]) == "\x89PNG\r\n\x1a\n":
		return "png"
	case len(head) >= 6 && (string(head[:6]) == "GIF87a" || string(head[:6]) == "GIF89a"):
		return "gif"
	case len(head) >= 12 && string(head[:4]) == "RIFF" && string(head[8:12]) == "WEBP":
		return "webp"
	case len(head) >= 12 && string(head[4:8]) == "ftyp":
		return "heic"
	default:
		return "bin"
	}
}
