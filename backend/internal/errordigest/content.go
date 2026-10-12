package errordigest

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/Ulisesgtz/medic-track/backend/internal/errorlog"
	"github.com/Ulisesgtz/medic-track/backend/internal/jobreport"
)

const (
	// maxGroups is how many groups each section of the e-mail lists: the most frequent ones.
	maxGroups = 10
	// comparisonRetentionDays: the comparison with the previous week needs 14 days of data, so it only makes sense when the
	// retention keeps at least that much (specs/021; 90 by default, never less than 7).
	comparisonRetentionDays = 14
)

// Source is what the digest reads from error_logs (satisfied by *errorlog.Repository).
type Source interface {
	Summary(ctx context.Context, f errorlog.Filter) ([]errorlog.SummaryRow, error)
	Stats(ctx context.Context, f errorlog.Filter) (errorlog.Stats, error)
	OldestEntry(ctx context.Context, f errorlog.Filter) (*time.Time, error)
}

// Group is one kind of error of the week: the same endpoint, status and message, how many times and when. The message is
// already clean (cleanMessage).
type Group struct {
	Endpoint  string
	Status    *int
	Message   string
	Count     int
	FirstSeen time.Time
	LastSeen  time.Time
}

// Section is one part of the e-mail: the requests or the background processes.
type Section struct {
	Total      int
	Groups     []Group // the most frequent first, at most maxGroups
	MoreGroups int     // how many groups did not fit
}

// Digest is what one week's e-mail says. It is derived from error_logs each time and never stored.
type Digest struct {
	Since, Until time.Time
	Requests     Section
	Jobs         Section
	// Accounts is how many distinct accounts the week's errors came from: only the number, never which ones.
	Accounts int
	// Groups is the number of different errors of the week, both sections together.
	Groups int
	// PreviousTotal is the number of errors of the week before; meaningful only if HasComparison.
	PreviousTotal int
	HasComparison bool
}

// Total is every error of the week, requests and processes.
func (d Digest) Total() int { return d.Requests.Total + d.Jobs.Total }

// Build reads the week that ends at `now` and the one before it. The comparison with the previous week is offered only if the
// retention covers it and there is data to compare with: the previous week had errors, or the log is older than its start (so
// a quiet week isn't confused with a service too young to have one).
func Build(ctx context.Context, src Source, now time.Time, retentionDays int) (Digest, error) {
	since, until, previousSince := Window(now)
	week := errorlog.Filter{Since: since, Until: until}
	requests := week
	requests.ExcludeEndpointPrefix = jobreport.EndpointPrefix
	jobs := week
	jobs.EndpointPrefix = jobreport.EndpointPrefix
	// The previous week ends where this one begins; the upper bound of a filter is inclusive, so step back one microsecond
	// (the resolution of the database) to not count an entry that sits exactly on the boundary twice.
	previous := errorlog.Filter{Since: previousSince, Until: since.Add(-time.Microsecond)}

	d := Digest{Since: since, Until: until}
	var err error

	all, err := src.Stats(ctx, week)
	if err != nil {
		return Digest{}, fmt.Errorf("counting the week's errors: %w", err)
	}
	d.Accounts = all.Accounts

	if d.Requests, err = section(ctx, src, requests); err != nil {
		return Digest{}, err
	}
	if d.Jobs, err = section(ctx, src, jobs); err != nil {
		return Digest{}, err
	}
	d.Groups = d.Requests.MoreGroups + len(d.Requests.Groups) + d.Jobs.MoreGroups + len(d.Jobs.Groups)

	if retentionDays >= comparisonRetentionDays {
		prev, err := src.Stats(ctx, previous)
		if err != nil {
			return Digest{}, fmt.Errorf("counting the previous week's errors: %w", err)
		}
		oldest, err := src.OldestEntry(ctx, errorlog.Filter{})
		if err != nil {
			return Digest{}, fmt.Errorf("finding the oldest error: %w", err)
		}
		d.PreviousTotal = prev.Entries
		d.HasComparison = prev.Entries > 0 || (oldest != nil && !oldest.After(previousSince))
	}
	return d, nil
}

// section reads one part of the week: its totals and its most frequent groups, with their messages cleaned.
func section(ctx context.Context, src Source, f errorlog.Filter) (Section, error) {
	stats, err := src.Stats(ctx, f)
	if err != nil {
		return Section{}, fmt.Errorf("counting a section of the week's errors: %w", err)
	}
	s := Section{Total: stats.Entries}
	if stats.Entries == 0 {
		return s, nil
	}
	rows, err := src.Summary(ctx, f)
	if err != nil {
		return Section{}, fmt.Errorf("summarizing a section of the week's errors: %w", err)
	}
	merged := mergeCleaned(rows)
	shown := min(maxGroups, len(merged))
	s.Groups = merged[:shown]
	// The groups that did not fit: those past the tenth and those the summary did not return (it stops at 100).
	if more := (stats.Groups - len(rows)) + (len(merged) - shown); more > 0 {
		s.MoreGroups = more
	}
	return s, nil
}

// mergeCleaned cleans the text of every group and joins the ones that came out identical: the summary groups by the raw message,
// and two that differed only in what cleaning replaces (an identifier, an address, the text past the cut) would otherwise be
// listed twice with split counts. The result is ordered like the summary: most frequent first, the most recent breaking a tie.
func mergeCleaned(rows []errorlog.SummaryRow) []Group {
	type key struct {
		endpoint, message string
		status            int // -1 = no status
	}
	index := map[key]int{}
	var groups []Group
	for _, row := range rows {
		status := -1
		if row.HTTPStatus != nil {
			status = *row.HTTPStatus
		}
		k := key{cleanMessage(row.Endpoint), cleanMessage(row.Message), status}
		if i, ok := index[k]; ok {
			g := &groups[i]
			g.Count += row.Count
			if row.FirstSeen.Before(g.FirstSeen) {
				g.FirstSeen = row.FirstSeen
			}
			if row.LastSeen.After(g.LastSeen) {
				g.LastSeen = row.LastSeen
			}
			continue
		}
		index[k] = len(groups)
		groups = append(groups, Group{Endpoint: k.endpoint, Status: row.HTTPStatus, Message: k.message, Count: row.Count, FirstSeen: row.FirstSeen, LastSeen: row.LastSeen})
	}
	sort.SliceStable(groups, func(i, j int) bool {
		if groups[i].Count != groups[j].Count {
			return groups[i].Count > groups[j].Count
		}
		return groups[i].LastSeen.After(groups[j].LastSeen)
	})
	return groups
}

var (
	monthNames   = [...]string{"ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"}
	weekdayNames = [...]string{"dom", "lun", "mar", "mié", "jue", "vie", "sáb"}
)

// dayMonth is «5 oct» in Mexico City time (fixed Spanish names: the same ones the app uses, no locale).
func dayMonth(t time.Time) string {
	l := t.In(location)
	return fmt.Sprintf("%d %s", l.Day(), monthNames[l.Month()-1])
}

// dayMonthYear is «12 oct 2026».
func dayMonthYear(t time.Time) string {
	return fmt.Sprintf("%s %d", dayMonth(t), t.In(location).Year())
}

// stamp is «lun 5 oct 09:12».
func stamp(t time.Time) string {
	l := t.In(location)
	return fmt.Sprintf("%s %s %02d:%02d", weekdayNames[l.Weekday()], dayMonth(t), l.Hour(), l.Minute())
}

func plural(n int, one, many string) string {
	if n == 1 {
		return fmt.Sprintf("%d %s", n, one)
	}
	return fmt.Sprintf("%d %s", n, many)
}

// delta is the change since the previous week: «+12», «-3» or «igual».
func delta(now, before int) string {
	switch diff := now - before; {
	case diff > 0:
		return fmt.Sprintf("+%d", diff)
	case diff < 0:
		return fmt.Sprintf("%d", diff)
	default:
		return "igual"
	}
}

// footer closes every e-mail; the same two lines always.
const footer = "Este correo lo genera el servicio de PediTrack y no incluye datos de personas.\n" +
	"Lo que se ve aquí son los mensajes fijos de error y su conteo; el detalle está en error_logs."

// Render writes the e-mail of a digest (specs/039 contracts/email.md): its subject and its plain-text body. `envLabel` names the
// environment («DEV»); empty leaves it out.
func Render(d Digest, envLabel string) (subject, text string) {
	name := "PediTrack"
	if envLabel != "" {
		name = "PediTrack " + envLabel
	}
	period := fmt.Sprintf("Errores del %s al %s", dayMonth(d.Since), dayMonthYear(d.Until))

	subject = fmt.Sprintf("[%s] %s: %d", name, period, d.Total())
	if d.HasComparison {
		subject += fmt.Sprintf(" (%s vs. semana anterior)", delta(d.Total(), d.PreviousTotal))
	}

	var b strings.Builder
	if envLabel != "" {
		fmt.Fprintf(&b, "PediTrack · %s\n", envLabel)
	} else {
		b.WriteString("PediTrack\n")
	}
	fmt.Fprintf(&b, "%s (hora de Ciudad de México)\n\n", period)

	b.WriteString("RESUMEN\n")
	fmt.Fprintf(&b, "- Total: %s en %s (%s)\n", plural(d.Total(), "error", "errores"), plural(d.Groups, "grupo", "grupos"),
		plural(d.Accounts, "cuenta afectada", "cuentas afectadas"))
	if d.HasComparison {
		fmt.Fprintf(&b, "- Semana anterior: %s (%s)\n", plural(d.PreviousTotal, "error", "errores"), delta(d.Total(), d.PreviousTotal))
	} else {
		b.WriteString("- Semana anterior: sin comparación (no hay datos suficientes)\n")
	}
	fmt.Fprintf(&b, "- Peticiones: %d\n", d.Requests.Total)
	fmt.Fprintf(&b, "- Procesos en segundo plano: %d\n", d.Jobs.Total)

	if d.Total() == 0 {
		b.WriteString("\nNo hubo errores esta semana.\n")
	} else {
		writeSection(&b, "PETICIONES", d.Requests)
		writeSection(&b, "PROCESOS EN SEGUNDO PLANO", d.Jobs)
	}
	b.WriteString("\n" + footer + "\n")
	return subject, b.String()
}

// writeSection lists the groups of one part; a part with no errors is left out.
func writeSection(b *strings.Builder, title string, s Section) {
	if s.Total == 0 {
		return
	}
	if s.MoreGroups > 0 {
		fmt.Fprintf(b, "\n%s (los %d grupos más frecuentes)\n", title, len(s.Groups))
	} else {
		fmt.Fprintf(b, "\n%s\n", title)
	}
	for i, g := range s.Groups {
		status := ""
		if g.Status != nil {
			status = fmt.Sprintf("%d  ", *g.Status)
		}
		fmt.Fprintf(b, "%2d. %d × %s%s — %s\n", i+1, g.Count, status, g.Endpoint, g.Message)
		fmt.Fprintf(b, "    primera: %s · última: %s\n", stamp(g.FirstSeen), stamp(g.LastSeen))
	}
	switch {
	case s.MoreGroups == 1:
		b.WriteString(" y 1 grupo más que no cabe aquí.\n")
	case s.MoreGroups > 1:
		fmt.Fprintf(b, " y %d grupos más que no caben aquí.\n", s.MoreGroups)
	}
}
