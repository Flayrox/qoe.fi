package posts

import (
	"context"
	"testing"
)

// seedGatePost crée une pensée avec la restriction de réponse donnée,
// retourne son id.
func seedGatePost(t *testing.T, authorID, restriction, content string) string {
	t.Helper()
	ctx := context.Background()
	var id string
	if err := poolTest.QueryRow(ctx,
		`INSERT INTO "Post" (id, content, "authorId", "createdAt", "updatedAt", tags,
		                    visibility, "contentVisibility", "isDraft", "replyRestriction",
		                    "likeCount", "repostCount", "replyCount")
		 VALUES (gen_random_uuid()::text, $1, $2, now(), now(), ARRAY[]::text[],
		         'public', 'PUBLIC', false, $3, 0, 0, 0) RETURNING id`,
		content, authorID, restriction).Scan(&id); err != nil {
		t.Fatalf("seed gate post: %v", err)
	}
	return id
}

func TestCanReply_Everyone(t *testing.T) {
	fx := seedPosts(t)
	svc := newTestService()
	id := seedGatePost(t, fx.AuthorID, "everyone", "post public")
	res, err := svc.CanReply(context.Background(), id, fx.ViewerID)
	if err != nil {
		t.Fatalf("CanReply: %v", err)
	}
	if !res.CanReply || res.Restriction != "everyone" {
		t.Errorf("everyone → canReply=%v restriction=%q", res.CanReply, res.Restriction)
	}
}

func TestCanReply_Author(t *testing.T) {
	fx := seedPosts(t)
	svc := newTestService()
	id := seedGatePost(t, fx.AuthorID, "subscribers", "réservé")
	res, err := svc.CanReply(context.Background(), id, fx.AuthorID)
	if err != nil {
		t.Fatalf("CanReply: %v", err)
	}
	if !res.CanReply {
		t.Error("l'auteur doit toujours pouvoir répondre")
	}
}

func TestCanReply_Subscribers_Denied(t *testing.T) {
	fx := seedPosts(t)
	svc := newTestService()
	id := seedGatePost(t, fx.AuthorID, "subscribers", "réservé abonnés")
	res, err := svc.CanReply(context.Background(), id, fx.ViewerID)
	if err != nil {
		t.Fatalf("CanReply: %v", err)
	}
	if res.CanReply {
		t.Fatal("viewer sans abonnement ne doit pas pouvoir répondre")
	}
	if res.Restriction != "subscribers" || res.Reason == "" {
		t.Errorf("restriction=%q reason=%q", res.Restriction, res.Reason)
	}
}

func TestCanReply_Following_DeniedAndAllowed(t *testing.T) {
	fx := seedPosts(t)
	svc := newTestService()
	ctx := context.Background()
	id := seedGatePost(t, fx.AuthorID, "following", "réservé suivis")

	// Bob sans être suivi → refusé.
	res, err := svc.CanReply(ctx, id, fx.ViewerID)
	if err != nil {
		t.Fatalf("CanReply(denied): %v", err)
	}
	if res.CanReply || res.Restriction != "following" {
		t.Errorf("following denied → canReply=%v restriction=%q", res.CanReply, res.Restriction)
	}

	// Donne à Bob une publication personnelle + un follow par l'auteur.
	bobPub := "pub_bob_personal"
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Publication" (id, type, name, slug, "createdAt", "updatedAt")
		 VALUES ($1, 'PERSONAL', 'BobPub', 'bob-pub', now(), now())`, bobPub); err != nil {
		t.Fatalf("bob pub: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`UPDATE "User" SET "publicationId" = $1 WHERE id = $2`, bobPub, fx.ViewerID); err != nil {
		t.Fatalf("link bob pub: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Follows" (id, "readerId", "publicationId")
		 VALUES (gen_random_uuid()::text, $1::uuid, $2)`, fx.AuthorID, bobPub); err != nil {
		t.Fatalf("follow: %v", err)
	}

	res, err = svc.CanReply(ctx, id, fx.ViewerID)
	if err != nil {
		t.Fatalf("CanReply(allowed): %v", err)
	}
	if !res.CanReply {
		t.Error("bob suivi par l'auteur devrait pouvoir répondre")
	}
}

func TestCanReply_Mentioned(t *testing.T) {
	fx := seedPosts(t)
	svc := newTestService()
	ctx := context.Background()
	id := seedGatePost(t, fx.AuthorID, "mentioned", "Salut @bob viens discuter")

	// Bob mentionné → autorisé.
	res, err := svc.CanReply(ctx, id, fx.ViewerID)
	if err != nil {
		t.Fatalf("CanReply(mentioned): %v", err)
	}
	if !res.CanReply {
		t.Error("le @mentionné doit pouvoir répondre")
	}

	// Alice (3e user non mentionnée) → refusé.
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt")
		 VALUES ('00000000-0000-0000-0000-0000000000c1', 'carol@t.dev', 'carol', 'Carol', 'user', now(), now())
		 ON CONFLICT (id) DO NOTHING`); err != nil {
		t.Fatalf("carol: %v", err)
	}
	res, err = svc.CanReply(ctx, id, "00000000-0000-0000-0000-0000000000c1")
	if err != nil {
		t.Fatalf("CanReply(not mentioned): %v", err)
	}
	if res.CanReply {
		t.Error("un non-mentionné ne doit pas pouvoir répondre")
	}
}

func TestCanReply_NotFound(t *testing.T) {
	seedPosts(t)
	svc := newTestService()
	res, err := svc.CanReply(context.Background(), "post_inexistant", "00000000-0000-0000-0000-000000000003")
	if err != nil {
		t.Fatalf("CanReply(notfound): %v", err)
	}
	if res.Reason == "" || res.Restriction != "everyone" {
		t.Errorf("not found → reason=%q restriction=%q", res.Reason, res.Restriction)
	}
}

func TestValidateContentLen(t *testing.T) {
	if err := validateContentLen("court"); err != nil {
		t.Errorf("court → err %v", err)
	}
	long := make([]byte, 501)
	for i := range long {
		long[i] = 'a'
	}
	if err := validateContentLen(string(long)); err == nil {
		t.Error("501 caractères doit dépasser la limite")
	}
	// URL externe coûte 20 (pas sa longueur) → sous la limite si on répète assez
	// de URLs pour la mesurer.
	if err := validateContentLen("https://exemple.com/a"); err != nil {
		t.Errorf("URL externe simple doit passer: %v", err)
	}
	// Beaucoup de URLs externes dépassent les 500 (chaque URL = 20).
	manyExt := ""
	for i := 0; i < 26; i++ {
		manyExt += " https://exemple.com/a"
	}
	if err := validateContentLen(manyExt); err == nil {
		t.Error("26 URLs externes (520) doivent échouer")
	}
	// URL interne (post/article/thought) coûte 0 → 19 'a' + URL interne = OK.
	if err := validateContentLen("aaaaaaaaaaaaaaaaaaa /article/abc"); err != nil {
		t.Errorf("URL interne ne doit pas compter: %v", err)
	}
}