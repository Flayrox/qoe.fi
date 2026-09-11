package legal

// Tests d'intégration du module légal (Postgres éphémère + migrations goose) :
//   - seed idempotent du contenu embarqué (10 documents, versions publiées) ;
//   - lecture publique + repli de locale (en → fr) ;
//   - consentement versionné idempotent et re-consentement après nouvelle version ;
//   - publication d'une nouvelle version : l'ancienne est archivée, une seule publiée ;
//   - RBAC : tout ce qui touche à l'édition est refusé hors superadmin.

import (
	"context"
	"log"
	"os"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api/internal/testutil"
)

var poolTest *pgxpool.Pool

const (
	legalAdminID  = "00000000-0000-0000-0000-00000000e1a1"
	legalReaderID = "00000000-0000-0000-0000-00000000e1a2"
	legalSimpleID = "00000000-0000-0000-0000-00000000e1a3"
)

func TestMain(m *testing.M) {
	p, err := testutil.Pool(context.Background())
	if err != nil {
		log.Fatalf("testcontainers: %v", err)
	}
	poolTest = p
	code := m.Run()
	testutil.Cleanup()
	os.Exit(code)
}

// seedUsers crée un superadmin, un créateur et un lecteur, et vide les tables légales.
func seedUsers(t *testing.T, ctx context.Context) {
	t.Helper()
	if _, err := poolTest.Exec(ctx, `TRUNCATE TABLE "legal_acceptance", "legal_document_version", "legal_document" CASCADE`); err != nil {
		t.Fatalf("truncate legal: %v", err)
	}
	if _, err := poolTest.Exec(ctx, `DELETE FROM "User" WHERE id IN ($1, $2, $3)`, legalAdminID, legalReaderID, legalSimpleID); err != nil {
		t.Fatalf("clean users: %v", err)
	}
	rows := []struct{ id, email, username, role string }{
		{legalAdminID, "legal-admin@test.dev", "legaladmin", "superadmin"},
		{legalReaderID, "legal-reader@test.dev", "legalreader", "user"},
		{legalSimpleID, "legal-creator@test.dev", "legalcreator", "creator"},
	}
	for _, r := range rows {
		if _, err := poolTest.Exec(ctx,
			`INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt")
			 VALUES ($1, $2, $3, $3, $4, now(), now())`,
			r.id, r.email, r.username, r.role); err != nil {
			t.Fatalf("insert user %s: %v", r.username, err)
		}
	}
}

func newSvc() *Service { return NewService(poolTest) }

// seedVersionCount = nombre total de versions déclarées dans le manifeste
// (une par locale et par document).
func seedVersionCount() int {
	n := 0
	for _, doc := range seedManifest() {
		n += len(doc.Versions)
	}
	return n
}

// ─── Seed ────────────────────────────────────────────────────────────

func TestLegal_SeedIsIdempotentAndPublishes(t *testing.T) {
	ctx := context.Background()
	seedUsers(t, ctx)
	svc := newSvc()

	res, err := svc.SeedDefaults(ctx, legalAdminID)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	if res.Created != len(seedManifest()) {
		t.Fatalf("documents créés = %d, attendu %d", res.Created, len(seedManifest()))
	}
	if res.Versions != seedVersionCount() {
		t.Fatalf("versions créées = %d, attendu %d", res.Versions, seedVersionCount())
	}
	if len(res.Missing) != 0 {
		t.Fatalf("contenu embarqué manquant: %v", res.Missing)
	}

	// Idempotence : un second seed ne crée rien et ne casse rien.
	res2, err := svc.SeedDefaults(ctx, legalAdminID)
	if err != nil {
		t.Fatalf("re-seed: %v", err)
	}
	if res2.Created != 0 || res2.Enriched != 0 || res2.Skipped != len(seedManifest()) {
		t.Fatalf("re-seed = %+v, attendu 0 créé / 0 complété / %d ignorés", res2, len(seedManifest()))
	}

	// Toutes les pages publiques sont servies dès le seed.
	docs, err := svc.ListPublished(ctx, "fr")
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(docs) != len(seedManifest()) {
		t.Fatalf("documents publiés = %d, attendu %d", len(docs), len(seedManifest()))
	}
	for _, d := range docs {
		if d.Version == "" || d.VersionID == "" || d.Title == "" {
			t.Fatalf("document incomplet: %+v", d)
		}
		if d.PublishedAt == nil {
			t.Fatalf("document %s sans date de publication", d.Slug)
		}
	}
	// Ordre d'affichage = sort_order du manifeste.
	if docs[0].Slug != "mentions-legales" {
		t.Fatalf("premier document = %s, attendu mentions-legales", docs[0].Slug)
	}

	// Le contenu markdown est bien rendu (variables substituées, pas de gabarit).
	full, err := svc.GetPublished(ctx, "politique-confidentialite", "fr")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if strings.Contains(full.Body, "{{updatedAt}}") {
		t.Fatalf("variable de gabarit non substituée dans le contenu")
	}
	if !strings.Contains(full.Body, "Responsable du traitement") {
		t.Fatalf("contenu inattendu: %s", full.Body[:120])
	}
	if !full.RequiresAcceptance {
		t.Fatalf("la politique de confidentialité doit exiger une acceptation")
	}

	// Bilingue : la version anglaise est publiée d'emblée, avec son propre
	// contenu et ses propres libellés (un lecteur anglophone ne doit jamais
	// tomber sur du français, ni sur une page vide).
	enDocs, err := svc.ListPublished(ctx, "en")
	if err != nil {
		t.Fatalf("list en: %v", err)
	}
	if len(enDocs) != len(seedManifest()) {
		t.Fatalf("documents publiés en anglais = %d, attendu %d", len(enDocs), len(seedManifest()))
	}
	for _, d := range enDocs {
		if d.Locale != "en" || d.Version == "" || d.PublishedAt == nil {
			t.Fatalf("document anglais incomplet: %+v", d)
		}
	}

	enFull, err := svc.GetPublished(ctx, "conditions-generales-utilisation", "en")
	if err != nil {
		t.Fatalf("get en: %v", err)
	}
	if enFull.Title != "Terms of service" {
		t.Fatalf("titre anglais = %q, attendu Terms of service", enFull.Title)
	}
	if !strings.Contains(enFull.Body, "Data controller") && !strings.Contains(enFull.Body, "Account and legal capacity") {
		t.Fatalf("corps anglais inattendu: %s", firstChars(enFull.Body, 160))
	}

	// Les deux locales vivent côte à côte sans interférer : la version
	// française reste servie telle quelle.
	frFull, err := svc.GetPublished(ctx, "conditions-generales-utilisation", "fr")
	if err != nil {
		t.Fatalf("get fr: %v", err)
	}
	if frFull.Title != "Conditions générales d'utilisation" {
		t.Fatalf("titre français = %q", frFull.Title)
	}
}

// firstChars retourne un extrait sûr pour les messages d'erreur de test.
func firstChars(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

// ─── Amarçage au démarrage ───────────────────────────────────────────

func TestLegal_EnsureSeededBootstrapsEmptyDatabase(t *testing.T) {
	ctx := context.Background()
	seedUsers(t, ctx)
	svc := newSvc()

	// Base vide : le boot installe tout le contenu embarqué. Aucun acteur
	// n'est requis (l'éditeur déploie le binaire, pas un compte utilisateur).
	res, err := svc.EnsureSeeded(ctx)
	if err != nil {
		t.Fatalf("ensure seeded: %v", err)
	}
	if res.Created != len(seedManifest()) {
		t.Fatalf("documents installés = %d, attendu %d", res.Created, len(seedManifest()))
	}

	docs, err := svc.ListPublished(ctx, "fr")
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(docs) != len(seedManifest()) {
		t.Fatalf("aucune page légale vide ne doit subsister: %d publié(s)", len(docs))
	}

	// Base déjà garnie : on ne touche à rien (le contenu appartient à l'éditeur).
	res2, err := svc.EnsureSeeded(ctx)
	if err != nil {
		t.Fatalf("ensure seeded (2): %v", err)
	}
	if res2.Created != 0 || res2.Enriched != 0 {
		t.Fatalf("second boot = %+v, attendu 0 création / 0 complétion", res2)
	}
}

// TestLegal_SeedBackfillsMissingLocale couvre la mise à jour d'une instance
// plus ancienne : le contenu français est déjà publié, l'anglais arrive après.
// Le rattrapage ajoute et publie la locale manquante sans jamais toucher à ce
// qui existe déjà (le contenu appartient à l'éditeur).
func TestLegal_SeedBackfillsMissingLocale(t *testing.T) {
	ctx := context.Background()
	seedUsers(t, ctx)
	svc := newSvc()
	if _, err := svc.SeedDefaults(ctx, legalAdminID); err != nil {
		t.Fatalf("seed: %v", err)
	}

	// Simule une instance d'avant la traduction : on retire l'anglais de deux
	// documents et on note la version française pour vérifier son intégrité.
	frenchOnly := []string{"politique-confidentialite", "conditions-generales-utilisation"}
	before := make(map[string][2]string)
	for _, slug := range frenchOnly {
		doc, err := svc.q.GetLegalDocumentBySlug(ctx, slug)
		if err != nil {
			t.Fatalf("doc %s: %v", slug, err)
		}
		rows, err := svc.q.ListLegalDocumentVersions(ctx, doc.ID)
		if err != nil {
			t.Fatalf("versions %s: %v", slug, err)
		}
		for _, row := range rows {
			if row.Locale == "fr" && row.Status == "PUBLISHED" {
				before[slug] = [2]string{row.ID, row.Version}
			}
		}
		// Retrait complet de l'anglais, comme sur une instance d'avant la
		// traduction. L'API ne supprime jamais une version publiée : on simule
		// la migration par un nettoyage direct en base.
		if _, err := poolTest.Exec(ctx,
			`DELETE FROM legal_document_version WHERE document_id = $1 AND locale = 'en'`,
			doc.ID); err != nil {
			t.Fatalf("purge en %s: %v", slug, err)
		}
	}

	res, err := svc.EnsureSeeded(ctx)
	if err != nil {
		t.Fatalf("ensure seeded: %v", err)
	}
	if res.Created != 0 {
		t.Fatalf("aucun document ne doit être recréé: %+v", res)
	}
	if res.Enriched != len(frenchOnly) {
		t.Fatalf("documents complétés = %d, attendu %d", res.Enriched, len(frenchOnly))
	}
	if res.Versions != len(frenchOnly) {
		t.Fatalf("versions ajoutées = %d, attendu %d", res.Versions, len(frenchOnly))
	}

	// L'anglais est de nouveau servi, publié, et le français est intact.
	for _, slug := range frenchOnly {
		en, err := svc.GetPublished(ctx, slug, "en")
		if err != nil {
			t.Fatalf("get en %s: %v", slug, err)
		}
		if en.Locale != "en" || en.Version == "" {
			t.Fatalf("anglais non publié pour %s: %+v", slug, en)
		}

		fr, err := svc.GetPublished(ctx, slug, "fr")
		if err != nil {
			t.Fatalf("get fr %s: %v", slug, err)
		}
		if fr.VersionID != before[slug][0] || fr.Version != before[slug][1] {
			t.Fatalf("la version française de %s a été modifiée par le rattrapage", slug)
		}
	}

	// Une locale déjà travaillée n'est jamais réinstallée : un second passage
	// ne complète plus rien, même après archivage par l'éditeur.
	doc, err := svc.q.GetLegalDocumentBySlug(ctx, "politique-cookies")
	if err != nil {
		t.Fatalf("doc: %v", err)
	}
	rows, err := svc.q.ListLegalDocumentVersions(ctx, doc.ID)
	if err != nil {
		t.Fatalf("versions: %v", err)
	}
	for _, row := range rows {
		if row.Locale == "en" && row.Status == "PUBLISHED" {
			if _, err := svc.ArchiveVersion(ctx, legalAdminID, row.ID); err != nil {
				t.Fatalf("archive en: %v", err)
			}
		}
	}
	replay, err := svc.EnsureSeeded(ctx)
	if err != nil {
		t.Fatalf("ensure seeded (replay): %v", err)
	}
	if replay.Enriched != 0 || replay.Versions != 0 {
		t.Fatalf("une locale archivée a été ressuscitée: %+v", replay)
	}
}

// ─── Locale ──────────────────────────────────────────────────────────

func TestLegal_LocaleFallback(t *testing.T) {
	ctx := context.Background()
	seedUsers(t, ctx)
	svc := newSvc()
	if _, err := svc.SeedDefaults(ctx, legalAdminID); err != nil {
		t.Fatalf("seed: %v", err)
	}

	// La version anglaise est publiée d'emblée : une locale régionale
	// (en-GB) sert bien l'anglais, pas le français.
	en, err := svc.GetPublished(ctx, "conditions-generales-utilisation", "en-GB")
	if err != nil {
		t.Fatalf("get en: %v", err)
	}
	if en.Locale != "en" {
		t.Fatalf("locale servie = %s, attendu en", en.Locale)
	}
	if en.Title != "Terms of service" {
		t.Fatalf("titre inattendu: %s", en.Title)
	}

	// Document dont l'éditeur a retiré l'anglais : le français fait foi,
	// jamais de page vide.
	doc, err := svc.q.GetLegalDocumentBySlug(ctx, "politique-cookies")
	if err != nil {
		t.Fatalf("doc: %v", err)
	}
	rows, err := svc.q.ListLegalDocumentVersions(ctx, doc.ID)
	if err != nil {
		t.Fatalf("versions: %v", err)
	}
	for _, row := range rows {
		if row.Locale == "en" && row.Status == "PUBLISHED" {
			if _, err := svc.ArchiveVersion(ctx, legalAdminID, row.ID); err != nil {
				t.Fatalf("archive en: %v", err)
			}
		}
	}
	fallback, err := svc.GetPublished(ctx, "politique-cookies", "en")
	if err != nil {
		t.Fatalf("get fallback: %v", err)
	}
	if fallback.Locale != "fr" || !strings.Contains(fallback.Title, "Politique de cookies") {
		t.Fatalf("repli attendu sur fr, obtenu %s / %s", fallback.Locale, fallback.Title)
	}

	// Une locale inconnue de document → 404.
	if _, err := svc.GetPublished(ctx, "inconnu-total", "fr"); !IsNotFound(err) {
		t.Fatalf("document inconnu: err = %v, attendu introuvable", err)
	}
	if NormalizeLocale("EN_us") != "en" || NormalizeLocale("de") != "fr" || NormalizeLocale("") != "fr" {
		t.Fatalf("NormalizeLocale incohérent")
	}
}

// ─── Consentement ────────────────────────────────────────────────────

func TestLegal_ConsentLifecycle(t *testing.T) {
	ctx := context.Background()
	seedUsers(t, ctx)
	svc := newSvc()
	if _, err := svc.SeedDefaults(ctx, legalAdminID); err != nil {
		t.Fatalf("seed: %v", err)
	}

	// État initial : les documents à accepter sont en attente.
	pending, err := svc.PendingAcceptances(ctx, legalReaderID, "fr")
	if err != nil {
		t.Fatalf("pending: %v", err)
	}
	if len(pending) == 0 {
		t.Fatal("aucun consentement en attente alors que des documents l'exigent")
	}
	wantPending := len(pending)

	// Acceptation (idempotente : deux appels = une seule preuve).
	acc, err := svc.Accept(ctx, legalReaderID, "conditions-generales-utilisation", AcceptInput{
		Locale: "fr", Source: "signup", Method: "checkbox", IP: "203.0.113.7", UserAgent: "test-agent",
	})
	if err != nil {
		t.Fatalf("accept: %v", err)
	}
	if acc.Version == "" || acc.DocumentSlug == "" {
		t.Fatalf("preuve incomplète: %+v", acc)
	}
	if _, err := svc.Accept(ctx, legalReaderID, "conditions-generales-utilisation", AcceptInput{Locale: "fr"}); err != nil {
		t.Fatalf("re-accept: %v", err)
	}

	after, err := svc.PendingAcceptances(ctx, legalReaderID, "fr")
	if err != nil {
		t.Fatalf("pending after: %v", err)
	}
	if len(after) != wantPending-1 {
		t.Fatalf("en attente = %d, attendu %d", len(after), wantPending-1)
	}

	history, err := svc.UserAcceptances(ctx, legalReaderID)
	if err != nil {
		t.Fatalf("history: %v", err)
	}
	if len(history) != 1 {
		t.Fatalf("preuves = %d, attendu 1 (idempotence)", len(history))
	}
	if history[0].Source != "signup" {
		t.Fatalf("source = %s, attendu signup", history[0].Source)
	}

	// Un second utilisateur a son propre état (isolation).
	other, err := svc.PendingAcceptances(ctx, legalSimpleID, "fr")
	if err != nil {
		t.Fatalf("pending other: %v", err)
	}
	if len(other) != wantPending {
		t.Fatalf("en attente pour le second utilisateur = %d, attendu %d", len(other), wantPending)
	}

	// Document inconnu → introuvable, pas de preuve orpheline.
	if _, err := svc.Accept(ctx, legalReaderID, "nope", AcceptInput{Locale: "fr"}); !IsNotFound(err) {
		t.Fatalf("accept inconnu: err = %v", err)
	}
}

// ─── Versioning ──────────────────────────────────────────────────────

func TestLegal_VersioningPublishArchive(t *testing.T) {
	ctx := context.Background()
	seedUsers(t, ctx)
	svc := newSvc()
	if _, err := svc.SeedDefaults(ctx, legalAdminID); err != nil {
		t.Fatalf("seed: %v", err)
	}

	all, err := svc.AdminList(ctx, legalAdminID)
	if err != nil {
		t.Fatalf("admin list: %v", err)
	}
	var docID string
	for _, d := range all {
		if d.Slug == "mentions-legales" {
			docID = d.ID
			if d.PublishedVersion == nil || *d.PublishedVersion != "1.0.0" {
				t.Fatalf("version publiée initiale = %v", d.PublishedVersion)
			}
			// Deux versions publiées d'emblée : le français et l'anglais.
			if d.VersionsCount != 2 || d.DraftsCount != 0 {
				t.Fatalf("compteurs initiaux = %+v", d)
			}
		}
	}
	if docID == "" {
		t.Fatal("document mentions-legales introuvable")
	}

	// Nouveau brouillon.
	draft, err := svc.CreateVersion(ctx, legalAdminID, docID, SaveVersionInput{
		Locale: "fr", Version: "1.1.0", Title: "Mentions légales",
		Summary: "Mise à jour de l'hébergeur", Body: "# Mentions légales\n\nNouvelle version.",
		Changelog: "Précision de l'hébergeur et du DPO",
	})
	if err != nil {
		t.Fatalf("create version: %v", err)
	}
	if draft.Status != "DRAFT" {
		t.Fatalf("statut = %s, attendu DRAFT", draft.Status)
	}

	// Le public ne voit pas le brouillon.
	pub, err := svc.GetPublished(ctx, "mentions-legales", "fr")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if pub.Version != "1.0.0" {
		t.Fatalf("version publique = %s, attendu 1.0.0 tant que le brouillon n'est pas publié", pub.Version)
	}

	// Un brouillon est éditable ; le public toujours inchangé.
	if _, err := svc.UpdateVersion(ctx, legalAdminID, draft.ID, SaveVersionInput{
		Title: "Mentions légales", Summary: "s", Body: "# Mentions légales\n\nVersion revue.",
	}); err != nil {
		t.Fatalf("update draft: %v", err)
	}

	// Publication : la 1.0.0 est archivée, la 1.1.0 devient publique.
	published, err := svc.PublishVersion(ctx, legalAdminID, draft.ID)
	if err != nil {
		t.Fatalf("publish: %v", err)
	}
	if published.Status != "PUBLISHED" || published.PublishedAt == nil {
		t.Fatalf("version publiée incohérente: %+v", published)
	}
	pub2, err := svc.GetPublished(ctx, "mentions-legales", "fr")
	if err != nil {
		t.Fatalf("get after publish: %v", err)
	}
	if pub2.Version != "1.1.0" || !strings.Contains(pub2.Body, "Version revue") {
		t.Fatalf("contenu public non mis à jour: %s / %s", pub2.Version, pub2.Body[:80])
	}

	// Historique public : la version archivée reste consultable (preuve).
	versions, err := svc.ListVersions(ctx, "mentions-legales", "fr")
	if err != nil {
		t.Fatalf("versions: %v", err)
	}
	if len(versions) != 2 {
		t.Fatalf("historique = %d versions, attendu 2", len(versions))
	}
	statuses := map[string]string{}
	for _, v := range versions {
		statuses[v.Version] = v.Status
	}
	if statuses["1.0.0"] != "ARCHIVED" || statuses["1.1.0"] != "PUBLISHED" {
		t.Fatalf("statuts d'historique inattendus: %v", statuses)
	}

	// Une version publiée est immuable.
	if _, err := svc.UpdateVersion(ctx, legalAdminID, published.ID, SaveVersionInput{Title: "hack"}); !IsConflict(err) {
		t.Fatalf("édition d'une version publiée: err = %v, attendu conflit", err)
	}

	// Archivage : plus rien de publié en français → le document reste servi
	// grâce au repli anglais (jamais de page légale vide), mais la version
	// française n'est plus renvoyée.
	if _, err := svc.ArchiveVersion(ctx, legalAdminID, published.ID); err != nil {
		t.Fatalf("archive: %v", err)
	}
	fallback, err := svc.GetPublished(ctx, "mentions-legales", "fr")
	if err != nil {
		t.Fatalf("get après archivage: %v", err)
	}
	if fallback.Locale != "en" || fallback.Version != "1.0.0" {
		t.Fatalf("repli anglais attendu, obtenu %s / %s", fallback.Locale, fallback.Version)
	}

	// Plus aucune locale publiée → le document disparaît du public.
	rows, err := svc.q.ListLegalDocumentVersions(ctx, docID)
	if err != nil {
		t.Fatalf("versions: %v", err)
	}
	for _, row := range rows {
		if row.Locale == "en" && row.Status == "PUBLISHED" {
			if _, err := svc.ArchiveVersion(ctx, legalAdminID, row.ID); err != nil {
				t.Fatalf("archive en: %v", err)
			}
		}
	}
	if _, err := svc.GetPublished(ctx, "mentions-legales", "fr"); !IsNotFound(err) {
		t.Fatalf("document entièrement archivé toujours servi: err = %v", err)
	}

	// Suppression d'un brouillon.
	tmp, err := svc.CreateVersion(ctx, legalAdminID, docID, SaveVersionInput{
		Locale: "fr", Version: "2.0.0", Title: "T", Body: "B",
	})
	if err != nil {
		t.Fatalf("create tmp: %v", err)
	}
	if err := svc.DeleteDraft(ctx, legalAdminID, tmp.ID); err != nil {
		t.Fatalf("delete draft: %v", err)
	}
}

// ─── RBAC ────────────────────────────────────────────────────────────

func TestLegal_RBAC(t *testing.T) {
	ctx := context.Background()
	seedUsers(t, ctx)
	svc := newSvc()
	if _, err := svc.SeedDefaults(ctx, legalAdminID); err != nil {
		t.Fatalf("seed: %v", err)
	}

	// Un créateur n'est pas superadmin : aucune route d'édition.
	if _, err := svc.AdminList(ctx, legalSimpleID); !IsForbidden(err) {
		t.Fatalf("AdminList non-superadmin: err = %v, attendu interdit", err)
	}
	if _, err := svc.SeedDefaults(ctx, legalReaderID); !IsForbidden(err) {
		t.Fatalf("Seed non-superadmin: err = %v, attendu interdit", err)
	}
	if _, err := svc.CreateDocument(ctx, legalReaderID, SaveDocumentInput{Slug: "x", Category: "legal", Audience: "all"}); !IsForbidden(err) {
		t.Fatalf("CreateDocument non-superadmin: err = %v, attendu interdit", err)
	}
	if _, err := svc.AdminStats(ctx, ""); !IsForbidden(err) {
		t.Fatalf("AdminStats sans identité: err = %v, attendu interdit", err)
	}

	// Le public reste accessible sans authentification.
	if _, err := svc.ListPublished(ctx, "fr"); err != nil {
		t.Fatalf("ListPublished public: %v", err)
	}
}

// ─── CRUD document ───────────────────────────────────────────────────

func TestLegal_CreateDocumentValidationAndConflict(t *testing.T) {
	ctx := context.Background()
	seedUsers(t, ctx)
	svc := newSvc()

	// Validation.
	if _, err := svc.CreateDocument(ctx, legalAdminID, SaveDocumentInput{Slug: "", Category: "legal", Audience: "all"}); !IsInvalid(err) {
		t.Fatalf("slug vide: err = %v, attendu invalide", err)
	}
	if _, err := svc.CreateDocument(ctx, legalAdminID, SaveDocumentInput{Slug: "test", Category: "nope", Audience: "all"}); !IsInvalid(err) {
		t.Fatalf("catégorie inconnue: err = %v, attendu invalide", err)
	}

	// Création + publication immédiate.
	doc, err := svc.CreateDocument(ctx, legalAdminID, SaveDocumentInput{
		Slug: "charte-test", Category: "general", Audience: "creators", RequiresAcceptance: true,
		Locale: "fr", Version: "1.0.0", Title: "Charte de test", Summary: "s",
		Body: "# Charte de test\n\nContenu.", Publish: true,
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if doc.Slug != "charte-test" || doc.PublishedVersion == nil || *doc.PublishedVersion != "1.0.0" {
		t.Fatalf("document créé incohérent: %+v", doc)
	}

	// Slug déjà pris → 409.
	if _, err := svc.CreateDocument(ctx, legalAdminID, SaveDocumentInput{
		Slug: "charte-test", Category: "general", Audience: "all", Locale: "fr", Title: "doublon", Body: "b",
	}); !IsConflict(err) {
		t.Fatalf("slug dupliqué: err = %v, attendu conflit", err)
	}

	// Mise à jour des métadonnées.
	inactive := false
	updated, err := svc.UpdateDocument(ctx, legalAdminID, doc.ID, SaveDocumentInput{
		Slug: "charte-test", Category: "general", Audience: "all", RequiresAcceptance: false, IsActive: &inactive,
	})
	if err != nil {
		t.Fatalf("update: %v", err)
	}
	if updated.IsActive || updated.RequiresAcceptance {
		t.Fatalf("mise à jour non appliquée: %+v", updated)
	}

	// Désactivé → retiré du public (mais conservé en base).
	if _, err := svc.GetPublished(ctx, "charte-test", "fr"); !IsNotFound(err) {
		t.Fatalf("document inactif servi publiquement: err = %v", err)
	}

	// Statistiques et preuves accessibles au superadmin.
	stats, err := svc.AdminStats(ctx, legalAdminID)
	if err != nil {
		t.Fatalf("stats: %v", err)
	}
	if len(stats) == 0 {
		t.Fatal("aucune statistique")
	}
	accs, err := svc.AdminAcceptances(ctx, legalAdminID, "charte-test", 10)
	if err != nil {
		t.Fatalf("acceptances: %v", err)
	}
	if len(accs) != 0 {
		t.Fatalf("preuves inattendues: %d", len(accs))
	}

	// Mise à jour d'un document inexistant.
	if _, err := svc.UpdateDocument(ctx, legalAdminID, "00000000-0000-0000-0000-000000000000", SaveDocumentInput{
		Slug: "x", Category: "legal", Audience: "all",
	}); !IsNotFound(err) {
		t.Fatalf("update inconnu: err = %v, attendu introuvable", err)
	}

	// Suppression.
	if err := svc.DeleteDocument(ctx, legalAdminID, doc.ID); err != nil {
		t.Fatalf("delete: %v", err)
	}
}
