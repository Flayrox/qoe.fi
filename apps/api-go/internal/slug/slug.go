// Package slug reproduit les helpers @qoe/utils (slugify + shortId) côté Go.
package slug

import (
	"crypto/rand"
	"math/big"
	"strings"
	"unicode"

	"golang.org/x/text/unicode/norm"
)

// Slugify convertit un texte en slug URL-safe (miroir @qoe/utils slugify).
func Slugify(input string) string {
	s := strings.ToLower(strings.TrimSpace(input))
	s = norm.NFD.String(s) // décompose les accents (é → e + ́)

	var b strings.Builder
	lastDash := false
	for _, r := range s {
		if unicode.Is(unicode.Mn, r) {
			continue // marque diacritique
		}
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
			lastDash = false
		case r == ' ' || r == '-' || unicode.IsSpace(r):
			if !lastDash && b.Len() > 0 {
				b.WriteByte('-')
				lastDash = true
			}
		default:
			// caractère spécial : ignoré (parité TS)
		}
	}
	return strings.Trim(b.String(), "-")
}

const shortIDAlphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

// ShortID génère un id court alphanumérique (miroir @qoe/utils shortId).
func ShortID(length int) string {
	if length <= 0 {
		length = 8
	}
	b := make([]byte, length)
	for i := range b {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(shortIDAlphabet))))
		if err != nil {
			b[i] = shortIDAlphabet[i%len(shortIDAlphabet)]
			continue
		}
		b[i] = shortIDAlphabet[n.Int64()]
	}
	return string(b)
}
