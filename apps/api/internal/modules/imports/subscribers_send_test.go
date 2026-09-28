package imports

import (
	"context"
	"testing"
)

// La classification des rejets durables et les seuils se testent sans base :
// ce sont eux qui déclenchent la suspension automatique.

func TestIsHardBounce(t *testing.T) {
	hard := map[string]bool{
		"550 5.1.1 <a@b.fr>: Recipient address rejected: User unknown": true,
		"552 mailbox unavailable":                                      true,
		"554 delivery error: undeliverable":                            true,
		"551 user unknown":                                             true,
		"553 address rejected":                                         true,
		"no such user here":                                            true,
		"account disabled by provider":                                 true,
	}
	for msg := range hard {
		if !isHardBounce(msg) {
			t.Fatalf("%q devrait être un rejet durable", msg)
		}
	}
	soft := map[string]bool{
		"":                          true,
		"421 timeout, try again":    true,
		"452 4.2.2 mailbox full":    true,
		"connection reset by peer":  true,
		"provider temporarily down": true,
	}
	for msg := range soft {
		if isHardBounce(msg) {
			t.Fatalf("%q ne doit pas être un rejet durable", msg)
		}
	}
}

func TestDecisionSendCap(t *testing.T) {
	if got := decisionSendCap(nil); got != 0 {
		t.Fatalf("sans limites = %d, attendu 0", got)
	}
	if got := decisionSendCap([]byte(`{"maxRecipients": 300}`)); got != 300 {
		t.Fatalf("maxRecipients = %d, attendu 300", got)
	}
	for _, raw := range []string{`{"maxRecipients": 0}`, `{"maxRecipients": -2}`, `{"maxRecipients": "beaucoup"}`, `pas du json`} {
		if got := decisionSendCap([]byte(raw)); got != 0 {
			t.Fatalf("limites %q = %d, attendu 0 (jamais de plafond silencieux à zéro)", raw, got)
		}
	}
}

func TestDecisionSendThresholds(t *testing.T) {
	def := decisionSendThresholds(nil)
	if def.maxHardBounceRate != defaultMaxHardBounceRate || def.maxComplaints != defaultMaxComplaints ||
		def.maxFailedRate != defaultMaxFailedRate || def.minSample != defaultMinSample {
		t.Fatalf("défauts modifiés : %+v", def)
	}
	custom := decisionSendThresholds([]byte(`{"maxHardBounceRate": 0.05, "maxComplaints": 2, "maxFailedRate": 0.3, "minSample": 100}`))
	if custom.maxHardBounceRate != 0.05 || custom.maxComplaints != 2 || custom.maxFailedRate != 0.3 || custom.minSample != 100 {
		t.Fatalf("surcharges ignorées : %+v", custom)
	}
	// Invalides : chaque valeur retombe sur son défaut, jamais à zéro.
	bad := decisionSendThresholds([]byte(`{"maxHardBounceRate": 5, "maxComplaints": -1, "maxFailedRate": 0, "minSample": 2}`))
	if bad.maxHardBounceRate != defaultMaxHardBounceRate || bad.maxComplaints != defaultMaxComplaints ||
		bad.maxFailedRate != defaultMaxFailedRate || bad.minSample != defaultMinSample {
		t.Fatalf("invalides non neutralisés : %+v", bad)
	}
}

func TestSendChunkDelay_Positif(t *testing.T) {
	if SendChunkDelay() <= 0 || SendChunkSize() <= 0 {
		t.Fatal("taille et délai de tranche strictement positifs exigés")
	}
}

// ── Cycle de vie complet, contre Postgres éphémère ─────────────────────
// Décision → vague → tranche → envoi → suspension/clôture. Sans Docker, ces
// tests sont skippés (même pattern que le reste du module).

func seedSendBatch(t *testing.T, ctx context.Context, batchID, pubID, requester string, emails []string) {
	t.Helper()
	if _, err := poolTest.Exec(ctx, `
		INSERT INTO "SubscriberImportBatch"
		    ("id", "publicationId", "requesterId", "status", "source",
		     "declarations", "fileFingerprint", "fileVersion", "rowCount", "stats",
		     "submittedAt", "createdAt", "updatedAt")
		VALUES ($1, $2, $3, 'approved_direct', 'csv_manual',
		        '{"noPurchased":true}'::jsonb, 'fp-test', 1, $4, '{}'::jsonb,
		        now(), now(), now())`,
		batchID, pubID, requester, len(emails)); err != nil {
		t.Fatalf("lot: %v", err)
	}
	for _, email := range emails {
		if _, err := poolTest.Exec(ctx, `
			INSERT INTO "SubscriberImportRow"
			    ("id", "batchId", "email", "status", "createdAt", "updatedAt")
			VALUES (gen_random_uuid()::text, $1, $2, 'eligible_direct', now(), now())`,
			batchID, email); err != nil {
			t.Fatalf("ligne %s: %v", email, err)
		}
	}
	if _, err := poolTest.Exec(ctx, `
		INSERT INTO "SubscriberImportDecision"
		    ("id", "batchId", "decision", "actorKind", "publicReason",
		     "limits", "fileVersion", "fileFingerprint")
		VALUES (gen_random_uuid()::text, $1, 'approved_direct', 'staff',
		        'preuves solides', '{"maxRecipients": 100}', 1, 'fp-test')`, batchID); err != nil {
		t.Fatalf("décision: %v", err)
	}
}

func TestSendWave_LifecycleComplet(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	seedImport(t, ctx)
	svc := newTestService()

	batchID := "batch_send_001"
	emails := []string{"s1@test.dev", "s2@test.dev", "s3@test.dev"}
	seedSendBatch(t, ctx, batchID, importPubPerso, importOwnerID, emails)

	// 1. Lot non approuvé en envoi encadré → refus.
	if _, err := svc.StartSendWave(ctx, importOwnerID, "batch_inexistant", 10); err == nil {
		t.Fatal("vague sur lot inexistant acceptée")
	}

	// 2. Ouverture : budget + snapshot, lot en running, aucun destinataire.
	wave, err := svc.StartSendWave(ctx, importOwnerID, batchID, 0)
	if err != nil {
		t.Fatalf("StartSendWave: %v", err)
	}
	if wave.BudgetCap != 100 {
		t.Fatalf("plafond = %d, attendu 100 (limits.maxRecipients de la décision)", wave.BudgetCap)
	}
	var queued int
	if err := poolTest.QueryRow(ctx, `
		SELECT COUNT(*) FROM "ImportSendDelivery" WHERE "waveId" = $1 AND "status" = 'queued'`,
		wave.ID).Scan(&queued); err != nil {
		t.Fatalf("livraisons: %v", err)
	}
	if queued != 3 {
		t.Fatalf("livraisons = %d, attendu 3", queued)
	}
	var confirmed int
	if err := poolTest.QueryRow(ctx, `
		SELECT COUNT(*) FROM "Subscriber"
		WHERE "publicationId" = $1 AND "email" = ANY($2::text[]) AND "confirmedAt" IS NOT NULL`,
		importPubPerso, emails).Scan(&confirmed); err != nil {
		t.Fatalf("confirmés: %v", err)
	}
	if confirmed != 0 {
		t.Fatal("l'ouverture d'une vague ne doit activer personne")
	}

	// 3. Idempotence : une seconde ouverture renvoie la même vague.
	again, err := svc.StartSendWave(ctx, importOwnerID, batchID, 0)
	if err != nil {
		t.Fatalf("re-ouverture: %v", err)
	}
	if again.ID != wave.ID {
		t.Fatal("une seconde vague a été créée : risque de doubles envois")
	}

	// 4. Tranche : budget consommé, abonnés inactifs porteurs d'un jeton.
	claims, err := svc.ClaimSendChunk(ctx, wave.ID, 10)
	if err != nil {
		t.Fatalf("ClaimSendChunk: %v", err)
	}
	if len(claims) != 3 {
		t.Fatalf("réclamées = %d, attendu 3", len(claims))
	}
	var consumed int
	if err := poolTest.QueryRow(ctx, `
		SELECT "consumed" FROM "ImportSendBudget" WHERE "batchId" = $1`, batchID).Scan(&consumed); err != nil {
		t.Fatalf("budget: %v", err)
	}
	if consumed != 3 {
		t.Fatalf("consommé = %d, attendu 3", consumed)
	}
	var inactive int
	if err := poolTest.QueryRow(ctx, `
		SELECT COUNT(*) FROM "Subscriber"
		WHERE "publicationId" = $1 AND "email" = ANY($2::text[])
		  AND "confirmedAt" IS NULL AND "receiveArticles" = false AND "confirmationToken" IS NOT NULL`,
		importPubPerso, emails).Scan(&inactive); err != nil {
		t.Fatalf("inactifs: %v", err)
	}
	if inactive != 3 {
		t.Fatal("chaque adresse réclamée doit avoir un abonné inactif porteur d'un jeton")
	}

	// 5. Marquage + clôture : vague puis lot terminés.
	for _, c := range claims {
		if err := svc.MarkSendResult(ctx, wave.ID, c.DeliveryID, true, "", false); err != nil {
			t.Fatalf("MarkSendResult: %v", err)
		}
	}
	finished, err := svc.FinishSendWaveIfDrained(ctx, wave.ID)
	if err != nil {
		t.Fatalf("FinishSendWaveIfDrained: %v", err)
	}
	if !finished {
		t.Fatal("vague non terminée alors que tout est marqué")
	}
	var batchStatus string
	if err := poolTest.QueryRow(ctx, `
		SELECT "status" FROM "SubscriberImportBatch" WHERE "id" = $1`, batchID).Scan(&batchStatus); err != nil {
		t.Fatalf("statut lot: %v", err)
	}
	if batchStatus != "completed" {
		t.Fatalf("statut lot = %q, attendu completed", batchStatus)
	}

	// 6. `confirmedAt` n'a été écrit par personne sur ce chemin : seuls les
	// trois abonnés inactifs existent, aucun destinataire.
	var active int
	if err := poolTest.QueryRow(ctx, `
		SELECT COUNT(*) FROM "Subscriber"
		WHERE "publicationId" = $1 AND "email" = ANY($2::text[])
		  AND "receiveArticles" = true AND "confirmedAt" IS NOT NULL`,
		importPubPerso, emails).Scan(&active); err != nil {
		t.Fatalf("actifs: %v", err)
	}
	if active != 0 {
		t.Fatal("un contact est devenu destinataire sans clic individuel")
	}
}

func TestSendWave_BudgetAtomiqueSousConcurrence(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	seedImport(t, ctx)
	svc := newTestService()

	emails := []string{"c1@test.dev", "c2@test.dev", "c3@test.dev", "c4@test.dev", "c5@test.dev", "c6@test.dev"}
	seedSendBatch(t, ctx, "batch_send_002", importPubPerso, importOwnerID, emails)
	// Plafond volontairement plus petit que le lot : 4 pour 6 adresses.
	wave, err := svc.StartSendWave(ctx, importOwnerID, "batch_send_002", 4)
	if err != nil {
		t.Fatalf("StartSendWave: %v", err)
	}
	if wave.BudgetCap != 4 {
		t.Fatalf("plafond = %d, attendu 4", wave.BudgetCap)
	}

	// Deux workers qui réclament en même temps ne doivent jamais dépasser 4.
	// (Ici séquentiel par simplicité d'ordonnancement : l'atomicité vient de
	// l'UPDATE conditionnel, testé en charge réelle via le worker.)
	first, err := svc.ClaimSendChunk(ctx, wave.ID, 10)
	if err != nil {
		t.Fatalf("tranche 1: %v", err)
	}
	if len(first) != 4 {
		t.Fatalf("tranche 1 = %d, attendu 4 (plafond)", len(first))
	}
	second, err := svc.ClaimSendChunk(ctx, wave.ID, 10)
	if err != nil {
		t.Fatalf("tranche 2: %v", err)
	}
	if len(second) != 0 {
		t.Fatalf("tranche 2 = %d, attendu 0 (budget épuisé)", len(second))
	}
	var consumed int
	if err := poolTest.QueryRow(ctx, `
		SELECT "consumed" FROM "ImportSendBudget" WHERE "batchId" = 'batch_send_002'`).Scan(&consumed); err != nil {
		t.Fatalf("budget: %v", err)
	}
	if consumed != 4 {
		t.Fatalf("consommé = %d, attendu exactement 4", consumed)
	}
	// Les deux adresses restantes ne sont jamais envoyées.
	var queued int
	if err := poolTest.QueryRow(ctx, `
		SELECT COUNT(*) FROM "ImportSendDelivery" WHERE "waveId" = $1 AND "status" = 'queued'`,
		wave.ID).Scan(&queued); err != nil {
		t.Fatalf("en attente: %v", err)
	}
	if queued != 2 {
		t.Fatalf("en attente = %d, attendu 2 (jamais envoyées, jamais perdues)", queued)
	}
}

func TestSendWave_SuspensionAutomatiqueSurRejets(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	seedImport(t, ctx)
	svc := newTestService()

	seedSendBatch(t, ctx, "batch_send_003", importPubPerso, importOwnerID, []string{"b1@test.dev", "b2@test.dev"})
	wave, err := svc.StartSendWave(ctx, importOwnerID, "batch_send_003", 0)
	if err != nil {
		t.Fatalf("StartSendWave: %v", err)
	}
	claims, err := svc.ClaimSendChunk(ctx, wave.ID, 10)
	if err != nil {
		t.Fatalf("ClaimSendChunk: %v", err)
	}
	// On abaisse les seuils pour ce test : 2 rejets durs sur 2 envois.
	if _, err := poolTest.Exec(ctx, `
		UPDATE "ImportSendWave"
		SET "maxHardBounceRate" = 0.5, "minSample" = 2, "updatedAt" = now()
		WHERE "id" = $1`, wave.ID); err != nil {
		t.Fatalf("seuils: %v", err)
	}
	for _, c := range claims {
		if err := svc.MarkSendResult(ctx, wave.ID, c.DeliveryID, false, "550 user unknown", true); err != nil {
			t.Fatalf("MarkSendResult: %v", err)
		}
	}
	suspended, err := svc.EvaluateSendSuspension(ctx, wave.ID)
	if err != nil {
		t.Fatalf("EvaluateSendSuspension: %v", err)
	}
	if !suspended {
		t.Fatal("100 % de rejets durs aurait dû suspendre la vague")
	}
	var waveStatus, batchStatus string
	if err := poolTest.QueryRow(ctx, `
		SELECT w."status", b."status" FROM "ImportSendWave" w
		JOIN "SubscriberImportBatch" b ON b."id" = w."batchId"
		WHERE w."id" = $1`, wave.ID).Scan(&waveStatus, &batchStatus); err != nil {
		t.Fatalf("statuts: %v", err)
	}
	if waveStatus != "paused" || batchStatus != "suspended" {
		t.Fatalf("vague = %q, lot = %q (attendu paused/suspended)", waveStatus, batchStatus)
	}
	// La suspension est une décision système tracée, pas un état muet.
	var decisions int
	if err := poolTest.QueryRow(ctx, `
		SELECT COUNT(*) FROM "SubscriberImportDecision"
		WHERE "batchId" = 'batch_send_003' AND "decision" = 'suspended' AND "actorKind" = 'system'`,
	).Scan(&decisions); err != nil {
		t.Fatalf("décisions: %v", err)
	}
	if decisions != 1 {
		t.Fatalf("décisions système = %d, attendu 1", decisions)
	}
	// Sous les seuils : pas de suspension.
	if _, err := poolTest.Exec(ctx, `
		UPDATE "ImportSendWave"
		SET "status" = 'sending', "maxHardBounceRate" = 1.0, "maxFailedRate" = 1.0, "updatedAt" = now()
		WHERE "id" = $1`, wave.ID); err != nil {
		t.Fatalf("seuils: %v", err)
	}
	suspended, err = svc.EvaluateSendSuspension(ctx, wave.ID)
	if err != nil {
		t.Fatalf("EvaluateSendSuspension: %v", err)
	}
	if suspended {
		t.Fatal("suspension sous des seuils sains : faux positif")
	}
}
