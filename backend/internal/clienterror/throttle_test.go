package clienterror

import (
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

type clock struct{ t time.Time }

func (c *clock) now() time.Time { return c.t }

func newTestThrottle() (*throttle, *clock) {
	c := &clock{t: time.Date(2026, 11, 17, 10, 0, 0, 0, time.UTC)}
	return newThrottle(c.now), c
}

func TestThrottle_OneRowPerGroupEveryFiveMinutesAndTheNextCountsTheRest(t *testing.T) {
	th, c := newTestThrottle()
	ok, n := th.admit("a")
	require.True(t, ok)
	require.Zero(t, n)

	for i := 0; i < 3; i++ {
		c.t = c.t.Add(time.Minute)
		ok, _ = th.admit("a")
		require.False(t, ok)
	}
	// another group is independent
	ok, _ = th.admit("b")
	require.True(t, ok)

	c.t = c.t.Add(2 * time.Minute) // 5 min since the first
	ok, n = th.admit("a")
	require.True(t, ok)
	require.Equal(t, 3, n)

	c.t = c.t.Add(5 * time.Minute)
	ok, n = th.admit("a")
	require.True(t, ok)
	require.Zero(t, n)
}

func TestThrottle_GlobalCapOf30RowsPerMinute(t *testing.T) {
	th, c := newTestThrottle()
	written := 0
	for i := 0; i < 100; i++ {
		if ok, _ := th.admit(fmt.Sprint("k", i)); ok {
			written++
		}
	}
	require.Equal(t, 30, written)

	c.t = c.t.Add(time.Minute)
	ok, _ := th.admit("another")
	require.True(t, ok)
}

func TestThrottle_MapIsBoundedAndForgetsTheOldest(t *testing.T) {
	th, c := newTestThrottle()
	for i := 0; i < maxGroups+500; i++ {
		c.t = c.t.Add(time.Second)
		if i%maxRowsPerMinute == 0 {
			c.t = c.t.Add(time.Minute) // a fresh minute every 30 rows: the global cap never bites
		}
		th.admit(fmt.Sprint("k", i))
		require.LessOrEqual(t, len(th.groups), maxGroups)
	}
	// the very first was forgotten, the last is remembered
	_, first := th.groups["k0"]
	_, last := th.groups[fmt.Sprint("k", maxGroups+499)]
	require.False(t, first)
	require.True(t, last)
}

func TestThrottle_EvictsExpiredGroupsFirst(t *testing.T) {
	th, c := newTestThrottle()
	for i := 0; i < maxGroups; i++ {
		c.t = c.t.Add(time.Second)
		if i%maxRowsPerMinute == 0 {
			c.t = c.t.Add(time.Minute)
		}
		th.admit(fmt.Sprint("k", i))
	}
	require.Len(t, th.groups, maxGroups)
	c.t = c.t.Add(10 * time.Minute) // all expired
	ok, _ := th.admit("new")
	require.True(t, ok)
	require.Len(t, th.groups, 1)
}

func TestThrottle_GlobalCapCountsTheRowOfAKnownGroupItLeavesOut(t *testing.T) {
	th, c := newTestThrottle()
	ok, _ := th.admit("known")
	require.True(t, ok)

	c.t = c.t.Add(groupWindow) // the window of «known» passed
	for i := 0; i < maxRowsPerMinute; i++ {
		ok, _ = th.admit(fmt.Sprint("k", i))
		require.True(t, ok)
	}
	// the minute is full: «known» is due but left out, and that is counted
	ok, _ = th.admit("known")
	require.False(t, ok)
	ok, _ = th.admit("known")
	require.False(t, ok)

	c.t = c.t.Add(time.Minute)
	ok, n := th.admit("known")
	require.True(t, ok)
	require.Equal(t, 2, n)
}

func TestThrottle_GlobalCapDoesNotRememberAnUnknownGroup(t *testing.T) {
	th, _ := newTestThrottle()
	for i := 0; i < maxRowsPerMinute; i++ {
		th.admit(fmt.Sprint("k", i))
	}
	ok, _ := th.admit("never seen")
	require.False(t, ok)
	_, remembered := th.groups["never seen"]
	require.False(t, remembered)
}
