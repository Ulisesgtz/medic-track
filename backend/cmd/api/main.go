// Command api runs the PediTrack backend HTTP server.
package main

import (
	"context"
	"log"
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"github.com/Ulisesgtz/medic-track/backend/internal/account"
	"github.com/Ulisesgtz/medic-track/backend/internal/catalog"
	"github.com/Ulisesgtz/medic-track/backend/internal/platform"
)

func main() {
	ctx := context.Background()

	pool, err := platform.NewPostgresPool(ctx)
	if err != nil {
		log.Fatalf("connecting to database: %v", err)
	}
	defer pool.Close()

	catalogRepo := catalog.NewRepository(pool)
	catalogHandler := catalog.NewHandler(catalogRepo)

	accountRepo := account.NewRepository(pool)
	accountService := account.NewService(accountRepo)
	accountHandler := account.NewHandler(accountService)

	frontendOrigin := os.Getenv("FRONTEND_ORIGIN")
	if frontendOrigin == "" {
		frontendOrigin = "http://localhost:5173"
	}

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{frontendOrigin},
		AllowedMethods:   []string{"GET", "POST", "OPTIONS"},
		AllowedHeaders:   []string{"Content-Type"},
		AllowCredentials: false,
		MaxAge:           300,
	}))

	r.Get("/catalog/countries", catalogHandler.ListCountries)
	r.Get("/catalog/countries/{countryCode}/states", catalogHandler.ListStates)

	r.Post("/accounts", accountHandler.CreateAccount)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("PediTrack API listening on :%s", port)
	if err := http.ListenAndServe(":"+port, r); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
