package legal

// Tests du consentement « à la source » : ce que le serveur doit pouvoir
// prouver quand un compte naît, quand un créateur ouvre son espace, quand un
// visiteur anonyme fait un choix de traceurs, et quand une nouvelle version
// publiée doit être annoncée.

import (
	"context"
	"testing"

	db "github.com/qoefi/api/internal/database"
)

// cleanConsentTables vide les tables ajoutées par la migration 00019 (les
// tables légales historiques sont déjà nettoyées par seedUsers).
func cleanConsentTables(t *testing.T, ctx context.Context) {
	t.Helper()
	if _, err := poolTest.Exec(ctx,
		`TRUNCATE TABLE legal_notice_delivery, legal_notice, cookie_consent_record CASCADE`); err != nil {
		t.Fatalf("truncate consent tables: %v", err)
	}
}

func seededService(t *testing.T) *Service {
	t.Helper()
	ctx := context.Background()
	seedUsers(t, ctx)
	cleanConsentTables(t, ctx)
	svc := newSvc()
	if _, err := svc.SeedDefaults(ctx, legalAdminID); err != nil {
		t.Fatalf("seed: %v", err)
	}
	return svc
}

// ─── Consentement d'inscription ──────────────────────────────────────

func TestLegal_RecordSignupConsent(t *testing.T) {
	ctx := context.Background()
	svc := seededService(t)

	cgu, err := svc.GetPublished(ctx, "conditions-generales-utilisation", "fr")
	if err != nil {
		t.Fatalf("get cgu: %v", err)
	}
	privacy, err := svc.GetPublished(ctx, "politique-confidentialite", "fr")
	if err != nil {
		t.Fatalf("get privacy: %v", err)
	}

	// Le formulaire d'inscription a coché deux documents : les deux versions
	// exactes sont reprises dans les métadonnées du compte.
	payload := map[string]any{
		"locale": "fr",
		"at":     "2026-09-12T10:00:00Z",
		"items": []any{
			map[string]any{"slug": cgu.Slug, "versionId": cgu.VersionID, "version": cgu.Version},
			map[string]any{"slug": privacy.Slug, "versionId": privacy.VersionID, "version": privacy.Version},
			// Slug inconnu : ignoré sans faire échouer le reste.
			map[string]any{"slug": "document-fantome", "versionId": "x", "version": "9.9"},
		},
	}

	written, err := svc.RecordSignupConsent(ctx, legalReaderID, "fr", "signup", "203.0.113.9", "test-agent", payload)
	if err != nil {
		t.Fatalf("record signup consent: %v", err)
	}
	if written != 2 {
		t.Fatalf("preuves écrites = %d, attendu 2", written)
	}

	history, err := svc.UserAcceptances(ctx, legalReaderID)
	if err != nil {
		t.Fatalf("history: %v", err)
	}
	if len(history) != 2 {
		t.Fatalf("preuves en base = %d, attendu 2", len(history))
	}
	for _, acc := range history {
		if acc.Source != "signup" || acc.Method != "signup-checkbox" {
			t.Fatalf("origine de la preuve inattendue: %+v", acc)
		}
	}

	// Idempotence : rejouer le même payload ne duplique aucune preuve.
	if _, err := svc.RecordSignupConsent(ctx, legalReaderID, "fr", "signup", "", "", payload); err != nil {
		t.Fatalf("replay: %v", err)
	}
	history, err = svc.UserAcceptances(ctx, legalReaderID)
	if err != nil {
		t.Fatalf("history after replay: %v", err)
	}
	if len(history) != 2 {
		t.Fatalf("preuves après rejeu = %d, attendu 2", len(history))
	}

	// Un payload illisible ou vide ne crée rien et ne renvoie pas d'erreur
	// bloquante : la création du compte ne doit jamais échouer pour ça.
	for name, bad := range map[string]any{
		"nil":       nil,
		"chaîne":    "pas du json",
		"vide":      map[string]any{},
		"sans item": map[string]any{"locale": "fr", "items": []any{}},
	} {
		written, err := svc.RecordSignupConsent(ctx, legalSimpleID, "fr", "signup", "", "", bad)
		if err != nil || written != 0 {
			t.Fatalf("payload %s: écrit=%d err=%v, attendu 0/nil", name, written, err)
		}
	}
}

// TestLegal_RecordSignupConsentRejectsStaleVersion est le garde-fou le plus
// important : si la version publiée a changé entre l'inscription et l'activation
// du compte, on n'écrit AUCUNE preuve. Laisser croire à un consentement sur un
// texte que la personne n'a pas lu serait une fausse preuve.
func TestLegal_RecordSignupConsentRejectsStaleVersion(t *testing.T) {
	ctx := context.Background()
	svc := seededService(t)

	doc, err := svc.q.GetLegalDocumentBySlug(ctx, "conditions-generales-utilisation")
	if err != nil {
		t.Fatalf("doc: %v", err)
	}
	// Nouvelle version publiée entre-temps.
	draft, err := svc.CreateVersion(ctx, legalAdminID, doc.ID, SaveVersionInput{
		Locale: "fr", Version: "1.1.0", Title: "Conditions générales d'utilisation",
		Summary: "s", Body: "# CGU\n\nTexte modifié.", Changelog: "Clause de résiliation précisée",
	})
	if err != nil {
		t.Fatalf("create version: %v", err)
	}
	if _, err := svc.PublishVersion(ctx, legalAdminID, draft.ID); err != nil {
		t.Fatalf("publish: %v", err)
	}

	// Le formulaire avait affiché la 1.0.0.
	old, err := svc.q.ListLegalDocumentVersions(ctx, doc.ID)
	if err != nil {
		t.Fatalf("versions: %v", err)
	}
	var staleVersionID string
	for _, row := range old {
		if row.Locale == "fr" && row.Status == "ARCHIVED" {
			staleVersionID = row.ID
		}
	}
	if staleVersionID == "" {
		t.Fatal("version archivée introuvable")
	}

	payload := map[string]any{
		"locale": "fr",
		"items": []any{
			map[string]any{"slug": doc.Slug, "versionId": staleVersionID, "version": "1.0.0"},
		},
	}
	written, err := svc.RecordSignupConsent(ctx, legalReaderID, "fr", "signup", "", "", payload)
	if err != nil {
		t.Fatalf("record: %v", err)
	}
	if written != 0 {
		t.Fatalf("preuves écrites = %d, attendu 0 (version périmée)", written)
	}
	history, err := svc.UserAcceptances(ctx, legalReaderID)
	if err != nil {
		t.Fatalf("history: %v", err)
	}
	if len(history) != 0 {
		t.Fatalf("une preuve a été écrite sur une version non lue: %+v", history)
	}

	// Sans version épinglée (métadonnée d'un client plus ancien), on accepte la
	// version courante : c'est le comportement de repli documenté.
	payloadUnpinned := map[string]any{
		"locale": "fr",
		"items":  []any{map[string]any{"slug": doc.Slug}},
	}
	written, err = svc.RecordSignupConsent(ctx, legalReaderID, "fr", "signup", "", "", payloadUnpinned)
	if err != nil {
		t.Fatalf("record unpinned: %v", err)
	}
	if written != 1 {
		t.Fatalf("preuves écrites = %d, attendu 1", written)
	}
}

func TestLegal_ParseSignupConsent(t *testing.T) {
	if parseSignupConsent(nil) != nil {
		t.Fatal("nil doit être ignoré")
	}
	if parseSignupConsent(map[string]any{}) != nil {
		t.Fatal("payload sans item doit être ignoré")
	}
	if parseSignupConsent("{{{") != nil {
		t.Fatal("json invalide doit être ignoré")
	}
	parsed := parseSignupConsent(map[string]any{
		"locale": "en",
		"items":  []any{map[string]any{"slug": "cgu", "versionId": "v1"}},
	})
	if parsed == nil || len(parsed.Items) != 1 || parsed.Items[0].Slug != "cgu" {
		t.Fatalf("payload valide non décodé: %+v", parsed)
	}
}

// ─── Acceptation par lot (onboarding) ────────────────────────────────

func TestLegal_AcceptBatch(t *testing.T) {
	ctx := context.Background()
	svc := seededService(t)

	items, err := svc.AcceptBatch(ctx, legalSimpleID, AcceptBatchInput{
		Locale: "fr", Source: "onboarding", Method: "onboarding-checkbox",
		Slugs: []string{
			"accord-createur",
			"conditions-generales-utilisation",
			"conditions-generales-utilisation", // doublon volontaire
			"accord-createur",                  // doublon volontaire
			"document-inexistant",              // ignoré
			"",                                 // ignoré
		},
		IP: "198.51.100.4", UserAgent: "test-agent",
	})
	if err != nil {
		t.Fatalf("accept batch: %v", err)
	}
	if len(items) != 2 {
		t.Fatalf("acceptations = %d, attendu 2 (doublons et inconnus ignorés)", len(items))
	}
	for _, item := range items {
		if item.Source != "onboarding" || item.Version == "" {
			t.Fatalf("preuve incomplète: %+v", item)
		}
	}

	// Idempotent : un second appel ne crée pas de doublon.
	if _, err := svc.AcceptBatch(ctx, legalSimpleID, AcceptBatchInput{
		Locale: "fr", Source: "onboarding", Slugs: []string{"accord-createur"},
	}); err != nil {
		t.Fatalf("accept batch replay: %v", err)
	}
	history, err := svc.UserAcceptances(ctx, legalSimpleID)
	if err != nil {
		t.Fatalf("history: %v", err)
	}
	if len(history) != 2 {
		t.Fatalf("preuves = %d, attendu 2", len(history))
	}

	// Sans identité → refusé.
	if _, err := svc.AcceptBatch(ctx, "", AcceptBatchInput{Locale: "fr", Slugs: []string{"accord-createur"}}); !IsForbidden(err) {
		t.Fatalf("sans identité: err = %v, attendu interdit", err)
	}
	// Sans document → invalide.
	if _, err := svc.AcceptBatch(ctx, legalSimpleID, AcceptBatchInput{Locale: "fr"}); !IsInvalid(err) {
		t.Fatalf("sans slug: err = %v, attendu invalide", err)
	}
}

// ─── Journal du consentement traceurs ────────────────────────────────

func TestLegal_CookieConsentJournal(t *testing.T) {
	ctx := context.Background()
	svc := seededService(t)

	refused, err := svc.RecordCookieConsent(ctx, CookieConsentInput{
		ConsentID: "browser-1", Locale: "fr", PolicyVersion: "1.0",
		Categories: map[string]bool{"necessary": true, "analytics": false, "functional": false, "marketing": false},
		Source:     "banner", IP: "203.0.113.20", UserAgent: "test-agent",
	})
	if err != nil {
		t.Fatalf("record refused: %v", err)
	}
	if refused.ID == "" || refused.RecordedAt == nil {
		t.Fatalf("accusé de réception incomplet: %+v", refused)
	}

	// Même navigateur, choix modifié : on AJOUTE une ligne, on n'écrase jamais.
	if _, err := svc.RecordCookieConsent(ctx, CookieConsentInput{
		ConsentID: "browser-1", Locale: "fr", PolicyVersion: "1.0",
		Categories: map[string]bool{"necessary": true, "analytics": true, "functional": true, "marketing": false},
		Source:     "preferences-center",
	}); err != nil {
		t.Fatalf("record accepted: %v", err)
	}

	records, err := svc.ListCookieConsentRecords(ctx, legalAdminID, "", 50)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(records) != 2 {
		t.Fatalf("lignes de journal = %d, attendu 2 (append-only)", len(records))
	}
	// Le plus récent d'abord.
	if records[0].Categories["analytics"] != true || records[1].Categories["analytics"] != false {
		t.Fatalf("ordre ou contenu du journal inattendu: %+v", records)
	}

	// Corrélation par navigateur.
	same, err := svc.ListCookieConsentRecords(ctx, legalAdminID, "browser-1", 50)
	if err != nil {
		t.Fatalf("list by consent: %v", err)
	}
	if len(same) != 2 {
		t.Fatalf("lignes pour browser-1 = %d, attendu 2", len(same))
	}

	stats, err := svc.CookieConsentStats(ctx, legalAdminID)
	if err != nil {
		t.Fatalf("stats: %v", err)
	}
	if stats.Total != 2 || stats.DistinctBrowsers != 1 || stats.AnalyticsOptIn != 1 || stats.AnalyticsOptOut != 1 {
		t.Fatalf("statistiques inattendues: %+v", stats)
	}
	if stats.LastChoiceAt == nil {
		t.Fatal("dernier choix non daté")
	}

	// Une ligne sans version de politique n'est pas une preuve exploitable.
	if _, err := svc.RecordCookieConsent(ctx, CookieConsentInput{ConsentID: "x", Locale: "fr"}); !IsInvalid(err) {
		t.Fatalf("sans policyVersion: err = %v, attendu invalide", err)
	}
	// Les statistiques sont réservées au superadmin.
	if _, err := svc.CookieConsentStats(ctx, legalSimpleID); !IsForbidden(err) {
		t.Fatalf("stats non-superadmin: err = %v, attendu interdit", err)
	}
}

// ─── Avis de nouvelle version ────────────────────────────────────────

func TestLegal_EnqueueNoticeOnPublish(t *testing.T) {
	ctx := context.Background()
	svc := seededService(t)

	// Un document sans consentement obligatoire ne déclenche aucun avis.
	mentions, err := svc.q.GetLegalDocumentBySlug(ctx, "mentions-legales")
	if err != nil {
		t.Fatalf("doc: %v", err)
	}
	draft, err := svc.CreateVersion(ctx, legalAdminID, mentions.ID, SaveVersionInput{
		Locale: "fr", Version: "1.1.0", Title: "Mentions légales", Summary: "s", Body: "corps",
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	published, err := svc.PublishVersion(ctx, legalAdminID, draft.ID)
	if err != nil {
		t.Fatalf("publish: %v", err)
	}
	if published.Notice == nil || !published.Notice.Skipped {
		t.Fatalf("avis attendu « ignoré » pour un document sans consentement: %+v", published.Notice)
	}

	// Deux comptes avaient accepté la CGU : ce sont eux qui doivent être
	// prévenus quand le texte change.
	if _, err := svc.Accept(ctx, legalReaderID, "conditions-generales-utilisation", AcceptInput{Locale: "fr", Source: "signup"}); err != nil {
		t.Fatalf("accept reader: %v", err)
	}
	if _, err := svc.Accept(ctx, legalSimpleID, "conditions-generales-utilisation", AcceptInput{Locale: "fr", Source: "onboarding"}); err != nil {
		t.Fatalf("accept creator: %v", err)
	}

	cgu, err := svc.q.GetLegalDocumentBySlug(ctx, "conditions-generales-utilisation")
	if err != nil {
		t.Fatalf("doc cgu: %v", err)
	}
	newDraft, err := svc.CreateVersion(ctx, legalAdminID, cgu.ID, SaveVersionInput{
		Locale: "fr", Version: "1.1.0", Title: "Conditions générales d'utilisation",
		Summary: "Nouvelle clause", Body: "# CGU\n\nTexte revu.",
		Changelog: "Ajout d'une clause de résiliation en 30 jours.",
	})
	if err != nil {
		t.Fatalf("create cgu version: %v", err)
	}
	published, err = svc.PublishVersion(ctx, legalAdminID, newDraft.ID)
	if err != nil {
		t.Fatalf("publish cgu: %v", err)
	}
	if published.Notice == nil {
		t.Fatal("aucun avis créé pour un document à consentement obligatoire")
	}
	if published.Notice.Queued != 2 || published.Notice.Recipients != 2 {
		t.Fatalf("destinataires = %d (file = %d), attendu 2/2", published.Notice.Recipients, published.Notice.Queued)
	}
	if published.Notice.Skipped {
		t.Fatalf("avis marqué ignoré à tort: %+v", published.Notice)
	}

	// Les livraisons sont en file, prêtes pour le worker.
	var queued int
	if err := poolTest.QueryRow(ctx,
		`SELECT count(*) FROM legal_notice_delivery WHERE notice_id = $1 AND status = 'QUEUED'`,
		published.Notice.NoticeID).Scan(&queued); err != nil {
		t.Fatalf("count deliveries: %v", err)
	}
	if queued != 2 {
		t.Fatalf("livraisons en file = %d, attendu 2", queued)
	}

	// Republier la même version ne duplique ni avis ni livraison.
	if _, err := svc.EnqueueNotice(ctx, legalAdminID, db.LegalDocumentVersion{
		ID:         newDraft.ID,
		DocumentID: cgu.ID,
		Locale:     "fr",
		Version:    "1.1.0",
		Title:      "Conditions générales d'utilisation",
	}); err != nil {
		t.Fatalf("re-enqueue: %v", err)
	}
	var notices int
	if err := poolTest.QueryRow(ctx, `SELECT count(*) FROM legal_notice`).Scan(&notices); err != nil {
		t.Fatalf("count notices: %v", err)
	}
	if notices != 1 {
		t.Fatalf("avis en base = %d, attendu 1 (idempotence)", notices)
	}
	var deliveries int
	if err := poolTest.QueryRow(ctx, `SELECT count(*) FROM legal_notice_delivery`).Scan(&deliveries); err != nil {
		t.Fatalf("count deliveries: %v", err)
	}
	if deliveries != 2 {
		t.Fatalf("livraisons en base = %d, attendu 2 (idempotence)", deliveries)
	}

	// Console : la campagne reste consultable avec son état d'envoi.
	noticesList, err := svc.AdminNotices(ctx, legalAdminID, 10)
	if err != nil {
		t.Fatalf("admin notices: %v", err)
	}
	if len(noticesList) != 1 || noticesList[0].Deliveries != 2 || noticesList[0].Sent != 0 {
		t.Fatalf("campagne inattendue: %+v", noticesList)
	}
	if noticesList[0].PortalPath != "/legal/conditions-generales-utilisation" {
		t.Fatalf("lien de re-consentement = %q", noticesList[0].PortalPath)
	}

	// Réservé au superadmin.
	if _, err := svc.AdminNotices(ctx, legalReaderID, 10); !IsForbidden(err) {
		t.Fatalf("notices non-superadmin: err = %v, attendu interdit", err)
	}
}

// TestLegal_EnqueueNoticeSkipsSuspendus vérifie qu'un compte suspendu ne
// reçoit pas d'email d'information : on n'écrit pas dans le vide.
func TestLegal_EnqueueNoticeSkipsSuspendus(t *testing.T) {
	ctx := context.Background()
	svc := seededService(t)

	if _, err := svc.Accept(ctx, legalReaderID, "conditions-generales-utilisation", AcceptInput{Locale: "fr"}); err != nil {
		t.Fatalf("accept: %v", err)
	}
	if _, err := poolTest.Exec(ctx, `UPDATE "User" SET "isSuspended" = true WHERE id = $1`, legalReaderID); err != nil {
		t.Fatalf("suspend: %v", err)
	}
	t.Cleanup(func() {
		_, _ = poolTest.Exec(context.Background(), `UPDATE "User" SET "isSuspended" = false WHERE id = $1`, legalReaderID)
	})

	doc, err := svc.q.GetLegalDocumentBySlug(ctx, "conditions-generales-utilisation")
	if err != nil {
		t.Fatalf("doc: %v", err)
	}
	draft, err := svc.CreateVersion(ctx, legalAdminID, doc.ID, SaveVersionInput{
		Locale: "fr", Version: "1.2.0", Title: "CGU", Summary: "s", Body: "corps",
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	published, err := svc.PublishVersion(ctx, legalAdminID, draft.ID)
	if err != nil {
		t.Fatalf("publish: %v", err)
	}
	if published.Notice == nil {
		t.Fatal("aucun avis créé pour un document à consentement obligatoire")
	}
	if published.Notice.Recipients != 0 {
		t.Fatalf("destinataires = %d, attendu 0 (compte suspendu)", published.Notice.Recipients)
	}
}

// ─── Tableau de bord de conformité ───────────────────────────────────

func TestLegal_Compliance(t *testing.T) {
	ctx := context.Background()
	svc := seededService(t)

	// Un lecteur accepte un document ; la couverture de CE document monte.
	if _, err := svc.Accept(ctx, legalReaderID, "conditions-generales-utilisation", AcceptInput{Locale: "fr"}); err != nil {
		t.Fatalf("accept: %v", err)
	}

	snapshot, err := svc.Compliance(ctx, legalAdminID)
	if err != nil {
		t.Fatalf("compliance: %v", err)
	}
	if len(snapshot.Documents) != len(seedManifest()) {
		t.Fatalf("documents suivis = %d, attendu %d", len(snapshot.Documents), len(seedManifest()))
	}
	if snapshot.GeneratedAt.IsZero() {
		t.Fatal("photographie non datée")
	}
	if snapshot.EligibleUsers < 3 {
		t.Fatalf("comptes actifs = %d, attendu au moins 3", snapshot.EligibleUsers)
	}
	// Personne n'a encore accepté : les écarts sont signalés.
	if snapshot.UsersWithGaps == 0 || snapshot.PendingAcceptances == 0 {
		t.Fatalf("écarts de consentement non détectés: %+v", snapshot.Summary)
	}

	var cgu *ComplianceDocument
	for i := range snapshot.Documents {
		if snapshot.Documents[i].Slug == "conditions-generales-utilisation" {
			cgu = &snapshot.Documents[i]
		}
	}
	if cgu == nil {
		t.Fatal("CGU absentes du rapport")
	}
	if cgu.CurrentAcceptances != 1 || cgu.Status != "warning" {
		t.Fatalf("état CGU inattendu: %+v", cgu)
	}

	// Toutes les échéances partent de la publication réelle du seed.
	if len(snapshot.Obligations) == 0 {
		t.Fatal("aucune échéance réglementaire suivie")
	}
	for _, obl := range snapshot.Obligations {
		if obl.Status != "ok" || obl.NextDue == nil || obl.DaysLeft == nil {
			t.Fatalf("échéance juste publiée non conforme: %+v", obl)
		}
		if obl.Legal == "" {
			t.Fatalf("échéance sans référence légale: %+v", obl)
		}
	}
	// Un contenu fraîchement publié mais sans consentement recueilli n'est pas
	// « conforme » : le score doit refléter l'écart, pas le masquer.
	if snapshot.Summary.Score >= 100 {
		t.Fatalf("score = %d alors qu'aucun compte n'a accepté les documents", snapshot.Summary.Score)
	}

	// Quand tous les comptes ont accepté, la couverture devient totale : c'est
	// le signal que la console doit faire passer au vert.
	for _, userID := range []string{legalAdminID, legalReaderID, legalSimpleID} {
		pending, err := svc.PendingAcceptances(ctx, userID, "fr")
		if err != nil {
			t.Fatalf("pending %s: %v", userID, err)
		}
		for _, item := range pending {
			if _, err := svc.Accept(ctx, userID, item.Slug, AcceptInput{Locale: "fr", Source: "onboarding"}); err != nil {
				t.Fatalf("accept %s/%s: %v", userID, item.Slug, err)
			}
		}
	}
	settled, err := svc.Compliance(ctx, legalAdminID)
	if err != nil {
		t.Fatalf("compliance accepté: %v", err)
	}
	if settled.UsersWithGaps != 0 {
		t.Fatalf("écarts restants = %d après acceptation complète", settled.UsersWithGaps)
	}
	if settled.Summary.Score <= snapshot.Summary.Score {
		t.Fatalf("le score n'a pas progressé (%d → %d)", snapshot.Summary.Score, settled.Summary.Score)
	}

	// Document « à accepter » sans aucune version publiée : critique.
	doc, err := svc.CreateDocument(ctx, legalAdminID, SaveDocumentInput{
		Slug: "charte-obligatoire", Category: "general", Audience: "all",
		RequiresAcceptance: true, Locale: "fr", Version: "1.0.0",
		Title: "Charte obligatoire", Summary: "s", Body: "corps", Publish: false,
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	t.Cleanup(func() { _ = svc.DeleteDocument(context.Background(), legalAdminID, doc.ID) })

	snapshot, err = svc.Compliance(ctx, legalAdminID)
	if err != nil {
		t.Fatalf("compliance 2: %v", err)
	}
	var risky *ComplianceDocument
	for i := range snapshot.Documents {
		if snapshot.Documents[i].Slug == "charte-obligatoire" {
			risky = &snapshot.Documents[i]
		}
	}
	if risky == nil || risky.Status != "critical" {
		t.Fatalf("document sans version publiée non signalé: %+v", risky)
	}
	if snapshot.Summary.Critical == 0 || snapshot.Summary.MissingPublications == 0 {
		t.Fatalf("synthèse non mise à jour: %+v", snapshot.Summary)
	}
	if snapshot.Summary.Score >= 100 {
		t.Fatalf("score inchangé malgré un document critique: %d", snapshot.Summary.Score)
	}
	if len(risky.Issues) == 0 {
		t.Fatal("aucun angle mort expliqué pour un document critique")
	}

	// RBAC.
	if _, err := svc.Compliance(ctx, legalSimpleID); !IsForbidden(err) {
		t.Fatalf("compliance non-superadmin: err = %v, attendu interdit", err)
	}
}
