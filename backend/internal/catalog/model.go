// Package catalog exposes read-only access to the country/state reference data
// used by the account signup form's country and state selectors.
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
