package reminder

import (
	"context"
	"encoding/json"
	"errors"
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

// Service turns reminders on and off per device, sends the due reminders and handles the
// "Tomada" action.
type Service struct {
	repo   *Repository
	sender Sender
	config Config
	now    func() time.Time
	// allowLocalEndpoints lets tests use an http://127.0.0.1 push service. Never set in production.
	allowLocalEndpoints bool
}

// NewService creates a reminder Service.
func NewService(repo *Repository, sender Sender, config Config) *Service {
	return &Service{repo: repo, sender: sender, config: config, now: time.Now}
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

// Tick claims the doses due now and pushes their reminder to each of the account's devices.
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
		return 0, err
	}

	var pushes []push
	for _, dose := range due {
		devices, err := s.repo.ActiveDevicesFor(ctx, dose.AccountID, dose.ScheduledAt)
		if err != nil {
			return 0, err
		}
		for _, device := range devices {
			token := SignActionToken(s.config.ActionSecret, dose.DoseID, device.ID, now.Add(actionTokenLifetime))
			body, err := json.Marshal(buildPayload(dose, token))
			if err != nil {
				return 0, err
			}
			pushes = append(pushes, push{device: device, payload: body})
		}
	}

	var (
		wg        sync.WaitGroup
		mu        sync.Mutex
		delivered int
		failed    int
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
				}
			default:
				failed++
			}
		}(p)
	}
	wg.Wait()
	if failed > 0 {
		log.Printf("reminder: %d of %d reminders could not be delivered", failed, len(pushes))
	}
	return delivered, nil
}

// buildPayload is what the service worker receives. Generic mode (also while the tutor hasn't
// chosen) carries no medication and no child at all (SC-005).
func buildPayload(dose DueDose, actionToken string) Payload {
	p := Payload{
		Kind:           DetailGeneric,
		DoseID:         dose.DoseID.String(),
		ConsultationID: dose.ConsultationID.String(),
		ScheduledAt:    dose.ScheduledAt.UTC().Format(time.RFC3339),
		ActionToken:    actionToken,
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
