package historyexport_test

import (
	"context"
	"errors"
	"fmt"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/account"
	"github.com/Ulisesgtz/medic-track/backend/internal/consultation"
	"github.com/Ulisesgtz/medic-track/backend/internal/errorlog"
	"github.com/Ulisesgtz/medic-track/backend/internal/historyexport"
	"github.com/Ulisesgtz/medic-track/backend/internal/vaccination"
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

// jpeg starts like a JPEG, which is all the photo check looks at.
var jpeg = []byte{0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 'J', 'F', 'I', 'F', 0x00}

type family struct {
	accountID, childID uuid.UUID
}

func newFamily(t *testing.T, pool *pgxpool.Pool, plan account.Plan) family {
	t.Helper()
	height, weight := 112.0, 19.4
	acc := &account.Account{
		FirstName: "Ana", LastName: "Morales", Email: fmt.Sprintf("export.%d.%s@example.com", time.Now().UnixNano(), uuid.NewString()[:6]), Plan: plan,
		Children: []account.Child{{FirstName: "Mateo", LastName: "Morales", BirthDate: time.Date(2021, 3, 14, 0, 0, 0, 0, time.UTC), Height: &height, Weight: &weight}},
	}
	require.NoError(t, account.NewRepository(pool).Create(context.Background(), acc))
	return family{accountID: acc.ID, childID: acc.Children[0].ID}
}

func strPtr(s string) *string { return &s }

// consult saves a consultation through the consultation service (as the app does).
func consult(t *testing.T, pool *pgxpool.Pool, f family, date time.Time, doctor string, meds ...consultation.CreateMedicationInput) *consultation.Consultation {
	t.Helper()
	if len(meds) == 0 {
		meds = []consultation.CreateMedicationInput{{Name: "Paracetamol", FrequencyHours: 6, DurationDays: 1, StartTime: strPtr("00:00")}}
	}
	c, err := consultation.NewService(consultation.NewRepository(pool)).CreateConsultation(context.Background(), f.childID, consultation.CreateConsultationInput{
		DoctorName: doctor, ConsultDate: date, Photo: jpeg, Notes: "Fiebre por las noches.", SymptomCodes: []string{"fever"}, Medications: meds,
	})
	require.NoError(t, err)
	return c
}

func newService(pool *pgxpool.Pool) *historyexport.Service {
	return historyexport.NewService(historyexport.NewRepository(pool), consultation.NewRepository(pool), vaccination.NewRepository(pool))
}

var everything = historyexport.Request{PeriodKind: historyexport.PeriodAll, Consultations: true, Vaccinations: true}

func today() time.Time {
	now := time.Now().UTC()
	return time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
}

func TestBuild_AFreeFamilyGetsNothingEvenAskingOnlyForTheCard(t *testing.T) {
	pool := testPool(t)
	f := newFamily(t, pool, account.PlanFree)
	for _, req := range []historyexport.Request{everything, {PeriodKind: historyexport.PeriodAll, Vaccinations: true}} {
		doc, err := newService(pool).Build(context.Background(), f.childID, req)
		require.Nil(t, doc)
		var plan *consultation.PlanLimitError
		require.True(t, errors.As(err, &plan))
		require.Equal(t, consultation.PlanLimitPDFExport, plan.Reason)
	}
}

func TestBuild_AChildThatDoesNotExist(t *testing.T) {
	pool := testPool(t)
	_, err := newService(pool).Build(context.Background(), uuid.New(), everything)
	require.ErrorIs(t, err, historyexport.ErrChildNotFound)
}

func TestBuild_TheWholeHistory(t *testing.T) {
	ctx := context.Background()
	pool := testPool(t)
	f := newFamily(t, pool, account.PlanPaid)
	day := today()
	old := consult(t, pool, f, day.AddDate(0, -2, 0), "Dr. Ernesto Ruiz", consultation.CreateMedicationInput{Name: "Paracetamol", FrequencyHours: 6, DurationDays: 1, StartTime: strPtr("00:00")})
	recent := consult(t, pool, f, day, "Dra. Laura Cázares",
		consultation.CreateMedicationInput{Name: "Amoxicilina", FrequencyHours: 8, DurationDays: 30, StartTime: strPtr("00:00")},
		consultation.CreateMedicationInput{Name: "Ibuprofeno", FrequencyHours: 8, DurationDays: 30, StartTime: strPtr("00:00")})

	svc := consultation.NewService(consultation.NewRepository(pool))
	// Ana marks the first Amoxicilina dose; Ibuprofeno is ended now (its doses ahead become canceled).
	amox := recent.Medications[0]
	_, err := svc.MarkDose(ctx, recent.ID, amox.Doses[0].ID, true, consultation.Actor{AccountID: f.accountID, Full: true})
	require.NoError(t, err)
	_, err = svc.EndTreatment(ctx, recent.ID, recent.Medications[1].ID)
	require.NoError(t, err)

	vacc := vaccination.NewService(vaccination.NewRepository(pool))
	_, err = vacc.Create(ctx, f.childID, f.accountID, vaccination.Input{VaccineCode: "bcg", AppliedOn: "2021-03-15"})
	require.NoError(t, err)
	_, err = vacc.Create(ctx, f.childID, f.accountID, vaccination.Input{CustomName: "Vacuna del viaje", AppliedOn: "2024-05-02", Lot: "L-12"})
	require.NoError(t, err)

	// An appointment of the recent consultation, three days ahead.
	_, err = pool.Exec(ctx, `INSERT INTO consultation_appointments (consultation_id, child_id, account_id, starts_at, utc_offset_minutes, created_by_account_id, location)
		VALUES ($1, $2, $3, now() + interval '3 days', -360, $3, 'Consultorio 204')`, recent.ID, f.childID, f.accountID)
	require.NoError(t, err)

	doc, err := newService(pool).Build(ctx, f.childID, everything)
	require.NoError(t, err)

	require.Equal(t, "Mateo", doc.Child.FirstName)
	require.Equal(t, "2021-03-14", doc.Child.BirthDate.Format("2006-01-02"))
	require.NotNil(t, doc.Child.Height)
	require.InDelta(t, 112, *doc.Child.Height, 0.001)

	require.Len(t, doc.Consultations, 2)
	require.Equal(t, recent.ID, doc.Consultations[0].ID, "most recent first")
	require.Equal(t, old.ID, doc.Consultations[1].ID)
	first := doc.Consultations[0]
	require.Equal(t, "Dra. Laura Cázares", first.DoctorName)
	require.True(t, first.HasPhoto)
	require.Equal(t, []historyexport.Symptom{{Code: "fever", Name: first.Symptoms[0].Name}}, first.Symptoms)
	require.NotNil(t, first.Appointment)
	require.Equal(t, "Consultorio 204", first.Appointment.Location)

	amoxOut := first.Medications[0]
	require.Equal(t, "Amoxicilina", amoxOut.Name)
	require.Equal(t, 90, amoxOut.Doses.Total)
	require.Equal(t, 1, amoxOut.Doses.Taken)
	require.Equal(t, amoxOut.Doses.Total, amoxOut.Doses.Taken+amoxOut.Doses.Unregistered+amoxOut.Doses.Due+amoxOut.Doses.Pending)
	require.NotNil(t, amoxOut.LastMark)
	require.Equal(t, "Ana", amoxOut.LastMark.By)
	require.NotNil(t, amoxOut.FirstDoseAt)

	ibu := first.Medications[1]
	require.NotNil(t, ibu.EndedAt)
	require.Less(t, ibu.Doses.Total, 90, "the doses canceled by ending the treatment are not counted")
	require.Zero(t, ibu.Doses.Pending)

	require.Len(t, doc.Vaccinations, 2)
	var custom *historyexport.Vaccination
	for i := range doc.Vaccinations {
		if doc.Vaccinations[i].Custom {
			custom = &doc.Vaccinations[i]
		}
	}
	require.NotNil(t, custom)
	require.Equal(t, "Vacuna del viaje", custom.Name)

	require.NotNil(t, doc.ActiveTreatment)
	require.Equal(t, "Amoxicilina", doc.ActiveTreatment.MedicationName)
	require.Equal(t, "Dra. Laura Cázares", doc.ActiveTreatment.DoctorName)
	require.NotNil(t, doc.NextAppointment)
	require.Nil(t, doc.Photos, "photos only when asked for")
}

func TestBuild_ThePeriodNarrowsOnlyTheConsultations(t *testing.T) {
	ctx := context.Background()
	pool := testPool(t)
	f := newFamily(t, pool, account.PlanPaid)
	day := today()
	consult(t, pool, f, day.AddDate(0, -2, 0), "Dr. Ernesto Ruiz")
	recent := consult(t, pool, f, day.AddDate(0, 0, -1), "Dra. Laura Cázares")
	_, err := vaccination.NewService(vaccination.NewRepository(pool)).Create(ctx, f.childID, f.accountID, vaccination.Input{VaccineCode: "bcg", AppliedOn: "2021-03-15"})
	require.NoError(t, err)

	from, to := day.AddDate(0, 0, -10), day
	doc, err := newService(pool).Build(ctx, f.childID, historyexport.Request{PeriodKind: historyexport.PeriodRange, From: &from, To: &to, Consultations: true, Vaccinations: true})
	require.NoError(t, err)
	require.Len(t, doc.Consultations, 1)
	require.Equal(t, recent.ID, doc.Consultations[0].ID)
	require.Len(t, doc.Vaccinations, 1, "the card is always whole")

	doc, err = newService(pool).Build(ctx, f.childID, historyexport.Request{PeriodKind: historyexport.PeriodFilters, Filters: historyexport.Filters{Doctor: "Dr. Ernesto Ruiz"}, Consultations: true})
	require.NoError(t, err)
	require.Len(t, doc.Consultations, 1)
	require.Equal(t, "Dr. Ernesto Ruiz", doc.Consultations[0].DoctorName)
	require.Empty(t, doc.Vaccinations, "the card only when asked for")
}

func TestBuild_ListsThePhotosOnlyWhenAsked(t *testing.T) {
	ctx := context.Background()
	pool := testPool(t)
	f := newFamily(t, pool, account.PlanPaid)
	c := consult(t, pool, f, today(), "Dra. Laura Cázares")
	_, err := vaccination.NewRepository(pool).AddPhoto(ctx, f.childID, f.accountID, jpeg)
	require.NoError(t, err)

	doc, err := newService(pool).Build(ctx, f.childID, historyexport.Request{PeriodKind: historyexport.PeriodAll, Consultations: true, Vaccinations: true, Photos: true})
	require.NoError(t, err)
	require.NotNil(t, doc.Photos)
	require.Len(t, doc.Photos.Consultations, 1)
	require.Equal(t, c.ID, doc.Photos.Consultations[0].ConsultationID)
	require.Len(t, doc.Photos.Card, 1)
}

func TestBuild_ARecordOnlyConsultationAndNoRunningTreatment(t *testing.T) {
	ctx := context.Background()
	pool := testPool(t)
	f := newFamily(t, pool, account.PlanPaid)
	_, err := consultation.NewService(consultation.NewRepository(pool)).CreateConsultation(ctx, f.childID, consultation.CreateConsultationInput{
		DoctorName: "Dr. Ernesto Ruiz", ConsultDate: today(), Photo: jpeg, RecordOnly: true,
		Medications: []consultation.CreateMedicationInput{{Name: "Paracetamol", FrequencyHours: 6, DurationDays: 1}},
	})
	require.NoError(t, err)

	doc, err := newService(pool).Build(ctx, f.childID, everything)
	require.NoError(t, err)
	require.Len(t, doc.Consultations, 1)
	require.True(t, doc.Consultations[0].RecordOnly)
	med := doc.Consultations[0].Medications[0]
	require.Zero(t, med.Doses.Total)
	require.Nil(t, med.FirstDoseAt)
	require.Nil(t, doc.ActiveTreatment)
	require.Nil(t, doc.NextAppointment)
	require.Empty(t, doc.Vaccinations)
}

// capture keeps what the Responder would write to error_logs.
type capture struct {
	mu      sync.Mutex
	entries []errorlog.Entry
}

func (c *capture) Create(_ context.Context, e *errorlog.Entry) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.entries = append(c.entries, *e)
	return nil
}

func (c *capture) all() []errorlog.Entry {
	c.mu.Lock()
	defer c.mu.Unlock()
	return append([]errorlog.Entry(nil), c.entries...)
}
