package errordigest

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/errorlog"
)

// fakeSource answers Build's questions from fixed data, telling the four filters it uses apart: the whole week, its requests
// (ExcludeEndpointPrefix), its processes (EndpointPrefix) and the week before (a period that ends before the week starts).
type fakeSource struct {
	weekStart time.Time

	all, requests, jobs, previous errorlog.Stats
	requestRows, jobRows          []errorlog.SummaryRow
	oldest                        *time.Time

	err         error
	summaryCall int
}

func (f *fakeSource) Stats(_ context.Context, flt errorlog.Filter) (errorlog.Stats, error) {
	if f.err != nil {
		return errorlog.Stats{}, f.err
	}
	switch {
	case flt.Until.Before(f.weekStart):
		return f.previous, nil
	case flt.ExcludeEndpointPrefix != "":
		return f.requests, nil
	case flt.EndpointPrefix != "":
		return f.jobs, nil
	default:
		return f.all, nil
	}
}

func (f *fakeSource) Summary(_ context.Context, flt errorlog.Filter) ([]errorlog.SummaryRow, error) {
	f.summaryCall++
	if f.err != nil {
		return nil, f.err
	}
	if flt.ExcludeEndpointPrefix != "" {
		return f.requestRows, nil
	}
	return f.jobRows, nil
}

func (f *fakeSource) OldestEntry(context.Context, errorlog.Filter) (*time.Time, error) {
	return f.oldest, f.err
}

var now = cdmx(2026, time.October, 12, 8, 0)

func newFake() *fakeSource {
	return &fakeSource{weekStart: now.Add(-7 * 24 * time.Hour)}
}

func row(endpoint string, status *int, message string, count int, first, last time.Time) errorlog.SummaryRow {
	return errorlog.SummaryRow{Endpoint: endpoint, HTTPStatus: status, Message: message, Count: count, FirstSeen: first, LastSeen: last}
}

func statusPtr(n int) *int { return &n }

func TestBuild_SeparatesRequestsFromProcessesAndCountsAccountsOnlyAsANumber(t *testing.T) {
	src := newFake()
	src.all = errorlog.Stats{Entries: 8, Groups: 3, Accounts: 2}
	src.requests = errorlog.Stats{Entries: 5, Groups: 2, Accounts: 2}
	src.jobs = errorlog.Stats{Entries: 3, Groups: 1}
	src.requestRows = []errorlog.SummaryRow{
		row("/accounts/me", statusPtr(404), "Account not found", 4, now.Add(-72*time.Hour), now.Add(-time.Hour)),
		row("/children/{childId}/overview", statusPtr(500), "Could not load", 1, now.Add(-48*time.Hour), now.Add(-48*time.Hour)),
	}
	src.jobRows = []errorlog.SummaryRow{row("job:reminders", nil, "reminder tick failed", 3, now.Add(-96*time.Hour), now.Add(-95*time.Hour))}

	d, err := Build(context.Background(), src, now, 90)

	require.NoError(t, err)
	require.Equal(t, 8, d.Total())
	require.Equal(t, 5, d.Requests.Total)
	require.Equal(t, 3, d.Jobs.Total)
	require.Equal(t, 2, d.Accounts)
	require.Equal(t, 3, d.Groups)
	require.Len(t, d.Requests.Groups, 2)
	require.Equal(t, "/accounts/me", d.Requests.Groups[0].Endpoint, "the most frequent first, as the summary gives them")
	require.Equal(t, 4, d.Requests.Groups[0].Count)
	require.Equal(t, 404, *d.Requests.Groups[0].Status)
	require.Len(t, d.Jobs.Groups, 1)
	require.Nil(t, d.Jobs.Groups[0].Status)
	require.Zero(t, d.Requests.MoreGroups)
	require.True(t, d.Since.Equal(now.Add(-7*24*time.Hour)))
	require.True(t, d.Until.Equal(now))
}

func TestBuild_ListsTenGroupsAndSaysHowManyDidNotFit(t *testing.T) {
	src := newFake()
	src.all = errorlog.Stats{Entries: 100, Groups: 31, Accounts: 5}
	src.requests = errorlog.Stats{Entries: 100, Groups: 31, Accounts: 5}
	for i := 0; i < 31; i++ {
		src.requestRows = append(src.requestRows, row(fmt.Sprintf("/e%02d", i), statusPtr(500), "m", 100-i, now, now))
	}

	d, err := Build(context.Background(), src, now, 90)

	require.NoError(t, err)
	require.Len(t, d.Requests.Groups, 10)
	require.Equal(t, 21, d.Requests.MoreGroups)
	require.Equal(t, 31, d.Groups)
	require.Equal(t, 1, src.summaryCall, "no summary is asked for the processes when there are none")
}

func TestBuild_AWeekWithoutErrorsAsksNoSummary(t *testing.T) {
	src := newFake()

	d, err := Build(context.Background(), src, now, 90)

	require.NoError(t, err)
	require.Zero(t, d.Total())
	require.Empty(t, d.Requests.Groups)
	require.Zero(t, src.summaryCall)
}

func TestBuild_TheComparisonNeedsRetentionAndData(t *testing.T) {
	previousStart := now.Add(-14 * 24 * time.Hour)
	older := previousStart.Add(-time.Hour)
	younger := previousStart.Add(24 * time.Hour)
	cases := []struct {
		name      string
		retention int
		previous  int
		oldest    *time.Time
		want      bool
	}{
		{"retention covers it and the previous week had errors", 90, 4, &younger, true},
		{"retention covers it, a quiet previous week, and the log is older than it", 90, 0, &older, true},
		{"a quiet previous week in a service too young to have one", 90, 0, &younger, false},
		{"an empty log", 90, 0, nil, false},
		{"retention shorter than 14 days", 13, 4, &older, false},
		{"retention of exactly 14 days", 14, 4, &older, true},
		{"the minimum retention of 7", 7, 4, &older, false},
	}
	for _, tc := range cases {
		src := newFake()
		src.previous = errorlog.Stats{Entries: tc.previous}
		src.oldest = tc.oldest

		d, err := Build(context.Background(), src, now, tc.retention)

		require.NoError(t, err, tc.name)
		require.Equal(t, tc.want, d.HasComparison, tc.name)
		if tc.want {
			require.Equal(t, tc.previous, d.PreviousTotal, tc.name)
		}
	}
}

func TestBuild_ACleanedMessageNeverCarriesSensitiveText(t *testing.T) {
	src := newFake()
	src.all = errorlog.Stats{Entries: 1, Groups: 1}
	src.requests = src.all
	src.requestRows = []errorlog.SummaryRow{row("/accounts/6f0c6a0e-1d2b-4c3a-9e8f-0123456789ab", statusPtr(500), "failed for ana@example.com\nsecond line", 1, now, now)}

	d, err := Build(context.Background(), src, now, 90)

	require.NoError(t, err)
	require.Equal(t, "/accounts/[id]", d.Requests.Groups[0].Endpoint)
	require.Equal(t, "failed for [correo] second line", d.Requests.Groups[0].Message)
}

func TestBuild_AFailureOfTheSourceIsReturnedWithoutADigest(t *testing.T) {
	src := newFake()
	src.err = errors.New("database is down")

	d, err := Build(context.Background(), src, now, 90)

	require.Error(t, err)
	require.Zero(t, d.Total())
}

func TestRender_SubjectAndBodyOfAWeekWithErrors(t *testing.T) {
	d := Digest{
		Since: now.Add(-7 * 24 * time.Hour), Until: now,
		Accounts: 14, Groups: 3, PreviousTotal: 26, HasComparison: true,
		Requests: Section{Total: 5, Groups: []Group{
			{Endpoint: "/accounts/me", Status: statusPtr(404), Message: "Account not found", Count: 4,
				FirstSeen: cdmx(2026, time.October, 5, 9, 12), LastSeen: cdmx(2026, time.October, 11, 22, 40)},
			{Endpoint: "/children/{childId}/overview", Status: statusPtr(500), Message: "Could not load", Count: 1,
				FirstSeen: cdmx(2026, time.October, 7, 10, 0), LastSeen: cdmx(2026, time.October, 7, 10, 0)},
		}},
		Jobs: Section{Total: 3, Groups: []Group{
			{Endpoint: "job:reminders", Message: "reminder tick failed", Count: 3,
				FirstSeen: cdmx(2026, time.October, 7, 3, 0), LastSeen: cdmx(2026, time.October, 7, 3, 10)},
		}},
	}

	subject, text := Render(d, "DEV")

	require.Equal(t, "[PediTrack DEV] Errores del 5 oct al 12 oct 2026: 8 (-18 vs. semana anterior)", subject)
	for _, want := range []string{
		"PediTrack · DEV\n",
		"Errores del 5 oct al 12 oct 2026 (hora de Ciudad de México)",
		"RESUMEN\n",
		"- Total: 8 errores en 3 grupos (14 cuentas afectadas)",
		"- Semana anterior: 26 errores (-18)",
		"- Peticiones: 5",
		"- Procesos en segundo plano: 3",
		"\nPETICIONES\n",
		" 1. 4 × 404  /accounts/me — Account not found",
		"    primera: lun 5 oct 09:12 · última: dom 11 oct 22:40",
		" 2. 1 × 500  /children/{childId}/overview — Could not load",
		"\nPROCESOS EN SEGUNDO PLANO\n",
		" 1. 3 × job:reminders — reminder tick failed",
		"    primera: mié 7 oct 03:00 · última: mié 7 oct 03:10",
		"Este correo lo genera el servicio de PediTrack y no incluye datos de personas.\n",
		"el detalle está en error_logs.\n",
	} {
		require.Contains(t, text, want)
	}
	require.NotContains(t, text, "http", "no links")
	require.NotContains(t, text, "No hubo errores")
}

func TestRender_TheSubjectWithAndWithoutALabelAndAComparison(t *testing.T) {
	week := Digest{Since: now.Add(-7 * 24 * time.Hour), Until: now, Requests: Section{Total: 38}}

	s, _ := Render(week, "")
	require.Equal(t, "[PediTrack] Errores del 5 oct al 12 oct 2026: 38", s)

	week.HasComparison, week.PreviousTotal = true, 26
	s, _ = Render(week, "")
	require.Equal(t, "[PediTrack] Errores del 5 oct al 12 oct 2026: 38 (+12 vs. semana anterior)", s)

	week.PreviousTotal = 38
	s, _ = Render(week, "producción")
	require.Equal(t, "[PediTrack producción] Errores del 5 oct al 12 oct 2026: 38 (igual vs. semana anterior)", s)
}

func TestRender_AWeekWithoutErrorsSaysSoAndStillHasTheFooter(t *testing.T) {
	d := Digest{Since: now.Add(-7 * 24 * time.Hour), Until: now}

	subject, text := Render(d, "DEV")

	require.Equal(t, "[PediTrack DEV] Errores del 5 oct al 12 oct 2026: 0", subject)
	require.Contains(t, text, "- Total: 0 errores en 0 grupos (0 cuentas afectadas)")
	require.Contains(t, text, "No hubo errores esta semana.")
	require.NotContains(t, text, "PETICIONES")
	require.NotContains(t, text, "PROCESOS")
	require.Contains(t, text, "no incluye datos de personas")
}

func TestRender_WithoutComparisonSaysSo(t *testing.T) {
	d := Digest{Since: now.Add(-7 * 24 * time.Hour), Until: now, Requests: Section{Total: 1, Groups: []Group{{Endpoint: "/x", Message: "m", Count: 1}}}, Groups: 1}

	_, text := Render(d, "")

	require.Contains(t, text, "- Semana anterior: sin comparación (no hay datos suficientes)")
	require.Contains(t, text, "- Total: 1 error en 1 grupo (0 cuentas afectadas)")
	require.True(t, strings.HasPrefix(text, "PediTrack\n"))
}

func TestRender_SaysHowManyGroupsDidNotFit(t *testing.T) {
	groups := make([]Group, 10)
	for i := range groups {
		groups[i] = Group{Endpoint: fmt.Sprintf("/e%d", i), Message: "m", Count: 10 - i}
	}
	d := Digest{Since: now.Add(-7 * 24 * time.Hour), Until: now, Groups: 11, Requests: Section{Total: 55, Groups: groups, MoreGroups: 1}}

	_, text := Render(d, "")

	require.Contains(t, text, "PETICIONES (los 10 grupos más frecuentes)")
	require.Contains(t, text, " y 1 grupo más que no cabe aquí.")

	d.Requests.MoreGroups = 21
	_, text = Render(d, "")
	require.Contains(t, text, " y 21 grupos más que no caben aquí.")
}

func TestStampAndDelta(t *testing.T) {
	require.Equal(t, "dom 11 oct 22:40", stamp(cdmx(2026, time.October, 11, 22, 40)))
	require.Equal(t, "sáb 3 ene 00:05", stamp(cdmx(2026, time.January, 3, 0, 5)))
	require.Equal(t, "+1", delta(5, 4))
	require.Equal(t, "-5", delta(0, 5))
	require.Equal(t, "igual", delta(3, 3))
	require.Equal(t, "1 grupo", plural(1, "grupo", "grupos"))
	require.Equal(t, "0 grupos", plural(0, "grupo", "grupos"))
}

func TestBuild_GroupsThatCleaningMakesIdenticalAreMergedBeforeTheTopTen(t *testing.T) {
	first := cdmx(2026, time.October, 6, 9, 0)
	last := cdmx(2026, time.October, 11, 9, 0)
	src := newFake()
	src.all = errorlog.Stats{Entries: 9, Groups: 4, Accounts: 2}
	src.requests = src.all
	// Three rows that differ only in an identifier, plus one genuinely different error that is less frequent than their sum.
	src.requestRows = []errorlog.SummaryRow{
		row("/children/{childId}", statusPtr(404), "child 11111111-2222-4333-8444-555555555555 not found", 3, first.Add(time.Hour), last.Add(-time.Hour)),
		row("/children/{childId}", statusPtr(404), "child 66666666-7777-4888-9999-000000000000 not found", 2, first, last.Add(-2*time.Hour)),
		row("/children/{childId}", statusPtr(404), "child aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee not found", 1, first.Add(2*time.Hour), last),
		row("/accounts/me", statusPtr(404), "Account not found", 3, first, last),
	}

	d, err := Build(context.Background(), src, now, 90)

	require.NoError(t, err)
	require.Len(t, d.Requests.Groups, 2, "the three that read the same are one group")
	merged := d.Requests.Groups[0]
	require.Equal(t, "child [id] not found", merged.Message)
	require.Equal(t, 6, merged.Count)
	require.True(t, merged.FirstSeen.Equal(first), "the earliest of the three")
	require.True(t, merged.LastSeen.Equal(last), "the latest of the three")
	require.Equal(t, "Account not found", d.Requests.Groups[1].Message)
	require.Zero(t, d.Requests.MoreGroups)
}

func TestBuild_GroupsBeyondTheSummaryLimitAreCountedAsNotFitting(t *testing.T) {
	src := newFake()
	src.all = errorlog.Stats{Entries: 500, Groups: 150, Accounts: 3}
	src.requests = src.all
	for i := 0; i < 100; i++ { // the summary stops at 100 groups although there are 150
		src.requestRows = append(src.requestRows, row(fmt.Sprintf("/e%03d", i), statusPtr(500), "m", 100-i, now, now))
	}

	d, err := Build(context.Background(), src, now, 90)

	require.NoError(t, err)
	require.Len(t, d.Requests.Groups, 10)
	require.Equal(t, 140, d.Requests.MoreGroups, "90 of the ones returned plus 50 never returned")
	require.Equal(t, 150, d.Groups)
}

// specs/045: the payments process reports as job:payments (kinds create, cancel, webhook, verify, reconcile, sweep). The digest reads
// any job:* group, so it lists them in the processes section with the fixed message and no personal data.
func TestBuild_ThePaymentsProcessAppearsAmongTheBackgroundProcesses(t *testing.T) {
	src := newFake()
	src.all = errorlog.Stats{Entries: 2, Groups: 1, Accounts: 0}
	src.jobs = errorlog.Stats{Entries: 2, Groups: 1}
	src.jobRows = []errorlog.SummaryRow{row("job:payments", nil, "payment webhook could not be verified (2 occurrences)", 2, now.Add(-48*time.Hour), now.Add(-47*time.Hour))}

	d, err := Build(context.Background(), src, now, 90)
	require.NoError(t, err)
	require.Len(t, d.Jobs.Groups, 1)
	require.Equal(t, "job:payments", d.Jobs.Groups[0].Endpoint)
	require.Empty(t, d.Requests.Groups)

	_, body := Render(d, "DEV")
	require.Contains(t, body, "job:payments")
	require.Contains(t, body, "payment webhook could not be verified")
	require.NotContains(t, body, "@")
}
