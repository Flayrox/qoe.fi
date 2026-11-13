package articles

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/qoefi/api/internal/slug"
)

func TestHandlerGetByShortCode_Validation(t *testing.T) {
	h := NewHandler(NewService(poolTest, nil, nil))
	r := chi.NewRouter()
	h.RegisterPublic(r)

	// Code vide → 400
	req := httptest.NewRequest(http.MethodGet, "/v1/articles/short/%20", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("GET /short/%%20 = %d, attendu 400", w.Code)
	}

	// Code invalide (non numérique) → 404 sans toucher la DB
	req2 := httptest.NewRequest(http.MethodGet, "/v1/articles/short/abc123", nil)
	w2 := httptest.NewRecorder()
	r.ServeHTTP(w2, req2)
	if w2.Code != http.StatusNotFound {
		t.Fatalf("GET /short/abc123 = %d, attendu 404", w2.Code)
	}

	// Code commençant par 0 → 404 sans toucher la DB
	req3 := httptest.NewRequest(http.MethodGet, "/v1/articles/short/012345", nil)
	w3 := httptest.NewRecorder()
	r.ServeHTTP(w3, req3)
	if w3.Code != http.StatusNotFound {
		t.Fatalf("GET /short/012345 = %d, attendu 404", w3.Code)
	}
}

func TestShortCode_CreateUpdateHistoryAndResolve(t *testing.T) {
	requirePool(t)
	fx := seed(t)
	svc := newService()
	ctx := context.Background()

	id, err := svc.Create(ctx, fx.AuthorID, CreateArticleInput{
		PublisherID:   fx.PublisherID,
		Title:         "Mon Super Article",
		Slug:          "mon-super-article",
		Content:       "Contenu",
		ContentFormat: "markdown",
		Status:        "PUBLISHED",
		Published:     true,
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	var savedSlug, shortCode string
	if err := poolTest.QueryRow(ctx,
		`SELECT slug, COALESCE("shortCode", '') FROM "Article" WHERE id = $1`, id,
	).Scan(&savedSlug, &shortCode); err != nil {
		t.Fatalf("select article: %v", err)
	}

	reCode := regexp.MustCompile(`^[1-9][0-9]{4,9}$`)
	if !reCode.MatchString(shortCode) {
		t.Fatalf("shortCode = %q invalide", shortCode)
	}
	if !strings.HasSuffix(savedSlug, "-"+shortCode) {
		t.Fatalf("slug = %q devrait se terminer par -%s", savedSlug, shortCode)
	}
	if got := slug.ExtractTrailingShortCode(savedSlug); got != shortCode {
		t.Fatalf("ExtractTrailingShortCode(%q) = %q, attendu %q", savedSlug, got, shortCode)
	}

	// Résolution via GetByShortCode + HTTP handler
	res, err := svc.GetByShortCode(ctx, shortCode)
	if err != nil {
		t.Fatalf("GetByShortCode: %v", err)
	}
	if res.ID != id || res.Slug != savedSlug || res.ShortCode != shortCode || res.OwnerSlug == "" {
		t.Fatalf("GetByShortCode = %+v", res)
	}

	h := NewHandler(svc)
	r := chi.NewRouter()
	h.RegisterPublic(r)
	req := httptest.NewRequest(http.MethodGet, "/v1/articles/short/"+shortCode, nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("HTTP GET /v1/articles/short/%s = %d (body %s)", shortCode, w.Code, w.Body.String())
	}
	var httpRes ShortCodeResolution
	if err := json.Unmarshal(w.Body.Bytes(), &httpRes); err != nil {
		t.Fatalf("json decode: %v", err)
	}
	if httpRes.ID != id || httpRes.ShortCode != shortCode {
		t.Fatalf("httpRes = %+v", httpRes)
	}

	// Changement de slug sur article publié → archive l'ancien slug et conserve shortCode
	newSlug := "nouveau-titre-" + shortCode
	if err := svc.Update(ctx, id, fx.AuthorID, UpdateArticleInput{
		Title:         "Nouveau Titre",
		Slug:          newSlug,
		Content:       "Contenu mis à jour",
		ContentFormat: "markdown",
		Status:        "PUBLISHED",
		Published:     true,
	}); err != nil {
		t.Fatalf("Update: %v", err)
	}

	var updatedSlug, updatedShortCode string
	if err := poolTest.QueryRow(ctx,
		`SELECT slug, "shortCode" FROM "Article" WHERE id = $1`, id,
	).Scan(&updatedSlug, &updatedShortCode); err != nil {
		t.Fatalf("select updated: %v", err)
	}
	if updatedShortCode != shortCode {
		t.Fatalf("shortCode modifié: %q != %q", updatedShortCode, shortCode)
	}
	var archivedCount int
	if err := poolTest.QueryRow(ctx,
		`SELECT COUNT(*)::int FROM "ArticleSlugHistory" WHERE "articleId" = $1 AND slug = $2`,
		id, savedSlug,
	).Scan(&archivedCount); err != nil || archivedCount != 1 {
		t.Fatalf("ArticleSlugHistory count = %d (err=%v), attendu 1", archivedCount, err)
	}

	// Un brouillon ne doit pas être exposé par GetByShortCode
	draftID, err := svc.Create(ctx, fx.AuthorID, CreateArticleInput{
		PublisherID:   fx.PublisherID,
		Title:         "Brouillon Secret",
		Slug:          "brouillon-secret",
		Content:       "Draft",
		ContentFormat: "markdown",
		Status:        "DRAFT",
		Published:     false,
	})
	if err != nil {
		t.Fatalf("Create draft: %v", err)
	}
	var draftCode string
	_ = poolTest.QueryRow(ctx, `SELECT "shortCode" FROM "Article" WHERE id = $1`, draftID).Scan(&draftCode)
	if _, err := svc.GetByShortCode(ctx, draftCode); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("GetByShortCode(draft) = %v, attendu pgx.ErrNoRows", err)
	}
}
