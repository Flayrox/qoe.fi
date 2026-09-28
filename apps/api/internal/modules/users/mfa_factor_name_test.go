package users

import (
	"context"
	"errors"
	"testing"
)

func factorList(names ...string) map[string]any {
	all := make([]any, 0, len(names))
	for _, name := range names {
		all = append(all, map[string]any{"friendly_name": name, "factor_type": "totp"})
	}
	return map[string]any{"all": all}
}

// GoTrue refuse deux facteurs du même nom. Sans numérotation, une inscription
// interrompue (facteur créé mais jamais vérifié) bloquait définitivement toute
// nouvelle tentative : plus aucune action sensible n'était déblocable.
func TestNextFactorNameNumbersAroundExistingFactors(t *testing.T) {
	cases := []struct {
		name  string
		names []string
		want  string
	}{
		{name: "aucun facteur", names: nil, want: defaultFactorName},
		{name: "nom libre", names: []string{"téléphone"}, want: defaultFactorName},
		{name: "premier pris", names: []string{defaultFactorName}, want: defaultFactorName + " 2"},
		{
			name:  "trous comblés dans l'ordre",
			names: []string{defaultFactorName, defaultFactorName + " 2"},
			want:  defaultFactorName + " 3",
		},
	}

	svc := &Service{}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			list := func(context.Context, string, string) (map[string]any, error) {
				return factorList(tc.names...), nil
			}
			got := svc.nextFactorName(context.Background(), "user", "Bearer token", defaultFactorName, list)
			if got != tc.want {
				t.Fatalf("nom du facteur = %q, attendu %q", got, tc.want)
			}
		})
	}
}

// Si la liste des facteurs n'est pas lisible, on garde un nom stable : un
// suffixe aléatoire s'accumulerait à chaque nouvelle tentative ratée.
func TestNextFactorNameFallsBackToStableName(t *testing.T) {
	svc := &Service{}
	list := func(context.Context, string, string) (map[string]any, error) {
		return nil, errors.New("fournisseur d'identité indisponible")
	}
	if got := svc.nextFactorName(context.Background(), "user", "Bearer token", defaultFactorName, list); got != defaultFactorName {
		t.Fatalf("nom du facteur = %q, attendu %q", got, defaultFactorName)
	}
}

// Les facteurs peuvent aussi n'apparaître que dans les listes typées.
func TestNextFactorNameReadsTypedLists(t *testing.T) {
	svc := &Service{}
	list := func(context.Context, string, string) (map[string]any, error) {
		return map[string]any{"totp": []any{map[string]any{"friendly_name": defaultFactorName}}}, nil
	}
	if got := svc.nextFactorName(context.Background(), "user", "Bearer token", defaultFactorName, list); got != defaultFactorName+" 2" {
		t.Fatalf("nom du facteur = %q, attendu %q", got, defaultFactorName+" 2")
	}
}
