package support

// Articles d'aide (tranche 6) : validation pure sans base ; cycle CRUD en
// base (skippé sans Docker). Brouillon par défaut, pas de suppression.

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"
)

func TestValidArticleInput(t *testing.T) {
	ok := func() error {
		return ValidArticleInput("compte-perdu", "Titre assez long", "Title long enough", "Corps.", "Body.")
	}
	if err := ok(); err != nil {
		t.Fatalf("valide : %v", err)
	}
	cases := map[string]func() error{
		"slug majuscules": func() error {
			return ValidArticleInput("Mauvais", "Titre assez long", "Title long enough", "Corps.", "Body.")
		},
		"slug trop court": func() error {
			return ValidArticleInput("ab", "Titre assez long", "Title long enough", "Corps.", "Body.")
		},
		"slug trop long": func() error {
			return ValidArticleInput(strings.Repeat("a", 81), "Titre assez long", "Title long enough", "Corps.", "Body.")
		},
		"titre trop court": func() error { return ValidArticleInput("slug-ok", "abc", "Title long enough", "Corps.", "Body.") },
		"titre FR trop long": func() error {
			return ValidArticleInput("slug-ok", strings.Repeat("a", 201), "Title long enough", "Corps.", "Body.")
		},
		"titre EN trop court": func() error {
			return ValidArticleInput("slug-ok", "Titre assez long", "abc", "Corps.", "Body.")
		},
		"corps vide": func() error {
			return ValidArticleInput("slug-ok", "Titre assez long", "Title long enough", "", "Body.")
		},
		"corps FR trop long": func() error {
			return ValidArticleInput("slug-ok", "Titre assez long", "Title long enough", strings.Repeat("a", 10001), "Body.")
		},
		"corps EN vide": func() error {
			return ValidArticleInput("slug-ok", "Titre assez long", "Title long enough", "Corps.", "")
		},
		"corps EN trop long": func() error {
			return ValidArticleInput("slug-ok", "Titre assez long", "Title long enough", "Corps.", strings.Repeat("a", 10001))
		},
	}
	for name, fn := range cases {
		if err := fn(); !errors.Is(err, ErrInvalidArticle) {
			t.Errorf("%s : attendu ErrInvalidArticle, obtenu %v", name, err)
		}
	}
}

// TestListAllArticles_NilPool_ReturnsNonNilEmptySlice verrouille la cause
// racine du crash « This page couldn't load » : une slice Go non initialisée
// sérialise en `null`, le composant serveur admin crashe sur `.filter`. Le
// JSON doit porter `[]`, jamais `null`.
func TestListAllArticles_NilPool_ReturnsNonNilEmptySlice(t *testing.T) {
	items, total, err := ListAllArticles(context.Background(), nil, 10, 0)
	if err != nil || total != 0 || items == nil || len(items) != 0 {
		t.Fatalf("nil pool = (%#v, %d, %v), attendu (slice vide, 0, nil)", items, total, err)
	}
	raw, err := json.Marshal(map[string]any{"items": items, "total": total})
	if err != nil {
		t.Fatalf("marshal : %v", err)
	}
	if want := `{"items":[],"total":0}`; string(raw) != want {
		t.Fatalf("JSON = %s, attendu %s", raw, want)
	}
}

func TestListPublishedArticles_NilPool_ReturnsNonNilEmptySlice(t *testing.T) {
	items, err := ListPublishedArticles(context.Background(), nil)
	if err != nil || items == nil || len(items) != 0 {
		t.Fatalf("nil pool = (%#v, %v), attendu (slice vide, nil)", items, err)
	}
}

// TestArticle_NilPool_Errors : sans base, les écritures/lectures unitaires
// refusent explicitement (jamais de zéro-valeur silencieuse).
func TestArticle_NilPool_Errors(t *testing.T) {
	ctx := context.Background()
	if _, err := CreateArticle(ctx, nil, "slug-ok", "Titre assez long", "Title long enough", "Corps.", "Body.", 0, time.Now()); err == nil {
		t.Fatal("CreateArticle pool nil : erreur attendue")
	}
	if _, err := GetArticle(ctx, nil, "x"); err == nil {
		t.Fatal("GetArticle pool nil : erreur attendue")
	}
	if _, err := UpdateArticle(ctx, nil, "x", "", "", "", "", nil, nil, time.Now()); err == nil {
		t.Fatal("UpdateArticle pool nil : erreur attendue")
	}
}

func TestArticle_FullCycle(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	now := time.Now()
	slug := fmt.Sprintf("smoke-art-%d", now.UnixNano())
	cleanup := func() {
		poolTest.Exec(ctx, `DELETE FROM "SupportArticle" WHERE "slug" = $1`, slug)
	}
	cleanup()
	defer cleanup()

	// Création = brouillon (jamais publié par défaut).
	a, err := CreateArticle(ctx, poolTest, slug, "Titre assez long", "Title long enough", "Corps de l'article.", "Article body.", 5, now)
	if err != nil {
		t.Fatalf("création : %v", err)
	}
	if a.Published || a.Position != 5 {
		t.Fatalf("brouillon positionné attendu, obtenu %+v", a)
	}
	// Slug pris : refusé.
	if _, err := CreateArticle(ctx, poolTest, slug, "Autre titre long", "Other long title", "Corps.", "Body.", 0, now); !errors.Is(err, ErrInvalidArticle) {
		t.Fatalf("doublon : attendu ErrInvalidArticle, obtenu %v", err)
	}
	// Invisible du public tant que brouillon.
	items, err := ListPublishedArticles(ctx, poolTest)
	if err != nil {
		t.Fatalf("liste publique : %v", err)
	}
	for _, it := range items {
		if it.ID == a.ID {
			t.Fatal("brouillon visible du public !")
		}
	}
	// Publication : visible, en tête si position basse.
	a, err = UpdateArticle(ctx, poolTest, a.ID, "", "", "", "", nil, &[]bool{true}[0], now)
	if err != nil {
		t.Fatalf("publication : %v", err)
	}
	if !a.Published {
		t.Fatal("publié attendu")
	}
	items, err = ListPublishedArticles(ctx, poolTest)
	if err != nil {
		t.Fatalf("liste publique : %v", err)
	}
	found := false
	for _, it := range items {
		if it.ID == a.ID {
			found = true
		}
	}
	if !found {
		t.Fatal("publié invisible du public !")
	}
	// Champs vides = inchangés (jamais de vidage par omission).
	a, err = UpdateArticle(ctx, poolTest, a.ID, "", "", "", "", nil, nil, now)
	if err != nil || a.TitleFr != "Titre assez long" || !a.Published {
		t.Fatalf("inchangé attendu, obtenu %+v (%v)", a, err)
	}
	// Inexistant : refus explicite.
	if _, err := GetArticle(ctx, poolTest, "00000000-0000-0000-0000-000000000000"); !errors.Is(err, ErrArticleNotFound) {
		t.Fatalf("inexistant : attendu ErrArticleNotFound, obtenu %v", err)
	}
}
