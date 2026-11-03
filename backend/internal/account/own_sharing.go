package account

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/Ulisesgtz/medic-track/backend/internal/access"
)

// A person's own consultations (specs/058-consultas-del-titular), as the account response tells them: whether the person
// shares theirs with the Tutors of their family, and whose are shared with the person.

// ConsultationSharing is the state of the person's switch; ChangedAt is nil while it was never touched (off).
type ConsultationSharing struct {
	Shared    bool
	ChangedAt *time.Time
}

// SharedProfile is a person who shares their own consultations with this account, and it can still see them.
type SharedProfile struct {
	AccountID uuid.UUID
	FirstName string
}

// addOwnSharing fills ConsultationSharing and SharedProfiles. The profiles are decided by the same rule as the routes
// (access.OwnLevelSQL): only people of the account's family who share, and only while the account is its owner or a Tutor.
func (r *Repository) addOwnSharing(ctx context.Context, acc *Account) error {
	var shared bool
	var at time.Time
	err := r.pool.QueryRow(ctx, `SELECT shared, changed_at FROM own_consultation_sharing WHERE account_id = $1`, acc.ID).Scan(&shared, &at)
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		acc.ConsultationSharing = ConsultationSharing{}
	case err != nil:
		return fmt.Errorf("reading the consultation sharing: %w", err)
	default:
		acc.ConsultationSharing = ConsultationSharing{Shared: shared, ChangedAt: &at}
	}

	rows, err := r.pool.Query(ctx, `
		WITH fam AS (
			SELECT $1::uuid AS fam WHERE EXISTS (SELECT 1 FROM family_members pm WHERE pm.family_account_id = $1 AND pm.status = 'active')
			UNION ALL
			SELECT pm.family_account_id FROM family_members pm WHERE pm.account_id = $1 AND pm.status = 'active'
		)
		SELECT p.id, p.first_name
		FROM accounts p
		JOIN own_consultation_sharing sh ON sh.account_id = p.id AND sh.shared
		JOIN accounts a ON a.id = $1
		WHERE p.id <> a.id
		  AND (p.id IN (SELECT fam FROM fam)
		       OR p.id IN (SELECT fm.account_id FROM family_members fm JOIN fam ON fm.family_account_id = fam.fam WHERE fm.status = 'active'))
		  AND (`+access.OwnLevelSQL("p.id")+`) >= 1
		ORDER BY p.first_name, p.id`, acc.ID)
	if err != nil {
		return fmt.Errorf("querying the shared profiles: %w", err)
	}
	defer rows.Close()
	acc.SharedProfiles = make([]SharedProfile, 0)
	for rows.Next() {
		var p SharedProfile
		if err := rows.Scan(&p.AccountID, &p.FirstName); err != nil {
			return fmt.Errorf("scanning a shared profile: %w", err)
		}
		acc.SharedProfiles = append(acc.SharedProfiles, p)
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterating the shared profiles: %w", err)
	}
	return nil
}

type consultationSharingResponse struct {
	Shared    bool    `json:"shared" example:"false"`
	ChangedAt *string `json:"changedAt" example:"2026-11-02T15:20:00Z"`
}

type sharedProfileResponse struct {
	AccountID string `json:"accountId" example:"e5f6a7b8-0000-0000-0000-000000000000"`
	FirstName string `json:"firstName" example:"Ana"`
}

func toOwnSharingResponse(acc *Account) (consultationSharingResponse, []sharedProfileResponse) {
	sharing := consultationSharingResponse{Shared: acc.ConsultationSharing.Shared}
	if at := acc.ConsultationSharing.ChangedAt; at != nil {
		s := at.UTC().Format(time.RFC3339)
		sharing.ChangedAt = &s
	}
	profiles := make([]sharedProfileResponse, 0, len(acc.SharedProfiles))
	for _, p := range acc.SharedProfiles {
		profiles = append(profiles, sharedProfileResponse{AccountID: p.AccountID.String(), FirstName: p.FirstName})
	}
	return sharing, profiles
}
