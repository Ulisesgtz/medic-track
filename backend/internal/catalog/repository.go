package catalog

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Repository provides read-only access to the countries/states catalog.
type Repository struct {
	pool *pgxpool.Pool
}

// NewRepository creates a catalog Repository backed by the given pool.
func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

// ListCountries returns every country in the catalog, ordered by name.
func (r *Repository) ListCountries(ctx context.Context) ([]Country, error) {
	rows, err := r.pool.Query(ctx, `SELECT code, name FROM countries ORDER BY name`)
	if err != nil {
		return nil, fmt.Errorf("querying countries: %w", err)
	}
	defer rows.Close()

	var countries []Country
	for rows.Next() {
		var c Country
		if err := rows.Scan(&c.Code, &c.Name); err != nil {
			return nil, fmt.Errorf("scanning country: %w", err)
		}
		countries = append(countries, c)
	}
	return countries, rows.Err()
}

// CountryExists reports whether a country with the given code is in the catalog.
func (r *Repository) CountryExists(ctx context.Context, countryCode string) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM countries WHERE code = $1)`, countryCode).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("checking country existence: %w", err)
	}
	return exists, nil
}

// ListStatesByCountry returns every state belonging to countryCode, ordered by name.
func (r *Repository) ListStatesByCountry(ctx context.Context, countryCode string) ([]State, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT code, country_code, name FROM states WHERE country_code = $1 ORDER BY name`,
		countryCode,
	)
	if err != nil {
		return nil, fmt.Errorf("querying states: %w", err)
	}
	defer rows.Close()

	var states []State
	for rows.Next() {
		var s State
		if err := rows.Scan(&s.Code, &s.CountryCode, &s.Name); err != nil {
			return nil, fmt.Errorf("scanning state: %w", err)
		}
		states = append(states, s)
	}
	return states, rows.Err()
}
