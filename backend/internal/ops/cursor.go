package ops

import (
	"encoding/base64"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/Ulisesgtz/medic-track/backend/internal/errorlog"
)

// encodeCursor turns where a page ended into the opaque text the client sends back for the next one.
func encodeCursor(c errorlog.Cursor) string {
	return base64.RawURLEncoding.EncodeToString([]byte(fmt.Sprintf("%d.%s", c.CreatedAt.UnixNano(), c.ID)))
}

// decodeCursor is the reverse; anything that isn't a cursor this service made is an error.
func decodeCursor(s string) (errorlog.Cursor, error) {
	raw, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return errorlog.Cursor{}, err
	}
	nanos, id, ok := strings.Cut(string(raw), ".")
	if !ok {
		return errorlog.Cursor{}, fmt.Errorf("malformed cursor")
	}
	n, err := strconv.ParseInt(nanos, 10, 64)
	if err != nil {
		return errorlog.Cursor{}, err
	}
	parsed, err := uuid.Parse(id)
	if err != nil {
		return errorlog.Cursor{}, err
	}
	return errorlog.Cursor{CreatedAt: time.Unix(0, n).UTC(), ID: parsed}, nil
}
