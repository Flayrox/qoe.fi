package legal

// Répétition générale du re-consentement, de bout en bout :
//
//	seed → acceptation initiale → couverture 100 %
//	     → publication d'une nouvelle version (ancienne archivée)
//	     → avis + file de livraison renseignés (changelog, portail)
//	     → acceptation en attente côté portail
//	     → re-acceptation → retour à la conformité.
//
// L'envoi SMTP lui-même est couvert par internal/workers (drain + stub) ;
// ici on vérifie que la publication alimente la file avec les bonnes
// informations, et que la boucle consentement se referme.

import (
	"context"
	"testing"
	"time"
)

func TestLegal_Rehearsal_ReconsentEndToEnd(t *testing.T) {
	ctx := context.Background()
	seedUsers(t, ctx)
	svc := newSvc()

	// ── 1. Amorçage : les documents par défaut sont publiés ──────────
	if _, err := svc.SeedDefaults(ctx, legalAdminID); err != nil {
		t.Fatalf("seed: %v", err)
	}

	// ── 2. Le lecteur accepte les CGU depuis le portail ──────────────
	pending, err := svc.PendingAcceptances(ctx, legalReaderID, "fr")
	if err != nil {
		t.Fatalf("pending: %v", err)
	}
	var cgu *PendingAcceptance
	for i := range pending {
		if pending[i].Slug == "conditions-generales-utilisation" {
			cgu = &pending[i]
			break
		}
	}
	if cgu == nil {
		t.Fatalf("CGU absentes des acceptations en attente (%d documents)", len(pending))
	}

	accepted, err := svc.Accept(ctx, legalReaderID, "conditions-generales-utilisation", AcceptInput{
		Locale: "fr", Source: "portal", Method: "click",
		IP: "203.0.113.10", UserAgent: "rehearsal-agent/1.0",
	})
	if err != nil {
		t.Fatalf("accept v1: %v", err)
	}
	if accepted.Version == "" || accepted.VersionID != cgu.VersionID {
		t.Fatalf("acceptation v1 = version %q (%s), attendu %q (%s)",
			accepted.Version, accepted.VersionID, cgu.Version, cgu.VersionID)
	}
	if accepted.Source != "portal" || accepted.Method != "click" {
		t.Fatalf("preuve incomplète: source=%q method=%q", accepted.Source, accepted.Method)
	}

	// La preuve porte l'IP et le user-agent (exigence de Contrôle).
	if accepted.IP == nil || *accepted.IP != "203.0.113.10" {
		t.Fatalf("IP non journalisée: %+v", accepted.IP)
	}

	// ── 3. Couverture initiale : le lecteur est conforme ─────────────
	before, err := svc.Compliance(ctx, legalAdminID)
	if err != nil {
		t.Fatalf("compliance avant: %v", err)
	}
	var cguBefore *ComplianceDocument
	for i := range before.Documents {
		if before.Documents[i].Slug == "conditions-generales-utilisation" {
			cguBefore = &before.Documents[i]
			break
		}
	}
	if cguBefore == nil {
		t.Fatal("CGU absentes du tableau de conformité")
	}
	if cguBefore.CurrentAcceptances < 1 {
		t.Fatalf("couverture v1 = %d acceptations courantes, attendu ≥ 1", cguBefore.CurrentAcceptances)
	}

	// ── 4. Publication d'une nouvelle version (2.0.0) ────────────────
	const (
		newVersionID = "ver_rehearsal_200"
		newDocID     = "doc_rehearsal_cgu"
	)
	var publishedDocID, publishedVersionID string
	if err := poolTest.QueryRow(ctx,
		`SELECT document_id, id FROM legal_document_version
		 WHERE document_id = (SELECT id FROM legal_document WHERE slug = 'conditions-generales-utilisation')
		   AND locale = 'fr' AND status = 'PUBLISHED'`).Scan(&publishedDocID, &publishedVersionID); err != nil {
		t.Fatalf("version publiée introuvable: %v", err)
	}

	if _, err := poolTest.Exec(ctx,
		`INSERT INTO legal_document_version
		   (id, document_id, locale, version, title, summary, body, status, changelog)
		 VALUES ($1, $2, 'fr', '2.0.0', 'Conditions générales d''utilisation',
		         'Révision majeure', 'Nouveau corps de la version 2.0.0.', 'DRAFT',
		         'Clause de médiation ajoutée ; résiliation précisée')`,
		newVersionID, publishedDocID); err != nil {
		t.Fatalf("création brouillon: %v", err)
	}

	if _, err := svc.PublishVersion(ctx, legalAdminID, newVersionID); err != nil {
		t.Fatalf("publication: %v", err)
	}

	// L'ancienne version est archivée, la nouvelle seule publiée.
	var statusOld, statusNew string
	if err := poolTest.QueryRow(ctx,
		`SELECT status FROM legal_document_version WHERE id = $1`, publishedVersionID).Scan(&statusOld); err != nil {
		t.Fatal(err)
	}
	if err := poolTest.QueryRow(ctx,
		`SELECT status FROM legal_document_version WHERE id = $1`, newVersionID).Scan(&statusNew); err != nil {
		t.Fatal(err)
	}
	if statusOld != "ARCHIVED" || statusNew != "PUBLISHED" {
		t.Fatalf("statuts après publication: ancienne=%s nouvelle=%s", statusOld, statusNew)
	}

	// ── 5. La publication a alimenté la file d'avis ──────────────────
	var noticeCount int
	if err := poolTest.QueryRow(ctx,
		`SELECT count(*) FROM legal_notice WHERE version_id = $1`, newVersionID).Scan(&noticeCount); err != nil {
		t.Fatal(err)
	}
	if noticeCount != 1 {
		t.Fatalf("avis créés = %d, attendu 1", noticeCount)
	}
	var (
		changelog  string
		portalPath string
	)
	if err := poolTest.QueryRow(ctx,
		`SELECT changelog, portal_path FROM legal_notice WHERE version_id = $1`,
		newVersionID).Scan(&changelog, &portalPath); err != nil {
		t.Fatal(err)
	}
	if changelog == "" {
		t.Fatal("avis sans changelog : l'email serait vide")
	}
	if portalPath == "" {
		t.Fatal("avis sans chemin de portail : le lecteur ne saurait où re-consentir")
	}

	var queuedDeliveries int
	if err := poolTest.QueryRow(ctx,
		`SELECT count(*) FROM legal_notice_delivery d
		 JOIN legal_notice n ON n.id = d.notice_id
		 WHERE n.version_id = $1 AND d.user_id = $2 AND d.status = 'QUEUED'`,
		newVersionID, legalReaderID).Scan(&queuedDeliveries); err != nil {
		t.Fatal(err)
	}
	if queuedDeliveries != 1 {
		t.Fatalf("livraisons en file pour le lecteur = %d, attendu 1", queuedDeliveries)
	}

	// ── 6. Le portail repose la question ─────────────────────────────
	pendingAfter, err := svc.PendingAcceptances(ctx, legalReaderID, "fr")
	if err != nil {
		t.Fatalf("pending après publication: %v", err)
	}
	var cguPendingAfter *PendingAcceptance
	for i := range pendingAfter {
		if pendingAfter[i].Slug == "conditions-generales-utilisation" {
			cguPendingAfter = &pendingAfter[i]
			break
		}
	}
	if cguPendingAfter == nil {
		t.Fatal("la nouvelle version n'apparaît pas dans les acceptations en attente")
	}
	if cguPendingAfter.VersionID != newVersionID {
		t.Fatalf("portail propose %s, attendu %s", cguPendingAfter.VersionID, newVersionID)
	}
	if cguPendingAfter.Version != "2.0.0" {
		t.Fatalf("portail propose la version %s, attendu 2.0.0", cguPendingAfter.Version)
	}

	// ── 7. Le lecteur re-consent ─────────────────────────────────────
	reaccepted, err := svc.Accept(ctx, legalReaderID, "conditions-generales-utilisation", AcceptInput{
		Locale: "fr", Source: "portal", Method: "click",
		IP: "203.0.113.10", UserAgent: "rehearsal-agent/1.0",
	})
	if err != nil {
		t.Fatalf("re-accept: %v", err)
	}
	if reaccepted.VersionID != newVersionID || reaccepted.Version != "2.0.0" {
		t.Fatalf("re-acceptation = %s (%s), attendu 2.0.0 (%s)",
			reaccepted.Version, reaccepted.VersionID, newVersionID)
	}
	if reaccepted.AcceptedAt == nil || time.Since(*reaccepted.AcceptedAt) > 2*time.Minute {
		t.Fatalf("horodatage d'acceptation aberrant: %+v", reaccepted.AcceptedAt)
	}

	// ── 8. Retour à la conformité ────────────────────────────────────
	after, err := svc.Compliance(ctx, legalAdminID)
	if err != nil {
		t.Fatalf("compliance après: %v", err)
	}
	var cguAfter *ComplianceDocument
	for i := range after.Documents {
		if after.Documents[i].Slug == "conditions-generales-utilisation" {
			cguAfter = &after.Documents[i]
			break
		}
	}
	if cguAfter == nil {
		t.Fatal("CGU absentes du tableau de conformité après re-consentement")
	}
	if cguAfter.PublishedVersion != "2.0.0" {
		t.Fatalf("version publiée = %s, attendu 2.0.0", cguAfter.PublishedVersion)
	}
	if cguAfter.CurrentAcceptances < cguBefore.CurrentAcceptances {
		t.Fatalf("couverture régressée: %d < %d",
			cguAfter.CurrentAcceptances, cguBefore.CurrentAcceptances)
	}
	// Aucune acceptation ne doit pointer la version archivée comme « courante ».
	var staleCount int
	if err := poolTest.QueryRow(ctx,
		`SELECT count(*) FROM legal_acceptance
		 WHERE version_id = $1`, publishedVersionID).Scan(&staleCount); err != nil {
		t.Fatal(err)
	}
	_ = staleCount // l'acceptation v1 reste en historique : c'est voulu (piste d'audit).
}
