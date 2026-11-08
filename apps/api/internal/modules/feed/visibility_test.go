package feed

import (
	"context"
	"testing"
)

// TestHydrateArticles_Visibility vérifie que l'hydratation par ID ne contourne
// ni le statut de publication, ni la visibilité privée, ni un blocage.
func TestHydrateArticles_Visibility(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	readerID, err := seedEngine(ctx, poolTest)
	if err != nil {
		t.Fatalf("seed engine: %v", err)
	}

	const aliceID = "00000000-0000-0000-0000-000000000011"
	const draftArticleID = "eng_art_draft"
	const draftPostID = "eng_post_draft"

	if _, err := poolTest.Exec(ctx, `
		INSERT INTO "Article" (id, title, slug, content, published, visibility, "readingTime",
		                        status, "publicationId", "authorId", "createdAt", "updatedAt")
		VALUES ($1, 'Brouillon', 'brouillon', '<p>Brouillon</p>', false, 'PUBLIC', 8,
		        'DRAFT', 'pub_engine', $2, now(), now())`, draftArticleID, aliceID); err != nil {
		t.Fatalf("seed draft article: %v", err)
	}
	if _, err := poolTest.Exec(ctx, `
		INSERT INTO "Post" (id, content, "authorId", "createdAt", "updatedAt", tags,
		                    visibility, "contentVisibility", "isDraft", "replyRestriction",
		                    "likeCount", "repostCount", "replyCount")
		VALUES ($1, 'Brouillon', $2, now(), now(), ARRAY[]::text[],
		        'public', 'PUBLIC', true, 'everyone', 0, 0, 0)`, draftPostID, aliceID); err != nil {
		t.Fatalf("seed draft post: %v", err)
	}

	svc := newTestService()

	// Article public : visible anonymement.
	arts, err := svc.HydrateArticles(ctx, []string{"eng_art_a"}, "")
	if err != nil {
		t.Fatalf("hydrate public: %v", err)
	}
	if len(arts) != 1 {
		t.Fatalf("article public = %d, attendu 1", len(arts))
	}

	// Un brouillon n'est jamais hydraté, même pour son auteur.
	arts, err = svc.HydrateArticles(ctx, []string{draftArticleID}, aliceID)
	if err != nil {
		t.Fatalf("hydrate draft: %v", err)
	}
	if len(arts) != 0 {
		t.Fatalf("brouillon hydraté = %d, attendu 0", len(arts))
	}
	slices, err := svc.buildSlices(ctx, []string{draftPostID}, aliceID, false)
	if err != nil {
		t.Fatalf("hydrate draft thought: %v", err)
	}
	if len(slices) != 0 {
		t.Fatalf("pensée brouillon hydratée = %d, attendu 0", len(slices))
	}

	// Compte privé : anonyme masqué, abonné autorisé.
	if _, err := poolTest.Exec(ctx, `
		INSERT INTO "UserSettings" (id, "userId", "profileVisibility", "updatedAt")
		VALUES (gen_random_uuid()::text, $1, 'PRIVATE', now())
		ON CONFLICT ("userId") DO UPDATE SET "profileVisibility" = 'PRIVATE'`, aliceID); err != nil {
		t.Fatalf("private settings: %v", err)
	}
	arts, err = svc.HydrateArticles(ctx, []string{"eng_art_a"}, "")
	if err != nil {
		t.Fatalf("hydrate private anonymous: %v", err)
	}
	if len(arts) != 0 {
		t.Fatalf("article privé anonyme = %d, attendu 0", len(arts))
	}
	if _, err := poolTest.Exec(ctx, `
		INSERT INTO "Follows" (id, "readerId", "publicationId", "createdAt")
		VALUES ('follow_visibility', $1, 'pub_engine', now())`, readerID); err != nil {
		t.Fatalf("follow: %v", err)
	}
	arts, err = svc.HydrateArticles(ctx, []string{"eng_art_a"}, readerID)
	if err != nil {
		t.Fatalf("hydrate private follower: %v", err)
	}
	if len(arts) != 1 {
		t.Fatalf("article privé abonné = %d, attendu 1", len(arts))
	}

	// Le blocage coupe l'accès même à un abonné.
	if _, err := poolTest.Exec(ctx, `
		INSERT INTO "BlockedUser" (id, "creatorId", "readerId")
		VALUES ('block_visibility', $1, $2)`, aliceID, readerID); err != nil {
		t.Fatalf("block: %v", err)
	}
	arts, err = svc.HydrateArticles(ctx, []string{"eng_art_a"}, readerID)
	if err != nil {
		t.Fatalf("hydrate blocked: %v", err)
	}
	if len(arts) != 0 {
		t.Fatalf("article bloqué = %d, attendu 0", len(arts))
	}
}

// TestHydrateArticles_MediaUsesPublicationOwnerVisibility vérifie qu'un membre
// de média au profil personnel privé ne masque pas les articles du média, et
// qu'un blocage contre le propriétaire du média les masque bien.
func TestHydrateArticles_MediaUsesPublicationOwnerVisibility(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	readerID, err := seedEngine(ctx, poolTest)
	if err != nil {
		t.Fatalf("seed engine: %v", err)
	}

	const ownerID = "00000000-0000-0000-0000-000000000011"
	const memberID = "00000000-0000-0000-0000-000000000013"

	if _, err := poolTest.Exec(ctx,
		`UPDATE "User" SET "publicationId" = 'pub_engine' WHERE id = $1`, ownerID); err != nil {
		t.Fatalf("owner publication: %v", err)
	}
	// Le membre n'a pas la publication du média dans "User"."publicationId" :
	// son appartenance passe par MediaMember, et son profil personnel suit sa
	// propre visibilité. Sinon le propriétaire serait ambigu.
	if _, err := poolTest.Exec(ctx, `
		INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt")
		VALUES ($1, 'member@t.dev', 'membervis', 'Membre', 'creator', now(), now())`, memberID); err != nil {
		t.Fatalf("member: %v", err)
	}
	if _, err := poolTest.Exec(ctx, `
		INSERT INTO "UserSettings" (id, "userId", "profileVisibility", "updatedAt")
		VALUES (gen_random_uuid()::text, $1, 'PRIVATE', now())`, memberID); err != nil {
		t.Fatalf("member private settings: %v", err)
	}
	if _, err := poolTest.Exec(ctx, `
		INSERT INTO "Article" (id, title, slug, content, published, visibility, "readingTime",
		                        status, "publicationId", "authorId", "createdAt", "updatedAt")
		VALUES ('eng_art_member', 'Article média', 'article-media', '<p>Média</p>', true, 'PUBLIC', 8,
		        'PUBLISHED', 'pub_engine', $1, now(), now())`, memberID); err != nil {
		t.Fatalf("member article: %v", err)
	}

	svc := newTestService()
	arts, err := svc.HydrateArticles(ctx, []string{"eng_art_member"}, "")
	if err != nil {
		t.Fatalf("hydrate media member private: %v", err)
	}
	if len(arts) != 1 {
		t.Fatalf("article média avec membre privé = %d, attendu 1 (visibilité du propriétaire)", len(arts))
	}

	// Blocage contre le propriétaire du média → article masqué pour le viewer.
	if _, err := poolTest.Exec(ctx, `
		INSERT INTO "BlockedUser" (id, "creatorId", "readerId")
		VALUES ('block_media_owner', $1, $2)`, ownerID, readerID); err != nil {
		t.Fatalf("block media owner: %v", err)
	}
	arts, err = svc.HydrateArticles(ctx, []string{"eng_art_member"}, readerID)
	if err != nil {
		t.Fatalf("hydrate blocked media owner: %v", err)
	}
	if len(arts) != 0 {
		t.Fatalf("article média après blocage du propriétaire = %d, attendu 0", len(arts))
	}
	if _, err := poolTest.Exec(ctx,
		`DELETE FROM "BlockedUser" WHERE id = 'block_media_owner'`); err != nil {
		t.Fatalf("unblock media owner: %v", err)
	}

	// Propriétaire privé → l'article du média disparaît anonymement.
	if _, err := poolTest.Exec(ctx, `
		INSERT INTO "UserSettings" (id, "userId", "profileVisibility", "updatedAt")
		VALUES (gen_random_uuid()::text, $1, 'PRIVATE', now())
		ON CONFLICT ("userId") DO UPDATE SET "profileVisibility" = 'PRIVATE'`, ownerID); err != nil {
		t.Fatalf("owner private settings: %v", err)
	}
	arts, err = svc.HydrateArticles(ctx, []string{"eng_art_member"}, "")
	if err != nil {
		t.Fatalf("hydrate media owner private: %v", err)
	}
	if len(arts) != 0 {
		t.Fatalf("article média avec propriétaire privé = %d, attendu 0", len(arts))
	}
}
