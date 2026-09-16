// Package httpx holds tiny HTTP response helpers shared by every handler
// package, so the JSON error envelope shape is defined in exactly one place.
package httpx

import (
	"encoding/json"
	"net/http"
)

// WriteJSON writes body as a JSON response with the given status code.
func WriteJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

// WriteJSONError writes a {"error": code, "message": message} JSON body.
func WriteJSONError(w http.ResponseWriter, status int, code, message string) {
	WriteJSON(w, status, map[string]string{"error": code, "message": message})
}
