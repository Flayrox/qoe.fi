package support

// Articles d'aide (tranche 6) : validation pure sans base ; cycle CRUD en
// base (skippé sans Docker). Brouillon par défaut, pas de suppression.

import (
	"context"
	"errors"
	"fmt"
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
		"titre trop court": func() error { return ValidArticleInput("slug-ok", "abc", "Title long enough", "Corps.", "Body.") },
		"corps vide": func() error {
			return ValidArticleInput("slug-ok", "Titre assez long", "Title long enough", "", "Body.")
		},
	}
	for name, fn := range cases {
		if err := fn(); !errors.Is(err, ErrInvalidArticle) {
			t.Errorf("%s : attendu ErrInvalidArticle, obtenu %v", name, err)
		}
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
