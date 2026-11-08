package feed

import (
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/qoefi/api/internal/database"
)

// L'identité d'un auteur d'article suit SA publication : MEDIA quand l'article
// est publié dans un média, PERSONAL sinon — jamais la membership de l'auteur.
// Le logo suit la même règle : logo du média pour un article média, logo
// personnel pour un article publié sur la publication personnelle.
func TestBuildFeedArticleCarriesAuthorIdentityType(t *testing.T) {
	row := &publishedArticleRow{
		ID:              "article_1",
		Title:           "Titre",
		Slug:            "titre",
		Content:         "<p>Contenu</p>",
		Visibility:      db.ContentVisibilityPUBLIC,
		CreatedAt:       pgtype.Timestamp{Time: time.Date(2026, 9, 1, 10, 0, 0, 0, time.UTC), Valid: true},
		PublicationID:   "pub_1",
		AuthorID:        "user_camille",
		AuthorLogo:      pgtype.Text{String: "/avatars/camille.svg", Valid: true},
		AuthorCertified: true,
		PublicationName: "Le Média",
		PublicationSlug: "le-media",
		PublicationLogo: pgtype.Text{String: "/logos/le-media.svg", Valid: true},
		PublicationType: db.PublicationTypeMEDIA,
	}

	article := buildFeedArticle(row)
	if article.Author.Type != "MEDIA" {
		t.Fatalf("type auteur = %q, attendu MEDIA", article.Author.Type)
	}
	if article.Author.LogoURL == nil || *article.Author.LogoURL != "/logos/le-media.svg" {
		t.Fatalf("logo auteur = %v, attendu /logos/le-media.svg", article.Author.LogoURL)
	}

	// Même autrice membre d'un média, mais article sur sa publication perso :
	// identité ET logo personnels.
	row.PublicationType = db.PublicationTypePERSONAL
	personal := buildFeedArticle(row)
	if personal.Author.Type != "PERSONAL" {
		t.Fatalf("type auteur = %q, attendu PERSONAL", personal.Author.Type)
	}
	if personal.Author.LogoURL == nil || *personal.Author.LogoURL != "/avatars/camille.svg" {
		t.Fatalf("logo auteur = %v, attendu /avatars/camille.svg", personal.Author.LogoURL)
	}
}
