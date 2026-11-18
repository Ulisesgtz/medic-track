package server_test

import (
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
)

// Specs/074: the pairing screen and the union name no account or child in the address (the ids travel in the body), so they sit
// behind the session only and the handler decides who may do what. They are never reachable from the child's phone.
func TestRouter_TheUnionRoutesNeedASessionAndAreNotThePhones(t *testing.T) {
	w := newWorld(t)
	routes := []struct{ method, path string }{
		{http.MethodGet, "/family/merge-options"},
		{http.MethodPost, "/family/merges/preview"},
		{http.MethodPost, "/family/merges"},
	}
	for _, rt := range routes {
		t.Run(rt.method+" "+rt.path, func(t *testing.T) {
			require.Equal(t, http.StatusUnauthorized, w.do(t, rt.method, rt.path, "", `{}`).Code, "no session")
			require.Equal(t, http.StatusUnauthorized, w.doDevice(t, rt.method, rt.path, w.deviceCredential, `{}`).Code, "a child's phone credential")
		})
	}
	// Tutor A owns a family and is nobody's member: nothing to merge into.
	token := w.verifier.Token(t, w.clerkA)
	rec := w.do(t, http.MethodGet, "/family/merge-options", token, "")
	require.Equal(t, http.StatusNotFound, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), "no_family")
	require.Equal(t, http.StatusBadRequest, w.do(t, http.MethodPost, "/family/merges", token, `{}`).Code)
}
