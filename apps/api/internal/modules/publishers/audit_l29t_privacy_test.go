package publishers

// Complément vert du lot L29t : le prédicat can_view_profile ne doit pas
// fermer la page au propriétaire ni à ses abonnés (il ne teste pas seulement
// « public »).

import (
	"context"
	"testing"
)

func TestAuditL29T_FollowerStillSeesPrivateAccountArticles(t *testing.T) {
	_, ownerID, _ := seedPublisher(t)
	ctx := context.Background()
	if _, err := poolTest.Exec(ctx, `
		INSERT INTO "UserSettings" (id, "userId", "profileVisibility", "updatedAt")
		VALUES ('us_l29t_follower', $1::uuid, 'PRIVATE', now())
		ON CONFLICT ("userId") DO UPDATE SET "profileVisibility" = 'PRIVATE'`, ownerID); err != nil {
		t.Fatalf("settings: %v", err)
	}

	svc := NewService(poolTest)
	readerID := "00000000-0000-0000-0000-0000000000e2"
	pub, err := svc.ByDomain(ctx, "tenant", readerID)
	if err != nil {
		t.Fatalf("ByDomain abonné: %v", err)
	}
	if len(pub.Articles) != 1 {
		t.Fatalf("abonné voit %d articles, attendu 1", len(pub.Articles))
	}
	bundle, err := svc.Article(ctx, "tenant", "article-tenant", readerID, "")
	if err != nil {
		t.Fatalf("Article abonné: %v", err)
	}
	if bundle.Article.ID == "" {
		t.Fatal("article vide pour un abonné")
	}

	// Le propriétaire garde évidemment l'accès.
	if _, err := svc.Article(ctx, "tenant", "article-tenant", ownerID, ""); err != nil {
		t.Fatalf("Article propriétaire: %v", err)
	}
}
