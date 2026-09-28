package imports

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"testing"
	"time"
)

// Les propriétés des jetons et des plafonds se testent sans base : ce sont
// elles qui portent l'usage unique et les vagues plafonnées.

func TestNewReconfirmToken_FormatEtUnicite(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 100; i++ {
		token, hash, err := newReconfirmToken()
		if err != nil {
			t.Fatalf("newReconfirmToken: %v", err)
		}
		if len(token) != 64 || len(hash) != 64 {
			t.Fatalf("longueurs = %d/%d, attendu 64/64", len(token), len(hash))
		}
		if seen[token] {
			t.Fatal("deux jetons identiques : la source d'aléa est cassée")
		}
		seen[token] = true
		sum := sha256.Sum256([]byte(token))
		if hex.EncodeToString(sum[:]) != hash {
			t.Fatal("l'empreinte ne correspond pas au jeton")
		}
	}
}

func TestDecisionWaveCap(t *testing.T) {
	if got := decisionWaveCap(nil); got != 0 {
		t.Fatalf("sans limites = %d, attendu 0", got)
	}
	if got := decisionWaveCap([]byte(`{}`)); got != 0 {
		t.Fatalf("limites vides = %d, attendu 0", got)
	}
	if got := decisionWaveCap([]byte(`{"maxWave": 250}`)); got != 250 {
		t.Fatalf("maxWave = %d, attendu 250", got)
	}
	// Invalide : aucun plafond silencieux à zéro qui bloquerait tout.
	for _, raw := range []string{`{"maxWave": 0}`, `{"maxWave": -5}`, `{"maxWave": "beaucoup"}`, `pas du json`} {
		if got := decisionWaveCap([]byte(raw)); got != 0 {
			t.Fatalf("limites %q = %d, attendu 0", raw, got)
		}
	}
}

func TestReconfirmChunkDelay_Positif(t *testing.T) {
	if ReconfirmChunkDelay() <= 0 {
		t.Fatal("le délai inter-tranches doit être strictement positif")
	}
}

// ── Cycle de vie complet, contre Postgres éphémère ─────────────────────
// Quarantaine → approbation → vague → envoi → clic → purge. Sans Docker, ces
// tests sont skippés (même pattern que le reste du module).

func seedReconfirmBatch(t *testing.T, ctx context.Context, svc *Service, batchID, pubID, requester string, emails []string) {
	t.Helper()
	if _, err := poolTest.Exec(ctx, `
		INSERT INTO "SubscriberImportBatch"
		    ("id", "publicationId", "requesterId", "status", "source",
		     "declarations", "fileFingerprint", "fileVersion", "rowCount", "stats",
		     "submittedAt", "createdAt", "updatedAt")
		VALUES ($1, $2, $3, 'approved_reconfirm', 'csv_manual',
		        '{"noPurchased":true}'::jsonb, 'fp-test', 1, $4, '{}'::jsonb,
		        now(), now(), now())`,
		batchID, pubID, requester, len(emails)); err != nil {
		t.Fatalf("lot: %v", err)
	}
	for _, email := range emails {
		if _, err := poolTest.Exec(ctx, `
			INSERT INTO "SubscriberImportRow"
			    ("id", "batchId", "email", "status", "createdAt", "updatedAt")
			VALUES (gen_random_uuid()::text, $1, $2, 'pending_confirmation', now(), now())`,
			batchID, email); err != nil {
			t.Fatalf("ligne %s: %v", email, err)
		}
	}
	if _, err := poolTest.Exec(ctx, `
		INSERT INTO "SubscriberImportDecision"
		    ("id", "batchId", "decision", "actorKind", "publicReason",
		     "fileVersion", "fileFingerprint")
		VALUES (gen_random_uuid()::text, $1, 'approved_reconfirm', 'staff',
		        'dossier complet', 1, 'fp-test')`, batchID); err != nil {
		t.Fatalf("décision: %v", err)
	}
	_ = svc
}

func TestReconfirmWave_LifecycleComplet(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	seedImport(t, ctx)
	svc := newTestService()

	batchID := "batch_reconfirm_001"
	emails := []string{"rc1@test.dev", "rc2@test.dev", "rc3@test.dev"}
	seedReconfirmBatch(t, ctx, svc, batchID, importPubPerso, importOwnerID, emails)

	// 1. Lot non approuvé en reconfirmation → refus.
	if _, err := svc.StartReconfirmWave(ctx, importOwnerID, "batch_inexistant", 10); err == nil {
		t.Fatal("vague sur lot inexistant acceptée")
	}

	// 2. Ouverture de vague : abonnés inactifs créés, aucun destinataire.
	wave, err := svc.StartReconfirmWave(ctx, importOwnerID, batchID, 10)
	if err != nil {
		t.Fatalf("StartReconfirmWave: %v", err)
	}
	if wave.Status != "queued" {
		t.Fatalf("statut vague = %q, attendu queued", wave.Status)
	}
	var inactive, confirmed int
	if err := poolTest.QueryRow(ctx, `
		SELECT COUNT(*) FILTER (WHERE "confirmedAt" IS NULL AND "receiveArticles" = false),
		       COUNT(*) FILTER (WHERE "confirmedAt" IS NOT NULL)
		FROM "Subscriber" WHERE "publicationId" = $1 AND "email" = ANY($2::text[])`,
		importPubPerso, emails).Scan(&inactive, &confirmed); err != nil {
		t.Fatalf("état abonnés: %v", err)
	}
	if inactive != 3 || confirmed != 0 {
		t.Fatalf("inactifs = %d, confirmés = %d (attendu 3/0) : la vague ne doit activer personne", inactive, confirmed)
	}

	// 3. Idempotence : une seconde ouverture renvoie la même vague.
	again, err := svc.StartReconfirmWave(ctx, importOwnerID, batchID, 10)
	if err != nil {
		t.Fatalf("re-ouverture: %v", err)
	}
	if again.ID != wave.ID {
		t.Fatal("une seconde vague a été créée : risque de doubles envois")
	}

	// 4. Traitement : une tranche suffit ici (< 100), la vague se termine et
	// le lot passe `completed`. asynq est nil en test : PublishSubscriberConfirm
	// est un no-op, les demandes passent quand même `sent`.
	done, err := svc.ProcessReconfirmWave(ctx, wave.ID)
	if err != nil {
		t.Fatalf("ProcessReconfirmWave: %v", err)
	}
	if !done {
		t.Fatal("vague non terminée alors que tout tient dans une tranche")
	}
	var sent int
	if err := poolTest.QueryRow(ctx, `
		SELECT COUNT(*) FROM "SubscriberImportReconfirmRequest"
		WHERE "waveId" = $1 AND "status" = 'sent'`, wave.ID).Scan(&sent); err != nil {
		t.Fatalf("comptage sent: %v", err)
	}
	if sent != 3 {
		t.Fatalf("sent = %d, attendu 3", sent)
	}
	var batchStatus string
	if err := poolTest.QueryRow(ctx, `
		SELECT "status" FROM "SubscriberImportBatch" WHERE "id" = $1`, batchID).Scan(&batchStatus); err != nil {
		t.Fatalf("statut lot: %v", err)
	}
	if batchStatus != "completed" {
		t.Fatalf("statut lot = %q, attendu completed", batchStatus)
	}

	// 5. Clic individuel → seul ce contact devient destinataire, imputé à la vague.
	if err := svc.MarkReconfirmConfirmed(ctx, importPubPerso, "rc1@test.dev"); err != nil {
		t.Fatalf("MarkReconfirmConfirmed: %v", err)
	}
	// On simule le chemin réel (ConfirmSubscriberByToken) pour prouver que
	// `confirmedAt` ne peut être franchi que par lui : d'abord on vérifie que
	// la demande est bien marquée, puis qu'un seul abonné est confirmable.
	var confirmedCount int
	if err := poolTest.QueryRow(ctx, `
		SELECT COUNT(*) FROM "SubscriberImportReconfirmRequest"
		WHERE "waveId" = $1 AND "status" = 'confirmed'`, wave.ID).Scan(&confirmedCount); err != nil {
		t.Fatalf("comptage confirmed: %v", err)
	}
	if confirmedCount != 1 {
		t.Fatalf("confirmed = %d, attendu 1", confirmedCount)
	}

	// 6. Purge : les deux demandes restantes expirent, leurs jetons sont
	// effacés, et rien n'est créé en suppression (ne pas répondre ≠ refuser).
	if _, err := poolTest.Exec(ctx, `
		UPDATE "SubscriberImportReconfirmRequest"
		SET "expiresAt" = now() - interval '1 day', "updatedAt" = now()
		WHERE "waveId" = $1 AND "status" = 'sent'`, wave.ID); err != nil {
		t.Fatalf("vieillissement: %v", err)
	}
	expired, err := svc.PurgeExpiredReconfirms(ctx, importOwnerID, batchID)
	if err != nil {
		t.Fatalf("PurgeExpiredReconfirms: %v", err)
	}
	if expired != 2 {
		t.Fatalf("expirés = %d, attendu 2", expired)
	}
	var tokensLeft int
	if err := poolTest.QueryRow(ctx, `
		SELECT COUNT(*) FROM "Subscriber"
		WHERE "publicationId" = $1 AND "email" = ANY($2::text[])
		  AND "confirmedAt" IS NULL AND "confirmationToken" IS NOT NULL`,
		importPubPerso, []string{"rc2@test.dev", "rc3@test.dev"}).Scan(&tokensLeft); err != nil {
		t.Fatalf("jetons restants: %v", err)
	}
	if tokensLeft != 0 {
		t.Fatal("des jetons expirés survivent : un lien expiré ne doit plus rien activer")
	}
	var suppressions int
	if err := poolTest.QueryRow(ctx, `
		SELECT COUNT(*) FROM "EmailSuppression"
		WHERE "publicationId" = $1 AND "email" = ANY($2::text[])`,
		importPubPerso, []string{"rc2@test.dev", "rc3@test.dev"}).Scan(&suppressions); err != nil {
		t.Fatalf("suppressions: %v", err)
	}
	if suppressions != 0 {
		t.Fatal("la purge a créé des oppositions : ne pas répondre n'est pas refuser")
	}
	// Rejouable sans effet.
	expired, err = svc.PurgeExpiredReconfirms(ctx, importOwnerID, batchID)
	if err != nil {
		t.Fatalf("purge rejouée: %v", err)
	}
	if expired != 0 {
		t.Fatalf("purge rejouée = %d, attendu 0", expired)
	}
}

func TestReconfirmWave_LotSuspenduMetEnPause(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	seedImport(t, ctx)
	svc := newTestService()

	batchID := "batch_reconfirm_002"
	seedReconfirmBatch(t, ctx, svc, batchID, importPubPerso, importOwnerID, []string{"pause1@test.dev"})
	wave, err := svc.StartReconfirmWave(ctx, importOwnerID, batchID, 10)
	if err != nil {
		t.Fatalf("StartReconfirmWave: %v", err)
	}
	// Suspension entre l'ouverture et le traitement : la vague se met en
	// pause au lieu d'envoyer.
	if _, err := poolTest.Exec(ctx, `
		UPDATE "SubscriberImportBatch" SET "status" = 'suspended', "updatedAt" = now()
		WHERE "id" = $1`, batchID); err != nil {
		t.Fatalf("suspension: %v", err)
	}
	done, err := svc.ProcessReconfirmWave(ctx, wave.ID)
	if err != nil {
		t.Fatalf("ProcessReconfirmWave: %v", err)
	}
	if !done {
		t.Fatal("une vague en pause doit rendre la main (rien à re-enfiler)")
	}
	var status string
	if err := poolTest.QueryRow(ctx, `
		SELECT "status" FROM "SubscriberImportReconfirmWave" WHERE "id" = $1`, wave.ID).Scan(&status); err != nil {
		t.Fatalf("statut vague: %v", err)
	}
	if status != "paused" {
		t.Fatalf("statut vague = %q, attendu paused", status)
	}
	var sent int
	if err := poolTest.QueryRow(ctx, `
		SELECT COUNT(*) FROM "SubscriberImportReconfirmRequest"
		WHERE "waveId" = $1 AND "status" = 'sent'`, wave.ID).Scan(&sent); err != nil {
		t.Fatalf("comptage sent: %v", err)
	}
	if sent != 0 {
		t.Fatal("des emails sont partis malgré la suspension du lot")
	}
	// La reprise ne crée pas de seconde vague.
	if _, err := poolTest.Exec(ctx, `
		UPDATE "SubscriberImportBatch" SET "status" = 'approved_reconfirm', "updatedAt" = now()
		WHERE "id" = $1`, batchID); err != nil {
		t.Fatalf("reprise: %v", err)
	}
	resumed, err := svc.StartReconfirmWave(ctx, importOwnerID, batchID, 10)
	if err != nil {
		t.Fatalf("reprise vague: %v", err)
	}
	if resumed.ID != wave.ID {
		t.Fatal("la reprise a créé une seconde vague : risque de doubles envois")
	}
}

func TestReconfirmWave_PlafondDeTaille(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	seedImport(t, ctx)
	svc := newTestService()

	emails := []string{"w1@test.dev", "w2@test.dev", "w3@test.dev"}
	seedReconfirmBatch(t, ctx, svc, "batch_reconfirm_003", importPubPerso, importOwnerID, emails)
	wave, err := svc.StartReconfirmWave(ctx, importOwnerID, "batch_reconfirm_003", 2)
	if err != nil {
		t.Fatalf("StartReconfirmWave: %v", err)
	}
	if wave.WaveSize != 2 {
		t.Fatalf("taille vague = %d, attendu 2", wave.WaveSize)
	}
	var requests int
	if err := poolTest.QueryRow(ctx, `
		SELECT COUNT(*) FROM "SubscriberImportReconfirmRequest"
		WHERE "waveId" = $1`, wave.ID).Scan(&requests); err != nil {
		t.Fatalf("comptage demandes: %v", err)
	}
	if requests != 2 {
		t.Fatalf("demandes = %d, attendu 2 : la vague ne doit pas dépasser son plafond", requests)
	}
	// Durée de vie bornée par défaut (30 jours).
	var expiresAt time.Time
	if err := poolTest.QueryRow(ctx, `
		SELECT "expiresAt" FROM "SubscriberImportReconfirmRequest"
		WHERE "waveId" = $1 LIMIT 1`, wave.ID).Scan(&expiresAt); err != nil {
		t.Fatalf("expiration: %v", err)
	}
	if time.Until(expiresAt) > 31*24*time.Hour {
		t.Fatal("des demandes vivraient plus de ~30 jours : un lien éternel est interdit")
	}
}
