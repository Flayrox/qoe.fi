package feed

import (
	"context"
	"strings"
	"testing"

	"github.com/pgvector/pgvector-go"
)

// halfVec construit un vecteur 512d en deux demi-plans : `first` dans les 256
// premières dimensions, `second` dans les 256 suivantes. Deux vecteurs aux
// demi-plans inversés sont peu similaires ; deux vecteurs partageant le même
// demi-plan dominant sont proches.
func halfVec(first, second float64) pgvector.Vector {
	v := make([]float32, 512)
	for i := range v {
		if i < 256 {
			v[i] = float32(first)
		} else {
			v[i] = float32(second)
		}
	}
	return pgvector.NewVector(v)
}

// TestEnginePool_SimDominant verrouille la personnalisation du pool de
// candidats : le contenu du milieu de l'utilisateur (sim ≈ 0.9) DOIT précéder
// l'éditorial frais (sim ≈ 0.6) même si ce dernier est plus récent (fresh=1.0
// pour un article du jour contre ≈0 pour un article de 30 jours).
//
// Calibrage piège : avec les anciens poids du pool (50% sim / 25% fresh / 25%
// completion), l'éditorial frais battait le contenu du profil (0.7625 vs
// 0.6625) — la fraîcheur noyait la personnalisation. Avec le pool sim-dominant
// (65/15/20), le contenu du milieu gagne (0.755 vs 0.71).
func TestEnginePool_SimDominant(t *testing.T) {
	ctx := context.Background()
	if _, err := poolTest.Exec(ctx, `TRUNCATE TABLE "Post", "Article", "User", "Publication" CASCADE`); err != nil {
		t.Fatalf("truncate: %v", err)
	}
	const authorID = "00000000-0000-0000-0000-0000000000a1"
	if _, err := poolTest.Exec(ctx, `INSERT INTO "Publication" (id, type, name, slug, "createdAt", "updatedAt")
		VALUES ('pub_pool', 'PERSONAL', 'Pool Pub', 'pool-pub', now(), now())`); err != nil {
		t.Fatalf("publication: %v", err)
	}
	if _, err := poolTest.Exec(ctx, `INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt")
		VALUES ($1, 'author@t.dev', 'author', 'Author', 'creator', now(), now())`, authorID); err != nil {
		t.Fatalf("author: %v", err)
	}

	// 6 articles du milieu (vieux : fresh ≈ 0) + 10 éditoriaux frais (fresh = 1).
	insertArticle := func(id, title string, old bool, tags []string, vec pgvector.Vector) {
		created := `now()`
		if old {
			created = `now() - interval '30 days'`
		}
		if _, err := poolTest.Exec(ctx, `INSERT INTO "Article" (id, title, slug, content, published, visibility,
			"readingTime", status, "publicationId", "authorId", "createdAt", "updatedAt",
			"semanticTags", "completionRate", embedding)
			VALUES ($1, $2, $2, '<p>Corps</p>', true, 'PUBLIC', 8, 'PUBLISHED', 'pub_pool', $3,
			        `+created+`, now(), $4, 0.5, $5)`,
			id, title, authorID, tags, vec); err != nil {
			t.Fatalf("article %s: %v", id, err)
		}
	}
	for i := 0; i < 6; i++ {
		insertArticle("pool_art_f"+string(rune('a'+i)), "Article foot "+string(rune('a'+i)), true, []string{"foot"}, halfVec(1.03, 1))
	}
	for i := 0; i < 10; i++ {
		insertArticle("pool_art_e"+string(rune('a'+i)), "Article édito "+string(rune('a'+i)), false, []string{"edito"}, halfVec(1, 3))
	}

	svc := newTestService()
	readerVec := halfVec(3, 1)
	pool, err := svc.fetchEngineArticles(ctx, &readerVec, "", 39, 0, nil)
	if err != nil {
		t.Fatalf("fetchEngineArticles: %v", err)
	}
	if len(pool) == 0 {
		t.Fatal("pool vide")
	}
	// Les 6 articles du milieu doivent précéder TOUS les éditoriaux frais.
	for i := 0; i < 6; i++ {
		if !strings.HasPrefix(pool[i].id, "pool_art_f") {
			t.Fatalf("position %d : attendu un article du milieu, got %s — la fraîcheur ne doit pas noyer le profil", i, pool[i].id)
		}
	}

	// Même invariant pour le pool de pensées.
	insertPost := func(id, content string, old bool, tags []string, vec pgvector.Vector) {
		created := `now()`
		if old {
			created = `now() - interval '30 days'`
		}
		if _, err := poolTest.Exec(ctx, `INSERT INTO "Post" (id, content, "authorId", "createdAt", "updatedAt", tags,
			visibility, "contentVisibility", "isDraft", "replyRestriction", "likeCount", "repostCount", "replyCount", embedding)
			VALUES ($1, $2, $3, `+created+`, now(), $4, 'public', 'PUBLIC', false, 'everyone', 0, 0, 0, $5)`,
			id, content, authorID, tags, vec); err != nil {
			t.Fatalf("post %s: %v", id, err)
		}
	}
	for i := 0; i < 6; i++ {
		insertPost("pool_post_f"+string(rune('a'+i)), "Pensée foot "+string(rune('a'+i)), true, []string{"foot"}, halfVec(1.03, 1))
	}
	for i := 0; i < 10; i++ {
		insertPost("pool_post_e"+string(rune('a'+i)), "Pensée édito "+string(rune('a'+i)), false, []string{"edito"}, halfVec(1, 3))
	}
	thoughtPool, err := svc.fetchEngineThoughts(ctx, &readerVec, "", 30, 0, nil)
	if err != nil {
		t.Fatalf("fetchEngineThoughts: %v", err)
	}
	if len(thoughtPool) == 0 {
		t.Fatal("pool de pensées vide")
	}
	for i := 0; i < 6; i++ {
		if !strings.HasPrefix(thoughtPool[i].id, "pool_post_f") {
			t.Fatalf("position %d : attendu une pensée du milieu, got %s", i, thoughtPool[i].id)
		}
	}
}
