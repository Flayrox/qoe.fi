package feed

import "testing"

// TestMutedOKParity fige la parité avec `contains_muted_word` (migration
// 00079) : comparaison insensible à la casse des DEUX côtés, sur une
// sous-chaîne, et mot vide ignoré (jamais « tout masqué »).
func TestMutedOKParity(t *testing.T) {
	cases := []struct {
		name  string
		text  string
		muted []string
		want  bool
	}{
		{"aucun mot", "bonjour", nil, true},
		{"sous-chaîne", "la politique du pays", []string{"politique"}, false},
		{"casse du texte", "La Politique du pays", []string{"politique"}, false},
		{"casse du mot", "la politique du pays", []string{"Politique"}, false},
		{"majuscules des deux côtés", "La POLITIQUE", []string{"POLITIQUE"}, false},
		{"espaces autour du mot", "la politique", []string{"  politique  "}, false},
		{"sous-chaîne interne", "partir vite", []string{"arti"}, false},
		{"mot absent", "bonjour", []string{"politique"}, true},
		{"mot vide ignoré", "bonjour", []string{""}, true},
		{"mot vide parmi d'autres", "bonjour", []string{"", " "}, true},
	}
	for _, tc := range cases {
		if got := mutedOK(tc.text, tc.muted); got != tc.want {
			t.Errorf("%s : mutedOK(%q, %q) = %v, attendu %v", tc.name, tc.text, tc.muted, got, tc.want)
		}
	}
}
