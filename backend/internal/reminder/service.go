package reminder

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

// remindWindow: a dose whose time passed longer ago than this is no longer reminded — a reminder
// hours late confuses more than it helps (spec edge cases, FR-006).
const remindWindow = 60 * time.Minute

// sendConcurrency caps how many pushes go out at once in one tick.
const sendConcurrency = 8

// pushServiceHosts are the push services of the supported browsers (Chrome/Android, Firefox,
// Safari/iOS, Edge). A device endpoint must be an https URL on one of them: the server POSTs to
// whatever endpoint a tutor registers, so any other URL would let a request be sent anywhere.
var pushServiceHosts = []string{
	"fcm.googleapis.com",
	"updates.push.services.mozilla.com",
	"push.apple.com",
	"notify.windows.com",
}

// The kinds of failure the ticker reports (specs/018): each is grouped apart in error_logs.
const (
	failureTick    = "tick"
	failurePrepare = "prepare"
	failureDeliver = "deliver"
)

// FailureReporter records what fails in the ticker in error_logs (satisfied by *jobreport.Reporter). The messages are
// fixed sentences with counts: never an error from a third party, an address, a key or a token.
type FailureReporter interface {
	Report(kind, message string, accountID *uuid.UUID)
	Recovered(kind string)
}

// Service turns reminders on and off per device, sends the due reminders and handles the
// "Tomada" action.
type Service struct {
	repo     *Repository
	sender   Sender
	config   Config
	now      func() time.Time
	reporter FailureReporter // optional
	// allowLocalEndpoints lets tests use an http://127.0.0.1 push service. Never set in production.
	allowLocalEndpoints bool
}

// NewService creates a reminder Service.
func NewService(repo *Repository, sender Sender, config Config) *Service {
	return &Service{repo: repo, sender: sender, config: config, now: time.Now}
}

// SetReporter makes the ticker's failures also go to error_logs. Without one they only reach the console.
func (s *Service) SetReporter(r FailureReporter) { s.reporter = r }

// shouldReport says whether a failure goes to error_logs: there is a reporter and the server is not shutting down
// (which cancels the cycle and is not a failure). The call to Report stays in Tick itself — the row's file and line are
// the caller's, so a helper in between would make every row point at the helper.
func (s *Service) shouldReport(ctx context.Context) bool { return s.reporter != nil && ctx.Err() == nil }

func (s *Service) recovered(kind string) {
	if s.reporter != nil {
		s.reporter.Recovered(kind)
	}
}

// accountSet collects the accounts a cycle's failures belong to: the row names the account only when it is just one.
type accountSet map[uuid.UUID]struct{}

func (a accountSet) add(id uuid.UUID) { a[id] = struct{}{} }

func (a accountSet) single() *uuid.UUID {
	if len(a) != 1 {
		return nil
	}
	for id := range a {
		return &id
	}
	return nil
}

// Available reports whether reminders can be turned on (the server has its VAPID keys).
func (s *Service) Available() bool { return s.config.Available() }

// VAPIDPublicKey is the key a browser subscribes with; empty when not available.
func (s *Service) VAPIDPublicKey() string {
	if !s.Available() {
		return ""
	}
	return s.config.VAPIDPublicKey
}

// ActivateDevice turns reminders on for this browser in the account.
func (s *Service) ActivateDevice(ctx context.Context, accountID uuid.UUID, endpoint, p256dh, auth string) (Device, bool, error) {
	if !s.Available() {
		return Device{}, false, ErrRemindersUnavailable
	}
	var errs ValidationErrors
	if !s.validEndpoint(endpoint) {
		errs = append(errs, FieldError{Field: "endpoint", Message: "must be the https URL of a supported push service"})
	}
	if strings.TrimSpace(p256dh) == "" {
		errs = append(errs, FieldError{Field: "keys.p256dh", Message: "is required"})
	}
	if strings.TrimSpace(auth) == "" {
		errs = append(errs, FieldError{Field: "keys.auth", Message: "is required"})
	}
	if len(errs) > 0 {
		return Device{}, false, errs
	}
	return s.repo.UpsertDevice(ctx, accountID, endpoint, p256dh, auth)
}

// DeactivateDevice turns reminders off for this browser in the account.
func (s *Service) DeactivateDevice(ctx context.Context, accountID uuid.UUID, endpoint string) error {
	if strings.TrimSpace(endpoint) == "" {
		return ValidationErrors{{Field: "endpoint", Message: "is required"}}
	}
	return s.repo.DeactivateDevice(ctx, accountID, endpoint)
}

// MarkTakenWithToken marks the dose named by a reminder's "Tomada" token.
func (s *Service) MarkTakenWithToken(ctx context.Context, token string) error {
	if strings.TrimSpace(token) == "" {
		return ValidationErrors{{Field: "token", Message: "is required"}}
	}
	doseID, deviceID, err := VerifyActionToken(s.config.ActionSecret, token, s.now())
	if err != nil {
		return err
	}
	return s.repo.MarkTakenByAction(ctx, doseID, deviceID)
}

func (s *Service) validEndpoint(endpoint string) bool {
	u, err := url.Parse(endpoint)
	if err != nil || u.Host == "" {
		return false
	}
	host := strings.ToLower(u.Hostname())
	if s.allowLocalEndpoints && (host == "127.0.0.1" || host == "localhost") {
		return true
	}
	if u.Scheme != "https" {
		return false
	}
	for _, allowed := range pushServiceHosts {
		if host == allowed || strings.HasSuffix(host, "."+allowed) {
			return true
		}
	}
	return false
}

type push struct {
	device  Device
	payload []byte
}

// Tick claims the (dose, person) pairs due now and pushes each person's reminder to each of THEIR devices, with their own
// choice of detail (specs/032: a dose is reminded to every person with access, once each).
// It returns how many pushes were delivered. A device whose push service answers 404/410 is
// turned off; any other failure leaves it on and is not retried (the dose is already claimed:
// at most one reminder per dose, research.md R5).
func (s *Service) Tick(ctx context.Context) (int, error) {
	if !s.Available() {
		return 0, nil
	}
	now := s.now()
	due, err := s.repo.ClaimDueDoses(ctx, now, remindWindow)
	if err != nil {
		if s.shouldReport(ctx) {
			s.reporter.Report(failureTick, "reminder tick failed: could not read the due doses", nil)
		}
		return 0, err
	}
	// The routines' doses (specs/033) are claimed the same way. If reading them fails, the medications' ones — already
	// claimed — are still sent, and the failure is reported like a tick's.
	supplements, claimErr := s.repo.ClaimDueSupplementDoses(ctx, now, remindWindow)
	if claimErr != nil {
		if s.shouldReport(ctx) {
			s.reporter.Report(failureTick, "reminder tick failed: could not read the due doses", nil)
		}
	} else {
		due = append(due, supplements...)
		s.recovered(failureTick)
	}

	// The doses are already claimed: from here on a failure must only cost its own dose, never the
	// rest of the batch. Devices are read once per account (activated as late as now) and each dose
	// keeps those activated no later than itself.
	var (
		pushes       []push
		skipped      int
		skippedFor   = accountSet{}
		devicesByAcc = map[uuid.UUID][]Device{}
	)
	for _, dose := range due {
		devices, ok := devicesByAcc[dose.AccountID]
		if !ok {
			var err error
			if devices, err = s.repo.ActiveDevicesFor(ctx, dose.AccountID, now); err != nil {
				skipped++
				skippedFor.add(dose.AccountID)
				continue
			}
			devicesByAcc[dose.AccountID] = devices
		}
		for _, device := range devices {
			if device.ActivatedAt.After(dose.ScheduledAt) {
				continue
			}
			token := SignActionToken(s.config.ActionSecret, dose.DoseID, device.ID, now.Add(actionTokenLifetime))
			body, err := json.Marshal(buildPayload(dose, token))
			if err != nil {
				skipped++
				skippedFor.add(dose.AccountID)
				continue
			}
			pushes = append(pushes, push{device: device, payload: body})
		}
	}
	if skipped > 0 {
		log.Printf("reminder: %d reminders could not be prepared", skipped)
		if s.shouldReport(ctx) {
			s.reporter.Report(failurePrepare, fmt.Sprintf("%d reminders could not be prepared", skipped), skippedFor.single())
		}
	} else if len(due) > 0 {
		// Only a cycle that had something to prepare proves it works: an idle one says nothing.
		s.recovered(failurePrepare)
	}

	var (
		wg        sync.WaitGroup
		mu        sync.Mutex
		delivered int
		failed    int
		failedFor = accountSet{}
		slots     = make(chan struct{}, sendConcurrency)
	)
	for _, p := range pushes {
		wg.Add(1)
		slots <- struct{}{}
		go func(p push) {
			defer wg.Done()
			defer func() { <-slots }()
			result, _ := s.sender.Send(ctx, p.device, p.payload) // the error may carry the endpoint: never logged
			mu.Lock()
			defer mu.Unlock()
			switch result {
			case Delivered:
				delivered++
			case Gone:
				if err := s.repo.DeactivateByID(ctx, p.device.ID); err != nil {
					failed++
					failedFor.add(p.device.AccountID)
				}
			default:
				failed++
				failedFor.add(p.device.AccountID)
			}
		}(p)
	}
	wg.Wait()
	if failed > 0 {
		log.Printf("reminder: %d of %d reminders could not be delivered", failed, len(pushes))
		if s.shouldReport(ctx) {
			s.reporter.Report(failureDeliver, fmt.Sprintf("%d of %d reminders could not be delivered", failed, len(pushes)), failedFor.single())
		}
	} else if len(pushes) > 0 {
		s.recovered(failureDeliver)
	}
	return delivered, claimErr
}

// buildPayload is what the service worker receives. Generic mode (also while the tutor hasn't
// chosen) carries no medication and no child at all (SC-005).
func buildPayload(dose DueDose, actionToken string) Payload {
	p := Payload{
		Kind:        DetailGeneric,
		DoseID:      dose.DoseID.String(),
		ScheduledAt: dose.ScheduledAt.UTC().Format(time.RFC3339),
		ActionToken: actionToken,
	}
	if dose.Source == SourceSupplement {
		// A supplement's reminder points at its routine; the name is in the payload only in detailed mode, like a medication's.
		p.RoutineID = dose.RoutineID.String()
		p.Source = string(SourceSupplement)
	} else {
		p.ConsultationID = dose.ConsultationID.String()
	}
	if dose.Detail != nil && *dose.Detail == DetailDetailed {
		p.Kind = DetailDetailed
		p.Medication = dose.MedicationName
		p.Child = dose.ChildFirstName
	}
	return p
}

// IsValidationError reports whether err is a request validation failure.
func IsValidationError(err error) (ValidationErrors, bool) {
	var v ValidationErrors
	ok := errors.As(err, &v)
	return v, ok
}
