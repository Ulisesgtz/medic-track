package errordigest

import (
	"context"
	"fmt"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/errorlog"
)

// SC-004 (specs/039): nothing that identifies a person leaves the service in the e-mail. The messages of error_logs are fixed
// sentences, so this test feeds the digest the worst it could ever be given — messages and endpoints that DO carry an address,
// an identifier and a token — and checks the subject and the body.

var (
	anyEmail = regexp.MustCompile(`[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}`)
	anyUUID  = regexp.MustCompile(`(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}`)
	anyToken = regexp.MustCompile(`[A-Za-z0-9_\-]{32,}`)
)

func TestTheEmailNeverCarriesAnAddressAnIdentifierOrAToken(t *testing.T) {
	secretAccount := "11111111-2222-4333-8444-555555555555"
	token := "dGhpcy1pcy1hLWJlYXJlci10b2tlbi1mb3ItdGVzdGluZw"
	src := newFake()
	src.all = errorlog.Stats{Entries: 6, Groups: 4, Accounts: 3}
	src.requests = errorlog.Stats{Entries: 4, Groups: 3, Accounts: 3}
	src.jobs = errorlog.Stats{Entries: 2, Groups: 1}
	src.requestRows = []errorlog.SummaryRow{
		row("/accounts/"+secretAccount+"/children", statusPtr(404), "no account for ana.lopez@example.com", 2, now, now),
		row("/reminders/actions/taken", statusPtr(403), "token "+token+" is not valid", 1, now, now),
		row("/children/{childId}", statusPtr(500), "child "+secretAccount+" could not be loaded", 1, now, now),
	}
	src.jobRows = []errorlog.SummaryRow{row("job:reminders", nil, "device https://fcm.googleapis.com/fcm/send/"+token+" gone, owner "+secretAccount, 2, now, now)}

	d, err := Build(context.Background(), src, now, 90)
	require.NoError(t, err)
	subject, text := Render(d, "DEV")

	for name, content := range map[string]string{"subject": subject, "body": text} {
		require.False(t, anyEmail.MatchString(content), "%s has an e-mail address: %s", name, content)
		require.False(t, anyUUID.MatchString(content), "%s has an identifier: %s", name, content)
		require.False(t, anyToken.MatchString(content), "%s has a token: %s", name, content)
		require.NotContains(t, content, secretAccount, name)
		require.NotContains(t, content, token, name)
		require.NotContains(t, content, "ana.lopez", name)
	}
	// What is allowed to be there: the count of accounts, never which ones.
	require.Contains(t, text, "3 cuentas afectadas")
}

func TestTheEmailHasNoAccountListNoLinksAndAlwaysTheFooter(t *testing.T) {
	for _, d := range []Digest{
		{Since: now.Add(-7 * 24 * time.Hour), Until: now},
		{Since: now.Add(-7 * 24 * time.Hour), Until: now, Accounts: 2, Groups: 1, Requests: Section{Total: 2, Groups: []Group{{Endpoint: "/x", Message: "m", Count: 2}}}},
	} {
		_, text := Render(d, "")

		require.NotContains(t, strings.ToLower(text), "http")
		require.NotContains(t, strings.ToLower(text), "account_id")
		require.True(t, strings.HasSuffix(text, "el detalle está en error_logs.\n"))
	}
}

func TestADigestOfManyGroupsStaysBounded(t *testing.T) {
	src := newFake()
	src.all = errorlog.Stats{Entries: 100000, Groups: 5000, Accounts: 900}
	src.requests = src.all
	for i := 0; i < 100; i++ { // the summary gives at most 100 groups
		src.requestRows = append(src.requestRows, row(fmt.Sprintf("/e%d", i), statusPtr(500), strings.Repeat("long message ", 40), 1000-i, now, now))
	}

	d, err := Build(context.Background(), src, now, 90)
	require.NoError(t, err)
	_, text := Render(d, "")

	require.Len(t, d.Requests.Groups, 10)
	require.Equal(t, 4990, d.Requests.MoreGroups)
	require.Less(t, len(text), 6000, "the e-mail does not grow with the week")
	require.Contains(t, text, "y 4990 grupos más que no caben aquí.")
}
