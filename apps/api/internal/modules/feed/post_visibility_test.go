package feed

import "testing"

// La visibilité d'une PENSÉE décide de sa diffusion par les routes publiques
// (fil, `GET /v1/posts/{id}/thread`, `POST /v1/feed/hydrate`, home). Une valeur
// inconnue ou une visibilité restreinte ne doit jamais s'ouvrir par défaut.
func TestPostVisible(t *testing.T) {
	cas := []struct {
		nom        string
		visibility string
		isAuthor   bool
		follows    bool
		attendu    bool
	}{
		{"public anonyme", "public", false, false, true},
		{"public suivi", "public", false, true, true},
		{"followers anonyme", "followers", false, false, false},
		{"followers suivi", "followers", false, true, true},
		{"followers auteur", "followers", true, false, true},
		{"followers auteur et suivi", "followers", true, true, true},
		{"inconnue anonyme", "circle", false, false, false},
		{"inconnue suivi", "circle", false, true, false},
		{"inconnue auteur", "circle", true, false, true},
		{"privée explicite", "private", false, true, false},
		{"casse fautive", "Public", false, true, false},
		{"vide", "", false, true, false},
	}
	for _, c := range cas {
		t.Run(c.nom, func(t *testing.T) {
			if got := postVisible(c.visibility, c.isAuthor, c.follows); got != c.attendu {
				t.Fatalf("postVisible(%q, auteur=%v, suit=%v) = %v, attendu %v",
					c.visibility, c.isAuthor, c.follows, got, c.attendu)
			}
		})
	}
}
