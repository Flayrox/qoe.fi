package admin

import (
	"context"
	"strings"
	"testing"
)

// La validation du contenu est pure : catégories fermées, variables sur liste
// blanche, traductions requises pour le légal. Aucune DB nécessaire.
func TestValidateCampaignContent(t *testing.T) {
	ok := validateCampaignContent(CampaignStaffDirect, "Sujet", "<p>Bonjour {{publication_name}}</p>", "", "")
	if ok != nil {
		t.Fatalf("contenu valide refusé : %v", ok)
	}
	// Catégorie inconnue : jamais de message hors registre.
	if err := validateCampaignContent("promo_surprise", "S", "<p>x</p>", "", ""); err == nil {
		t.Fatal("catégorie inconnue acceptée : un message dit « obligatoire » ne doit pas servir de promotion")
	}
	// Variable hors liste blanche : rejetée avant tout stockage.
	for _, bad := range []string{"{{user_password}}", "{{ tracking_id }}", "{{user_name}}"} {
		if err := validateCampaignContent(CampaignStaffDirect, "S", "<p>"+bad+"</p>", "", ""); err == nil {
			t.Fatalf("variable %q acceptée : aucun HTML arbitraire via les variables", bad)
		}
	}
	// Légal sans anglais : bloqué (fiche 04 §12 — pas d'envoi si la traduction
	// légale requise manque).
	if err := validateCampaignContent(CampaignLegalNotice, "Sujet", "<p>FR</p>", "", ""); err == nil {
		t.Fatal("avis légal sans anglais accepté")
	}
	if err := validateCampaignContent(CampaignLegalNotice, "Sujet", "<p>FR</p>", "Subject", "<p>EN</p>"); err != nil {
		t.Fatalf("avis légal complet refusé : %v", err)
	}
	// Limites de taille.
	if err := validateCampaignContent(CampaignStaffDirect, strings.Repeat("x", maxCampaignSubject+1), "<p>x</p>", "", ""); err == nil {
		t.Fatal("objet trop long accepté")
	}
}

func TestRenderCampaignVars_Escapes(t *testing.T) {
	out := RenderCampaignVars(
		"<p>{{publication_name}}</p><a href=\"{{unsubscribe_url}}\">stop</a>",
		"<Journal & Co>",
		"https://x.test/u?a=1&b=2",
	)
	if strings.Contains(out, "<Journal") {
		t.Fatalf("nom de publication non échappé : %q", out)
	}
	if !strings.Contains(out, "&lt;Journal") || !strings.Contains(out, "&amp;") {
		t.Fatalf("échappement absent : %q", out)
	}
	// Texte sans variable : inchangé (pas de réécriture surprise).
	plain := "<p>Bonjour</p>"
	if got := RenderCampaignVars(plain, "X", "https://x.test/u"); got != plain {
		t.Fatalf("texte sans variable modifié : %q", got)
	}
}

func TestValidCampaignAudience(t *testing.T) {
	if !validCampaignAudience(CampaignAudienceAllUsers, "") {
		t.Fatal("audience globale sans publication refusée à tort")
	}
	if validCampaignAudience(CampaignAudienceAllUsers, "pub_1") {
		t.Fatal("audience globale AVEC publication acceptée : incohérent")
	}
	if !validCampaignAudience(CampaignAudienceSubscribers, "pub_1") {
		t.Fatal("audience publication refusée à tort")
	}
	if validCampaignAudience(CampaignAudienceSubscribers, "") {
		t.Fatal("audience publication sans publication acceptée")
	}
	if validCampaignAudience("csv_libre", "") {
		t.Fatal("audience libre acceptée : jamais de liste libre")
	}
}

// ── Cycle de vie complet, contre Postgres éphémère ─────────────────────
// Brouillon → revue → approbation (second superadmin) → envoi → clôture.
// Sans Docker, ces tests sont skippés (même pattern que le reste du module).

func seedCampaignPub(t *testing.T, ctx context.Context, pubID string) {
	t.Helper()
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Publication" (id, type, name, slug, "createdAt", "updatedAt")
		 VALUES ($1, 'PERSONAL', 'Campagne Test', 'campagne-test', now(), now())
		 ON CONFLICT (id) DO NOTHING`, pubID); err != nil {
		t.Fatalf("publication: %v", err)
	}
}

const (
	campaignOwnerA = "00000000-0000-0000-0000-00000000c101"
	campaignOwnerB = "00000000-0000-0000-0000-00000000c102"
)

func TestStaffCampaign_LifecycleComplet(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	svc := NewService(poolTest)

	seedCampaignPub(t, ctx, "pub_camp_001")
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Subscriber" (id, email, "publicationId", "isActive", "receiveArticles", "confirmedAt", "createdAt", "updatedAt")
		 VALUES
		  (gen_random_uuid()::text, 'camp-ok@test.dev', 'pub_camp_001', true, true, now(), now(), now()),
		  (gen_random_uuid()::text, 'camp-off@test.dev', 'pub_camp_001', true, false, now(), now(), now())`); err != nil {
		t.Fatalf("seed abonnés: %v", err)
	}
	t.Cleanup(func() {
		_, _ = poolTest.Exec(ctx, `DELETE FROM "StaffCampaignDelivery" WHERE "campaignId" LIKE 'camp-%'`)
		_, _ = poolTest.Exec(ctx, `DELETE FROM "StaffCampaign" WHERE id LIKE 'camp-%'`)
		_, _ = poolTest.Exec(ctx, `DELETE FROM "Subscriber" WHERE "publicationId" = 'pub_camp_001'`)
	})

	// 1. Brouillon invalide refusé (catégorie inconnue).
	if _, err := svc.CreateCampaign(ctx, campaignOwnerA, StaffCampaignInput{
		Type: "promo_surprise", Subject: "S", BodyHTML: "<p>x</p>",
		AudienceType: CampaignAudienceSubscribers, AudiencePubID: "pub_camp_001",
	}); err == nil {
		t.Fatal("catégorie inconnue acceptée")
	}

	created, err := svc.CreateCampaign(ctx, campaignOwnerA, StaffCampaignInput{
		Type: "product.announcement", Subject: "Nouveauté {{publication_name}}",
		BodyHTML:     "<p>Bonjour, <a href=\"{{unsubscribe_url}}\">stop</a></p>",
		AudienceType: CampaignAudienceSubscribers, AudiencePubID: "pub_camp_001",
	})
	if err != nil {
		t.Fatalf("CreateCampaign: %v", err)
	}
	if created.Status != "draft" {
		t.Fatalf("statut = %q, attendu draft", created.Status)
	}

	// 2. Approbation directe sans revue : refusée (transition interdite).
	if _, err := svc.ApproveCampaign(ctx, campaignOwnerB, created.ID); err == nil {
		t.Fatal("approbation d'un brouillon acceptée")
	}
	if _, err := svc.SubmitCampaign(ctx, campaignOwnerA, created.ID); err != nil {
		t.Fatalf("SubmitCampaign: %v", err)
	}

	// 3. Auto-approbation refusée : rédacteur ≠ approbateur, toujours.
	if _, err := svc.ApproveCampaign(ctx, campaignOwnerA, created.ID); err == nil {
		t.Fatal("auto-approbation acceptée : rédiger n'est pas approuver")
	}
	approved, err := svc.ApproveCampaign(ctx, campaignOwnerB, created.ID)
	if err != nil {
		t.Fatalf("ApproveCampaign: %v", err)
	}
	if approved.Status != "approved" || approved.ApprovedBy != campaignOwnerB {
		t.Fatalf("approbation = %+v", approved)
	}

	// 4. Démarrage : seuls les abonnés actifs confirmés non supprimés sont
	// matérialisés (camp-off a receiveArticles=false → exclu).
	started, err := svc.StartCampaign(ctx, campaignOwnerB, created.ID)
	if err != nil {
		t.Fatalf("StartCampaign: %v", err)
	}
	if started.Status != "sending" {
		t.Fatalf("statut = %q, attendu sending", started.Status)
	}
	var queued int
	if err := poolTest.QueryRow(ctx,
		`SELECT COUNT(*) FROM "StaffCampaignDelivery" WHERE "campaignId" = $1 AND "status" = 'queued'`,
		created.ID).Scan(&queued); err != nil {
		t.Fatalf("livraisons: %v", err)
	}
	if queued != 1 {
		t.Fatalf("livraisons = %d, attendu 1 (seule camp-ok, pas camp-off)", queued)
	}

	// 5. Tranche + marquage + clôture.
	claims, err := svc.ClaimCampaignChunk(ctx, created.ID, 10)
	if err != nil {
		t.Fatalf("ClaimCampaignChunk: %v", err)
	}
	if len(claims) != 1 || claims[0].Email != "camp-ok@test.dev" {
		t.Fatalf("réclamées = %v", claims)
	}
	if err := svc.MarkCampaignResult(ctx, created.ID, claims[0].DeliveryID, true, ""); err != nil {
		t.Fatalf("MarkCampaignResult: %v", err)
	}
	finished, err := svc.FinishCampaignIfDrained(ctx, created.ID)
	if err != nil {
		t.Fatalf("FinishCampaignIfDrained: %v", err)
	}
	if !finished {
		t.Fatal("campagne non terminée alors que tout est marqué")
	}
	var status string
	if err := poolTest.QueryRow(ctx,
		`SELECT "status" FROM "StaffCampaign" WHERE "id" = $1`, created.ID).Scan(&status); err != nil {
		t.Fatalf("statut: %v", err)
	}
	if status != "completed" {
		t.Fatalf("statut = %q, attendu completed", status)
	}

	// 6. Modification post-approbation : interdite (nouveau brouillon exigé).
	if _, err := svc.UpdateDraft(ctx, campaignOwnerA, created.ID, StaffCampaignInput{
		Type: "product.announcement", Subject: "Modifié",
		BodyHTML: "<p>x</p>", AudienceType: CampaignAudienceSubscribers, AudiencePubID: "pub_camp_001",
	}); err == nil {
		t.Fatal("modification d'une campagne terminée acceptée")
	}
}

func TestStaffCampaign_CancelAbandonneSansEnvoyer(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	svc := NewService(poolTest)

	seedCampaignPub(t, ctx, "pub_camp_002")
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Subscriber" (id, email, "publicationId", "isActive", "receiveArticles", "confirmedAt", "createdAt", "updatedAt")
		 VALUES (gen_random_uuid()::text, 'cancel@test.dev', 'pub_camp_002', true, true, now(), now(), now())`); err != nil {
		t.Fatalf("seed: %v", err)
	}
	t.Cleanup(func() {
		_, _ = poolTest.Exec(ctx, `DELETE FROM "StaffCampaignDelivery" WHERE "campaignId" LIKE 'camp-%'`)
		_, _ = poolTest.Exec(ctx, `DELETE FROM "StaffCampaign" WHERE id LIKE 'camp-%'`)
		_, _ = poolTest.Exec(ctx, `DELETE FROM "Subscriber" WHERE "publicationId" = 'pub_camp_002'`)
	})

	created, err := svc.CreateCampaign(ctx, campaignOwnerA, StaffCampaignInput{
		Type: "staff.direct", Subject: "Info", BodyHTML: "<p>Info {{publication_name}}</p>",
		AudienceType: CampaignAudienceSubscribers, AudiencePubID: "pub_camp_002",
	})
	if err != nil {
		t.Fatalf("CreateCampaign: %v", err)
	}
	if _, err := svc.SubmitCampaign(ctx, campaignOwnerA, created.ID); err != nil {
		t.Fatalf("SubmitCampaign: %v", err)
	}
	if _, err := svc.ApproveCampaign(ctx, campaignOwnerB, created.ID); err != nil {
		t.Fatalf("ApproveCampaign: %v", err)
	}
	if _, err := svc.StartCampaign(ctx, campaignOwnerB, created.ID); err != nil {
		t.Fatalf("StartCampaign: %v", err)
	}
	if err := svc.CancelCampaign(ctx, created.ID); err != nil {
		t.Fatalf("CancelCampaign: %v", err)
	}
	// Les livraisons en attente sont écartées avec motif : le worker ne les
	// reprendra jamais (claim ne lit que `queued`).
	var queued, skipped int
	if err := poolTest.QueryRow(ctx, `
		SELECT COUNT(*) FILTER (WHERE "status" = 'queued'),
		       COUNT(*) FILTER (WHERE "status" = 'skipped')
		FROM "StaffCampaignDelivery" WHERE "campaignId" = $1`,
		created.ID).Scan(&queued, &skipped); err != nil {
		t.Fatalf("livraisons: %v", err)
	}
	if queued != 0 || skipped != 1 {
		t.Fatalf("queued = %d, skipped = %d (attendu 0/1 : annuler empêche les jobs restants)", queued, skipped)
	}
}
