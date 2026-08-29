package seed

import (
	"strings"
	"testing"
)

func TestPrngHelpers(t *testing.T) {
	p := newPRNG(42)
	// intn borné.
	if n := p.intn(0); n != 0 {
		t.Fatalf("intn(0) = %d, attendu 0", n)
	}
	for i := 0; i < 50; i++ {
		if n := p.intn(10); n < 0 || n >= 10 {
			t.Fatalf("intn(10) = %d hors bornes", n)
		}
	}
	// prngPick : liste vide → zero, sinon toujours dans la liste.
	if v := prngPick(p, []string{}); v != "" {
		t.Fatalf("prngPick(vide) = %q", v)
	}
	items := []string{"a", "b", "c"}
	for i := 0; i < 50; i++ {
		v := prngPick(p, items)
		found := false
		for _, it := range items {
			if it == v {
				found = true
			}
		}
		if !found {
			t.Fatalf("prngPick = %q hors liste", v)
		}
	}
}

func TestTopFirstName(t *testing.T) {
	p := newPRNG(7)
	// MALE/FEMALE → pools respectifs (les pools sont non vides).
	for i := 0; i < 20; i++ {
		m := topFirstName(p, "MALE")
		f := topFirstName(p, "FEMALE")
		if m == "" || f == "" {
			t.Fatal("prénom vide")
		}
		_ = topFirstName(p, "AUTRE") // default : renvoie l'un des deux pools
	}
}

func TestStripHTML(t *testing.T) {
	cases := []struct{ in, want string }{
		{"<p>Bonjour</p>", "Bonjour"},
		{"<p>Un <strong>mot</strong> et <em>autre</em></p>", "Un mot et autre"},
		{"Aucune balise", "Aucune balise"},
		{"", ""},
		{"<br/><br/>", ""},
		{"  Espaces   multiples  ", "Espaces multiples"},
	}
	for _, c := range cases {
		if got := stripHTML(c.in); got != c.want {
			t.Fatalf("stripHTML(%q) = %q, attendu %q", c.in, got, c.want)
		}
	}
}

func TestVectorLiteral(t *testing.T) {
	if got := vectorLiteral([]float64{1.5, -2, 0.25}); got != "[1.5,-2,0.25]" {
		t.Fatalf("vectorLiteral = %q", got)
	}
	if got := vectorLiteral(nil); got != "[]" {
		t.Fatalf("vectorLiteral(nil) = %q", got)
	}
}

func TestMimeOf(t *testing.T) {
	cases := map[string]string{
		"a.jpg": "image/jpeg", "a.JPEG": "image/jpeg", "a.png": "image/png",
		"a.webp": "image/webp", "a.gif": "image/gif", "a.svg": "image/svg+xml",
		"a.avif": "image/avif", "a.pdf": "application/octet-stream", "": "application/octet-stream",
	}
	for name, want := range cases {
		if got := mimeOf(name); got != want {
			t.Fatalf("mimeOf(%q) = %q, attendu %q", name, got, want)
		}
	}
}

func TestVectorLiteralRoundTrip(t *testing.T) {
	// Le littéral généré doit être parseable en littéral pgvector.
	lit := vectorLiteral([]float64{0.1, 0.2, 0.3})
	if !strings.HasPrefix(lit, "[") || !strings.HasSuffix(lit, "]") {
		t.Fatalf("littéral mal formé : %s", lit)
	}
}
