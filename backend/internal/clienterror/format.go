package clienterror

import (
	"fmt"
	"strings"
	"unicode/utf8"
)

// EndpointPrefix starts the endpoint of every row of a report: "client:<screen>". The weekly e-mail (specs/039) and the operation
// queries (specs/021) use it to tell these rows from the requests' ones.
const EndpointPrefix = "client:"

// rowFile and rowLine fill the NOT NULL columns file and line: the error did not happen in the API.
const (
	rowFile = "frontend"
	rowLine = 0
)

// maxRowMessage is the longest message of a row (contract).
const maxRowMessage = 300

// Endpoint is the endpoint of the row of a report.
func (r Report) Endpoint() string { return EndpointPrefix + r.Route }

// repeated says how many times the phone saw it, in ranges so the groups of the summary are not split per number.
func repeated(count int) string {
	switch {
	case count >= 10:
		return " · repetido 10 o más veces"
	case count >= 2:
		return " · repetido 2–9 veces"
	}
	return ""
}

// RowMessage is the text of the row: «<kind> · <clean message> · <browser>/<system>[ · instalada] · v<version>[ · repetido …]».
func (r Report) RowMessage() string { return r.rowMessage(Clean(r.Message), "") }

// rowMessage builds the row's text from the message already cleaned; `tail` is what the server's cap adds at the end
// (« (+N más desde la última)»). Only the message gives way when the row would pass maxRowMessage: the kind, the browser, the
// version, the repeat range and the tail are what the weekly summary groups by and what says how many were left out, so they
// always fit.
func (r Report) rowMessage(clean, tail string) string {
	var head, rest strings.Builder
	fmt.Fprintf(&head, "%s · ", r.Kind)
	fmt.Fprintf(&rest, " · %s/%s", r.Browser, r.OS)
	if r.Installed {
		rest.WriteString(" · instalada")
	}
	fmt.Fprintf(&rest, " · v%s%s%s", r.Version, repeated(r.Count), tail)

	budget := maxRowMessage - utf8.RuneCountInString(head.String()) - utf8.RuneCountInString(rest.String())
	if budget < 1 {
		budget = 1
	}
	return cut(head.String()+cut(clean, budget)+rest.String(), maxRowMessage)
}

// groupKey is what the server's cap groups by: the endpoint, the kind and the clean message.
func (r Report) groupKey() string { return r.groupKeyOf(Clean(r.Message)) }

func (r Report) groupKeyOf(clean string) string {
	return r.Endpoint() + "\x00" + r.Kind + "\x00" + clean
}
