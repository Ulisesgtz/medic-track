package clienterror_test

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/clienterror"
)

func valid() clienterror.Report {
	return clienterror.Report{Kind: "render", Message: "Cannot read properties of undefined (reading 'doses')", Route: "/consultations/:consultationId",
		Version: "3e34a6799b24", Browser: "safari", OS: "ios", Installed: true, Count: 3}
}

func TestValidate(t *testing.T) {
	require.NoError(t, valid().Validate())

	ok := []func(*clienterror.Report){
		func(r *clienterror.Report) { r.Route = "/" },
		func(r *clienterror.Report) { r.Route = "other" },
		func(r *clienterror.Report) { r.Route = "/__prueba-error" },
		func(r *clienterror.Report) { r.Route = "/children/:childId/historial" },
		func(r *clienterror.Report) { r.Kind = "error" },
		func(r *clienterror.Report) { r.Kind = "rejection" },
		func(r *clienterror.Report) { r.Count = 1000 },
		func(r *clienterror.Report) { r.Message = strings.Repeat("é", 300) },
		func(r *clienterror.Report) { r.Version = "1.2.3-rc" },
	}
	for i, mutate := range ok {
		r := valid()
		mutate(&r)
		require.NoError(t, r.Validate(), "valid case %d", i)
	}

	bad := map[string]func(*clienterror.Report){
		"kind":            func(r *clienterror.Report) { r.Kind = "boom" },
		"empty kind":      func(r *clienterror.Report) { r.Kind = "" },
		"browser":         func(r *clienterror.Report) { r.Browser = "ie" },
		"os":              func(r *clienterror.Report) { r.OS = "beos" },
		"route digit":     func(r *clienterror.Report) { r.Route = "/children/3e34" },
		"route no slash":  func(r *clienterror.Report) { r.Route = "children" },
		"route query":     func(r *clienterror.Report) { r.Route = "/a?x=y" },
		"route too long":  func(r *clienterror.Report) { r.Route = "/" + strings.Repeat("a", 80) },
		"route empty":     func(r *clienterror.Report) { r.Route = "" },
		"route uppercase": func(r *clienterror.Report) { r.Route = "/Ana" },
		"version":         func(r *clienterror.Report) { r.Version = "v 1" },
		"version long":    func(r *clienterror.Report) { r.Version = strings.Repeat("a", 21) },
		"count 0":         func(r *clienterror.Report) { r.Count = 0 },
		"count 1001":      func(r *clienterror.Report) { r.Count = 1001 },
		"message empty":   func(r *clienterror.Report) { r.Message = "" },
		"message blank":   func(r *clienterror.Report) { r.Message = "   " },
		"message long":    func(r *clienterror.Report) { r.Message = strings.Repeat("a", 301) },
	}
	for name, mutate := range bad {
		r := valid()
		mutate(&r)
		require.Error(t, r.Validate(), name)
	}
}
