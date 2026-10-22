package imagecheck_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/imagecheck"
)

func TestLooksLike_TheSignaturesOfTheAcceptedFormats(t *testing.T) {
	heic := append([]byte{0, 0, 0, 24}, []byte("ftypheic")...)
	webp := append([]byte("RIFF\x00\x00\x00\x00"), []byte("WEBPVP8 ")...)
	for name, b := range map[string][]byte{
		"jpeg":  {0xff, 0xd8, 0xff, 0xe0},
		"png":   {0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n', 0},
		"gif87": []byte("GIF87a..."),
		"gif89": []byte("GIF89a..."),
		"webp":  webp,
		"heic":  heic,
	} {
		require.True(t, imagecheck.LooksLike(b), name)
	}
}

func TestLooksLike_NothingElseIsAPhoto(t *testing.T) {
	for name, b := range map[string][]byte{
		"empty":         nil,
		"text":          []byte("hola, esto no es una foto"),
		"pdf":           []byte("%PDF-1.7"),
		"script":        []byte("<script>alert(1)</script>"),
		"riff-not-webp": append([]byte("RIFF\x00\x00\x00\x00"), []byte("WAVEfmt ")...),
		"ftyp-not-heif": append([]byte{0, 0, 0, 24}, []byte("ftypmp42")...),
		"short":         {0xff, 0xd8},
	} {
		require.False(t, imagecheck.LooksLike(b), name)
	}
}
