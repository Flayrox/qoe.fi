package articles

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/queue"
)

// ─── Helpers purs ─────────────────────────────────────────────────────

func fixtureIDRow() db.GetArticleByIDRow {
	now := time.Now()
	return db.GetArticleByIDRow{
		ID: "art_x", Title: "Titre", Slug: "slug-x", Content: "contenu",
		Published: true, IsPremium: true, Visibility: "PUBLIC", ReadingTime: 4,
		AllowPublicAnnotations: true, AllowComments: true, Status: "PUBLISHED",
		PublicationId: "pub_1", AuthorId: pgtype.UUID{}, AuthorID: "user_1",
		CategoryId:      pgtype.Text{String: "cat_1", Valid: true},
		TierId:          pgtype.Text{String: "tier_1", Valid: true},
		SeoTitle:        pgtype.Text{String: "seo", Valid: true},
		CreatedAt:       pgtype.Timestamp{Time: now, Valid: true},
		UpdatedAt:       pgtype.Timestamp{Time: now, Valid: true},
		AuthorName:      pgtype.Text{String: "Alice", Valid: true},
		AuthorLogo:      pgtype.Text{String: "logo.png", Valid: true},
		PublicationName: "Média", PublicationSlug: "media",
		PublicationSubdomain: pgtype.Text{String: "media.qoe", Valid: true},
	}
}

func TestArticleFromRow(t *testing.T) {
	row := fixtureIDRow()
	cut := PaywallCutResult{
		Content: "tronqué", IsTruncated: true, AccessGranted: false,
		PaywallMeta: &PaywallMeta{Visibility: "PREMIUM", TeaserParagraphsCount: 2},
	}
	art := articleFromRow(row, cut)

	if art.ID != "art_x" || art.Content != "tronqué" || !art.IsTruncated || art.AccessGranted {
		t.Fatalf("article mal assemblé: %+v", art)
	}
	if art.Author.ID != "user_1" || art.Author.Name == nil || *art.Author.Name != "Alice" {
		t.Fatalf("author = %+v", art.Author)
	}
	if art.Publication == nil || art.Publication.Slug != "media" || art.Publication.Subdomain == nil {
		t.Fatalf("publication = %+v", art.Publication)
	}
	if art.CategoryID == nil || *art.CategoryID != "cat_1" || art.TierID == nil || *art.TierID != "tier_1" {
		t.Fatalf("ids = %v / %v", art.CategoryID, art.TierID)
	}
	if art.PaywallMeta == nil || art.PaywallMeta.TeaserParagraphsCount != 2 {
		t.Fatalf("paywallMeta = %+v", art.PaywallMeta)
	}
	if art.CreatedAt == "" || art.UpdatedAt == "" {
		t.Fatal("dates vides")
	}
}

func TestUUIDString_Invalid(t *testing.T) {
	if uuidString(pgtype.UUID{}) != "" {
		t.Fatal("uuid invalide doit donner une chaîne vide")
	}
}

func TestTextVal_Empty(t *testing.T) {
	e := ""
	if v := textVal(&e); v.Valid {
		t.Fatal("pointeur vide → pgtype.Text invalide")
	}
	if v := textVal(nil); v.Valid {
		t.Fatal("nil → pgtype.Text invalide")
	}
}

func TestEmitArticleLifecycle_WithClient(t *testing.T) {
	s := miniredis.RunT(t)
	c := asynq.NewClient(asynq.RedisClientOpt{Addr: s.Addr()})
	t.Cleanup(func() { _ = c.Close() })

	svc := NewService(poolTest, nil, c)
	row := fixtureIDRow()

	// title/slug vides → défauts depuis la row.
	svc.emitArticleLifecycle(queueTask("updated"), row, "", "")
	// title/slug fournis explicitement.
	svc.emitArticleLifecycle(queueTask("deleted"), row, "Override", "override-slug")

	if got := len(s.DB(0).Keys()); got == 0 {
		t.Fatal("aucune tâche enqueue")
	}
}

func queueTask(kind string) string {
	if kind == "updated" {
		return queue.TaskArticleUpdated
	}
	return queue.TaskArticleDeleted
}

// ─── Enrichissement GetByID (attributions, co-auteurs) ───────────────

func TestGetByID_Enrichment(t *testing.T) {
	ctx := context.Background()
	fx := seed(t)
	svc := newService()

	// Second auteur pour l'attribution + co-auteur.
	co := "00000000-0000-0000-0000-000000000042"
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt")
		 VALUES ($1, 'co@t.dev', 'coauth', 'Co', 'user', now(), now())
		 ON CONFLICT (id) DO NOTHING`, co); err != nil {
		t.Fatalf("user co: %v", err)
	}

	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "ArticleAttribution" (id, "articleId", "userId", role, "order", "isVisible", "consentStatus", "updatedAt")
		 VALUES ('attr_1', 'art_test_001', $1::uuid, 'CO_AUTHOR', 1, true, 'ACCEPTED', now())`, co); err != nil {
		t.Fatalf("attribution: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "_CoAuthors" ("A", "B") VALUES ('art_test_001', $1::uuid)`, co); err != nil {
		t.Fatalf("coauthor: %v", err)
	}

	art, err := svc.GetByID(ctx, "art_test_001", fx.AuthorID)
	if err != nil {
		t.Fatalf("GetByID: %v", err)
	}
	if len(art.Attributions) != 1 || art.Attributions[0].User.ID != co {
		t.Fatalf("attributions = %+v", art.Attributions)
	}
	if len(art.CoAuthors) != 1 || art.CoAuthors[0].ID != co {
		t.Fatalf("coAuthors = %+v", art.CoAuthors)
	}
}

// ─── Compteurs de lecture / commentaires ─────────────────────────────

func TestList_CommentsAndViewsBatch(t *testing.T) {
	ctx := context.Background()
	fx := seed(t)
	svc := newService()
	reader := seedReader(t, ctx)

	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "ArticleComment" (id, content, "createdAt", "updatedAt", "articleId", "authorId")
		 VALUES ('cmt_cov_1', 'super', now(), now(), 'art_test_000', $1::uuid)
		      , ('cmt_cov_2', 'top',   now(), now(), 'art_test_000', $1::uuid)`, reader); err != nil {
		t.Fatalf("comments: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "ReadingSession" (id, "articleId", "userId", source, status, "createdAt")
		 VALUES (gen_random_uuid()::text, 'art_test_000', $1::uuid, 'feed', 'completed', now())`, reader); err != nil {
		t.Fatalf("session: %v", err)
	}

	items, err := svc.List(ctx, fx.AuthorID, fx.PublicationID, 100, 0, "all")
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	for _, it := range items {
		if it.ID == "art_test_000" {
			if it.CommentsCount != 2 {
				t.Fatalf("commentsCount = %d, attendu 2", it.CommentsCount)
			}
			if it.Views != 1 || it.ViewsUnique != 1 {
				t.Fatalf("views = %d/%d, attendu 1/1", it.Views, it.ViewsUnique)
			}
		}
	}
}

// ─── Entitlements abonné (paywall) ───────────────────────────────────

func TestGetBySlug_SubscriberEntitled(t *testing.T) {
	ctx := context.Background()
	fx := seed(t)
	svc := newService()

	reader := "00000000-0000-0000-0000-000000000043"
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt")
		 VALUES ($1, 'abonne@t.dev', 'abonne', 'Abonné', 'user', now(), now())
		 ON CONFLICT (id) DO NOTHING`, reader); err != nil {
		t.Fatalf("user abonné: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Subscriber" (id, email, "isActive", "isPremium", "updatedAt", "publicationId", "userId")
		 VALUES ('sub_cov_1', 'abonne@t.dev', true, true, now(), $1, $2::uuid)
		 ON CONFLICT (id) DO NOTHING`, fx.PublicationID, reader); err != nil {
		t.Fatalf("subscriber: %v", err)
	}

	// Lecteur abonné premium → accès complet au contenu payant.
	art, err := svc.GetBySlug(ctx, "article-payant", fx.PublicationID, reader, "")
	if err != nil {
		t.Fatalf("GetBySlug: %v", err)
	}
	if !art.AccessGranted || art.IsTruncated {
		t.Fatalf("abonné premium tronqué: accessGranted=%v isTruncated=%v", art.AccessGranted, art.IsTruncated)
	}
	if !strings.Contains(art.Content, "PAYANT SENSIBLE") {
		t.Fatalf("contenu complet attendu, got %q", art.Content)
	}
}

func TestGetBySlug_NonSubscriberTruncated(t *testing.T) {
	ctx := context.Background()
	fx := seed(t)
	svc := newService()

	// Lecteur lambda avec viewerEmail → pas d'entitlement → tronqué.
	art, err := svc.GetBySlug(ctx, "article-payant", fx.PublicationID, "", "lambda@t.dev")
	if err != nil {
		t.Fatalf("GetBySlug: %v", err)
	}
	if art.AccessGranted || !art.IsTruncated {
		t.Fatalf("non-abonné: accessGranted=%v isTruncated=%v", art.AccessGranted, art.IsTruncated)
	}
}

// ─── RBAC média : branches Update / Delete / Review manquantes ───────

func TestService_Update_MediaWorkflow(t *testing.T) {
	ctx := context.Background()
	fx := seedMedia(t)
	svc := newService()

	// Le writer crée puis l'editor publie (revue) → article publié par le writer.
	subID, err := svc.Create(ctx, fx.WriterID, CreateArticleInput{
		PublicationID: fx.PublicationID, Title: "À publier", Slug: "media-publie",
		Content: "x", ContentFormat: "markdown", Status: "SUBMITTED",
	})
	if err != nil {
		t.Fatalf("Create(writer): %v", err)
	}
	if err := svc.Review(ctx, subID, fx.EditorID, true); err != nil {
		t.Fatalf("Review(approve): %v", err)
	}
	pubID := subID

	// Gate 1 : non-auteur + publication active différente → forbidden (viewer).
	if err := svc.Update(ctx, pubID, fx.ViewerID, UpdateArticleInput{
		Title: "X", Content: "x", ContentFormat: "markdown", ActivePublicationID: "autre-pub",
	}); err == nil {
		t.Fatal("Update(autre publication) = nil, attendu errForbidden")
	}

	// Le writer (auteur) édite son article déjà publié → l'état reste PUBLISHED.
	if err := svc.Update(ctx, pubID, fx.WriterID, UpdateArticleInput{
		Title: "Retouché", Content: "retouche", ContentFormat: "markdown",
		Slug: "media-publie", Status: "DRAFT", Published: false,
		ActivePublicationID: fx.PublicationID,
	}); err != nil {
		t.Fatalf("Update(writer sur publié): %v", err)
	}
	var status string
	var published bool
	if err := poolTest.QueryRow(ctx, `SELECT status, published FROM "Article" WHERE id=$1`, pubID).Scan(&status, &published); err != nil {
		t.Fatalf("select: %v", err)
	}
	if status != "PUBLISHED" || !published {
		t.Fatalf("article = %q/%v, attendu PUBLISHED conservé", status, published)
	}

	// Soumission d'un article déjà publié → refus.
	if err := svc.Update(ctx, pubID, fx.WriterID, UpdateArticleInput{
		Title: "T", Content: "c", ContentFormat: "markdown", Status: "SUBMITTED",
		ActivePublicationID: fx.PublicationID,
	}); err == nil || !strings.Contains(err.Error(), "déjà publié") {
		t.Fatalf("Update(SUBMITTED sur publié) = %v, attendu refus", err)
	}

	// Le writer (sans publish:any) ne peut pas publier un brouillon.
	draftID, err := svc.Create(ctx, fx.WriterID, CreateArticleInput{
		PublicationID: fx.PublicationID, Title: "Draft", Slug: "draft-w",
		Content: "x", ContentFormat: "markdown",
	})
	if err != nil {
		t.Fatalf("Create(writer draft): %v", err)
	}
	if err := svc.Update(ctx, draftID, fx.WriterID, UpdateArticleInput{
		Title: "Draft", Content: "x", ContentFormat: "markdown", Status: "PUBLISHED", Published: true,
		ActivePublicationID: fx.PublicationID,
	}); err == nil || !strings.Contains(err.Error(), "Soumettre pour revue") {
		t.Fatalf("Update(writer PUBLISHED) = %v, attendu refus de publication", err)
	}

	// SetStatus publish sans permission → forbidden.
	if err := svc.SetStatus(ctx, draftID, fx.WriterID, "PUBLISHED", true); err == nil {
		t.Fatal("SetStatus(writer publish) = nil, attendu errForbidden")
	}
}

func TestService_Delete_MediaBranches(t *testing.T) {
	ctx := context.Background()
	fx := seedMedia(t)
	svc := newService()

	// L'editor crée un article publié ; le writer n'est ni auteur ni delete:any.
	pubID, err := svc.Create(ctx, fx.EditorID, CreateArticleInput{
		PublicationID: fx.PublicationID, Title: "À garder", Slug: "a-garder",
		Content: "x", ContentFormat: "markdown", Status: "PUBLISHED", Published: true,
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if err := svc.Delete(ctx, pubID, fx.WriterID, fx.PublicationID); err == nil {
		t.Fatal("Delete(writer non-auteur) = nil, attendu errForbidden")
	}
	// Le writer supprime son propre brouillon → OK (edit:own).
	draftID, err := svc.Create(ctx, fx.WriterID, CreateArticleInput{
		PublicationID: fx.PublicationID, Title: "Mon draft", Slug: "mon-draft",
		Content: "x", ContentFormat: "markdown",
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if err := svc.Delete(ctx, draftID, fx.WriterID, fx.PublicationID); err != nil {
		t.Fatalf("Delete(own draft): %v", err)
	}
}

func TestService_Review_DeniedForViewer(t *testing.T) {
	ctx := context.Background()
	fx := seedMedia(t)
	svc := newService()

	id, err := svc.Create(ctx, fx.WriterID, CreateArticleInput{
		PublicationID: fx.PublicationID, Title: "À revoir 2", Slug: "a-revoir-2",
		Content: "x", ContentFormat: "markdown", Status: "SUBMITTED",
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	// Le viewer n'a pas media:review.
	if err := svc.Review(ctx, id, fx.ViewerID, true); err == nil || !strings.Contains(err.Error(), "revoir") {
		t.Fatalf("Review(viewer) = %v, attendu permission refusée", err)
	}
	// Le writer non plus (pas media:review).
	if err := svc.Review(ctx, id, fx.WriterID, true); err == nil {
		t.Fatal("Review(writer) = nil, attendu refus")
	}
}

// ─── GetByID handler : 403 non-membre ────────────────────────────────

func TestHandler_GetByID_ForbiddenForOutsider(t *testing.T) {
	seed(t)
	r := newTestRouter()
	token := testJWT("00000000-0000-0000-0000-000000000099")

	w, _ := doJSON(t, r, "GET", "/v1/articles/by-id/art_test_001", token, nil)
	if w.Code != 403 {
		t.Fatalf("status = %d, attendu 403 (étranger à la publication)", w.Code)
	}
}
