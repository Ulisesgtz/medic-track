// Command api runs the PediTrack backend HTTP server.
//
//	@title			PediTrack API
//	@version		1.0
//	@description	Backend API for account/children signup and the país/estado catalog.
//	@description	See contracts/post-accounts.md and contracts/get-catalog.md under
//	@description	specs/001-registro-cuenta-usuario/ for the source-of-truth prose contracts.
//	@securityDefinitions.apikey	ClerkSession
//	@in							header
//	@name						Authorization
//	@description				Clerk session token, sent as "Bearer <token>".
//	@BasePath		/
package main

import (
	"context"
	"log"
	"net/http"
	"os"

	clerk "github.com/clerk/clerk-sdk-go/v2"
	httpSwagger "github.com/swaggo/http-swagger/v2"

	"github.com/Ulisesgtz/medic-track/backend/internal/account"
	"github.com/Ulisesgtz/medic-track/backend/internal/authmw"
	"github.com/Ulisesgtz/medic-track/backend/internal/catalog"
	"github.com/Ulisesgtz/medic-track/backend/internal/consultation"
	_ "github.com/Ulisesgtz/medic-track/backend/internal/docs"
	"github.com/Ulisesgtz/medic-track/backend/internal/errorlog"
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
	"github.com/Ulisesgtz/medic-track/backend/internal/ownership"
	"github.com/Ulisesgtz/medic-track/backend/internal/platform"
	"github.com/Ulisesgtz/medic-track/backend/internal/server"
)

func main() {
	ctx := context.Background()

	clerkSecretKey := os.Getenv("CLERK_SECRET_KEY")
	if clerkSecretKey == "" {
		log.Fatal("CLERK_SECRET_KEY is not set")
	}
	clerk.SetKey(clerkSecretKey)

	pool, err := platform.NewPostgresPool(ctx)
	if err != nil {
		log.Fatalf("connecting to database: %v", err)
	}
	defer pool.Close()

	errorLogRepo := errorlog.NewRepository(pool)
	responder := httpx.NewResponder(errorLogRepo)

	catalogRepo := catalog.NewRepository(pool)
	catalogHandler := catalog.NewHandler(catalogRepo, responder)

	accountRepo := account.NewRepository(pool)
	accountService := account.NewService(accountRepo)
	accountHandler := account.NewHandler(accountService, responder)

	consultationRepo := consultation.NewRepository(pool)
	consultationService := consultation.NewService(consultationRepo)
	consultationHandler := consultation.NewHandler(consultationService, responder)

	frontendOrigin := os.Getenv("FRONTEND_ORIGIN")
	if frontendOrigin == "" {
		frontendOrigin = "http://localhost:5173"
	}

	r := server.NewRouter(server.Deps{
		Responder:      responder,
		Catalog:        catalogHandler,
		Account:        accountHandler,
		Consultation:   consultationHandler,
		Ownership:      ownership.NewRepository(pool),
		FrontendOrigin: frontendOrigin,
		RequireSession: authmw.RequireSession(responder),
	})

	// Swagger UI, generated from the @swag annotations on the handlers below
	// (run `swag init` from backend/ after changing any of them — see
	// backend/CLAUDE.md).
	r.Get("/swagger/*", httpSwagger.WrapHandler)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("PediTrack API listening on :%s", port)
	if err := http.ListenAndServe(":"+port, r); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
