package articles

import (
	"context"
	"strings"
	"testing"

	"github.com/pgvector/pgvector-go"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/testutil"
)

// newService instancie le service sans Redis/asynq (nil-safe).
func newService() *Service {
	return NewService(poolTest, nil, nil)
}

// ─── CRUD créateur (publication personnelle) ──────────────────────────

func TestService_Create_PersonalOwner(t *testing.T) {
	fx := seed(t)
	svc := newService()
	ctx := context.Background()

	id, err := svc.Create(ctx, fx.AuthorID, CreateArticleInput{
		PublicationID: fx.PublicationID,
		Title:         "Nouvel article",
		Slug:          "nouvel-article",
		Content:       "# Titre\n\nContenu markdown",
		ContentFormat: "markdown",
		Status:        "PUBLISHED",
		Published:     true,
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if id == "" {
		t.Fatal("Create retourne un id vide")
	}

	// L'article est bien en base, publié.
	var title, status string
	var published bool
	if err := poolTest.QueryRow(ctx,
		`SELECT title, status, published FROM "Article" WHERE id = $1`, id,
	).Scan(&title, &status, &published); err != nil {
		t.Fatalf("select article: %v", err)
	}
	if title != "Nouvel article" || status != "PUBLISHED" || !published {
		t.Fatalf("article = %q/%q/%v", title, status, published)
	}
}

func TestService_Create_InvalidContentFormat(t *testing.T) {
	fx := seed(t)
	svc := newService()
	ctx := context.Background()

	_, err := svc.Create(ctx, fx.AuthorID, CreateArticleInput{
		PublicationID: fx.PublicationID,
		Title:         "X", Content: "x", ContentFormat: "docx",
	})
	if err == nil || !strings.Contains(err.Error(), "contentFormat") {
		t.Fatalf("Create(docx) = %v, attendu erreur contentFormat", err)
	}
}

func TestService_List_Owner(t *testing.T) {
	fx := seed(t)
	svc := newService()
	ctx := context.Background()

	items, err := svc.List(ctx, fx.AuthorID, fx.PublicationID, 10, 0)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	// 4 articles (3 publiés + 1 brouillon) : List n'applique pas de filtre.
	if len(items) != 4 {
		t.Fatalf("len = %d, attendu 4", len(items))
	}
	// Le plus récent d'abord (le brouillon, delta 0).
	if items[0].Slug != "brouillon" {
		t.Fatalf("items[0] = %q, attendu brouillon", items[0].Slug)
	}
	if items[0].Category == nil || items[0].Category.Slug != "tech" {
		t.Fatalf("catégorie non embarquée: %+v", items[0].Category)
	}
}

func TestService_List_ForbiddenForViewer(t *testing.T) {
	fx := seed(t)
	svc := newService()
	ctx := context.Background()

	// Un utilisateur inconnu (aucun lien avec la publication) est refusé.
	_, err := svc.List(ctx, "00000000-0000-0000-0000-000000000099", fx.PublicationID, 10, 0)
	if err == nil {
		t.Fatal("List(inconnu) = nil, attendu errForbidden")
	}
}

func TestService_GetBySlug_Published(t *testing.T) {
	fx := seed(t)
	svc := newService()
	ctx := context.Background()

	art, err := svc.GetBySlug(ctx, "premier-article", fx.PublicationID, "", "")
	if err != nil {
		t.Fatalf("GetBySlug: %v", err)
	}
	if art.Slug != "premier-article" || !art.Published {
		t.Fatalf("article = %q published=%v", art.Slug, art.Published)
	}
	if !strings.Contains(art.Content, "Contenu public A") {
		t.Fatalf("contenu = %q", art.Content)
	}
	if art.Author.ID != fx.AuthorID {
		t.Fatalf("author = %+v", art.Author)
	}
	if art.Publication == nil || art.Publication.Slug != "journal-test" {
		t.Fatalf("publication = %+v", art.Publication)
	}
}

func TestService_GetBySlug_Unknown(t *testing.T) {
	fx := seed(t)
	svc := newService()
	ctx := context.Background()

	_, err := svc.GetBySlug(ctx, "n-existe-pas", fx.PublicationID, "", "")
	if err == nil {
		t.Fatal("GetBySlug(inconnu) = nil, attendu erreur")
	}
}

func TestService_GetByID_Author(t *testing.T) {
	fx := seed(t)
	svc := newService()
	ctx := context.Background()

	// L'auteur lit son article complet (contenu non tronqué).
	id, err := svc.Create(ctx, fx.AuthorID, CreateArticleInput{
		PublicationID: fx.PublicationID,
		Title:         "Éditable", Slug: "editable",
		Content: "Contenu complet", ContentFormat: "markdown", Status: "DRAFT",
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	art, err := svc.GetByID(ctx, id, fx.AuthorID)
	if err != nil {
		t.Fatalf("GetByID: %v", err)
	}
	if !strings.Contains(art.Content, "Contenu complet") {
		t.Fatalf("contenu = %q", art.Content)
	}
	if art.Status != "DRAFT" {
		t.Fatalf("status = %q", art.Status)
	}
}

func TestService_Update_Owner(t *testing.T) {
	fx := seed(t)
	svc := newService()
	ctx := context.Background()

	err := svc.Update(ctx, "art_test_001", fx.AuthorID, UpdateArticleInput{
		Title:               "Titre modifié",
		Content:             "Nouveau contenu",
		ContentFormat:       "markdown",
		Slug:                "premier-article",
		ActivePublicationID: fx.PublicationID,
	})
	if err != nil {
		t.Fatalf("Update: %v", err)
	}

	var title, content string
	if err := poolTest.QueryRow(ctx,
		`SELECT title, content FROM "Article" WHERE id = 'art_test_001'`,
	).Scan(&title, &content); err != nil {
		t.Fatalf("select: %v", err)
	}
	if title != "Titre modifié" || !strings.Contains(content, "Nouveau contenu") {
		t.Fatalf("article = %q / %q", title, content)
	}
}

func TestService_Update_NotFound(t *testing.T) {
	fx := seed(t)
	svc := newService()
	ctx := context.Background()

	err := svc.Update(ctx, "art_inexistant", fx.AuthorID, UpdateArticleInput{
		Title: "X", Content: "x", ContentFormat: "markdown", ActivePublicationID: fx.PublicationID,
	})
	if err == nil {
		t.Fatal("Update(inexistant) = nil, attendu erreur")
	}
}

func TestService_SetStatus_PublishDraft(t *testing.T) {
	fx := seed(t)
	svc := newService()
	ctx := context.Background()

	// Publie le brouillon.
	if err := svc.SetStatus(ctx, "art_test_003", fx.AuthorID, "PUBLISHED", true); err != nil {
		t.Fatalf("SetStatus: %v", err)
	}

	var published bool
	if err := poolTest.QueryRow(ctx,
		`SELECT published FROM "Article" WHERE id = 'art_test_003'`,
	).Scan(&published); err != nil {
		t.Fatalf("select: %v", err)
	}
	if !published {
		t.Fatal("article toujours brouillon après SetStatus")
	}
}

func TestService_Delete_Owner(t *testing.T) {
	fx := seed(t)
	svc := newService()
	ctx := context.Background()

	if err := svc.Delete(ctx, "art_test_001", fx.AuthorID, fx.PublicationID); err != nil {
		t.Fatalf("Delete: %v", err)
	}

	var n int
	if err := poolTest.QueryRow(ctx,
		`SELECT COUNT(*) FROM "Article" WHERE id = 'art_test_001'`,
	).Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 0 {
		t.Fatalf("article encore présent (%d)", n)
	}
}

// ─── Contrat créateurs via le service ─────────────────────────────────

func TestService_ListCreatorArticles_Service(t *testing.T) {
	fx := seed(t)
	svc := newService()
	ctx := context.Background()

	resp, err := svc.ListCreatorArticles(ctx, fx.AuthorID, fx.PublicationID, 1, 10, "", true)
	if err != nil {
		t.Fatalf("ListCreatorArticles: %v", err)
	}
	if len(resp.Data) != 3 {
		t.Fatalf("len = %d, attendu 3 publiés", len(resp.Data))
	}
	if resp.Pagination.Total != 3 || resp.Pagination.Page != 1 {
		t.Fatalf("pagination = %+v", resp.Pagination)
	}
	// Le contenu payant est tronqué (zéro-fuite) pour l'article premium.
	for _, item := range resp.Data {
		if item.Slug == "article-payant" {
			if !item.IsTruncated {
				t.Fatal("article payant non tronqué dans le contrat créateurs")
			}
			if strings.Contains(item.ContentHTML, "Contenu PAYANT") {
				t.Fatal("fuite de contenu payant dans le contrat créateurs")
			}
		}
	}
}

func TestService_GetCreatorBySlug_DraftNotFound(t *testing.T) {
	fx := seed(t)
	svc := newService()
	ctx := context.Background()

	// Le brouillon n'est jamais exposé par le contrat créateurs.
	_, err := svc.GetCreatorBySlug(ctx, "brouillon", fx.PublicationID)
	if err == nil {
		t.Fatal("GetCreatorBySlug(brouillon) = nil, attendu errNotFound")
	}
}

func TestService_GetCreatorBySlug_Published(t *testing.T) {
	fx := seed(t)
	svc := newService()
	ctx := context.Background()

	item, err := svc.GetCreatorBySlug(ctx, "recette-pates", fx.PublicationID)
	if err != nil {
		t.Fatalf("GetCreatorBySlug: %v", err)
	}
	if item.Slug != "recette-pates" {
		t.Fatalf("slug = %q", item.Slug)
	}
	if item.Category == nil || item.Category.Slug != "food" {
		t.Fatalf("catégorie = %+v", item.Category)
	}
}

// ─── RBAC média (workflow de revue) ───────────────────────────────────

func seedMedia(t *testing.T) *testutil.MediaFixtures {
	t.Helper()
	fx, err := testutil.SeedMedia(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed media: %v", err)
	}
	return fx
}

func TestService_Create_AsViewer_Forbidden(t *testing.T) {
	fx := seedMedia(t)
	svc := newService()
	ctx := context.Background()

	// viewer n'a pas media:create_articles → refus.
	_, err := svc.Create(ctx, fx.ViewerID, CreateArticleInput{
		PublicationID: fx.PublicationID,
		Title:         "Tentative", Slug: "tentative",
		Content: "x", ContentFormat: "markdown",
	})
	if err == nil || !strings.Contains(err.Error(), "créer des articles") {
		t.Fatalf("Create(viewer) = %v, attendu permission refusée", err)
	}
}

func TestService_Create_AsWriter_Submit(t *testing.T) {
	fx := seedMedia(t)
	svc := newService()
	ctx := context.Background()

	// writer a media:create_articles mais PAS media:publish:any : une
	// demande de publication directe est refusée.
	_, err := svc.Create(ctx, fx.WriterID, CreateArticleInput{
		PublicationID: fx.PublicationID,
		Title:         "Soumission", Slug: "soumission",
		Content: "Contenu soumis", ContentFormat: "markdown",
		Status: "PUBLISHED", Published: true,
	})
	if err == nil || !strings.Contains(err.Error(), "Soumettre pour revue") {
		t.Fatalf("Create(writer PUBLISHED) = %v, attendu refus de publication", err)
	}

	// En revanche, une soumission explicite (SUBMITTED) est acceptée.
	id, err := svc.Create(ctx, fx.WriterID, CreateArticleInput{
		PublicationID: fx.PublicationID,
		Title:         "Soumission", Slug: "soumission",
		Content: "Contenu soumis", ContentFormat: "markdown",
		Status: "SUBMITTED",
	})
	if err != nil {
		t.Fatalf("Create(writer SUBMITTED): %v", err)
	}

	var status string
	var published bool
	if err := poolTest.QueryRow(ctx,
		`SELECT status, published FROM "Article" WHERE id = $1`, id,
	).Scan(&status, &published); err != nil {
		t.Fatalf("select: %v", err)
	}
	if status != "SUBMITTED" || published {
		t.Fatalf("article = %q published=%v, attendu SUBMITTED non publié", status, published)
	}
}

func TestService_Review_EditorApproves(t *testing.T) {
	fx := seedMedia(t)
	svc := newService()
	ctx := context.Background()

	// writer soumet un article.
	id, err := svc.Create(ctx, fx.WriterID, CreateArticleInput{
		PublicationID: fx.PublicationID,
		Title:         "À revoir", Slug: "a-revoir",
		Content: "Contenu", ContentFormat: "markdown", Status: "SUBMITTED",
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	// L'editor (media:review) approuve → PUBLISHED.
	if err := svc.Review(ctx, id, fx.EditorID, true); err != nil {
		t.Fatalf("Review(approve): %v", err)
	}

	var status string
	var published bool
	if err := poolTest.QueryRow(ctx,
		`SELECT status, published FROM "Article" WHERE id = $1`, id,
	).Scan(&status, &published); err != nil {
		t.Fatalf("select: %v", err)
	}
	if status != "PUBLISHED" || !published {
		t.Fatalf("article = %q published=%v, attendu PUBLISHED", status, published)
	}
}

func TestService_Review_RejectBackToDraft(t *testing.T) {
	fx := seedMedia(t)
	svc := newService()
	ctx := context.Background()

	id, err := svc.Create(ctx, fx.WriterID, CreateArticleInput{
		PublicationID: fx.PublicationID,
		Title:         "Rejeté", Slug: "rejete",
		Content: "Contenu", ContentFormat: "markdown", Status: "SUBMITTED",
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	if err := svc.Review(ctx, id, fx.EditorID, false); err != nil {
		t.Fatalf("Review(reject): %v", err)
	}

	var status string
	if err := poolTest.QueryRow(ctx,
		`SELECT status FROM "Article" WHERE id = $1`, id,
	).Scan(&status); err != nil {
		t.Fatalf("select: %v", err)
	}
	if status != "DRAFT" {
		t.Fatalf("status = %q, attendu DRAFT après rejet", status)
	}
}

func TestService_Review_NonSubmittedError(t *testing.T) {
	fx := seedMedia(t)
	svc := newService()
	ctx := context.Background()

	id, err := svc.Create(ctx, fx.WriterID, CreateArticleInput{
		PublicationID: fx.PublicationID,
		Title:         "Direct", Slug: "direct",
		Content: "Contenu", ContentFormat: "markdown", Status: "DRAFT",
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	// On ne peut revoir qu'un article SUBMITTED.
	if err := svc.Review(ctx, id, fx.EditorID, true); err == nil {
		t.Fatal("Review(DRAFT) = nil, attendu erreur")
	}
}

// ─── Articles similaires (pgvector) ───────────────────────────────────

func TestService_SimilarArticles_NoEmbedding_Empty(t *testing.T) {
	_ = seed(t)
	svc := newService()
	ctx := context.Background()

	// Aucun article du seed n'a d'embedding → liste vide, pas d'erreur.
	items, err := svc.SimilarArticles(ctx, "art_test_001", 6)
	if err != nil {
		t.Fatalf("SimilarArticles: %v", err)
	}
	if len(items) != 0 {
		t.Fatalf("len = %d, attendu 0 (pas d'embedding)", len(items))
	}
}

func TestService_SimilarArticles_RanksBySimilarity(t *testing.T) {
	_ = seed(t)
	svc := newService()
	ctx := context.Background()

	// Écrit des embeddings : art_test_000 et art_test_001 proches, art_test_002 loin.
	// Vecteur unitaire proche (cos ~0.98) puis orthogonal (cos 0).
	// Dimension 512 (MRL jina-embeddings-v3) — alignée sur la colonne vector(512).
	proche := make([]float32, 512)
	proche[0] = 1
	lointain := make([]float32, 512)
	lointain[1] = 1

	q := db.New(poolTest)
	if err := q.UpsertArticleEmbedding(ctx, db.UpsertArticleEmbeddingParams{
		ID: "art_test_000", Embedding: pgvector.NewVector(proche),
	}); err != nil {
		t.Fatalf("upsert 000: %v", err)
	}
	if err := q.UpsertArticleEmbedding(ctx, db.UpsertArticleEmbeddingParams{
		ID: "art_test_001", Embedding: pgvector.NewVector(proche),
	}); err != nil {
		t.Fatalf("upsert 001: %v", err)
	}
	if err := q.UpsertArticleEmbedding(ctx, db.UpsertArticleEmbeddingParams{
		ID: "art_test_002", Embedding: pgvector.NewVector(lointain),
	}); err != nil {
		t.Fatalf("upsert 002: %v", err)
	}

	// Depuis art_test_000 : 001 (proche) avant 002 (orthogonal).
	items, err := svc.SimilarArticles(ctx, "art_test_000", 6)
	if err != nil {
		t.Fatalf("SimilarArticles: %v", err)
	}
	if len(items) != 2 {
		t.Fatalf("len = %d, attendu 2 (001 et 002)", len(items))
	}
	if items[0].ID != "art_test_001" {
		t.Fatalf("items[0] = %s, attendu art_test_001 (plus proche)", items[0].ID)
	}
	if items[0].Score < items[1].Score {
		t.Fatalf("score décroissant attendu: %f < %f", items[0].Score, items[1].Score)
	}
	if items[0].Title == "" || items[0].AuthorName == nil {
		t.Fatalf("article mal assemblé: %+v", items[0])
	}
}

func TestService_EditorCapabilities_Personal(t *testing.T) {
	fx := seed(t)
	svc := newService()
	ctx := context.Background()

	caps, err := svc.EditorCapabilities(ctx, fx.AuthorID, fx.PublicationID)
	if err != nil {
		t.Fatalf("EditorCapabilities: %v", err)
	}
	if caps["isMedia"] != false || caps["canPublish"] != true || caps["canReview"] != false {
		t.Fatalf("caps = %+v", caps)
	}
}

func TestService_EditorCapabilities_Media(t *testing.T) {
	fx := seedMedia(t)
	svc := newService()
	ctx := context.Background()

	// editor : publie + revoie (rôle editor = media:publish:any + media:review).
	caps, err := svc.EditorCapabilities(ctx, fx.EditorID, fx.PublicationID)
	if err != nil {
		t.Fatalf("EditorCapabilities(editor): %v", err)
	}
	if caps["isMedia"] != true || caps["canPublish"] != true || caps["canReview"] != true || caps["canSubmit"] != false {
		t.Fatalf("caps editor = %+v", caps)
	}

	// writer : soumet mais ne publie pas.
	capsWriter, err := svc.EditorCapabilities(ctx, fx.WriterID, fx.PublicationID)
	if err != nil {
		t.Fatalf("EditorCapabilities(writer): %v", err)
	}
	if capsWriter["canPublish"] != false || capsWriter["canSubmit"] != true || capsWriter["canReview"] != false {
		t.Fatalf("caps writer = %+v", capsWriter)
	}

	// viewer : rien.
	capsViewer, err := svc.EditorCapabilities(ctx, fx.ViewerID, fx.PublicationID)
	if err != nil {
		t.Fatalf("EditorCapabilities(viewer): %v", err)
	}
	if capsViewer["canPublish"] != false || capsViewer["canReview"] != false || capsViewer["canSubmit"] != false {
		t.Fatalf("caps viewer = %+v", capsViewer)
	}
}
