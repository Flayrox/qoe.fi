package admin

// Test d'acceptation du lancement de fonctionnalité : l'audience n'est pas une
// liste fournie par l'opérateur mais la matérialisation des consentements
// actifs. Un intérêt retiré, un compte suspendu ou une adresse en opposition
// globale ne reçoivent rien ; le succès d'envoi met à jour la promesse.

import (
	"context"
	"testing"
)

func TestFeatureLaunchCampaign_OnlyActiveNonSuppressedInterests(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	seedAdmin(t, ctx)
	svc := NewService(poolTest)

	const (
		activeUser     = "00000000-0000-0000-0000-00000000c201"
		unsubUser      = "00000000-0000-0000-0000-00000000c202"
		suppressedUser = "00000000-0000-0000-0000-00000000c203"
	)
	users := []struct{ id, email, username string }{
		{activeUser, "launch-active@test.dev", "launchactive"},
		{unsubUser, "launch-unsub@test.dev", "launchunsub"},
		{suppressedUser, "launch-suppressed@test.dev", "launchsuppressed"},
	}
	for _, u := range users {
		if _, err := poolTest.Exec(ctx, `
			INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt")
			VALUES ($1, $2, $3, $3, 'user', now(), now())
			ON CONFLICT (id) DO NOTHING`, u.id, u.email, u.username); err != nil {
			t.Fatalf("seed user %s: %v", u.username, err)
		}
	}
	if _, err := poolTest.Exec(ctx, `
		UPDATE "Feature" SET "status" = 'coming-soon', "notifyEnabled" = true
		WHERE "key" = 'custom-domain'`); err != nil {
		t.Fatalf("seed feature: %v", err)
	}
	if _, err := poolTest.Exec(ctx, `
		INSERT INTO "FeatureInterest" ("id", "featureKey", "userId", "source", "status", "consentAt", "updatedAt")
		VALUES
		 ('int_launch_active',     'custom-domain', $1::uuid, 'studio', 'active',       now(), now()),
		 ('int_launch_unsub',      'custom-domain', $2::uuid, 'studio', 'unsubscribed', now(), now()),
		 ('int_launch_suppressed', 'custom-domain', $3::uuid, 'studio', 'active',       now(), now())
		ON CONFLICT ("userId", "featureKey") DO UPDATE
		 SET "status" = EXCLUDED."status", "unsubscribedAt" = NULL, "updatedAt" = now()`,
		activeUser, unsubUser, suppressedUser); err != nil {
		t.Fatalf("seed interests: %v", err)
	}
	if _, err := poolTest.Exec(ctx, `
		INSERT INTO "EmailSuppression" ("id", "email", "scope", "reason")
		VALUES ('supp_launch_test', 'launch-suppressed@test.dev', 'global', 'unsubscribe')
		ON CONFLICT ("id") DO NOTHING`); err != nil {
		t.Fatalf("seed suppression: %v", err)
	}

	created, err := svc.CreateCampaign(ctx, campaignOwnerA, StaffCampaignInput{
		Type:         CampaignFeatureLaunch,
		FeatureKey:   "custom-domain",
		Subject:      "Votre domaine personnalisé est disponible",
		BodyHTML:     `<p>Bonjour, la fonctionnalité est prête.</p>`,
		AudienceType: CampaignAudienceInterested,
	})
	if err != nil {
		t.Fatalf("CreateCampaign: %v", err)
	}
	t.Cleanup(func() {
		_, _ = poolTest.Exec(context.Background(),
			`DELETE FROM "StaffCampaignDelivery" WHERE "campaignId" = $1`, created.ID)
		_, _ = poolTest.Exec(context.Background(),
			`DELETE FROM "StaffCampaign" WHERE "id" = $1`, created.ID)
		_, _ = poolTest.Exec(context.Background(),
			`DELETE FROM "FeatureInterest" WHERE "id" LIKE 'int_launch_%'`)
		_, _ = poolTest.Exec(context.Background(),
			`DELETE FROM "EmailSuppression" WHERE "id" = 'supp_launch_test'`)
		_, _ = poolTest.Exec(context.Background(),
			`DELETE FROM "User" WHERE id IN ($1, $2, $3)`, activeUser, unsubUser, suppressedUser)
	})

	// Une campagne de lancement ne peut pas viser une autre audience.
	if _, err := svc.CreateCampaign(ctx, campaignOwnerA, StaffCampaignInput{
		Type: CampaignFeatureLaunch, FeatureKey: "custom-domain",
		Subject: "S", BodyHTML: "<p>x</p>", AudienceType: CampaignAudienceAllUsers,
	}); err == nil {
		t.Fatal("lancement de fonctionnalité avec audience globale accepté")
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

	var queued int
	var email, interestID string
	if err := poolTest.QueryRow(ctx, `
		SELECT COUNT(*), COALESCE(MIN("email"), ''), COALESCE(MIN("interestId"), '')
		  FROM "StaffCampaignDelivery"
		 WHERE "campaignId" = $1 AND "status" = 'queued'`,
		created.ID).Scan(&queued, &email, &interestID); err != nil {
		t.Fatalf("livraisons: %v", err)
	}
	if queued != 1 {
		t.Fatalf("livraisons = %d, attendu 1 (intérêt actif non supprimé uniquement)", queued)
	}
	if email != "launch-active@test.dev" {
		t.Fatalf("destinataire = %q, attendu launch-active@test.dev", email)
	}
	if interestID != "int_launch_active" {
		t.Fatalf("interestId = %q, attendu int_launch_active", interestID)
	}

	// Relancer une vague déjà active ne duplique aucune livraison.
	if _, err := svc.StartCampaign(ctx, campaignOwnerB, created.ID); err != nil {
		t.Fatalf("StartCampaign (rejeu): %v", err)
	}
	if err := poolTest.QueryRow(ctx,
		`SELECT COUNT(*) FROM "StaffCampaignDelivery" WHERE "campaignId" = $1`,
		created.ID).Scan(&queued); err != nil {
		t.Fatalf("count après rejeu: %v", err)
	}
	if queued != 1 {
		t.Fatalf("livraisons après rejeu = %d, attendu 1 (ON CONFLICT)", queued)
	}

	claims, err := svc.ClaimCampaignChunk(ctx, created.ID, 10)
	if err != nil {
		t.Fatalf("ClaimCampaignChunk: %v", err)
	}
	if len(claims) != 1 || claims[0].InterestID != "int_launch_active" {
		t.Fatalf("tranche = %+v", claims)
	}
	if err := svc.MarkCampaignResult(ctx, created.ID, claims[0].DeliveryID, true, ""); err != nil {
		t.Fatalf("MarkCampaignResult: %v", err)
	}

	var lastNotified *string
	var lastCampaign *string
	if err := poolTest.QueryRow(ctx, `
		SELECT "lastNotifiedAt"::text, "lastCampaignId"
		  FROM "FeatureInterest" WHERE "id" = 'int_launch_active'`).
		Scan(&lastNotified, &lastCampaign); err != nil {
		t.Fatalf("read interest: %v", err)
	}
	if lastNotified == nil || *lastNotified == "" {
		t.Fatal("lastNotifiedAt non renseigné après un envoi réussi")
	}
	if lastCampaign == nil || *lastCampaign != created.ID {
		t.Fatalf("lastCampaignId = %v, attendu %s", lastCampaign, created.ID)
	}

	// L'intérêt retiré n'a jamais été marqué comme notifié.
	if err := poolTest.QueryRow(ctx,
		`SELECT "lastNotifiedAt"::text FROM "FeatureInterest" WHERE "id" = 'int_launch_unsub'`).
		Scan(&lastNotified); err != nil {
		t.Fatalf("read unsub interest: %v", err)
	}
	if lastNotified != nil {
		t.Fatalf("un intérêt retiré a été marqué notifié (%v)", lastNotified)
	}
}
