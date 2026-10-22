package consultation

import "github.com/Ulisesgtz/medic-track/backend/internal/imagecheck"

// looksLikeImage reports whether the bytes start like an image the app accepts for a prescription photo (specs/037). The signature
// check is shared with the vaccination card's photos (specs/046), in package imagecheck.
func looksLikeImage(b []byte) bool { return imagecheck.LooksLike(b) }
