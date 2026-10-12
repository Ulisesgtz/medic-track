package errordigest

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

// cdmx is a moment in Mexico City time.
func cdmx(year int, month time.Month, day, hour, minute int) time.Time {
	return time.Date(year, month, day, hour, minute, 0, 0, Location())
}

func TestLocation_LoadsMexicoCityFromTheEmbeddedDatabase(t *testing.T) {
	require.Equal(t, "America/Mexico_City", Location().String())
	_, offset := cdmx(2026, time.October, 12, 8, 0).Zone()
	require.Equal(t, -6*60*60, offset, "Mexico City is UTC−6 all year")
}

func TestLoadLocation_FallsBackToAFixedZone(t *testing.T) {
	loc := loadLocation("Not/AZone")
	_, offset := time.Date(2026, 10, 12, 8, 0, 0, 0, loc).Zone()
	require.Equal(t, -6*60*60, offset)
}

func TestWeekKey_IsTheISOWeekInMexicoCityTime(t *testing.T) {
	require.Equal(t, "2026-W42", WeekKey(cdmx(2026, time.October, 12, 8, 0)), "a Monday")
	require.Equal(t, "2026-W42", WeekKey(cdmx(2026, time.October, 18, 23, 59)), "the Sunday of the same week")
	require.Equal(t, "2026-W43", WeekKey(cdmx(2026, time.October, 19, 0, 0)), "the next Monday")

	// Sunday night in Mexico City is already Monday in UTC: the week is Mexico City's.
	sundayNight := cdmx(2026, time.October, 18, 22, 0)
	require.Equal(t, time.Monday, sundayNight.UTC().Weekday())
	require.Equal(t, "2026-W42", WeekKey(sundayNight))
}

func TestWeekKey_AroundTheNewYear(t *testing.T) {
	// 2026 has 53 ISO weeks: its last one runs into January 2027.
	require.Equal(t, "2026-W53", WeekKey(cdmx(2026, time.December, 31, 12, 0)))
	require.Equal(t, "2026-W53", WeekKey(cdmx(2027, time.January, 1, 12, 0)))
	require.Equal(t, "2027-W01", WeekKey(cdmx(2027, time.January, 4, 0, 0)))
	// The key always has the shape the table's CHECK asks for.
	require.Regexp(t, `^[0-9]{4}-W[0-9]{2}$`, WeekKey(cdmx(2026, time.January, 1, 0, 0)))
}

func TestScheduled_IsTheConfiguredDayAndHourOfTheWeekOfNow(t *testing.T) {
	wednesday := cdmx(2026, time.October, 14, 10, 30)

	require.True(t, Scheduled(wednesday, 1, 8).Equal(cdmx(2026, time.October, 12, 8, 0)), "Monday 08:00 of this week")
	require.True(t, Scheduled(wednesday, 5, 17).Equal(cdmx(2026, time.October, 16, 17, 0)), "Friday 17:00")
	require.True(t, Scheduled(wednesday, 7, 0).Equal(cdmx(2026, time.October, 18, 0, 0)), "Sunday midnight")

	// From a Sunday it is still the week that began on the Monday before, not the next one.
	sunday := cdmx(2026, time.October, 18, 20, 0)
	require.True(t, Scheduled(sunday, 1, 8).Equal(cdmx(2026, time.October, 12, 8, 0)))
	// And across a month boundary.
	require.True(t, Scheduled(cdmx(2026, time.November, 3, 9, 0), 1, 8).Equal(cdmx(2026, time.November, 2, 8, 0)))
	require.True(t, Scheduled(cdmx(2026, time.December, 1, 9, 0), 1, 8).Equal(cdmx(2026, time.November, 30, 8, 0)))
}

func TestDue_TheScheduledMinuteTheRestOfTheWeekAndNotBefore(t *testing.T) {
	cfg := Config{Weekday: 1, Hour: 8}

	require.False(t, Due(cdmx(2026, time.October, 12, 7, 59), cfg), "one minute before")
	require.True(t, Due(cdmx(2026, time.October, 12, 8, 0), cfg), "on the minute")
	require.True(t, Due(cdmx(2026, time.October, 13, 9, 0), cfg), "the Tuesday: a service that was off on Monday recovers")
	require.True(t, Due(cdmx(2026, time.October, 18, 23, 59), cfg), "the last minute of the week")

	// The next Monday is another week: its own schedule, so a missed week is never recovered.
	require.False(t, Due(cdmx(2026, time.October, 19, 7, 59), cfg))
	require.Equal(t, "2026-W43", WeekKey(cdmx(2026, time.October, 19, 7, 59)))
	require.True(t, Due(cdmx(2026, time.October, 19, 8, 0), cfg))
}

func TestDue_AnotherWeekdayAndHour(t *testing.T) {
	cfg := Config{Weekday: 5, Hour: 17} // Friday 17:00
	require.False(t, Due(cdmx(2026, time.October, 12, 8, 0), cfg), "Monday")
	require.False(t, Due(cdmx(2026, time.October, 16, 16, 59), cfg))
	require.True(t, Due(cdmx(2026, time.October, 16, 17, 0), cfg))
}

func TestWindow_TheSevenDaysBeforeNowAndTheSevenBeforeThose(t *testing.T) {
	now := cdmx(2026, time.October, 12, 8, 0)

	since, until, previousSince := Window(now)

	require.True(t, until.Equal(now))
	require.True(t, since.Equal(now.Add(-7*24*time.Hour)))
	require.True(t, previousSince.Equal(now.Add(-14*24*time.Hour)))
}
