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
//	@securityDefinitions.apikey	OpsKey
//	@in							header
//	@name						Authorization
//	@description				Operation key (OPS_API_KEY), sent as "Bearer <key>"; only for the team that runs the service.
//	@BasePath		/
package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	clerk "github.com/clerk/clerk-sdk-go/v2"
	httpSwagger "github.com/swaggo/http-swagger/v2"

	"github.com/Ulisesgtz/medic-track/backend/internal/access"
	"github.com/Ulisesgtz/medic-track/backend/internal/account"
	"github.com/Ulisesgtz/medic-track/backend/internal/authmw"
	"github.com/Ulisesgtz/medic-track/backend/internal/catalog"
	"github.com/Ulisesgtz/medic-track/backend/internal/consultation"
	_ "github.com/Ulisesgtz/medic-track/backend/internal/docs"
	"github.com/Ulisesgtz/medic-track/backend/internal/errorlog"
	"github.com/Ulisesgtz/medic-track/backend/internal/family"
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
	"github.com/Ulisesgtz/medic-track/backend/internal/jobreport"
	"github.com/Ulisesgtz/medic-track/backend/internal/ops"
	"github.com/Ulisesgtz/medic-track/backend/internal/ownership"
	"github.com/Ulisesgtz/medic-track/backend/internal/platform"
	"github.com/Ulisesgtz/medic-track/backend/internal/reminder"
	"github.com/Ulisesgtz/medic-track/backend/internal/retention"
	"github.com/Ulisesgtz/medic-track/backend/internal/server"
)

func main() {
	// Cancelled on SIGINT/SIGTERM: stops the reminder scheduler and shuts the server down gracefully.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

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

	// Sharing with the family (specs/032): who can accept an invitation is decided by the session's verified e-mail.
	familyService := family.NewService(family.NewRepository(pool), access.NewRepository(pool), family.EmailFunc(func(ctx context.Context, clerkUserID string) (string, error) {
		email, err := account.VerifiedEmail(ctx, clerkUserID)
		if account.IsEmailNotVerified(err) {
			return "", family.ErrEmailNotVerified
		}
		return email, err
	}))
	familyHandler := family.NewHandler(familyService, responder)

	// Dose reminders (specs/011): without VAPID keys the API still runs, reminders are just unavailable.
	reminderConfig := reminder.ConfigFromEnv()
	reminderService := reminder.NewService(reminder.NewRepository(pool), reminder.NewWebPushSender(reminderConfig, nil), reminderConfig)
	reminderHandler := reminder.NewHandler(reminderService, responder)
	if reminderConfig.Available() {
		// What fails in the ticker also goes to error_logs (specs/018), grouped so a failure that lasts doesn't fill it.
		reminderService.SetReporter(jobreport.New(errorLogRepo, "reminders"))
		go reminderService.RunScheduler(ctx)
	} else {
		log.Printf("reminders unavailable: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT and REMINDER_ACTION_SECRET must all be set")
	}

	// The log doesn't grow forever (specs/021): once a day what is older than the retention is deleted, by batches; a failure
	// of that job is itself reported to error_logs like any background process's (specs/018).
	go retention.Run(ctx, errorLogRepo, jobreport.New(errorLogRepo, "error-logs-retention"), retention.ConfigFromEnv())

	// Operation queries over error_logs (specs/021): they exist only with a key; without one there is no such route.
	var opsHandler *ops.Handler
	opsKey := os.Getenv("OPS_API_KEY")
	if opsKey != "" {
		opsHandler = ops.NewHandler(errorLogRepo, responder)
	} else {
		log.Printf("operation queries disabled: OPS_API_KEY is not set")
	}

	frontendOrigin := os.Getenv("FRONTEND_ORIGIN")
	if frontendOrigin == "" {
		frontendOrigin = "http://localhost:5173"
	}

	r := server.NewRouter(server.Deps{
		Responder:      responder,
		Catalog:        catalogHandler,
		Account:        accountHandler,
		Consultation:   consultationHandler,
		Reminder:       reminderHandler,
		Family:         familyHandler,
		Ops:            opsHandler,
		OpsKey:         opsKey,
		Ownership:      ownership.NewRepository(pool),
		Access:         access.NewRepository(pool),
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

	srv := &http.Server{Addr: ":" + port, Handler: r, ReadHeaderTimeout: 10 * time.Second}
	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutdownCtx)
	}()

	log.Printf("PediTrack API listening on :%s", port)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("server error: %v", err)
	}
}
