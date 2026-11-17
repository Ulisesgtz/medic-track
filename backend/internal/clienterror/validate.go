package clienterror

import (
	"errors"
	"regexp"
	"strings"
	"unicode/utf8"
)

// Report is what the app sends (specs/072 contracts/client-errors.md).
type Report struct {
	Kind      string `json:"kind" example:"render" enums:"error,rejection,render"`
	Message   string `json:"message" example:"Cannot read properties of undefined (reading 'doses')"`
	Route     string `json:"route" example:"/consultations/:consultationId"`
	Version   string `json:"version" example:"3e34a6799b24"`
	Browser   string `json:"browser" example:"safari" enums:"safari,chrome,firefox,edge,samsung,other"`
	OS        string `json:"os" example:"ios" enums:"ios,android,windows,macos,linux,other"`
	Installed bool   `json:"installed" example:"true"`
	Count     int    `json:"count" example:"3"`
}

var (
	// A screen pattern never has a digit: an identifier is a parameter name («:childId»), never its value. Underscores are
	// allowed in a segment only for the test route of the E2E suite («/__prueba-error»).
	routePattern   = regexp.MustCompile(`^(/|other|(/([a-z_-]+|:[a-zA-Z]+))+)$`)
	versionPattern = regexp.MustCompile(`^[A-Za-z0-9.-]{1,20}$`)

	kinds    = set("error", "rejection", "render")
	browsers = set("safari", "chrome", "firefox", "edge", "samsung", "other")
	systems  = set("ios", "android", "windows", "macos", "linux", "other")

	errInvalid = errors.New("invalid report")
)

const (
	maxRouteLength   = 80
	maxMessageLength = 300
	maxCount         = 1000
)

func set(values ...string) map[string]bool {
	m := make(map[string]bool, len(values))
	for _, v := range values {
		m[v] = true
	}
	return m
}

// Validate checks every field against the contract; any failure is errInvalid (the answer never says which, nor echoes a value).
func (r Report) Validate() error {
	msgLen := utf8.RuneCountInString(r.Message)
	switch {
	case !kinds[r.Kind], !browsers[r.Browser], !systems[r.OS]:
	case len(r.Route) > maxRouteLength, !routePattern.MatchString(r.Route):
	case !versionPattern.MatchString(r.Version):
	case r.Count < 1, r.Count > maxCount:
	case msgLen < 1, msgLen > maxMessageLength, strings.TrimSpace(r.Message) == "":
	default:
		return nil
	}
	return errInvalid
}
