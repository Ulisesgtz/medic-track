package server

import (
	"net/url"
	"strings"
)

// SwaggerEnabled says whether the Swagger UI (/swagger/*) is served (specs/037). It documents every endpoint to whoever
// opens it, so a deployed API does not serve it unless SWAGGER_ENABLED=true; on a developer's machine (no
// FRONTEND_ORIGIN, or one on localhost) it is on without configuration.
func SwaggerEnabled(flag, frontendOrigin string) bool {
	switch strings.ToLower(strings.TrimSpace(flag)) {
	case "true", "1":
		return true
	case "false", "0":
		return false
	}
	if frontendOrigin == "" {
		return true
	}
	u, err := url.Parse(frontendOrigin)
	if err != nil {
		return false
	}
	h := u.Hostname()
	return h == "localhost" || h == "127.0.0.1" || h == "::1"
}
