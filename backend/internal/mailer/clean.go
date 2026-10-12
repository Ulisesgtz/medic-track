package mailer

import (
	"regexp"
	"strings"
	"unicode"
)

// The messages of error_logs are fixed sentences (specs/002 and 018) and carry no e-mail, identifier or token. These three
// expressions are a second lock: if a future message ever did, it would reach the provider as «[correo]», «[id]» or «[token]»
// instead of the value (constitution, Principio II).
var (
	emailPattern = regexp.MustCompile(`[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}`)
	uuidPattern  = regexp.MustCompile(`(?i)\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b`)
	// A long run of letters, digits, «_» and «-»: what a bearer token, an API key or a hash looks like.
	tokenPattern = regexp.MustCompile(`[A-Za-z0-9_\-]{32,}`)
)

// Clean makes a text that comes from outside (a message of error_logs, a person's first name) safe to put in an e-mail: control characters and line breaks become spaces
// (so it can't break the layout or add a header), anything that looks like an e-mail address, a UUID or a token is replaced,
// and it is cut at maxRunes characters ending in «…». The replacements go before the cut so an address is never left half-written.
func Clean(s string, maxRunes int) string {
	s = strings.Map(func(r rune) rune {
		if unicode.IsControl(r) {
			return ' '
		}
		return r
	}, s)
	s = strings.Join(strings.Fields(s), " ")
	s = emailPattern.ReplaceAllString(s, "[correo]")
	s = uuidPattern.ReplaceAllString(s, "[id]")
	s = redactTokens(s)

	runes := []rune(s)
	if len(runes) > maxRunes {
		return string(runes[:maxRunes-1]) + "…"
	}
	return s
}

// redactTokens replaces the long runs that look like a token. A real one (a bearer token, a key, a hash) always has digits among
// its letters; a long run of letters only is a word, and the operator needs to read it.
func redactTokens(s string) string {
	return tokenPattern.ReplaceAllStringFunc(s, func(run string) string {
		if strings.ContainsAny(run, "0123456789") {
			return "[token]"
		}
		return run
	})
}
