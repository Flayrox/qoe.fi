package feed

import (
	"context"
	"testing"
)

// seedCoRead matérialise l'affinité de lecture : le lecteur (reader) lit 3 fois
// les deux articles de base ; le voisin (neighbor) lit ces deux-là PLUS un
// article « candidat » que le lecteur n'a jamais lu ; le voisin like une pensée
// (bob) que le lecteur n'a ni postée ni likée.
func seedCoRead(t *testing.T, ctx context.Context) (readerID, neighborID string) {
	t.Helper()
	readerID, err := seedEngine(ctx, poolTest)
	if err != nil {
		t.Fatalf("seed engine: %v", err)
	}
	neighborID = "00000000-0000-0000-0000-000000000011" // alice
	bobID := "00000000-0000-0000-0000-000000000012"

	// Article candidat (publié) que seul le voisin lit.
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Article" (id, title, slug, content, published, visibility, "readingTime",
		                        status, "publicationId", "authorId", "createdAt", "updatedAt", embedding)
		 VALUES ('eng_art_candidate', 'Candidat CF', 'eng-art-candidate', '<p>x</p>', true, 'PUBLIC', 5,
		         'PUBLISHED', 'pub_engine', $1, now(), now(), `+vec512+`)`, bobID); err != nil {
		t.Fatalf("article candidat: %v", err)
	}

	insertRead := func(userID, articleID, status string) {
		t.Helper()
		if _, err := poolTest.Exec(ctx,
			`INSERT INTO "ReadingSession" (id, "articleId", "userId", source, status)
			 VALUES (gen_random_uuid()::text, $1, $2::uuid, 'feed', $3)`, articleID, userID, status); err != nil {
			t.Fatalf("reading session %s/%s: %v", userID, articleID, err)
		}
	}
	// Lecteur : 3 lectures sur les articles de base (seuil cfMinMyReads=3).
	insertRead(readerID, "eng_art_a", "READ_COMPLETE")
	insertRead(readerID, "eng_art_b", "READ_PARTIAL")
	insertRead(readerID, "eng_art_a", "SKIM")
	// Voisin lit les mêmes articles + le candidat → affinité ET candidat.
	insertRead(neighborID, "eng_art_a", "READ_COMPLETE")
	insertRead(neighborID, "eng_art_b", "READ_COMPLETE")
	insertRead(neighborID, "eng_art_candidate", "READ_COMPLETE")

	// Le voisin like une pensée de bob (que le lecteur n'a ni likée ni postée).
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Like" (id, "postId", "userId") SELECT gen_random_uuid()::text, id, $1::uuid
		 FROM "Post" WHERE "authorId" = $2 AND id NOT IN (SELECT id FROM "Post" WHERE "authorId"=$3)
		 LIMIT 1`, neighborID, bobID, readerID); err != nil {
		t.Fatalf("like voisin: %v", err)
	}

	return readerID, neighborID
}

func TestCoReadNeighbors_ReturnsAffinity(t *testing.T) {
	ctx := context.Background()
	readerID, _ := seedCoRead(t, ctx)
	svc := newTestService()

	neighbors, ok := svc.coReadNeighbors(ctx, readerID, svc.loadEngineConfig(ctx))
	if !ok {
		t.Fatal("coReadNeighbors doit trouver un voisin")
	}
	if len(neighbors) != 1 {
		t.Fatalf("voisins = %d, attendu 1", len(neighbors))
	}
	if v, ok := neighbors["00000000-0000-0000-0000-000000000011"]; !ok || v <= 0 {
		t.Errorf("affinité alice absent ou nul: %v", neighbors)
	}
}

func TestGetCoReadCandidates_ReturnsUnreadArticles(t *testing.T) {
	ctx := context.Background()
	readerID, _ := seedCoRead(t, ctx)
	svc := newTestService()

	cands := svc.getCoReadCandidates(ctx, readerID, svc.loadEngineConfig(ctx))
	if len(cands) == 0 {
		t.Fatal("aucun candidat CF article")
	}
	if _, ok := cands["eng_art_candidate"]; !ok {
		t.Errorf("l'article candidat doit remonter: %v", cands)
	}
}

func TestGetCoReadThoughtCandidates_ReturnsLikedThought(t *testing.T) {
	ctx := context.Background()
	readerID, _ := seedCoRead(t, ctx)
	svc := newTestService()

	cands := svc.getCoReadThoughtCandidates(ctx, readerID, svc.loadEngineConfig(ctx))
	if len(cands) == 0 {
		t.Fatal("aucun candidat CF pensée")
	}
}

func TestCoReadInteractsWithPersonalizedEngine(t *testing.T) {
	ctx := context.Background()
	readerID, _ := seedCoRead(t, ctx)
	svc := newTestService()

	res, err := svc.PersonalizedEngine(ctx, readerID, 8, 0, -1)
	if err != nil {
		t.Fatalf("PersonalizedEngine (CF): %v", err)
	}
	if len(res.Items) == 0 {
		t.Fatal("feed CF ne renvoie aucun item")
	}
}
