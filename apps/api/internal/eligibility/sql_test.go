package eligibility

import (
	"strings"
	"testing"
)

// Les quatre verrous d'éligibilité doivent être présents dans CHAQUE requête
// de flux : blocage, sourdine d'auteur, mots masqués, et (en découverte)
// visibilité du profil. Un flux qui en oublie un rend un contenu invisible
// au lieu de le filtrer.
func assertLocks(t *testing.T, sql string) {
	t.Helper()
	for _, needle := range []string{
		"is_blocked_bidirectional(",
		"is_muted_by(",
		"contains_muted_word(",
	} {
		if !strings.Contains(sql, needle) {
			t.Fatalf("verrou manquant %q dans :\n%s", needle, sql)
		}
	}
}

func TestArticlePredicates_FullLocks(t *testing.T) {
	sql := ArticlePredicates(Aliases{
		Entity:        "a",
		Authors:       []string{"u.id"},
		Publisher:   `a."publisherId"`,
		Viewer:        "$2",
		RequirePublic: true,
	})
	assertLocks(t, sql)

	if !strings.Contains(sql, `"profileVisibility"`) {
		t.Fatalf("la visibilité du profil doit être vérifiée en découverte :\n%s", sql)
	}
	if !strings.Contains(sql, `COALESCE(a.title, '') || ' ' || COALESCE(a.content, '')`) {
		t.Fatalf("les mots masqués doivent couvrir titre ET contenu :\n%s", sql)
	}
	if !strings.Contains(sql, `pv.id = a."publisherId"`) {
		t.Fatalf("la publication de l'article doit porter la visibilité :\n%s", sql)
	}
	if !strings.Contains(sql, "$2, u.id") {
		t.Fatalf("le viewer et l'auteur doivent être des paramètres liés :\n%s", sql)
	}
}

// Un article de média expose l'auteur ET le propriétaire de publication : les
// deux doivent porter blocage et sourdine, sinon le blocage du média fuit.
func TestArticlePredicates_AllAuthorsFiltered(t *testing.T) {
	sql := ArticlePredicates(Aliases{
		Entity:  "a",
		Authors: []string{"u.id", "po.id"},
		Viewer:  "$2",
	})
	if !strings.Contains(sql, "$2, u.id") || !strings.Contains(sql, "$2, po.id") {
		t.Fatalf("les deux auteurs doivent être filtrés :\n%s", sql)
	}
	if strings.Count(sql, "is_blocked_bidirectional(") != 2 {
		t.Fatalf("un blocage par auteur attendu :\n%s", sql)
	}
}

func TestThoughtPredicates_NoVisibilityWhenNotRequired(t *testing.T) {
	sql := ThoughtPredicates(Aliases{
		Entity:  "p",
		Authors: []string{`p."authorId"`},
		Viewer:  "$1",
	})
	assertLocks(t, sql)

	if strings.Contains(sql, `"profileVisibility"`) {
		t.Fatalf("un flux d'abonnements ne rejoue pas la visibilité :\n%s", sql)
	}
	if !strings.Contains(sql, "COALESCE(p.content, '')") {
		t.Fatalf("les mots masqués doivent lire le contenu de la pensée :\n%s", sql)
	}
	if !strings.Contains(sql, `$1, p."authorId"`) {
		t.Fatalf("l'auteur de la pensée doit être pris sur la ligne :\n%s", sql)
	}
}

// La publication vide fait résoudre la publication personnelle de l'auteur
// (pensées rattachées à leur auteur, pas à une publication de média).
func TestThoughtPredicates_VisibilityFallsBackToAuthorPublisher(t *testing.T) {
	sql := ThoughtPredicates(Aliases{
		Entity:        "p",
		Authors:       []string{"u.id"},
		Viewer:        "$3",
		RequirePublic: true,
	})
	if !strings.Contains(sql, `(SELECT "publisherId" FROM "User" WHERE id = u.id)`) {
		t.Fatalf("publication de l'auteur attendue :\n%s", sql)
	}
}

// Le viewer est toujours un paramètre lié : jamais de concaténation d'un id
// ou d'un pseudo dans le SQL.
func TestPredicates_ViewerIsAlwaysBound(t *testing.T) {
	for _, sql := range []string{
		ArticlePredicates(Aliases{Entity: "a", Authors: []string{"u.id"}, Viewer: "$4", RequirePublic: true}),
		ThoughtPredicates(Aliases{Entity: "p", Authors: []string{"u.id"}, Viewer: "$4", RequirePublic: true}),
	} {
		if strings.Contains(sql, "is_muted_by('") || strings.Contains(sql, "is_muted_by(\"") {
			t.Fatalf("le viewer ne doit jamais être interpolé :\n%s", sql)
		}
		if strings.Count(sql, "$4") < 3 {
			t.Fatalf("chaque prédicat doit réutiliser le même placeholder viewer :\n%s", sql)
		}
	}
}

// Les constructeurs nommés du masterplan (phase 2) restent exposés pour les
// appelants mono-auteur et produisent exactement les mêmes verrous.
func TestArticleWhereClause_Contract(t *testing.T) {
	sql := ArticleWhereClause("a", "u.id", "$2", true)
	assertLocks(t, sql)
	if !strings.Contains(sql, `"profileVisibility"`) {
		t.Fatalf("la clause article doit porter la visibilité :\n%s", sql)
	}
	if !strings.Contains(sql, "$2, u.id") {
		t.Fatalf("le viewer et l'auteur doivent être liés :\n%s", sql)
	}
	if !strings.Contains(sql, `COALESCE(a.title, '')`) {
		t.Fatalf("les mots masqués doivent couvrir le titre :\n%s", sql)
	}
}

func TestThoughtWhereClause_Contract(t *testing.T) {
	sql := ThoughtWhereClause("p", `p."authorId"`, "$1", false)
	assertLocks(t, sql)
	if strings.Contains(sql, `"profileVisibility"`) {
		t.Fatalf("un flux d'abonnements ne rejoue pas la visibilité :\n%s", sql)
	}
	if !strings.Contains(sql, "$1, p.\"authorId\"") {
		t.Fatalf("l'auteur de la pensée doit être lié :\n%s", sql)
	}
}
