package consultation

import "testing"

func TestLooksLikeImage(t *testing.T) {
	cases := []struct {
		name string
		in   []byte
		want bool
	}{
		{"jpeg", []byte{0xff, 0xd8, 0xff, 0xe0, 0, 0x10}, true},
		{"png", []byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n', 0, 0}, true},
		{"gif87", []byte("GIF87a....."), true},
		{"gif89", []byte("GIF89a....."), true},
		{"webp", []byte("RIFF\x00\x00\x00\x00WEBPVP8 "), true},
		{"heic", []byte("\x00\x00\x00\x18ftypheic\x00\x00"), true},
		{"heif mif1", []byte("\x00\x00\x00\x18ftypmif1\x00\x00"), true},
		{"mp4 is not a photo", []byte("\x00\x00\x00\x18ftypmp42\x00\x00"), false},
		{"riff but not webp", []byte("RIFF\x00\x00\x00\x00WAVEfmt "), false},
		{"html", []byte("<html><script>alert(1)</script>"), false},
		{"pdf", []byte("%PDF-1.7"), false},
		{"empty", nil, false},
		{"short", []byte{0xff, 0xd8}, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := looksLikeImage(c.in); got != c.want {
				t.Fatalf("looksLikeImage(%q) = %v, want %v", c.name, got, c.want)
			}
		})
	}
}

