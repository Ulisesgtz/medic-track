// Package clienterror receives the errors the app reports from a phone or a browser (a screen that failed to draw, an uncaught
// error) and writes them to error_logs as `client:<screen>` rows, with no account, no address and nothing a person typed
// (specs/072-monitoreo-errores-frontend).
package clienterror

import (
	"math"
	"regexp"
	"strings"

	"github.com/Ulisesgtz/medic-track/backend/internal/mailer"
)

// MaxMessageRunes is the longest a cleaned message is kept (research R5).
const MaxMessageRunes = 200

var (
	urlPattern = regexp.MustCompile(`https?://\S+`)
	// Quoted pieces: ASCII quotes and backticks, and the typographic pairs ‘…’ “…” «…» ‹…› of a translated or formatted message.
	quotedPattern = regexp.MustCompile("'[^']*'|\"[^\"]*\"|`[^`]*`|‘[^’]*’|“[^”]*”|«[^»]*»|‹[^›]*›")
	// A short identifier: what an error says about a property or a variable («reading 'doses'»), never a person's text.
	identifierPattern = regexp.MustCompile(`^[A-Za-z_$][\w$.]{0,40}$`)
	digitsPattern     = regexp.MustCompile(`\d{4,}`)
)

// Clean makes the message of a report safe to store: on top of mailer.Clean (control characters, e-mails, UUIDs, tokens)
// it replaces addresses with «[url]», quoted text that is not a short identifier with «[texto]» and numbers of four or more
// digits with «[n]», then cuts at MaxMessageRunes. The order matters: addresses and identifiers go before the digits, so an id
// inside a URL is not left half-replaced. The phone applies the same rules (frontend shared/clientErrors/clean.ts); both
// sides test the same table (specs/072 contracts/clean-cases.json).
func Clean(s string) string {
	s = mailer.Clean(s, math.MaxInt32)
	s = urlPattern.ReplaceAllString(s, "[url]")
	s = quotedPattern.ReplaceAllStringFunc(s, func(q string) string {
		// Every opening and closing mark is one character but not one byte: cut by runes.
		runes := []rune(q)
		if identifierPattern.MatchString(string(runes[1 : len(runes)-1])) {
			return q
		}
		return "[texto]"
	})
	s = digitsPattern.ReplaceAllString(s, "[n]")
	return cut(s, MaxMessageRunes)
}

// cut shortens s to max characters, the last one being «…».
func cut(s string, max int) string {
	runes := []rune(strings.TrimSpace(s))
	if len(runes) <= max {
		return string(runes)
	}
	return string(runes[:max-1]) + "…"
}
