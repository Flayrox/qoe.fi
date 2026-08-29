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