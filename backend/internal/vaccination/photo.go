package vaccination

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/Ulisesgtz/medic-track/backend/internal/imagecheck"
)

const (
	// MaxPhotosPerChild is how many photos of the paper card a child can keep (every plan). It is a storage safeguard, not a feature
	// of the paid plan (Principio IV).
	MaxPhotosPerChild = 10
	// maxPhotoBytes caps one decoded photo. A JPEG the phone scaled down weighs well under a megabyte; the margin covers an original
	// the browser could not shrink.
	maxPhotoBytes = 5 << 20
)

// ErrPhotoNotFound is a photo that doesn't exist or belongs to another child.
var ErrPhotoNotFound = errors.New("photo not found")

// PhotoMeta is a photo as the list shows it: never the image itself, which is asked for one at a time.
type PhotoMeta struct {
	ID            uuid.UUID
	ChildID       uuid.UUID
	CreatedAt     time.Time
	CreatedByName string
}

// DecodePhoto turns the base64 a client sent into the image bytes, checking that it is an image the app accepts and that it is not
// over the limit. The messages are fixed and never repeat anything about the file.
func DecodePhoto(photoBase64 string) ([]byte, ValidationErrors) {
	if photoBase64 == "" {
		return nil, ValidationErrors{{Field: "photoBase64", Message: "Elige una foto."}}
	}
	raw, err := base64.StdEncoding.DecodeString(photoBase64)
	if err != nil || !imagecheck.LooksLike(raw) {
		return nil, ValidationErrors{{Field: "photoBase64", Message: "El archivo no es una imagen que podamos guardar."}}
	}
	if len(raw) > maxPhotoBytes {
		return nil, ValidationErrors{{Field: "photoBase64", Message: "La foto pesa más de 5 MB."}}
	}
	return raw, nil
}

// AddPhoto saves a photo of the card in one transaction that locks the child's row, so two uploads at once can't both take the last
// place (ErrPhotoLimit). Only the transaction is used inside it, never the pool.
func (r *Repository) AddPhoto(ctx context.Context, childID, actor uuid.UUID, photo []byte) (*PhotoMeta, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("starting transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var accountID uuid.UUID
	if err := tx.QueryRow(ctx, `SELECT account_id FROM children WHERE id = $1 FOR UPDATE`, childID).Scan(&accountID); errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrChildNotFound
	} else if err != nil {
		return nil, fmt.Errorf("locking the child: %w", err)
	}
	var kept int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM vaccine_card_photos WHERE child_id = $1`, childID).Scan(&kept); err != nil {
		return nil, fmt.Errorf("counting the photos: %w", err)
	}
	if kept >= MaxPhotosPerChild {
		return nil, ErrPhotoLimit
	}
	var meta PhotoMeta
	meta.ChildID = childID
	err = tx.QueryRow(ctx, `
		WITH saved AS (
			INSERT INTO vaccine_card_photos (child_id, account_id, photo, created_by_account_id) VALUES ($1, $2, $3, $4) RETURNING id, created_at
		)
		SELECT saved.id, saved.created_at, a.first_name FROM saved, accounts a WHERE a.id = $4`,
		childID, accountID, photo, actor).Scan(&meta.ID, &meta.CreatedAt, &meta.CreatedByName)
	if err != nil {
		return nil, fmt.Errorf("saving the photo: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("committing the photo: %w", err)
	}
	return &meta, nil
}

// ListPhotos is the child's photos in the order they were saved, without the images.
func (r *Repository) ListPhotos(ctx context.Context, childID uuid.UUID) ([]PhotoMeta, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT p.id, p.child_id, p.created_at, a.first_name
		FROM vaccine_card_photos p JOIN accounts a ON a.id = p.created_by_account_id
		WHERE p.child_id = $1 ORDER BY p.created_at, p.id`, childID)
	if err != nil {
		return nil, fmt.Errorf("listing the photos: %w", err)
	}
	defer rows.Close()
	out := []PhotoMeta{}
	for rows.Next() {
		var m PhotoMeta
		if err := rows.Scan(&m.ID, &m.ChildID, &m.CreatedAt, &m.CreatedByName); err != nil {
			return nil, fmt.Errorf("scanning a photo: %w", err)
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// GetPhoto is the image of one photo of the child.
func (r *Repository) GetPhoto(ctx context.Context, childID, id uuid.UUID) ([]byte, error) {
	var photo []byte
	err := r.pool.QueryRow(ctx, `SELECT photo FROM vaccine_card_photos WHERE id = $1 AND child_id = $2`, id, childID).Scan(&photo)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrPhotoNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("reading the photo: %w", err)
	}
	return photo, nil
}

// DeletePhoto removes a photo of the child for good.
func (r *Repository) DeletePhoto(ctx context.Context, childID, id uuid.UUID) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM vaccine_card_photos WHERE id = $1 AND child_id = $2`, id, childID)
	if err != nil {
		return fmt.Errorf("deleting the photo: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrPhotoNotFound
	}
	return nil
}

// AddPhoto validates and saves a photo.
func (s *Service) AddPhoto(ctx context.Context, childID, actor uuid.UUID, photoBase64 string) (*PhotoMeta, error) {
	raw, errs := DecodePhoto(photoBase64)
	if len(errs) > 0 {
		return nil, errs
	}
	return s.repo.AddPhoto(ctx, childID, actor, raw)
}

// ListPhotos is the child's photos, without the images.
func (s *Service) ListPhotos(ctx context.Context, childID uuid.UUID) ([]PhotoMeta, error) {
	return s.repo.ListPhotos(ctx, childID)
}

// GetPhoto is the image of one photo.
func (s *Service) GetPhoto(ctx context.Context, childID, id uuid.UUID) ([]byte, error) {
	return s.repo.GetPhoto(ctx, childID, id)
}

// DeletePhoto removes a photo.
func (s *Service) DeletePhoto(ctx context.Context, childID, id uuid.UUID) error {
	return s.repo.DeletePhoto(ctx, childID, id)
}
