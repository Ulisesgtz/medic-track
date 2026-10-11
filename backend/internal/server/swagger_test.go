package server_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/server"
)

func TestSwaggerEnabled(t *testing.T) {
	cases := []struct {
		name, flag, origin string
		want               bool
	}{
		{"local by default", "", "", true},
		{"localhost origin", "", "http://localhost:5173", true},
		{"loopback origin", "", "http://127.0.0.1:5173", true},
		{"deployed origin", "", "https://dev.pedi-track.com", false},
		{"deployed but forced on", "true", "https://dev.pedi-track.com", true},
		{"forced on with 1", " 1 ", "https://dev.pedi-track.com", true},
		{"local but forced off", "false", "", false},
		{"unparsable origin", "", "://bad", false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			require.Equal(t, c.want, server.SwaggerEnabled(c.flag, c.origin))
		})
	}
}
