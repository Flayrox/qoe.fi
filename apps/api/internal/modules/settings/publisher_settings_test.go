package settings

import "testing"

// Ces tests couvrent la partie pure du PATCH /v1/settings/publisher : la
// validation. Elle doit être intégralement faite AVANT la transaction, donc
// elle est testable sans base — et c'est elle qui garantit qu'une saisie
// invalide n'écrit jamais un profil à moitié.

func TestBuildProfileFields(t *testing.T) {
	t.Run("nom présent appliqué, nom vide ignoré (parité TS)", func(t *testing.T) {
		fields, onboarding, err := buildProfileFields(map[string]any{"name": "Qoefi", "heroText": nil})
		if err != nil {
			t.Fatalf("erreur inattendue: %v", err)
		}
		if got := fields["name"]; got != "Qoefi" {
			t.Fatalf("name = %v, attendu Qoefi", got)
		}
		if v, ok := fields["heroText"]; !ok || v != nil {
			t.Fatalf("heroText null doit effacer la colonne, obtenu %v (présent=%v)", v, ok)
		}
		if onboarding != nil {
			t.Fatalf("aucun onboarding attendu, obtenu %v", onboarding)
		}

		fields, _, err = buildProfileFields(map[string]any{"name": ""})
		if err != nil {
			t.Fatalf("erreur inattendue: %v", err)
		}
		if _, ok := fields["name"]; ok {
			t.Fatal("un nom vide ne doit pas être écrit")
		}
	})

	t.Run("clé inconnue refusée", func(t *testing.T) {
		if _, _, err := buildProfileFields(map[string]any{"nom": "Qoefi"}); err == nil {
			t.Fatal("une faute de frappe doit être une erreur, pas un champ ignoré")
		}
	})

	t.Run("allowIndexing non booléen refusé", func(t *testing.T) {
		if _, _, err := buildProfileFields(map[string]any{"allowIndexing": "oui"}); err == nil {
			t.Fatal("allowIndexing doit être un booléen")
		}
	})

	t.Run("URL de logo non sûre refusée", func(t *testing.T) {
		if _, _, err := buildProfileFields(map[string]any{"logoUrl": "javascript:alert(1)"}); err == nil {
			t.Fatal("une URL javascript: doit être refusée")
		}
	})

	t.Run("texte d'onboarding normalisé", func(t *testing.T) {
		_, onboarding, err := buildProfileFields(map[string]any{"onboardingText": "  Bonjour  "})
		if err != nil {
			t.Fatalf("erreur inattendue: %v", err)
		}
		if onboarding == nil || !onboarding.Valid || onboarding.String != "Bonjour" {
			t.Fatalf("onboarding = %+v, attendu « Bonjour » valide", onboarding)
		}
	})
}

func TestNormalizeSubdomainInput(t *testing.T) {
	cases := []struct {
		name    string
		in      string
		want    string
		wantErr bool
	}{
		{name: "vide = retrait", in: "   ", want: ""},
		{name: "normalisé en minuscules", in: "Mon-Site", want: "mon-site"},
		{name: "trop court", in: "ab", wantErr: true},
		{name: "point interdit", in: "mon.site", wantErr: true},
		{name: "tiret initial interdit", in: "-mon-site", wantErr: true},
		{name: "double tiret interdit", in: "mon--site", wantErr: true},
		{name: "espaces internes interdits", in: "mon site", wantErr: true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := normalizeSubdomainInput(tc.in)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("%q devait être refusé, obtenu %q", tc.in, got)
				}
				return
			}
			if err != nil {
				t.Fatalf("erreur inattendue pour %q: %v", tc.in, err)
			}
			if got != tc.want {
				t.Fatalf("normalizeSubdomainInput(%q) = %q, attendu %q", tc.in, got, tc.want)
			}
		})
	}
}
