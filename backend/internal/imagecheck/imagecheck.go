// Package imagecheck recognises an image by its first bytes (its signature). It keeps arbitrary files from being stored as «photos»
// (specs/037 for the prescription photo, specs/046 for the photos of the vaccination card). It reads only the signature: it does not
// decode or re-encode anything.
package imagecheck

import "bytes"

// LooksLike reports whether the bytes start like an image the app accepts: JPEG, PNG, GIF, WebP or HEIC/HEIF (what an iPhone can
// produce).
func LooksLike(b []byte) bool {
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
