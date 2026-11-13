package backup

import (
	"fmt"
	"io"
	"strings"

	"filippo.io/age"
)

// Encrypt returns a writer whose input is encrypted to dst for every recipient (age, X25519). Close it to finish the file.
func Encrypt(dst io.Writer, recipients ...age.Recipient) (io.WriteCloser, error) {
	if len(recipients) == 0 {
		return nil, fmt.Errorf("encrypting a backup: no recipient")
	}
	w, err := age.Encrypt(dst, recipients...)
	if err != nil {
		return nil, fmt.Errorf("encrypting a backup: %w", err)
	}
	return w, nil
}

// Decrypt returns the plain content of an age file that was encrypted for identity.
func Decrypt(src io.Reader, identity age.Identity) (io.Reader, error) {
	r, err := age.Decrypt(src, identity)
	if err != nil {
		return nil, fmt.Errorf("decrypting a backup: %w", err)
	}
	return r, nil
}

// GenerateKey makes a new key pair: the public recipient (age1…) and the private identity (AGE-SECRET-KEY-1…).
func GenerateKey() (public, private string, err error) {
	id, err := age.GenerateX25519Identity()
	if err != nil {
		return "", "", fmt.Errorf("generating a backup key: %w", err)
	}
	return id.Recipient().String(), id.String(), nil
}

// ParseRecipient reads a public key (age1…).
func ParseRecipient(s string) (age.Recipient, error) {
	r, err := age.ParseX25519Recipient(strings.TrimSpace(s))
	if err != nil {
		return nil, fmt.Errorf("reading a backup public key: invalid")
	}
	return r, nil
}

// ParseIdentity reads a private key (AGE-SECRET-KEY-1…). The error never repeats the key.
func ParseIdentity(s string) (*age.X25519Identity, error) {
	id, err := age.ParseX25519Identity(strings.TrimSpace(s))
	if err != nil {
		return nil, fmt.Errorf("reading a backup private key: invalid")
	}
	return id, nil
}

// ParseIdentityFile reads the first private key of a key file (lines starting with "#" are comments, as age-keygen writes).
func ParseIdentityFile(content string) (*age.X25519Identity, error) {
	for _, line := range strings.Split(content, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		return ParseIdentity(line)
	}
	return nil, fmt.Errorf("reading a backup private key: the file has none")
}
