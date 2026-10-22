package vaccination_test

import (
	"encoding/base64"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/vaccination"
)

var jpegHead = []byte{0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 'J', 'F', 'I', 'F'}

func b64(b []byte) string { return base64.StdEncoding.EncodeToString(b) }

func TestDecodePhoto_AnImageIsAccepted(t *testing.T) {
	raw, errs := vaccination.DecodePhoto(b64(jpegHead))

	require.Empty(t, errs)
	require.Equal(t, jpegHead, raw)
}

func TestDecodePhoto_WhatIsNotAnImageOrNotBase64IsRefusedWithAFixedMessage(t *testing.T) {
	for name, input := range map[string]string{
		"empty":      "",
		"not base64": "%%%%no-es-base64%%%%",
		"a pdf":      b64([]byte("%PDF-1.7 ...")),
		"text":       b64([]byte("una nota de salud secreta")),
	} {
		_, errs := vaccination.DecodePhoto(input)
		require.Len(t, errs, 1, name)
		require.Equal(t, "photoBase64", errs[0].Field, name)
		require.NotContains(t, errs[0].Message, "secreta", name)
	}
}

func TestDecodePhoto_FiveMebibytesFitAndOneByteMoreDoesNot(t *testing.T) {
	const limit = 5 << 20
	fits := append(append([]byte{}, jpegHead...), make([]byte, limit-len(jpegHead))...)
	over := append(append([]byte{}, jpegHead...), make([]byte, limit-len(jpegHead)+1)...)

	_, ok := vaccination.DecodePhoto(b64(fits))
	_, tooBig := vaccination.DecodePhoto(b64(over))

	require.Empty(t, ok)
	require.Len(t, tooBig, 1)
	require.Equal(t, "photoBase64", tooBig[0].Field)
	require.True(t, strings.Contains(tooBig[0].Message, "5 MB"))
}

func TestMaxPhotosPerChildIsTen(t *testing.T) {
	require.Equal(t, 10, vaccination.MaxPhotosPerChild)
}
