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
	"strconv"
	"strings"
	"syscall"
	"time"

	clerk "github.com/clerk/clerk-sdk-go/v2"
	httpSwagger "github.com/swaggo/http-swagger/v2"

	"github.com/Ulisesgtz/medic-track/backend/internal/access"
	"github.com/Ulisesgtz/medic-track/backend/internal/account"
	"github.com/Ulisesgtz/medic-track/backend/internal/appointment"
	"github.com/Ulisesgtz/medic-track/backend/internal/authmw"
	"github.com/Ulisesgtz/medic-track/backend/internal/catalog"
	"github.com/Ulisesgtz/medic-track/backend/internal/consultation"
	_ "github.com/Ulisesgtz/medic-track/backend/internal/docs"
	"github.com/Ulisesgtz/medic-track/backend/internal/errordigest"
	"github.com/Ulisesgtz/medic-track/backend/internal/errorlog"
	"github.com/Ulisesgtz/medic-track/backend/internal/family"
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
	"github.com/Ulisesgtz/medic-track/backend/internal/jobreport"
	"github.com/Ulisesgtz/medic-track/backend/internal/mailer"
	"github.com/Ulisesgtz/medic-track/backend/internal/ops"
	"github.com/Ulisesgtz/medic-track/backend/internal/ownership"
	"github.com/Ulisesgtz/medic-track/backend/internal/payments"
	"github.com/Ulisesgtz/medic-track/backend/internal/platform"
	"github.com/Ulisesgtz/medic-track/backend/internal/ratelimit"
	"github.com/Ulisesgtz/medic-track/backend/internal/reminder"
	"github.com/Ulisesgtz/medic-track/backend/internal/retention"
	"github.com/Ulisesgtz/medic-track/backend/internal/server"
	"github.com/Ulisesgtz/medic-track/backend/internal/supplement"
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

	// Supplement routines (specs/033): the plan and the cap of active routines are decided by the repository, under a lock.
	supplementRepo := supplement.NewRepository(pool)
	supplementHandler := supplement.NewHandler(supplement.NewService(supplementRepo), responder)
	// The planner keeps every active routine's doses generated ahead (it only adds; what fails goes to error_logs as job:supplements).
	go supplement.RunPlanner(ctx, supplementRepo, jobreport.New(errorLogRepo, "supplements"), supplement.PlannerInterval)

	// The next appointment of a consultation (specs/033, part 2): plan and one-scheduled-per-consultation under the owner's lock.
	appointmentHandler := appointment.NewHandler(appointment.NewService(appointment.NewRepository(pool)), responder)

	// Sharing with the family (specs/032): who can accept an invitation is decided by the session's verified e-mail.
	familyService := family.NewService(family.NewRepository(pool), access.NewRepository(pool), family.EmailFunc(func(ctx context.Context, clerkUserID string) (string, error) {
		email, err := account.VerifiedEmail(ctx, clerkUserID)
		if account.IsEmailNotVerified(err) {
			return "", family.ErrEmailNotVerified
		}
		return email, err
	}))
	familyHandler := family.NewHandler(familyService, responder)

	// The e-mail of the invitations (specs/040) and the daily quota it shares with the weekly digest. Without the provider's key
	// (or MAIL_DRIVER=discard) or without FRONTEND_ORIGIN nothing is e-mailed and the link is copied by hand, as before; the
	// console says which variable is missing and never a value.
	mailConfig := mailer.ConfigFromEnv()
	// mailStopped is closed when the invitations' e-mail queue has been closed after a shutdown.
	var mailStopped chan struct{}
	// One reporter for the quota and the dispatcher, so the failures of the mailer are grouped together.
	mailReporter := jobreport.New(errorLogRepo, "mailer")
	mailQuota := mailer.NewQuota(mailer.NewRepository(pool), mailConfig, mailReporter)
	if mailOrigin := os.Getenv("FRONTEND_ORIGIN"); mailConfig.Available() && mailOrigin != "" {
		dispatcher := family.NewEmailDispatcher(family.NewRepository(pool), mailer.NewSender(mailConfig, nil), mailQuota, mailReporter)
		mailStopped = make(chan struct{})
		go func() { dispatcher.Start(ctx); close(mailStopped) }()
		familyService.SetEmail(family.EmailSettings{
			Dispatcher: dispatcher, From: mailConfig.From, Origin: mailOrigin,
			PerInvitation: mailConfig.PerInvitationPerDay, PerFamily: mailConfig.PerFamilyPerDay,
		})
	} else {
		log.Print("invitation e-mails unavailable: RESEND_API_KEY (or MAIL_DRIVER=discard) and FRONTEND_ORIGIN must be set")
	}

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
	retentionConfig := retention.ConfigFromEnv()
	go retention.Run(ctx, errorLogRepo, jobreport.New(errorLogRepo, "error-logs-retention"), retentionConfig)

	// The weekly digest of those errors by e-mail (specs/039): without the provider's key the API still runs, the digest just
	// doesn't (the console says so once, naming the variable and never a value). What fails in it goes to error_logs as
	// job:error-digest.
	digestConfig := errordigest.ConfigFromEnv()
	if digestConfig.Available() {
		digest := errordigest.NewService(errorLogRepo, mailer.NewResendSender(digestConfig.APIKey, nil, ""), errordigest.NewRepository(pool), digestConfig, retentionConfig.Days)
		digest.SetReporter(jobreport.New(errorLogRepo, "error-digest"))
		digest.SetQuota(mailQuota) // the same daily quota the invitations use: the digest keeps the places they leave
		go digest.Run(ctx)
	} else {
		log.Print(digestConfig.UnavailableReason())
	}

	// The subscription of the full plan with Mercado Pago (specs/045). Without its configuration the charge is "not available": none of
	// its routes exist, /planes keeps the «Pronto» button and a plan is given by hand, as before. The console names what is missing,
	// never a value. PAYMENTS_DRIVER=fake runs everything against an in-memory provider (tests and development only).
	var paymentsHandler *payments.Handler
	paymentsConfig := payments.ConfigFromEnv()
	if paymentsConfig.Available() {
		var provider payments.Provider
		var fakeProvider *payments.Fake
		if paymentsConfig.Fake() {
			fakeProvider = payments.NewFake(paymentsConfig.FrontendOrigin)
			provider = fakeProvider
			log.Print("PAYMENTS_DRIVER=fake: the payment provider is simulated and its helper routes are enabled (testing only)")
		} else {
			provider = payments.NewMercadoPago(paymentsConfig.AccessToken, "")
			if paymentsConfig.WebhookSecret == "" {
				log.Print("MERCADOPAGO_WEBHOOK_SECRET is empty: notices are accepted without a signature (the resource is always re-read from the provider); set it before charging for real")
			}
		}
		paymentsService := payments.NewService(payments.NewRepository(pool, family.NewRepository(pool)), provider, paymentsConfig)
		paymentsService.SetReporter(jobreport.New(errorLogRepo, "payments"))
		paymentsHandler = payments.NewHandler(paymentsService, responder, paymentsConfig)
		// Grace periods, paid periods and pending subscriptions that run out, and the healing of a lost notice (job:payments).
		go payments.RunSweeper(ctx, paymentsService, payments.SweepInterval)
		if fakeProvider != nil {
			paymentsHandler = paymentsHandler.WithFake(fakeProvider)
		}
	} else {
		log.Printf("payments not available: missing %v", paymentsConfig.Missing())
	}

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

	// Requests per minute per client address (specs/037). RATE_LIMIT_PER_MINUTE=0 turns the limit off. TRUSTED_PROXY_HOPS is
	// how many proxies stand in front of the API (Railway = 1; with Cloudflare in front of Railway = 2).
	rateLimit, strictLimit := envInt("RATE_LIMIT_PER_MINUTE", 240), envInt("RATE_LIMIT_STRICT_PER_MINUTE", 20)
	proxyHops := envInt("TRUSTED_PROXY_HOPS", 1)
	var generalMW, strictMW func(http.Handler) http.Handler
	if rateLimit > 0 {
		generalMW = ratelimit.Middleware(ratelimit.New(rateLimit, time.Minute), responder, proxyHops)
	}
	if strictLimit > 0 {
		strictMW = ratelimit.Middleware(ratelimit.New(strictLimit, time.Minute), responder, proxyHops)
	}

	r := server.NewRouter(server.Deps{
		RateLimit:       generalMW,
		StrictRateLimit: strictMW,
		Responder:       responder,
		Catalog:         catalogHandler,
		Account:         accountHandler,
		Consultation:    consultationHandler,
		Reminder:        reminderHandler,
		Family:          familyHandler,
		Supplement:      supplementHandler,
		Appointment:     appointmentHandler,
		Payments:        paymentsHandler,
		Ops:             opsHandler,
		OpsKey:          opsKey,
		Ownership:       ownership.NewRepository(pool),
		Access:          access.NewRepository(pool),
		FrontendOrigin:  frontendOrigin,
		RequireSession:  authmw.RequireSession(responder, authmw.PartyOptions(os.Getenv("CLERK_AUTHORIZED_PARTIES"))...),
	})

	// Swagger UI, generated from the @swag annotations on the handlers below
	// (run `swag init` from backend/ after changing any of them — see
	// backend/CLAUDE.md).
	// Only on a developer's machine, or when SWAGGER_ENABLED=true: a deployed API does not describe itself (specs/037).
	if server.SwaggerEnabled(os.Getenv("SWAGGER_ENABLED"), os.Getenv("FRONTEND_ORIGIN")) {
		r.Get("/swagger/*", httpSwagger.WrapHandler)
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	// The timeouts keep a slow or idle connection from holding the server (the largest body is the 11 MiB consultation with
	// its photo: two minutes are enough even on a poor mobile connection).
	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           r,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       2 * time.Minute,
		WriteTimeout:      2 * time.Minute,
		IdleTimeout:       2 * time.Minute,
	}
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
	// The e-mails still queued are closed as failed (so no invitation waits "sending" forever); a few seconds are enough for it.
	if mailStopped != nil {
		select {
		case <-mailStopped:
		case <-time.After(5 * time.Second):
		}
	}
}

// envInt reads an integer environment variable; unset or invalid gives def.
func envInt(name string, def int) int {
	if v, err := strconv.Atoi(strings.TrimSpace(os.Getenv(name))); err == nil && v >= 0 {
		return v
	}
	return def
}
