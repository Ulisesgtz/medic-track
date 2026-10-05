package httpx

// FieldError is one request field that failed validation.
type FieldError struct {
	Field   string
	Message string
}

// ValidationBody is the one shape of every 400 "validation_error" body in the API:
// {"error":"validation_error","message":…,"details":[{"field":…,"message":…}]}. Only data shaping:
// handlers still write it through their Responder, so each call site keeps its own error_logs entry.
func ValidationBody(message string, errs []FieldError) map[string]any {
	details := make([]map[string]string, 0, len(errs))
	for _, e := range errs {
		details = append(details, map[string]string{"field": e.Field, "message": e.Message})
	}
	return map[string]any{"error": "validation_error", "message": message, "details": details}
}
