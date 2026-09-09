package imports

// Tests d'intégration du module Import (import d'articles en lot) —
// migration de apps/studio/src/app/(creator)/import/actions.ts vers Go.

import (
	"context"
	"log"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api/internal/testutil"
)

var poolTest *pgxpool.Pool

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

const (
	importOwnerID  = "00000000-0000-0000-0000-0000000000b1"
	importStranger = "00000000-0000-0000-0000-0000000000b2"
	importMediaID  = "media_imp_001"
	importPubMedia = "pub_imp_media_001"
	importPubPerso = "pub_imp_perso_001"
)

// seedImport crée : une publication PERSONAL (owner), une publication MEDIA
// (owner membre), et un étranger sans aucun accès.
func seedImport(t *testing.T, ctx context.Context) {
	t.Helper()
	if _, err := poolTest.Exec(ctx, `TRUNCATE TABLE
		"MediaMember", "Media", "Article", "Publication", "User" CASCADE`); err != nil {
		t.Fatalf("truncate: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Publication" (id, type, name, slug, "createdAt", "updatedAt")
		 VALUES ($1, 'PERSONAL', 'Journal Perso', 'journal-perso', now(), now()),
		        ($2, 'MEDIA', 'Média Import', 'media-import', now(), now())`,
		importPubPerso, importPubMedia); err != nil {
		t.Fatalf("publications: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Media" (id, "publicationId", "createdAt", "updatedAt")
		 VALUES ($1, $2, now(), now())`, importMediaID, importPubMedia); err != nil {
		t.Fatalf("media: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "User" (id, email, username, name, role, "publicationId", "createdAt", "updatedAt")
		 VALUES ($1, 'owner-import@test.dev', 'ownerimport', 'Owner', 'creator', $2, now(), now()),
		        ($3, 'stranger-import@test.dev', 'strangerimport', 'Étranger', 'user', NULL, now(), now())`,
		importOwnerID, importPubPerso, importStranger); err != nil {
		t.Fatalf("users: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "MediaMember" (id, "mediaId", "userId", role, permissions, status, "createdAt", "updatedAt")
		 VALUES (gen_random_uuid()::text, $1, $2, 'owner', ARRAY[]::text[], 'active', now(), now())`,
		importMediaID, importOwnerID); err != nil {
		t.Fatalf("member: %v", err)
	}
}

func newTestService() *Service {
	return NewService(poolTest, nil)
}

func TestImportArticles(t *testing.T) {
	ctx := context.Background()
	seedImport(t, ctx)
	svc := newTestService()

	// 2 articles nouveaux + 1 slug vide (ignoré).
	req := ImportArticlesRequest{
		PublicationID: importPubPerso,
		Articles: []ImportArticle{
			{Title: "Article un", Slug: "article-un", Content: "<p>Un</p>", ReadingTime: 2},
			{Title: "Article deux", Slug: "article-deux", Content: "<p>Deux</p>", ReadingTime: 3},
			{Title: "", Slug: "", Content: "", ReadingTime: 0},
		},
	}
	created, err := svc.ImportArticles(ctx, importOwnerID, req)
	if err != nil {
		t.Fatalf("ImportArticles: %v", err)
	}
	if created != 2 {
		t.Fatalf("créés = %d, attendu 2", created)
	}

	// Re-import : dédup par slug → 0 nouveau.
	created, err = svc.ImportArticles(ctx, importOwnerID, req)
	if err != nil {
		t.Fatalf("ImportArticles (re): %v", err)
	}
	if created != 0 {
		t.Fatalf("re-import créés = %d, attendu 0 (dédup)", created)
	}

	// Nouveau slug dans le lot → 1 seul créé.
	req2 := ImportArticlesRequest{
		PublicationID: importPubPerso,
		Articles: []ImportArticle{
			{Title: "Article un", Slug: "article-un", Content: "<p>Un</p>", ReadingTime: 2},
			{Title: "Article trois", Slug: "article-trois", Content: "<p>Trois</p>", ReadingTime: 4},
		},
	}
	created, err = svc.ImportArticles(ctx, importOwnerID, req2)
	if err != nil {
		t.Fatalf("ImportArticles (mixte): %v", err)
	}
	if created != 1 {
		t.Fatalf("mixte créés = %d, attendu 1", created)
	}

	// Le créateur owner d'un média peut importer dans la publication média.
	created, err = svc.ImportArticles(ctx, importOwnerID, ImportArticlesRequest{
		PublicationID: importPubMedia,
		Articles:      []ImportArticle{{Title: "Média un", Slug: "media-un", Content: "<p>M</p>", ReadingTime: 1}},
	})
	if err != nil || created != 1 {
		t.Fatalf("import média = %d, %v (attendu 1)", created, err)
	}

	// Étranger → refus.
	if _, err := svc.ImportArticles(ctx, importStranger, ImportArticlesRequest{
		PublicationID: importPubPerso,
		Articles:      []ImportArticle{{Title: "X", Slug: "x", Content: "<p>X</p>", ReadingTime: 1}},
	}); err != errForbidden {
		t.Fatalf("import étranger = %v, attendu errForbidden", err)
	}
}

// ── Import bulk asynchrone : job + worker + rapport d'erreurs ──────────

func TestImportJobLifecycle(t *testing.T) {
	ctx := context.Background()
	seedImport(t, ctx)
	// asynq nil → CreateImportJob ne bloque pas (le job reste PENDING).
	svc := NewService(poolTest, nil)

	// Pré-importe « article-un » pour que le job le trouve en doublon
	// (chaque test re-truncate la base, rien ne survit d'un test à l'autre).
	if _, err := svc.ImportArticles(ctx, importOwnerID, ImportArticlesRequest{
		PublicationID: importPubPerso,
		Articles:      []ImportArticle{{Title: "Article un", Slug: "article-un", Content: "<p>Un</p>", ReadingTime: 2}},
	}); err != nil {
		t.Fatalf("pré-import doublon: %v", err)
	}

	// 1. Création d'un job : 3 articles dont un doublon (article-un) et un
	// invalide (slug vide).
	jobID, err := svc.CreateImportJob(ctx, importOwnerID, ImportArticlesRequest{
		PublicationID: importPubPerso,
		Articles: []ImportArticle{
			{Title: "Bulk un", Slug: "bulk-un", Content: "<p>U</p>", ReadingTime: 2},
			{Title: "Article un", Slug: "article-un", Content: "<p>Un</p>", ReadingTime: 2}, // doublon
			{Title: "", Slug: "", Content: "", ReadingTime: 0},                              // invalide
		},
	})
	if err != nil {
		t.Fatalf("CreateImportJob: %v", err)
	}
	if jobID == "" {
		t.Fatal("jobID vide")
	}

	// 2. Statut initial PENDING + total.
	job, err := svc.GetImportJob(ctx, importOwnerID, jobID)
	if err != nil {
		t.Fatalf("GetImportJob: %v", err)
	}
	if job.Status != "PENDING" || job.Total != 3 {
		t.Fatalf("statut initial = %s total=%d, attendu PENDING/3", job.Status, job.Total)
	}

	// 3. Un étranger ne voit pas le job.
	if _, err := svc.GetImportJob(ctx, importStranger, jobID); err != errNotFound {
		t.Fatalf("GetImportJob(étranger) = %v, attendu errNotFound", err)
	}

	// 4. Traitement (worker) : 1 importé, 1 doublon, 1 erreur rapportée.
	if err := svc.ProcessImportJob(ctx, jobID); err != nil {
		t.Fatalf("ProcessImportJob: %v", err)
	}
	job, err = svc.GetImportJob(ctx, importOwnerID, jobID)
	if err != nil {
		t.Fatalf("GetImportJob (fini): %v", err)
	}
	if job.Status != "DONE" {
		t.Fatalf("status = %s, attendu DONE", job.Status)
	}
	if job.Imported != 1 {
		t.Fatalf("imported = %d, attendu 1", job.Imported)
	}
	if job.Duplicates != 1 {
		t.Fatalf("duplicates = %d, attendu 1", job.Duplicates)
	}
	if len(job.Errors) != 1 || job.Errors[0].Reason == "" {
		t.Fatalf("rapport d'erreurs = %+v, attendu 1 entrée avec raison", job.Errors)
	}

	// 5. Re-traitement idempotent : bulk-un devient doublon, l'invalide reste
	// en erreur → 0 importé, 2 doublons.
	if err := svc.ProcessImportJob(ctx, jobID); err != nil {
		t.Fatalf("ProcessImportJob (re): %v", err)
	}
	job, _ = svc.GetImportJob(ctx, importOwnerID, jobID)
	if job.Imported != 0 || job.Duplicates != 2 || len(job.Errors) != 1 {
		t.Fatalf("re-traitement : imported=%d dup=%d errs=%d, attendu 0/2/1", job.Imported, job.Duplicates, len(job.Errors))
	}

	// 6. Liste des jobs récents.
	jobs, err := svc.ListImportJobs(ctx, importOwnerID)
	if err != nil {
		t.Fatalf("ListImportJobs: %v", err)
	}
	if len(jobs) != 1 || jobs[0].ID != jobID {
		t.Fatalf("jobs = %+v, attendu 1 (le job créé)", jobs)
	}

	// 7. Job inexistant → no-op pour le worker, 404 pour l'API.
	if err := svc.ProcessImportJob(ctx, "job-inexistant"); err != nil {
		t.Fatalf("ProcessImportJob(job absent) = %v, attendu nil (no-op)", err)
	}
}

func TestCreateImportJob_Forbidden(t *testing.T) {
	ctx := context.Background()
	seedImport(t, ctx)
	svc := NewService(poolTest, nil)
	if _, err := svc.CreateImportJob(ctx, importStranger, ImportArticlesRequest{
		PublicationID: importPubPerso,
		Articles:      []ImportArticle{{Title: "X", Slug: "x", Content: "<p>X</p>", ReadingTime: 1}},
	}); err != errForbidden {
		t.Fatalf("CreateImportJob(étranger) = %v, attendu errForbidden", err)
	}
}
