package feed

import (
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/qoefi/api/internal/database"
)

// La carte d'article du feed doit transmettre la nature de l'auteur (média ou
// personne). Sans elle, l'avatar retombe toujours sur un cercle.
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
		AuthorCertified: true,
		AuthorIsMedia:   true,
		PublicationName: "Le Média",
		PublicationSlug: "le-media",
		PublicationType: db.PublicationTypeMEDIA,
	}

	article := buildFeedArticle(row)
	if article.Author.Type != "MEDIA" {
		t.Fatalf("type auteur = %q, attendu MEDIA", article.Author.Type)
	}

	row.AuthorIsMedia = false
	if got := buildFeedArticle(row).Author.Type; got != "PERSONAL" {
		t.Fatalf("type auteur = %q, attendu PERSONAL", got)
	}
}
