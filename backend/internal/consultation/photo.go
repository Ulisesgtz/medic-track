package consultation

import "bytes"

// looksLikeImage reports whether the bytes start like an image the app accepts for a prescription photo: JPEG, PNG, GIF,
// WebP or HEIC/HEIF (what an iPhone can produce). Only the first bytes are read (the signature); it keeps arbitrary
// files from being stored as "photos" (specs/037).
func looksLikeImage(b []byte) bool {
	switch {
	case bytes.HasPrefix(b, []byte{0xff, 0xd8, 0xff}): // JPEG
		return true
	case bytes.HasPrefix(b, []byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'}): // PNG
		return true
	case bytes.HasPrefix(b, []byte("GIF87a")) || bytes.HasPrefix(b, []byte("GIF89a")): // GIF
		return true
	case len(b) >= 12 && bytes.Equal(b[0:4], []byte("RIFF")) && bytes.Equal(b[8:12], []byte("WEBP")): // WebP
		return true
	case len(b) >= 12 && bytes.Equal(b[4:8], []byte("ftyp")) && isHeifBrand(b[8:12]): // HEIC / HEIF
		return true
	}
	return false
}

func isHeifBrand(brand []byte) bool {
	for _, known := range []string{"heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"} {
		if string(brand) == known {
			return true
		}
	}
	return false
}
