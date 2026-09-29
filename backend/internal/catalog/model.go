// Package catalog exposes read-only access to reference data: the countries
// and states of the account signup form, and the symptoms a parent can mark on
// a consultation (specs/012).
package catalog

// Country represents an entry in the countries catalog.
type Country struct {
	Code string
	Name string
}

// State represents an entry in the states catalog, scoped to a Country.
type State struct {
	Code        string
	CountryCode string
	Name        string
}

// Symptom is an entry of the symptoms catalog: something a parent can observe,
// never a diagnosis (Principio I). Category is its group's title. Also what a
// consultation carries for each symptom marked on it (specs/012).
type Symptom struct {
	Code     string
	Name     string
	Category string
}
