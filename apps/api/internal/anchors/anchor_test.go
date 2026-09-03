package anchors

import "testing"

func TestResolve(t *testing.T) {
	html := `<p>Bonjour le monde</p><p>Deuxième partie ici</p>`
	start, end, sha, ok := Resolve(html, "monde\n\nDeuxième", 0)
	if !ok || start != 11 || end != 25 {
		t.Fatalf("Resolve = %d,%d,%v (want 11,25,true)", start, end, ok)
	}
	if len(sha) != 64 {
		t.Fatalf("sha = %q", sha)
	}
}

func TestResolveMissing(t *testing.T) {
	_, _, _, ok := Resolve(`<p>Un contenu</p>`, "passage absent", 0)
	if ok {
		t.Fatal("passage absent devrait être introuvable")
	}
}

func TestResolveOrdinal(t *testing.T) {
	html := `<p>Répète ceci</p><p>Répète ceci</p>`
	start, end, _, ok := Resolve(html, "Répète ceci", 1)
	if !ok || start != 12 || end != 23 {
		t.Fatalf("Resolve ordinal 1 = %d,%d,%v (want 12,23,true)", start, end, ok)
	}
}
