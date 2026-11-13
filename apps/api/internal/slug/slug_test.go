package slug

import (
	"regexp"
	"testing"
)

func TestSlugify(t *testing.T) {
	cases := []struct{ in, want string }{
		{"Bonjour Monde", "bonjour-monde"},
		{"  espaces   multiples  ", "espaces-multiples"},
		{"Déjà-vu été hôtel", "deja-vu-ete-hotel"},
		{"Ça va l'Oréal", "ca-va-loreal"},
		{"Test—em-dash-", "testem-dash"}, // tiret cadratin = caractère spécial ignoré
		{"123", "123"},
		{"a", "a"},
		{"", ""},
		{"!!!___***", ""},
		{"Mixte &%$# Symbole", "mixte-symbole"},
	}
	for _, c := range cases {
		if got := Slugify(c.in); got != c.want {
			t.Errorf("Slugify(%q) = %q, attendu %q", c.in, got, c.want)
		}
	}
}

func TestShortID_LengthAndAlphabet(t *testing.T) {
	re := regexp.MustCompile(`^[A-Za-z0-9]+$`)
	for _, n := range []int{-3, 0, 1, 8, 16, 24} {
		got := ShortID(n)
		wantLen := n
		if n <= 0 {
			wantLen = 8
		}
		if len(got) != wantLen {
			t.Fatalf("ShortID(%d) len = %d, attendu %d", n, len(got), wantLen)
		}
		if !re.MatchString(got) {
			t.Fatalf("ShortID(%d) = %q hors alphabet", n, got)
		}
	}
}

func TestShortID_Uniqueness(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 2000; i++ {
		s := ShortID(12)
		if seen[s] {
			t.Fatalf("collision: %q", s)
		}
		seen[s] = true
	}
}

func TestShortNumericCode(t *testing.T) {
	re := regexp.MustCompile(`^[1-9][0-9]{5}$`)
	seen := map[string]bool{}
	for i := 0; i < 500; i++ {
		code := ShortNumericCode()
		if !re.MatchString(code) {
			t.Fatalf("ShortNumericCode() = %q, attendu 6 chiffres ne commençant pas par 0", code)
		}
		seen[code] = true
	}
	if len(seen) < 450 {
		t.Fatalf("entropie insuffisante: %d codes distincts sur 500", len(seen))
	}
}

func TestExtractTrailingShortCode(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"mon-article-810839", "810839"},
		{"mon-article-12345", "12345"},
		{"mon-article-1234567890", "1234567890"},
		{"810839", "810839"},
		{"  mon-article-810839  ", "810839"},
		{"mon-article-012345", ""},
		{"mon-article-2024", ""},
		{"mon-article-12345678901", ""},
		{"mon-article-abc123", ""},
		{"mon-article-", ""},
		{"", ""},
	}
	for _, c := range cases {
		if got := ExtractTrailingShortCode(c.in); got != c.want {
			t.Errorf("ExtractTrailingShortCode(%q) = %q, attendu %q", c.in, got, c.want)
		}
	}
}