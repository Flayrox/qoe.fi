package creator

// Tests de non-régression de l'audit L29g : troncature UTF-8, écritures
// silencieusement perdues, faux succès, IDOR sur les annotations, bornes de
// dates invalides, erreurs de base masquées en 403/200.

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/umami"
)

func creatorRequest(h http.Handler, method, path, userID, publisherID, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	ctx := req.Context()
	if userID != "" {
		ctx = context.WithValue(ctx, middleware.UserIDKey, userID)
	}
	if publisherID != "" {
		ctx = context.WithValue(ctx, middleware.PublisherIDKey, publisherID)
	}
	req = req.WithContext(ctx)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	return w
}

// ─── Extraits : jamais d'UTF-8 cassé ─────────────────────────────────

func TestCreator_StripHTMLTagsKeepsUTF8(t *testing.T) {
	text := stripHTMLTags("<p>éééééééééé</p>", 7)
	if !utf8.ValidString(text) {
		t.Fatalf("extrait UTF-8 invalide : %q", text)
	}
}

// ─── PATCH article : aucun acte silencieusement perdu ────────────────

func seedAliceArticle(t *testing.T, content string) (articleID, aliceUserID, alicePubID string) {
	t.Helper()
	alicePubID, aliceUserID, _, _ = seedFollows(t)
	articleID = "art_creator_l29g"
	if _, err := poolTest.Exec(context.Background(), `DELETE FROM "Article" WHERE id = $1`, articleID); err != nil {
		t.Fatalf("clean article: %v", err)
	}
	if _, err := poolTest.Exec(context.Background(), `
		INSERT INTO "Article" (id, title, slug, "shortCode", content, published, visibility, status,
		  "publisherId", "authorId", "createdAt", "updatedAt")
		VALUES ($1, 'Titre', 'titre-l29g', 'aaaaaa', $2, false, 'PUBLIC', 'DRAFT', $3, $4, now(), now())`,
		articleID, content, alicePubID, aliceUserID); err != nil {
		t.Fatalf("insert article: %v", err)
	}
	return articleID, aliceUserID, alicePubID
}

func TestCreator_PublishEmptyArticleIsRejected(t *testing.T) {
	requirePool(t)
	articleID, aliceUserID, _ := seedAliceArticle(t, "")

	r := chi.NewRouter()
	r.Patch("/v1/creator/articles/{id}", newTestHandler().apiArticleUpdate)
	w := creatorRequest(r, http.MethodPatch, "/v1/creator/articles/"+articleID, aliceUserID, "", `{"publish":true}`)
	if w.Code == http.StatusOK {
		t.Fatalf("publication d'un article vide = 200 (%s), attendu un refus", w.Body.String())
	}
	if w.Code != http.StatusConflict {
		t.Fatalf("publication d'un article vide = %d, attendu 409", w.Code)
	}
}

func TestCreator_SlugSetReportsWriteFailure(t *testing.T) {
	requirePool(t)
	articleID, aliceUserID, _ := seedAliceArticle(t, "<p>corps</p>")

	h, _, fp := newFaultHandler(map[string]error{})
	r := chi.NewRouter()
	r.Patch("/v1/creator/articles/{id}/slug", h.apiArticleSlugSet)

	fp.failExec = true
	w := creatorRequest(r, http.MethodPatch, "/v1/creator/articles/"+articleID+"/slug", aliceUserID, "", `{"slug":"nouveau-slug"}`)
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("échec d'écriture du slug = %d (%s), attendu 500", w.Code, w.Body.String())
	}
}

// ─── Annotations : IDOR inter-publications ───────────────────────────

func TestCreator_HighlightCommentsScopedToCreator(t *testing.T) {
	requirePool(t)
	alicePubID, aliceUserID, bobPubID, bobUserID := seedFollows(t)
	ctx := context.Background()
	articleID := "art_l29g_hl"
	if _, err := poolTest.Exec(ctx, `DELETE FROM "Article" WHERE id = $1`, articleID); err != nil {
		t.Fatalf("clean article: %v", err)
	}
	if _, err := poolTest.Exec(ctx, `
		INSERT INTO "Article" (id, title, slug, "shortCode", content, published, visibility, status,
		  "publisherId", "authorId", "createdAt", "updatedAt")
		VALUES ($1, 'Titre', 'titre-l29g-hl', 'bbbbbb', '<p>corps</p>', false, 'PUBLIC', 'DRAFT', $2, $3, now(), now())`,
		articleID, alicePubID, aliceUserID); err != nil {
		t.Fatalf("insert article: %v", err)
	}

	if _, err := poolTest.Exec(ctx, `DELETE FROM "Highlight" WHERE id = 'hl_l29g'`); err != nil {
		t.Fatalf("clean highlight: %v", err)
	}
	if _, err := poolTest.Exec(ctx, `
		INSERT INTO "Highlight" (id, "articleId", "readerId", text, "isPublic", "isOfficial", "createdAt")
		VALUES ('hl_l29g', $1, $2, 'passage', true, false, now())`, articleID, bobUserID); err != nil {
		t.Fatalf("insert highlight: %v", err)
	}

	r := chi.NewRouter()
	r.Get("/v1/creator/highlights/{id}/comments", newTestHandler().apiHighlightComments)
	// Bob n'a aucun droit sur l'article d'Alice : sa clé ne doit pas lire la
	// discussion d'une annotation qui ne lui appartient pas.
	w := creatorRequest(r, http.MethodGet, "/v1/creator/highlights/hl_l29g/comments", bobUserID, bobPubID, "")
	if w.Code == http.StatusOK {
		t.Fatalf("annotation d'une autre publication servie à un créateur étranger : %s", w.Body.String())
	}
}

// ─── Recommandations ─────────────────────────────────────────────────

func TestCreator_RemoveRecommendationMissingIsNotFound(t *testing.T) {
	requirePool(t)
	alicePubID, aliceUserID, _, _ := seedFollows(t)
	r := chi.NewRouter()
	newTestHandler().RegisterProtected(r, func(string) func(http.Handler) http.Handler {
		return func(next http.Handler) http.Handler { return next }
	})
	w := creatorRequest(r, http.MethodDelete,
		"/v1/creator/recommendations/pub-inexistante?publisherId="+alicePubID, aliceUserID, "", "")
	if w.Code == http.StatusOK {
		t.Fatalf("suppression d'une recommandation inexistante = 200 (%s), attendu 404", w.Body.String())
	}
	if w.Code != http.StatusNotFound {
		t.Fatalf("suppression inexistante = %d, attendu 404", w.Code)
	}
}

func TestCreator_RecommendationDescriptionIsValidated(t *testing.T) {
	requirePool(t)
	alicePubID, aliceUserID, bobPubID, _ := seedFollows(t)
	r := chi.NewRouter()
	newTestHandler().RegisterProtected(r, func(string) func(http.Handler) http.Handler {
		return func(next http.Handler) http.Handler { return next }
	})
	body, _ := json.Marshal(map[string]string{
		"publisherId":   alicePubID,
		"recommendedId": bobPubID,
		"description":   strings.Repeat("a", 1000),
	})
	w := creatorRequest(r, http.MethodPost, "/v1/creator/recommendations", aliceUserID, "", string(body))
	if w.Code != http.StatusBadRequest {
		t.Fatalf("description de 1000 caractères = %d (%s), attendu 400", w.Code, w.Body.String())
	}
}

// ─── Catégories : pas d'écriture chez autrui, erreurs remontées ──────

func TestCreator_CategoriesReadDoesNotWriteOtherPublisher(t *testing.T) {
	requirePool(t)
	_, aliceUserID, _, _ := seedFollows(t)
	ctx := context.Background()
	ghostPub := "pub-ghost-l29g"
	if _, err := poolTest.Exec(ctx, `DELETE FROM "Category" WHERE "publisherId" = $1`, ghostPub); err != nil {
		t.Fatalf("clean categories: %v", err)
	}
	if _, err := poolTest.Exec(ctx, `DELETE FROM "Publisher" WHERE id = $1`, ghostPub); err != nil {
		t.Fatalf("clean publisher: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Publisher" (id, type, name, slug, "createdAt", "updatedAt")
		 VALUES ($1, 'PERSONAL', 'Ghost', 'ghost-l29g', now(), now())`, ghostPub); err != nil {
		t.Fatalf("insert publisher: %v", err)
	}

	r := chi.NewRouter()
	newTestHandler().RegisterProtected(r, func(string) func(http.Handler) http.Handler {
		return func(next http.Handler) http.Handler { return next }
	})
	w := creatorRequest(r, http.MethodGet, "/v1/categories?publisherId="+ghostPub, aliceUserID, "", "")
	if w.Code != http.StatusOK {
		t.Fatalf("lecture des catégories = %d (%s)", w.Code, w.Body.String())
	}
	var count int
	if err := poolTest.QueryRow(ctx, `SELECT count(*) FROM "Category" WHERE "publisherId" = $1`, ghostPub).Scan(&count); err != nil {
		t.Fatalf("count: %v", err)
	}
	if count != 0 {
		t.Fatalf("une lecture GET a créé %d catégorie(s) chez une autre publication", count)
	}
}

func TestCreator_CategorySlugCheckErrorIsReported(t *testing.T) {
	requirePool(t)
	alicePubID, aliceUserID, _, _ := seedFollows(t)
	h, _, _ := newFaultHandler(map[string]error{"CheckCategorySlugExists": errBoom})
	r := chi.NewRouter()
	r.Post("/v1/categories", h.createCategory)

	w := creatorRequest(r, http.MethodPost, "/v1/categories", aliceUserID, "",
		`{"publisherId":"`+alicePubID+`","name":"Nouvelle catégorie"}`)
	if w.Code == http.StatusCreated {
		t.Fatalf("erreur de vérification de slug ignorée : catégorie créée (%s)", w.Body.String())
	}
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("erreur de vérification de slug = %d, attendu 500", w.Code)
	}
}

// ─── Bornes de dates & métadonnées ───────────────────────────────────

func TestCreator_ArticleListRejectsInvalidDateBounds(t *testing.T) {
	requirePool(t)
	alicePubID, aliceUserID, _, _ := seedFollows(t)
	h := newTestHandler()
	r := chi.NewRouter()
	r.Get("/v1/creator/articles", h.apiArticles)

	w := creatorRequest(r, http.MethodGet, "/v1/creator/articles?since=pas-une-date", aliceUserID, alicePubID, "")
	if w.Code != http.StatusBadRequest {
		t.Fatalf("borne de date illisible = %d (%s), attendu 400", w.Code, w.Body.String())
	}
}

func TestCreator_PublisherMetadataReportsQueryFailure(t *testing.T) {
	requirePool(t)
	alicePubID, aliceUserID, _, _ := seedFollows(t)
	h, _, fp := newFaultHandler(map[string]error{})
	fp.failQueryRow = true
	r := chi.NewRouter()
	r.Get("/v1/creator/publisher", h.apiPublisherMetadata)

	w := creatorRequest(r, http.MethodGet, "/v1/creator/publisher", aliceUserID, alicePubID, "")
	if w.Code == http.StatusOK {
		t.Fatalf("échec de lecture des métadonnées = 200 (%s), attendu une erreur", w.Body.String())
	}
}

// ─── Analytics : bornes validées, panne ≠ zéros ──────────────────────

func TestCreator_AnalyticsRejectsInvalidBounds(t *testing.T) {
	requirePool(t)
	_, aliceUserID, alicePubID, _ := seedFollows(t)
	h := newTestHandler()
	r := chi.NewRouter()
	r.Get("/v1/analytics/stats", h.analyticsStats)

	w := creatorRequest(r, http.MethodGet, "/v1/analytics/stats?startAt=pas-un-ts", aliceUserID, alicePubID, "")
	if w.Code != http.StatusBadRequest {
		t.Fatalf("startAt illisible = %d (%s), attendu 400", w.Code, w.Body.String())
	}
	w = creatorRequest(r, http.MethodGet, "/v1/analytics/stats?startAt=200&endAt=100", aliceUserID, alicePubID, "")
	if w.Code != http.StatusBadRequest {
		t.Fatalf("startAt > endAt = %d (%s), attendu 400", w.Code, w.Body.String())
	}
}

func TestCreator_AnalyticsReportsUmamiFailure(t *testing.T) {
	requirePool(t)
	alicePubID, aliceUserID, _, _ := seedFollows(t)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "umami down", http.StatusInternalServerError)
	}))
	defer srv.Close()

	h := NewHandler(poolTest, umami.NewClient(srv.URL, "cle", "", ""), "site-test")
	r := chi.NewRouter()
	r.Get("/v1/analytics/stats", h.analyticsStats)

	w := creatorRequest(r, http.MethodGet, "/v1/analytics/stats", aliceUserID, alicePubID, "")
	if w.Code == http.StatusOK {
		t.Fatalf("panne Umami servie en 200 avec des zéros : %s", w.Body.String())
	}
}

// ─── Abonnés : suppression réellement effective ──────────────────────

func TestCreator_RemoveFollowerMissingIsNotFound(t *testing.T) {
	requirePool(t)
	alicePubID, aliceUserID, _, _ := seedFollows(t)
	r := chi.NewRouter()
	newTestHandler().RegisterProtected(r, func(string) func(http.Handler) http.Handler {
		return func(next http.Handler) http.Handler { return next }
	})
	stranger := "00000000-0000-0000-0000-000000000102"
	w := creatorRequest(r, http.MethodDelete, "/v1/me/followers/"+stranger, aliceUserID, alicePubID, "")
	if w.Code == http.StatusOK {
		t.Fatalf("retrait d'un non-abonné = 200 (%s), attendu 404", w.Body.String())
	}
	if w.Code != http.StatusNotFound {
		t.Fatalf("retrait d'un non-abonné = %d, attendu 404", w.Code)
	}
}

// ─── Gestion de publication : erreur ≠ refus ─────────────────────────

func TestCreator_FollowDecisionReportsDatabaseError(t *testing.T) {
	requirePool(t)
	alicePubID, aliceUserID, _, bobUserID := seedFollows(t)
	ctx := context.Background()
	requestID := "fr_l29g"
	if _, err := poolTest.Exec(ctx, `DELETE FROM "FollowRequest" WHERE id = $1`, requestID); err != nil {
		t.Fatalf("clean follow request: %v", err)
	}
	if _, err := poolTest.Exec(ctx, `
		INSERT INTO "FollowRequest" (id, "requesterId", "publisherId", status, "createdAt")
		VALUES ($1, $2, $3, 'PENDING', now())`, requestID, bobUserID, alicePubID); err != nil {
		t.Fatalf("insert follow request: %v", err)
	}

	h, _, _ := newFaultHandler(map[string]error{"GetPublisherOwner": errBoom})
	r := chi.NewRouter()
	r.Post("/v1/me/follow-requests/{id}/reject", h.rejectFollowRequest)

	w := creatorRequest(r, http.MethodPost, "/v1/me/follow-requests/"+requestID+"/reject", aliceUserID, "", "")
	if w.Code == http.StatusForbidden {
		t.Fatalf("erreur de base convertie en simple refus (403) : elle doit être une erreur serveur")
	}
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("échec de lecture du propriétaire = %d, attendu 500", w.Code)
	}
}
