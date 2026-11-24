package posts

import (
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/qoefi/api/internal/database"
)

// ─────────────────────────────────────────────────────────────────────────────
// Contexte d'article d'un commentaire (L44) — sans base.
// Un commentaire est un post (L41) : quand il entre dans un flux, il doit
// porter l'article qu'il commente. Ces deux fonctions pures décident quel
// article charger et l'attachent, y compris à la chaîne de parents.
// ─────────────────────────────────────────────────────────────────────────────

func TestRootArticleIDs_DeduplicatesAndSkipsMissing(t *testing.T) {
	all := map[string]*db.GetPostsByIDsRow{
		"c1": {ID: "c1", RootArticleId: pgtype.Text{String: "art-1", Valid: true}},
		"c2": {ID: "c2", RootArticleId: pgtype.Text{String: "art-1", Valid: true}},
		"c3": {ID: "c3", RootArticleId: pgtype.Text{String: "art-2", Valid: true}},
		"p1": {ID: "p1"},
		"p2": {ID: "p2", RootArticleId: pgtype.Text{String: "", Valid: true}},
	}

	ids := RootArticleIDs(all)
	if len(ids) != 2 {
		t.Fatalf("attendu 2 articles distincts, obtenu %v", ids)
	}
	seen := map[string]bool{ids[0]: true, ids[1]: true}
	if !seen["art-1"] || !seen["art-2"] {
		t.Fatalf("articles inattendus : %v", ids)
	}
}

func TestAttachRootArticle_WalksParentChainAndKeepsExisting(t *testing.T) {
	roots := map[string]*QuotedArticle{
		"art-1": {ID: "art-1", Title: "Le sujet"},
		"art-2": {ID: "art-2", Title: "Le parent"},
	}
	existing := &QuotedArticle{ID: "explicit", Title: "Déjà résolu"}
	parent := &FeedPost{ID: "parent", RootArticleID: strPtr("art-2")}
	target := &FeedPost{
		ID:            "child",
		RootArticleID: strPtr("art-1"),
		RootArticle:   existing,
		Parent:        parent,
	}

	AttachRootArticle(target, roots)

	if target.RootArticle != existing {
		t.Fatal("un contexte déjà résolu ne doit jamais être écrasé")
	}
	if parent.RootArticle == nil || parent.RootArticle.ID != "art-2" {
		t.Fatalf("le parent doit porter son propre article, obtenu %+v", parent.RootArticle)
	}
}

func TestAttachRootArticle_LeavesUnresolvedArticleNil(t *testing.T) {
	target := &FeedPost{ID: "c1", RootArticleID: strPtr("art-prive")}

	AttachRootArticle(target, map[string]*QuotedArticle{})

	if target.RootArticle != nil {
		t.Fatal("un article non chargé (privé, supprimé) ne doit pas produire de carte")
	}
}
