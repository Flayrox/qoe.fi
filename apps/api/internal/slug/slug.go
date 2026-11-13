// Package slug reproduit les helpers @qoe/utils (slugify + shortId) côté Go.
package slug

import (
	"crypto/rand"
	"math/big"
	"regexp"
	"strconv"
	"strings"
	"time"
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

var trailingShortCodeRe = regexp.MustCompile(`^[1-9][0-9]{4,9}$`)

// ShortNumericCode génère un code numérique aléatoire crypto-sûr à 6 chiffres
// compris entre 100000 et 999999 (ne commence jamais par 0).
func ShortNumericCode() string {
	n, err := rand.Int(rand.Reader, big.NewInt(900000))
	if err != nil {
		return strconv.FormatInt(100000+(time.Now().UnixNano()%900000), 10)
	}
	return strconv.FormatInt(100000+n.Int64(), 10)
}

// ExtractTrailingShortCode extrait le suffixe numérique final d'un slug
// (ex. "mon-article-810839" → "810839") s'il est valide (^[1-9][0-9]{4,9}$).
func ExtractTrailingShortCode(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	tail := s
	if idx := strings.LastIndexByte(s, '-'); idx >= 0 {
		tail = s[idx+1:]
	}
	if trailingShortCodeRe.MatchString(tail) {
		return tail
	}
	return ""
}
