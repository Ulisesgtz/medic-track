// Package ops is what the team that runs the service uses to see what is failing: read-only queries over error_logs
// (specs/021-consulta-y-retencion-error-logs). It is not for parents: no Clerk session, no account; a single operation
// key held by the server decides who may ask.
package ops

import (
	"crypto/sha256"
	"crypto/subtle"
	"net/http"
	"strings"
)

// RequireKey lets through only requests that carry `Authorization: Bearer <key>`. Anything else — no header, a wrong key, not a
// Bearer — gets http.NotFound: exactly what an unknown route answers, with no hint that this route exists or why it failed.
//
// Both keys are hashed before being compared, in constant time: neither the content nor the length of the real key can be
// learned from how long the answer takes. The comparison always runs, even when there is no token.
//
// A rejection is deliberately NOT written through the httpx.Responder (and so not into error_logs): anyone could then fill the
// table by sending wrong keys. Answers to someone who does hold the key do go through it.
func RequireKey(key string) func(http.Handler) http.Handler {
	want := sha256.Sum256([]byte(key))
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token, isBearer := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
			got := sha256.Sum256([]byte(token))
			match := subtle.ConstantTimeCompare(got[:], want[:]) == 1
			if !isBearer || !match {
				http.NotFound(w, r)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
