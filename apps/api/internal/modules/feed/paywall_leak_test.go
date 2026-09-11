package feed

import (
	"strings"
	"testing"

	db "github.com/qoefi/api/internal/database"
)

const leakyFeedPremium = `<p>Teaser public.</p><!--members-only--><p>PAYANT SENSIBLE : la suite réservée.</p>`

// 🔒 Zéro-fuite : les cartes de feed sont servies à des visiteurs anonymes.
// Le contenu d'un article premium doit y être tronqué au paywall — sinon le
// passage réservé apparaît dans le réseau, dans le DOM des cartes et dans les
// extraits rendus (fuite silencieuse du paywall).
func TestBuildFeedArticle_NeverLeaksPremiumContent(t *testing.T) {
	art := buildFeedArticle(&publishedArticleRow{
		ID: "art_premium", Title: "Enquête", Slug: "enquete",
		Content:       leakyFeedPremium,
		IsPremium:     true,
		Visibility:    db.ContentVisibility("PAID_SUBSCRIBERS"),
		ReadingTime:   4,
		PublicationID: "pub_1", AuthorID: "user_1",
	})

	if strings.Contains(art.Content, "PAYANT SENSIBLE") {
		t.Fatalf("fuite du passage réservé dans la carte de feed: %q", art.Content)
	}
	if !strings.Contains(art.Content, "Teaser public.") {
		t.Fatalf("le teaser public doit rester visible, got %q", art.Content)
	}
}

// Le contenu public (non premium) n'est jamais altéré par la troncature.
func TestBuildFeedArticle_PublicContentUntouched(t *testing.T) {
	art := buildFeedArticle(&publishedArticleRow{
		ID: "art_free", Title: "Libre", Slug: "libre",
		Content:     "<p>Tout public</p>",
		IsPremium:   false,
		Visibility:  db.ContentVisibility("PUBLIC"),
		ReadingTime: 1,
	})

	if !strings.Contains(art.Content, "Tout public") {
		t.Fatalf("contenu public altéré: %q", art.Content)
	}
}
