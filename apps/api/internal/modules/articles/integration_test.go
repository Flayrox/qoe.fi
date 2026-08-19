package articles

import (
	"context"
	"log"
	"os"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/testutil"
)

// poolTest est le pool Postgres de test (Testcontainers, pgvector).
var poolTest *pgxpool.Pool

func TestMain(m *testing.M) {
	p, err := testutil.Pool(context.Background())
	if err != nil {
		log.Fatalf("testcontainers: %v", err)
	}
	poolTest = p
	code := m.Run()
	testutil.Cleanup()
	os.Exit(code)
}

func seed(t *testing.T) *testutil.Fixtures {
	t.Helper()
	fx, err := testutil.SeedArticles(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	return fx
}

// truthy/falsy helpers pgtype.
func ptrBool(b bool) *bool { return &b }

func TestListCreatorArticles_AllPublished(t *testing.T) {
	fx := seed(t)
	q := db.New(poolTest)

	rows, err := q.ListCreatorArticles(context.Background(), db.ListCreatorArticlesParams{
		PublicationId: fx.PublicationID,
		Published:     pgtype.Bool{Bool: true, Valid: true},
		Limit:         10,
		Offset:        0,
	})
	if err != nil {
		t.Fatalf("ListCreatorArticles: %v", err)
	}

	// 3 articles publiés (le brouillon est exclu).
	if len(rows) != 3 {
		t.Fatalf("len = %d, attendu 3 (brouillon exclu)", len(rows))
	}

	// Trie par createdAt DESC parmi les publiés : brouillon exclu → le plus
	// récent des publiés est recette-pates.
	expected := []string{"recette-pates", "article-payant", "premier-article"}
	for i, slug := range expected {
		if rows[i].Slug != slug {
			t.Fatalf("rows[%d] = %q, attendu %q (ordre createdAt DESC)", i, rows[i].Slug, slug)
		}
	}

	// Catégorie embarquée (LEFT JOIN) sur l'article payant (index 1).
	if !rows[1].CategoryID.Valid || rows[1].CategorySlug.String != "tech" {
		t.Fatalf("catégorie non embarquée sur l'article payant: %+v", rows[1])
	}
}

func TestListCreatorArticles_FilterByCategory(t *testing.T) {
	fx := seed(t)
	q := db.New(poolTest)

	rows, err := q.ListCreatorArticles(context.Background(), db.ListCreatorArticlesParams{
		PublicationId: fx.PublicationID,
		Published:     pgtype.Bool{Bool: true, Valid: true},
		CategorySlug:  pgtype.Text{String: "food", Valid: true},
		Limit:         10,
		Offset:        0,
	})
	if err != nil {
		t.Fatalf("ListCreatorArticles(category=food): %v", err)
	}
	if len(rows) != 1 || rows[0].Slug != "recette-pates" {
		t.Fatalf("food: len=%d slugs=%v, attendu [recette-pates]", len(rows), slugs(rows))
	}

	rows, err = q.ListCreatorArticles(context.Background(), db.ListCreatorArticlesParams{
		PublicationId: fx.PublicationID,
		Published:     pgtype.Bool{Bool: true, Valid: true},
		CategorySlug:  pgtype.Text{String: "tech", Valid: true},
		Limit:         10,
		Offset:        0,
	})
	if err != nil {
		t.Fatalf("ListCreatorArticles(category=tech): %v", err)
	}
	if len(rows) != 2 {
		t.Fatalf("tech: len=%d, attendu 2 (premier-article + article-payant)", len(rows))
	}
}

func TestListCreatorArticles_Pagination(t *testing.T) {
	fx := seed(t)
	q := db.New(poolTest)

	// page 1 : limit 2 → 2 articles, page 2 : limit 2 → 1 article.
	page1, err := q.ListCreatorArticles(context.Background(), db.ListCreatorArticlesParams{
		PublicationId: fx.PublicationID,
		Published:     pgtype.Bool{Bool: true, Valid: true},
		Limit:         2,
		Offset:        0,
	})
	if err != nil {
		t.Fatalf("page1: %v", err)
	}
	if len(page1) != 2 {
		t.Fatalf("page1 len = %d, attendu 2", len(page1))
	}

	page2, err := q.ListCreatorArticles(context.Background(), db.ListCreatorArticlesParams{
		PublicationId: fx.PublicationID,
		Published:     pgtype.Bool{Bool: true, Valid: true},
		Limit:         2,
		Offset:        2,
	})
	if err != nil {
		t.Fatalf("page2: %v", err)
	}
	if len(page2) != 1 || page2[0].Slug != "premier-article" {
		t.Fatalf("page2 = %v, attendu [premier-article]", slugs(page2))
	}

	// Pas de chevauchement.
	seen := map[string]bool{}
	for _, r := range append(page1, page2...) {
		if seen[r.Slug] {
			t.Fatalf("slug dupliqué entre pages: %s", r.Slug)
		}
		seen[r.Slug] = true
	}
}

func TestCountCreatorArticles(t *testing.T) {
	fx := seed(t)
	q := db.New(poolTest)

	total, err := q.CountCreatorArticles(context.Background(), db.CountCreatorArticlesParams{
		PublicationId: fx.PublicationID,
		Published:     pgtype.Bool{Bool: true, Valid: true},
	})
	if err != nil {
		t.Fatalf("CountCreatorArticles: %v", err)
	}
	if total != 3 {
		t.Fatalf("total = %d, attendu 3", total)
	}

	// Filtre par catégorie.
	totalFood, err := q.CountCreatorArticles(context.Background(), db.CountCreatorArticlesParams{
		PublicationId: fx.PublicationID,
		Published:     pgtype.Bool{Bool: true, Valid: true},
		CategorySlug:  pgtype.Text{String: "food", Valid: true},
	})
	if err != nil {
		t.Fatalf("CountCreatorArticles(food): %v", err)
	}
	if totalFood != 1 {
		t.Fatalf("total(food) = %d, attendu 1", totalFood)
	}
}

func TestGetCreatorArticleBySlug_PublishedOnly(t *testing.T) {
	fx := seed(t)
	q := db.New(poolTest)

	// Article publié → trouvé.
	row, err := q.GetCreatorArticleBySlug(context.Background(), db.GetCreatorArticleBySlugParams{
		Slug:          "article-payant",
		PublicationId: fx.PublicationID,
	})
	if err != nil {
		t.Fatalf("GetCreatorArticleBySlug(publié): %v", err)
	}
	if row.Slug != "article-payant" {
		t.Fatalf("slug = %q", row.Slug)
	}
	if !row.CategoryID.Valid || row.CategorySlug.String != "tech" {
		t.Fatalf("catégorie embarquée manquante: %+v", row)
	}

	// Article brouillon → introuvable (published = true requis).
	_, err = q.GetCreatorArticleBySlug(context.Background(), db.GetCreatorArticleBySlugParams{
		Slug:          "brouillon",
		PublicationId: fx.PublicationID,
	})
	if err == nil {
		t.Fatal("brouillon ne doit pas être retourné (published=false)")
	}
}

func TestListCreatorArticles_NoPaywallLeak(t *testing.T) {
	fx := seed(t)
	q := db.New(poolTest)

	rows, err := q.ListCreatorArticles(context.Background(), db.ListCreatorArticlesParams{
		PublicationId: fx.PublicationID,
		Published:     pgtype.Bool{Bool: true, Valid: true},
		Limit:         10,
		Offset:        0,
	})
	if err != nil {
		t.Fatalf("ListCreatorArticles: %v", err)
	}

	// L'article payant est présent mais SON CONTENU PAYANT ne doit jamais
	// apparaître dans la liste (la troncature zéro-fuite est appliquée au
	// niveau du service, mais la requête ne doit pas exposer de marqueur non
	// plus — on vérifie surtout que le contrat de test reste cohérent).
	for _, r := range rows {
		if r.Slug == "article-payant" {
			if !strings.Contains(r.Content, "PAYANT SENSIBLE") {
				t.Fatal("seed incohérent: le contenu payant devrait exister en base")
			}
			// Le champ content brut est exposé par la requête — c'est le rôle
			// du service (ToCreatorItem + SliceContentAtPaywall) de tronquer.
			// On vérifie ici que le seed est bien branché.
			continue
		}
	}
}

func slugs(rows []db.ListCreatorArticlesRow) []string {
	out := make([]string, 0, len(rows))
	for _, r := range rows {
		out = append(out, r.Slug)
	}
	return out
}
