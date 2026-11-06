package admin

// « Ma file » agrège les SIX files triables. Elle ne crée aucune table Task :
// elle lit les lignes métier et leurs champs de triage. Ce test prouve que la
// requête s'exécute sur le schéma réel et que le compteur suit la machine à
// états métier (un signalement ouvert entre, un signalement clos sort).

import (
	"context"
	"testing"
)

func TestWorkQueue_FollowsOpenStateAndAggregatesSixFiles(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	seedAdmin(t, ctx)
	svc := NewService(poolTest)

	before, err := svc.GetWorkQueue(ctx, adminAdminID)
	if err != nil {
		t.Fatalf("GetWorkQueue: %v", err)
	}
	if len(before.Items) != 6 {
		t.Fatalf("files = %d, attendu 6 (%+v)", len(before.Items), before.Items)
	}
	wantKeys := map[string]bool{
		QueueReports: true, QueueSupport: true, QueueAppeals: true,
		QueueImports: true, QueueApprovals: true, QueueAbuse: true,
	}
	for _, item := range before.Items {
		if !wantKeys[item.Key] {
			t.Fatalf("file inattendue %q", item.Key)
		}
		delete(wantKeys, item.Key)
		if item.Label == "" || item.Href == "" || item.Count < 0 {
			t.Fatalf("ligne incomplète: %+v", item)
		}
	}
	if len(wantKeys) != 0 {
		t.Fatalf("files manquantes: %v", wantKeys)
	}
	beforeReports, _ := queueItem(before, QueueReports)

	const reportID = "rpt_wq_test"
	if _, err := poolTest.Exec(ctx, `
		INSERT INTO "ModerationReport"
			("id", "reporterId", "targetId", "targetType", "reason", "details", "status", "createdAt", "updatedAt")
		VALUES ($1, $2::uuid, 'target-wq', 'article', 'spam', '', 'pending', now(), now())
		ON CONFLICT ("id") DO UPDATE SET "status" = 'pending'`,
		reportID, adminReaderID); err != nil {
		t.Fatalf("seed report: %v", err)
	}
	t.Cleanup(func() {
		_, _ = poolTest.Exec(context.Background(), `DELETE FROM "ModerationReport" WHERE "id" = $1`, reportID)
	})

	after, err := svc.GetWorkQueue(ctx, adminAdminID)
	if err != nil {
		t.Fatalf("GetWorkQueue après insertion: %v", err)
	}
	afterReports, _ := queueItem(after, QueueReports)
	if afterReports.Count != beforeReports.Count+1 {
		t.Fatalf("signalements = %d, attendu %d", afterReports.Count, beforeReports.Count+1)
	}

	// Un dossier clos sort de la file : le compteur suit l'état, pas un total.
	if _, err := poolTest.Exec(ctx,
		`UPDATE "ModerationReport" SET "status" = 'resolved' WHERE "id" = $1`, reportID); err != nil {
		t.Fatalf("resolve: %v", err)
	}
	final, err := svc.GetWorkQueue(ctx, adminAdminID)
	if err != nil {
		t.Fatalf("GetWorkQueue final: %v", err)
	}
	finalReports, _ := queueItem(final, QueueReports)
	if finalReports.Count != beforeReports.Count {
		t.Fatalf("signalements après clôture = %d, attendu %d", finalReports.Count, beforeReports.Count)
	}
}
