package admin

// =====================================================================
// 🧭 Triage uniforme des six files — acceptation en base
// =====================================================================
// Ce que ces tests verrouillent, et rien d'autre :
//   1. les six files (signalements, recours, anti-abus, support, imports,
//      doubles validations) remontent dans « Ma file » ;
//   2. une assignation, une priorité et une échéance écrites par le service
//      sont PERSISTÉES et immédiatement visibles pour la personne assignée ;
//   3. une échéance dépassée sur un dossier ouvert est signalée « breached » ;
//   4. chaque écriture laisse une trace d'audit, flag ou pas ;
//   5. la route HTTP écrit réellement en base.
// =====================================================================

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"testing"
	"time"
)

const (
	triageReportID   = "rpt_triage_1"
	triageAppealID   = "apl_triage_1"
	triageAbuseID    = "rd_triage_1"
	triageSupportID  = "tkt_triage_1"
	triageImportID   = "imp_triage_1"
	triageApprovalID = "apr_triage_1"
)

type triageFixture struct {
	queue string
	id    string
}

// seedTriageFixtures pose un dossier ouvert dans CHACUNE des six files, puis
// nettoie tout (y compris les traces d'audit) à la fin du test.
func seedTriageFixtures(t *testing.T, ctx context.Context) []triageFixture {
	t.Helper()

	now := time.Now().UTC()
	statements := []struct {
		sql  string
		args []any
	}{
		{
			sql: `INSERT INTO "ModerationReport"
				("id", "reporterId", "targetId", "targetType", "reason", "details", "status", "createdAt", "updatedAt")
				VALUES ($1, $2::uuid, 'target-triage', 'article', 'spam', '', 'pending', $3, $3)
				ON CONFLICT ("id") DO UPDATE SET "status" = 'pending'`,
			args: []any{triageReportID, adminReaderID, now},
		},
		{
			sql: `INSERT INTO "Appeal"
				("id", "subjectType", "subjectId", "decisionId", "openedBy", "status", "createdAt", "updatedAt")
				VALUES ($1, 'account', 'acct-triage', 'dec-triage', $2, 'open', $3, $3)
				ON CONFLICT ("id") DO UPDATE SET "status" = 'open'`,
			args: []any{triageAppealID, adminReaderID, now},
		},
		{
			sql: `INSERT INTO "RiskDecision"
				("id", "policy", "version", "subjectType", "subjectId", "result", "decidedBy", "createdAt")
				VALUES ($1, 'triage-policy', '1', 'account', 'acct-triage', 'needs_review', 'auto', $2)
				ON CONFLICT ("id") DO UPDATE SET "result" = 'needs_review'`,
			args: []any{triageAbuseID, now},
		},
		{
			sql: `INSERT INTO "SupportTicket"
				("id", "kind", "subject", "openedBy", "status", "createdAt", "updatedAt")
				VALUES ($1, 'report_issue', 'Triage support', $2, 'open', $3, $3)
				ON CONFLICT ("id") DO UPDATE SET "status" = 'open'`,
			args: []any{triageSupportID, adminReaderID, now},
		},
		{
			sql: `INSERT INTO "SubscriberImportBatch"
				("id", "publicationId", "requesterId", "status", "source", "declarations",
				 "fileFingerprint", "fileVersion", "rowCount", "stats", "submittedAt", "createdAt", "updatedAt")
				VALUES ($1, 'pub-triage', $2::uuid, 'submitted', 'csv_manual', '{"noPurchased":true}'::jsonb,
				        'fp-triage', 1, 0, '{}'::jsonb, $3, $3, $3)
				ON CONFLICT ("id") DO UPDATE SET "status" = 'submitted'`,
			args: []any{triageImportID, adminReaderID, now},
		},
		{
			sql: `INSERT INTO "AdminApproval"
				("id", "act", "target", "capability", "requestedBy", "reason", "status", "expiresAt")
				VALUES ($1, 'legal_publish', 'lver-triage', 'admin.legal.write', $2::uuid,
				        'motif de test suffisant', 'pending', now() + interval '2 days')
				ON CONFLICT ("id") DO UPDATE SET "status" = 'pending'`,
			args: []any{triageApprovalID, adminAdminID},
		},
	}
	for _, statement := range statements {
		if _, err := poolTest.Exec(ctx, statement.sql, statement.args...); err != nil {
			t.Fatalf("seed triage: %v", err)
		}
	}

	fixtures := []triageFixture{
		{QueueReports, triageReportID},
		{QueueAppeals, triageAppealID},
		{QueueAbuse, triageAbuseID},
		{QueueSupport, triageSupportID},
		{QueueImports, triageImportID},
		{QueueApprovals, triageApprovalID},
	}
	t.Cleanup(func() {
		bg := context.Background()
		_, _ = poolTest.Exec(bg, `DELETE FROM "AdminAuditLog" WHERE "action" = 'queue.triage' AND "targetId" = ANY($1)`,
			[]string{triageReportID, triageAppealID, triageAbuseID, triageSupportID, triageImportID, triageApprovalID})
		_, _ = poolTest.Exec(bg, `DELETE FROM "ModerationReport" WHERE "id" = $1`, triageReportID)
		_, _ = poolTest.Exec(bg, `DELETE FROM "Appeal" WHERE "id" = $1`, triageAppealID)
		_, _ = poolTest.Exec(bg, `DELETE FROM "RiskDecision" WHERE "id" = $1`, triageAbuseID)
		_, _ = poolTest.Exec(bg, `DELETE FROM "SupportTicket" WHERE "id" = $1`, triageSupportID)
		_, _ = poolTest.Exec(bg, `DELETE FROM "SubscriberImportBatch" WHERE "id" = $1`, triageImportID)
		_, _ = poolTest.Exec(bg, `DELETE FROM "AdminApproval" WHERE "id" = $1`, triageApprovalID)
	})
	return fixtures
}

func findQueueEntry(view WorkQueueView, queue, id string) (QueueTriageEntry, bool) {
	for _, entry := range view.Entries {
		if entry.Queue == queue && entry.ID == id {
			return entry, true
		}
	}
	return QueueTriageEntry{}, false
}

func queueItem(view WorkQueueView, key string) (WorkQueueItem, bool) {
	for _, item := range view.Items {
		if item.Key == key {
			return item, true
		}
	}
	return WorkQueueItem{}, false
}

func countTriageAudit(t *testing.T, ctx context.Context) int {
	t.Helper()
	var count int
	if err := poolTest.QueryRow(ctx,
		`SELECT COUNT(*) FROM "AdminAuditLog" WHERE "action" = 'queue.triage'`).Scan(&count); err != nil {
		t.Fatalf("comptage audit: %v", err)
	}
	return count
}

// TestQueueTriage_PersistsAndAggregatesSixQueues — le test d'acceptation
// principal : les six files, l'assignation visible immédiatement, la priorité,
// l'échéance et le SLA dépassé.
func TestQueueTriage_PersistsAndAggregatesSixQueues(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	seedAdmin(t, ctx)
	svc := NewService(poolTest)
	fixtures := seedTriageFixtures(t, ctx)

	before, err := svc.GetWorkQueue(ctx, adminReaderID)
	if err != nil {
		t.Fatalf("GetWorkQueue: %v", err)
	}
	if len(before.Items) != len(fixtures) {
		t.Fatalf("files = %d, attendu %d", len(before.Items), len(fixtures))
	}
	for _, fixture := range fixtures {
		entry, ok := findQueueEntry(before, fixture.queue, fixture.id)
		if !ok {
			t.Fatalf("%s/%s absent de la vue agrégée", fixture.queue, fixture.id)
		}
		if entry.AssignedToMe {
			t.Fatalf("%s/%s déjà marqué assigné à moi avant l'écriture", fixture.queue, fixture.id)
		}
		if entry.Priority != "normal" {
			t.Fatalf("%s/%s priorité = %q, attendu normal", fixture.queue, fixture.id, entry.Priority)
		}
	}

	auditBefore := countTriageAudit(t, ctx)

	reader := adminReaderID
	high := "high"
	past := time.Now().UTC().Add(-2 * time.Hour).Format(time.RFC3339)
	for _, fixture := range fixtures {
		update := TriageUpdate{AssignedTo: &reader, Priority: &high}
		if fixture.queue == QueueReports {
			// Échéance explicitement dépassée : le SLA doit le dire.
			update.DueAt = &past
		}
		entry, err := svc.UpdateQueueTriage(ctx, adminReaderID, fixture.queue, fixture.id, update)
		if err != nil {
			t.Fatalf("UpdateQueueTriage(%s): %v", fixture.queue, err)
		}
		if entry.AssignedTo == nil || *entry.AssignedTo != adminReaderID {
			t.Fatalf("%s: assignedTo = %v, attendu %s", fixture.queue, entry.AssignedTo, adminReaderID)
		}
		if entry.Priority != "high" {
			t.Fatalf("%s: priorité = %q, attendu high", fixture.queue, entry.Priority)
		}
		if !entry.AssignedToMe {
			t.Fatalf("%s: le dossier assigné ne se marque pas « à moi »", fixture.queue)
		}
	}

	// Persistance réelle : on relit les colonnes, pas seulement le retour.
	var persistedAssignee *string
	var persistedPriority string
	var persistedDue *time.Time
	var persistedActor *string
	var persistedAt *time.Time
	if err := poolTest.QueryRow(ctx,
		`SELECT "assignedTo"::text, "priority", "dueAt", "triageUpdatedBy"::text, "triageUpdatedAt"
		   FROM "ModerationReport" WHERE "id" = $1`,
		triageReportID).Scan(&persistedAssignee, &persistedPriority, &persistedDue,
		&persistedActor, &persistedAt); err != nil {
		t.Fatalf("relecture signalement: %v", err)
	}
	if persistedAssignee == nil || *persistedAssignee != adminReaderID || persistedPriority != "high" {
		t.Fatalf("triage non persisté: assignee=%v priorité=%q", persistedAssignee, persistedPriority)
	}
	if persistedDue == nil {
		t.Fatal("échéance non persistée sur le signalement")
	}
	if persistedActor == nil || *persistedActor != adminReaderID || persistedAt == nil {
		t.Fatalf("traçabilité du triage absente: actor=%v at=%v", persistedActor, persistedAt)
	}

	after, err := svc.GetWorkQueue(ctx, adminReaderID)
	if err != nil {
		t.Fatalf("GetWorkQueue après écriture: %v", err)
	}
	// Une assignation fraîche apparaît immédiatement pour la personne concernée.
	for _, fixture := range fixtures {
		entry, ok := findQueueEntry(after, fixture.queue, fixture.id)
		if !ok {
			t.Fatalf("%s/%s disparu de la vue", fixture.queue, fixture.id)
		}
		if !entry.AssignedToMe || entry.Priority != "high" {
			t.Fatalf("%s/%s non visible comme assigné: %+v", fixture.queue, fixture.id, entry)
		}
	}
	if after.AssignedToMe < len(fixtures) {
		t.Fatalf("assignés à moi = %d, attendu au moins %d", after.AssignedToMe, len(fixtures))
	}

	breached, ok := findQueueEntry(after, QueueReports, triageReportID)
	if !ok {
		t.Fatal("signalement absent après écriture")
	}
	if breached.SLAState != "breached" {
		t.Fatalf("SLA = %q, attendu breached (échéance %v)", breached.SLAState, breached.DueAt)
	}
	reportCounters, ok := queueItem(after, QueueReports)
	if !ok || reportCounters.Breached < 1 {
		t.Fatalf("compteur SLA dépassé des signalements = %+v", reportCounters)
	}

	// L'audit est TOUJOURS écrit, une fois par mutation.
	if got := countTriageAudit(t, ctx); got != auditBefore+len(fixtures) {
		t.Fatalf("entrées d'audit queue.triage = %d, attendu %d", got, auditBefore+len(fixtures))
	}

	// Vocabulaire fermé, file inconnue, libération par chaîne vide.
	invalid := "critical"
	if _, err := svc.UpdateQueueTriage(ctx, adminReaderID, QueueReports, triageReportID,
		TriageUpdate{Priority: &invalid}); !errors.Is(err, errInvalidTriage) {
		t.Fatalf("priorité invalide: err = %v, attendu errInvalidTriage", err)
	}
	if _, err := svc.UpdateQueueTriage(ctx, adminReaderID, "unknown", triageReportID,
		TriageUpdate{}); !errors.Is(err, errQueueUnknown) {
		t.Fatalf("file inconnue: err = %v, attendu errQueueUnknown", err)
	}
	empty := ""
	released, err := svc.UpdateQueueTriage(ctx, adminReaderID, QueueSupport, triageSupportID,
		TriageUpdate{AssignedTo: &empty})
	if err != nil {
		t.Fatalf("libération: %v", err)
	}
	if released.AssignedTo != nil {
		t.Fatalf("assignation non libérée: %v", released.AssignedTo)
	}
}

// TestQueueTriageRoute_WritesThroughTheConsole — les SIX routes Go, avec leur
// garde de capacité, écrivent la ligne et l'audit, et le résultat remonte
// immédiatement dans « Ma file » pour la personne assignée.
func TestQueueTriageRoute_WritesThroughTheConsole(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	seedAdmin(t, ctx)
	seedTriageFixtures(t, ctx)

	past := time.Now().UTC().Add(-2 * time.Hour).Format(time.RFC3339)
	routes := []struct {
		queue string
		id    string
		table string
		path  string
	}{
		{QueueReports, triageReportID, `"ModerationReport"`, "/v1/admin/reports/" + triageReportID + "/triage"},
		{QueueAppeals, triageAppealID, `"Appeal"`, "/v1/admin/abuse/appeals/" + triageAppealID + "/triage"},
		{QueueAbuse, triageAbuseID, `"RiskDecision"`, "/v1/admin/abuse/decisions/" + triageAbuseID + "/triage"},
		{QueueSupport, triageSupportID, `"SupportTicket"`, "/v1/admin/support/tickets/" + triageSupportID + "/triage"},
		{QueueImports, triageImportID, `"SubscriberImportBatch"`, "/v1/admin/import/subscribers/" + triageImportID + "/triage"},
		{QueueApprovals, triageApprovalID, `"AdminApproval"`, "/v1/admin/approvals/" + triageApprovalID + "/triage"},
	}

	r := newHTTPRouter()
	for _, rt := range routes {
		body := fmt.Sprintf(`{"priority":"urgent","assignedTo":%q}`, adminReaderID)
		if rt.queue == QueueReports {
			body = fmt.Sprintf(`{"priority":"urgent","assignedTo":%q,"dueAt":%q}`, adminReaderID, past)
		}
		w := do(r, http.MethodPut, rt.path, adminAdminID, body)
		if w.Code != http.StatusOK {
			t.Fatalf("%s: triage HTTP = %d %s", rt.queue, w.Code, w.Body.String())
		}
		var entry QueueTriageEntry
		if err := json.Unmarshal(w.Body.Bytes(), &entry); err != nil {
			t.Fatalf("%s: json: %v (%s)", rt.queue, err, w.Body.String())
		}
		if entry.Priority != "urgent" || entry.AssignedTo == nil || *entry.AssignedTo != adminReaderID {
			t.Fatalf("%s: réponse = %+v", rt.queue, entry)
		}

		var priority string
		var assignee *string
		if err := poolTest.QueryRow(ctx,
			fmt.Sprintf(`SELECT "priority", "assignedTo"::text FROM %s WHERE "id" = $1`, rt.table),
			rt.id).Scan(&priority, &assignee); err != nil {
			t.Fatalf("%s: relecture: %v", rt.queue, err)
		}
		if priority != "urgent" || assignee == nil || *assignee != adminReaderID {
			t.Fatalf("%s: écriture HTTP non persistée: priorité=%q assignee=%v", rt.queue, priority, assignee)
		}

		var audits int
		if err := poolTest.QueryRow(ctx,
			`SELECT COUNT(*) FROM "AdminAuditLog" WHERE "action" = 'queue.triage' AND "targetId" = $1`,
			rt.id).Scan(&audits); err != nil {
			t.Fatalf("%s: audit: %v", rt.queue, err)
		}
		if audits != 1 {
			t.Fatalf("%s: audits = %d, attendu 1", rt.queue, audits)
		}
		var metaPriority, metaAssignee string
		if err := poolTest.QueryRow(ctx,
			`SELECT COALESCE(metadata->>'priority', ''), COALESCE(metadata->>'assignedTo', '')
			   FROM "AdminAuditLog"
			  WHERE "action" = 'queue.triage' AND "targetId" = $1
			  ORDER BY "createdAt" DESC LIMIT 1`, rt.id).Scan(&metaPriority, &metaAssignee); err != nil {
			t.Fatalf("%s: métadonnées d'audit: %v", rt.queue, err)
		}
		if metaPriority != "urgent" || metaAssignee != adminReaderID {
			t.Fatalf("%s: audit incomplet: priorité=%q assignee=%q", rt.queue, metaPriority, metaAssignee)
		}
	}

	// La vue agrégée, relue après les six écritures HTTP, les voit TOUTES.
	view, err := NewService(poolTest).GetWorkQueue(ctx, adminReaderID)
	if err != nil {
		t.Fatalf("GetWorkQueue après écritures HTTP: %v", err)
	}
	for _, rt := range routes {
		entry, ok := findQueueEntry(view, rt.queue, rt.id)
		if !ok {
			t.Fatalf("%s/%s absent de « Ma file » après écriture HTTP", rt.queue, rt.id)
		}
		if !entry.AssignedToMe || entry.Priority != "urgent" {
			t.Fatalf("%s/%s non reflété dans « Ma file »: %+v", rt.queue, rt.id, entry)
		}
	}
	report, _ := findQueueEntry(view, QueueReports, triageReportID)
	if report.SLAState != "breached" {
		t.Fatalf("SLA HTTP = %q, attendu breached", report.SLAState)
	}
}

// TestQueueTriage_RejectsClosedItem — on ne trie pas un dossier fermé : le
// triage ne doit pas ressusciter une file close par une écriture latérale.
func TestQueueTriage_RejectsClosedItem(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	seedAdmin(t, ctx)
	svc := NewService(poolTest)
	seedTriageFixtures(t, ctx)

	if _, err := poolTest.Exec(ctx,
		`UPDATE "ModerationReport" SET "status" = 'resolved' WHERE "id" = $1`, triageReportID); err != nil {
		t.Fatalf("clôture: %v", err)
	}
	priority := "high"
	if _, err := svc.UpdateQueueTriage(ctx, adminReaderID, QueueReports, triageReportID,
		TriageUpdate{Priority: &priority}); !errors.Is(err, errInvalidTriage) {
		t.Fatalf("triage d'un dossier fermé: err = %v, attendu errInvalidTriage", err)
	}
}
