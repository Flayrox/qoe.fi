package testutil

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Fixtures contient les IDs créés par SeedArticles pour être référencés
// dans les assertions de test.
type Fixtures struct {
	PublicationID string
	AuthorID      string
	CategoryTech  string
	CategoryFood  string
	ArticleSlugs  []string // ordre décroissant de createdAt (le plus récent d'abord)
}

// SeedArticles crée un environnement minimal mais réaliste :
//   - 1 publication (PERSONAL)
//   - 1 utilisateur (auteur, publication personnelle liée)
//   - 2 catégories (tech, food)
//   - 4 articles : 3 publiés (2 tech dont 1 payant, 1 food) + 1 brouillon
//
// Les tables sont vidées d'abord (les IDs sont fixes : chaque appel doit être
// rejouable). Retourne les IDs pour les assertions.
func SeedArticles(ctx context.Context, pool *pgxpool.Pool) (*Fixtures, error) {
	fx := &Fixtures{}

	// Vide les tables dépendantes (FK) avant de re-seeder.
	if _, err := pool.Exec(ctx, `TRUNCATE TABLE
		"Article", "Category", "User", "Publication", "_CoAuthors"
		CASCADE`); err != nil {
		return nil, fmt.Errorf("truncate: %w", err)
	}

	// Publication
	if err := pool.QueryRow(ctx,
		`INSERT INTO "Publication" (id, type, name, slug, "createdAt", "updatedAt")
		 VALUES ('pub_test_001', 'PERSONAL', 'Journal Test', 'journal-test', now(), now())
		 RETURNING id`,
	).Scan(&fx.PublicationID); err != nil {
		return nil, fmt.Errorf("publication: %w", err)
	}

	// Utilisateur auteur (id UUID)
	const authorID = "00000000-0000-0000-0000-000000000001"
	if err := pool.QueryRow(ctx,
		`INSERT INTO "User" (id, email, username, name, role, "publicationId", "createdAt", "updatedAt")
		 VALUES ($1, 'author@test.dev', 'author', 'Auteur Test', 'creator', $2, now(), now())
		 RETURNING id`,
		authorID, fx.PublicationID,
	).Scan(&fx.AuthorID); err != nil {
		return nil, fmt.Errorf("user: %w", err)
	}

	// Catégories
	if err := pool.QueryRow(ctx,
		`INSERT INTO "Category" (id, name, slug, description, "publicationId")
		 VALUES ('cat_tech', 'Technologie', 'tech', 'Actualité tech', $1) RETURNING id`,
		fx.PublicationID,
	).Scan(&fx.CategoryTech); err != nil {
		return nil, fmt.Errorf("category tech: %w", err)
	}
	if err := pool.QueryRow(ctx,
		`INSERT INTO "Category" (id, name, slug, description, "publicationId")
		 VALUES ('cat_food', 'Gastronomie', 'food', 'Recettes et restaurants', $1) RETURNING id`,
		fx.PublicationID,
	).Scan(&fx.CategoryFood); err != nil {
		return nil, fmt.Errorf("category food: %w", err)
	}

	// 4 articles. Le delta de createdAt décroît avec l'index : le PREMIER de la
	// liste est le plus ANCIEN (delta = len-1), le dernier inséré est le plus
	// RÉCENT (delta = 0) → ListCreatorArticles (ORDER BY createdAt DESC)
	// retourne le brouillon en premier.
	articles := []struct {
		slug, title, content, category, status string
		published, isPremium                   bool
	}{
		{"premier-article", "Premier article", "<p>Contenu public A</p>", fx.CategoryTech, "PUBLISHED", true, false},
		{"article-payant", "Article payant", "<p>Intro gratuite</p><p>Contenu PAYANT SENSIBLE</p>", fx.CategoryTech, "PUBLISHED", true, true},
		{"recette-pates", "Recette de pâtes", "<p>Recette complète</p>", fx.CategoryFood, "PUBLISHED", true, false},
		{"brouillon", "Brouillon secret", "<p>Pas encore publié</p>", fx.CategoryTech, "DRAFT", false, false},
	}
	for i, a := range articles {
		delta := len(articles) - 1 - i // 3,2,1,0 → plus récent en dernier
		var id string
		if err := pool.QueryRow(ctx,
			`INSERT INTO "Article" (id, title, slug, content, published, "isPremium", visibility,
			                        "readingTime", status, "publicationId", "authorId", "categoryId",
			                        "createdAt", "updatedAt")
			 VALUES ('art_test_00'||$1, $2, $3, $4, $5, $6, 'PUBLIC', 5, $7, $8, $9, $10,
			         now() - $11::text::interval, now())
			 RETURNING id`,
			fmt.Sprintf("%d", i), a.title, a.slug, a.content, a.published, a.isPremium,
			a.status, fx.PublicationID, fx.AuthorID, a.category,
			fmt.Sprintf("%d minutes", delta),
		).Scan(&id); err != nil {
			return nil, fmt.Errorf("article %s: %w", a.slug, err)
		}
		_ = id
	}

	// Slugs dans l'ordre createdAt DESC attendu (le brouillon, delta 0, est le
	// plus récent mais est exclu quand published=true).
	fx.ArticleSlugs = []string{
		"brouillon", "recette-pates", "article-payant", "premier-article",
	}
	return fx, nil
}
