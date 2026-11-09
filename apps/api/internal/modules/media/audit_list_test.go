package media

// Test du listing du journal média : pagination, filtres par famille et
// recherche, plus le refus des rôles qui n'administrent pas le média.

import (
	"context"
	"testing"
)

func TestListAuditLog_FiltersPagesAndRestricts(t *testing.T) {
	ctx := context.Background()
	seedMedia(t, ctx)
	svc := newTestService()

	entries := []struct {
		action   string
		metadata string
		minutes  int
	}{
		{"media.created", `{}`, 30},
		{"media.article_created", `{"title":"Premier article"}`, 20},
		{"member.role_changed", `{"role":"editor"}`, 10},
	}
	for _, e := range entries {
		if _, err := poolTest.Exec(ctx, `
			INSERT INTO "MediaAuditLog" (id, "mediaId", "actorId", action, metadata, "createdAt")
			VALUES (gen_random_uuid()::text, 'media_001', $1, $2, $3::jsonb, now() - make_interval(mins => $4))`,
			mediaOwnerID, e.action, e.metadata, e.minutes); err != nil {
			t.Fatalf("insert audit %s: %v", e.action, err)
		}
	}

	// Première page : les plus récentes d'abord, total complet.
	page, err := svc.ListAuditLog(ctx, mediaOwnerID, "media_001", AuditLogFilter{Limit: 2})
	if err != nil {
		t.Fatalf("ListAuditLog: %v", err)
	}
	if page.Total != 3 || len(page.Entries) != 2 || page.Limit != 2 {
		t.Fatalf("page = total %d, entries %d, limit %d — attendu 3/2/2", page.Total, len(page.Entries), page.Limit)
	}
	if page.Entries[0].Action != "member.role_changed" || page.Entries[1].Action != "media.article_created" {
		t.Fatalf("ordre = %s, %s", page.Entries[0].Action, page.Entries[1].Action)
	}
	if page.Entries[0].Actor == nil || page.Entries[0].Actor.Username == nil || *page.Entries[0].Actor.Username != "ownermedia" {
		t.Fatalf("acteur = %+v", page.Entries[0].Actor)
	}

	// Seconde page : une seule entrée restante.
	page, err = svc.ListAuditLog(ctx, mediaOwnerID, "media_001", AuditLogFilter{Limit: 2, Offset: 2})
	if err != nil {
		t.Fatalf("ListAuditLog offset: %v", err)
	}
	if len(page.Entries) != 1 || page.Entries[0].Action != "media.created" {
		t.Fatalf("page 2 = %+v", page.Entries)
	}

	// Filtre par famille.
	page, err = svc.ListAuditLog(ctx, mediaOwnerID, "media_001", AuditLogFilter{Category: "articles"})
	if err != nil {
		t.Fatalf("ListAuditLog catégorie: %v", err)
	}
	if page.Total != 1 || len(page.Entries) != 1 || page.Entries[0].Action != "media.article_created" {
		t.Fatalf("catégorie articles = total %d, %+v", page.Total, page.Entries)
	}

	// Recherche dans les métadonnées.
	page, err = svc.ListAuditLog(ctx, mediaOwnerID, "media_001", AuditLogFilter{Query: "editor"})
	if err != nil {
		t.Fatalf("ListAuditLog recherche: %v", err)
	}
	if page.Total != 1 || page.Entries[0].Action != "member.role_changed" {
		t.Fatalf("recherche editor = total %d, %+v", page.Total, page.Entries)
	}

	// Un writer n'administre pas le journal ; un étranger non plus.
	if _, err := svc.ListAuditLog(ctx, mediaWriterID, "media_001", AuditLogFilter{}); err == nil {
		t.Fatal("writer ne doit pas lire le journal")
	}
	if _, err := svc.ListAuditLog(ctx, mediaStranger, "media_001", AuditLogFilter{}); err == nil {
		t.Fatal("étranger ne doit pas lire le journal")
	}
}
