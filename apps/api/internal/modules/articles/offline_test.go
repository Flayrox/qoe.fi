package articles

// Hors-ligne (fiche Plus P1) : pack gaté Plus + droit auteur + paywall
// respecté, file idempotente. Exige Postgres — skippé sans Docker.

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/qoefi/api/internal/subscriptions"
)

func TestOfflinePack_Gates(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	fx := seed(t)
	svc := NewService(poolTest, nil, nil)
	now := time.Now()
	slug := fx.ArticleSlugs[0]

	// Sans compte : refusé (pas de hors-ligne anonyme).
	if _, err := svc.OfflinePack(ctx, slug, "", ""); !errors.Is(err, ErrOfflineForbidden) {
		t.Fatalf("anonyme : attendu ErrOfflineForbidden, obtenu %v", err)
	}
	// Sans Plus : 403 avec la cause précise.
	reader := seedReader(t, ctx)
	if _, err := svc.OfflinePack(ctx, slug, reader, ""); !errors.Is(err, ErrOfflinePlusRequired) {
		t.Fatalf("sans Plus : attendu ErrOfflinePlusRequired, obtenu %v", err)
	}
	// Octroi Plus : pack servi, versionné.
	if _, err := subscriptions.GrantPlan(ctx, poolTest, subscriptions.SubjectUser, reader,
		subscriptions.PlanPlus, now, nil, "staff-test", "test offline", now); err != nil {
		t.Fatalf("octroi : %v", err)
	}
	// L'article : id ou slug ? OfflinePack prend l'ID — résolvons.
	var articleID string
	if err := poolTest.QueryRow(ctx, `SELECT id FROM "Article" WHERE slug = $1`, slug).Scan(&articleID); err != nil {
		t.Fatalf("resolve slug : %v", err)
	}
	pack, err := svc.OfflinePack(ctx, articleID, reader, "")
	if err != nil {
		t.Fatalf("pack Plus : %v", err)
	}
	if pack.Version != "v1" || pack.ID != articleID || pack.Title == "" || pack.Content == "" {
		t.Fatalf("pack incomplet : %+v", pack)
	}
	if !pack.Downloadable {
		t.Fatal("pack : Downloadable vrai attendu")
	}
	poolTest.Exec(ctx, `DELETE FROM "SubscriptionGrant" WHERE "subjectId" = $1`, reader)
}

func TestOfflinePack_AuthorRight(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	fx := seed(t)
	svc := NewService(poolTest, nil, nil)
	now := time.Now()
	reader := seedReader(t, ctx)
	if _, err := subscriptions.GrantPlan(ctx, poolTest, subscriptions.SubjectUser, reader,
		subscriptions.PlanPlus, now, nil, "staff-test", "test", now); err != nil {
		t.Fatalf("octroi : %v", err)
	}
	var articleID string
	if err := poolTest.QueryRow(ctx, `SELECT id FROM "Article" WHERE slug = $1`, fx.ArticleSlugs[0]).Scan(&articleID); err != nil {
		t.Fatalf("resolve : %v", err)
	}
	// L'auteur restreint : même en Plus, refusé avec LA cause.
	if _, err := svc.SetAllowDownload(ctx, articleID, fx.AuthorID, false); err != nil {
		t.Fatalf("toggle auteur : %v", err)
	}
	if _, err := svc.OfflinePack(ctx, articleID, reader, ""); !errors.Is(err, ErrOfflineNotDownloadable) {
		t.Fatalf("restreint : attendu ErrOfflineNotDownloadable, obtenu %v", err)
	}
	// Un tiers ne peut pas (re)ouvrir : 404, pas 403 (pas de fuite).
	if _, err := svc.SetAllowDownload(ctx, articleID, reader, true); err == nil {
		t.Fatal("tiers : refus attendu")
	}
	// Rétabli pour les autres tests (droit auteur + grant).
	if _, err := svc.SetAllowDownload(ctx, articleID, fx.AuthorID, true); err != nil {
		t.Fatalf("rétablir : %v", err)
	}
	poolTest.Exec(ctx, `DELETE FROM "SubscriptionGrant" WHERE "subjectId" = $1`, reader)
}

func TestListenLater_IdempotentOrdered(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	fx := seed(t)
	svc := NewService(poolTest, nil, nil)
	reader := seedReader(t, ctx)
	var a1, a2 string
	poolTest.QueryRow(ctx, `SELECT id FROM "Article" WHERE slug = $1`, fx.ArticleSlugs[0]).Scan(&a1)
	poolTest.QueryRow(ctx, `SELECT id FROM "Article" WHERE slug = $1`, fx.ArticleSlugs[1]).Scan(&a2)

	id1, err := svc.AddListenLater(ctx, reader, a1)
	if err != nil || id1 == "" {
		t.Fatalf("ajout : %v", err)
	}
	// Doublon : no-op, même id.
	id1b, err := svc.AddListenLater(ctx, reader, a1)
	if err != nil || id1b != id1 {
		t.Fatalf("doublon : attendu no-op (%s), obtenu (%s, %v)", id1, id1b, err)
	}
	if _, err := svc.AddListenLater(ctx, reader, a2); err != nil {
		t.Fatalf("ajout 2 : %v", err)
	}
	items, err := svc.ListListenLater(ctx, reader)
	if err != nil || len(items) != 2 {
		t.Fatalf("file (2) : %+v (%v)", items, err)
	}
	if items[0].ArticleID != a1 || items[1].ArticleID != a2 {
		t.Fatalf("ordre d'ajout attendu, obtenu %+v", items)
	}
	if err := svc.RemoveListenLater(ctx, reader, a1); err != nil {
		t.Fatalf("retrait : %v", err)
	}
	items, _ = svc.ListListenLater(ctx, reader)
	if len(items) != 1 || items[0].ArticleID != a2 {
		t.Fatalf("après retrait : %+v", items)
	}
	// Retrait inexistant : no-op, pas d'erreur.
	if err := svc.RemoveListenLater(ctx, reader, a1); err != nil {
		t.Fatalf("re-retrait : %v", err)
	}
	poolTest.Exec(ctx, `DELETE FROM "ListenLater" WHERE "userId" = $1::uuid`, reader)
}

func TestListenLater_RespectsAuthorRight(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	fx := seed(t)
	svc := NewService(poolTest, nil, nil)
	reader := seedReader(t, ctx)
	var articleID string
	poolTest.QueryRow(ctx, `SELECT id FROM "Article" WHERE slug = $1`, fx.ArticleSlugs[0]).Scan(&articleID)
	if _, err := svc.SetAllowDownload(ctx, articleID, fx.AuthorID, false); err != nil {
		t.Fatalf("toggle : %v", err)
	}
	// Ajouter à la file ne demande PAS Plus, mais refuse le non-téléchargeable.
	if _, err := svc.AddListenLater(ctx, reader, articleID); !errors.Is(err, ErrOfflineNotDownloadable) {
		t.Fatalf("restreint : attendu ErrOfflineNotDownloadable, obtenu %v", err)
	}
	svc.SetAllowDownload(ctx, articleID, fx.AuthorID, true)
	poolTest.Exec(ctx, `DELETE FROM "ListenLater" WHERE "userId" = $1::uuid`, reader)
}

func TestSetAllowDownload_Unknown(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	seed(t)
	svc := NewService(poolTest, nil, nil)
	if _, err := svc.SetAllowDownload(ctx, "00000000-0000-0000-0000-000000000000", seedReader(t, ctx), false); err == nil {
		t.Fatal("inexistant : erreur attendue")
	}
}
