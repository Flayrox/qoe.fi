package creator

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/middleware"
)

func TestUserMe_ExistingUser(t *testing.T) {
	_, aliceUserID, _, _ := seedFollows(t)
	r := newFullRouter()
	w := authedRequest(r, http.MethodGet, "/v1/users/me", aliceUserID, "")
	if w.Code != http.StatusOK {
		t.Fatalf("userMe = %d %s, attendu 200", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), "alice") {
		t.Fatalf("userMe sans profil: %s", w.Body.String())
	}
}

// TestUserMe_AutoProvision couvre le JIT : utilisateur authentifié non encore
// en base → publication + ligne User auto-provisionnées.
func TestUserMe_AutoProvision(t *testing.T) {
	r := newFullRouter()
	newID := "fb8a0000-0000-0000-0000-0000000000aa"
	req := httptest.NewRequest(http.MethodGet, "/v1/users/me", nil)
	ctx := context.WithValue(req.Context(), middleware.UserIDKey, newID)
	ctx = context.WithValue(ctx, middleware.ClaimsKey, map[string]any{
		"email": "nouveau@test.dev",
		"user_metadata": map[string]any{"full_name": "Nouvel User", "username": "nouveau"},
	})
	req = req.WithContext(ctx)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("userMe auto-provision = %d %s, attendu 200", w.Code, w.Body.String())
	}
	// La ligne User existe désormais.
	var n int
	if err := poolTest.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM "User" WHERE id=$1::uuid`, newID).Scan(&n); err != nil || n != 1 {
		t.Fatalf("user auto-provisionné = %d (err=%v), attendu 1", n, err)
	}
}

// TestUserMe_AutoProvision_PartialClaims — JIT même sans user_metadata
// (claims minimaux) : le compte est provisionné avec des défauts.
func TestUserMe_AutoProvision_PartialClaims(t *testing.T) {
	r := newFullRouter()
	newID := "fb8b0000-0000-0000-0000-0000000000bb"
	req := httptest.NewRequest(http.MethodGet, "/v1/users/me", nil)
	ctx := context.WithValue(req.Context(), middleware.UserIDKey, newID)
	ctx = context.WithValue(ctx, middleware.ClaimsKey, map[string]any{"email": "partiel@test.dev"})
	req = req.WithContext(ctx)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("userMe JIT partiel = %d %s, attendu 200", w.Code, w.Body.String())
	}
}

func TestFollowers_Following_Handlers(t *testing.T) {
	seedFollows(t)
	r := newFullRouter()

	// /v1/users/alice/followers → Bob (1 abonné).
	w := authedRequest(r, http.MethodGet, "/v1/users/alice/followers?limit=10", "", "")
	if w.Code != http.StatusOK {
		t.Fatalf("followers = %d %s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), "bob") {
		t.Fatalf("followers sans bob: %s", w.Body.String())
	}
	// /v1/users/bob/following → Alice.
	w = authedRequest(r, http.MethodGet, "/v1/users/bob/following?limit=10", "", "")
	if w.Code != http.StatusOK {
		t.Fatalf("following = %d %s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), "alice") {
		t.Fatalf("following sans alice: %s", w.Body.String())
	}
	// Utilisateur inconnu → 404.
	if w := authedRequest(r, http.MethodGet, "/v1/users/inconnu/followers", "", ""); w.Code != http.StatusNotFound {
		t.Fatalf("followers inconnu = %d, attendu 404", w.Code)
	}
}

func TestCategories_UpdateAndDelete(t *testing.T) {
	alicePubID, aliceUserID, _, _ := seedFollows(t)
	r := chi.NewRouter()
	newTestHandler().RegisterProtected(r, func(string) func(http.Handler) http.Handler {
		return func(next http.Handler) http.Handler { return next }
	})

	// Crée une catégorie (owner alice).
	created := authedRequest(r, http.MethodPost, "/v1/categories", aliceUserID,
		`{"publicationId":"`+alicePubID+`","name":"Sport","slug":"sport"}`)
	if created.Code != http.StatusOK && created.Code != http.StatusCreated {
		t.Fatalf("create = %d %s", created.Code, created.Body.String())
	}
	var catID string
	if err := poolTest.QueryRow(context.Background(),
		`SELECT id FROM "Category" WHERE slug='sport' AND "publicationId"=$1`, alicePubID).Scan(&catID); err != nil {
		t.Fatalf("catID: %v", err)
	}

	// Update (renomme).
	upd := authedRequest(r, http.MethodPatch, "/v1/categories/"+catID, aliceUserID,
		`{"name":"Sports","slug":"sports"}`)
	if upd.Code != http.StatusOK {
		t.Fatalf("update = %d %s", upd.Code, upd.Body.String())
	}
	if !strings.Contains(upd.Body.String(), "sports") {
		t.Fatalf("update non appliqué: %s", upd.Body.String())
	}
	// Update par un non-owner → 403.
	bobID := "00000000-0000-0000-0000-000000000101"
	if w := authedRequest(r, http.MethodPatch, "/v1/categories/"+catID, bobID, `{"name":"Hack"}`); w.Code != http.StatusForbidden {
		t.Fatalf("update non-owner = %d, attendu 403", w.Code)
	}
	// Categorie inexistante → 404.
	if w := authedRequest(r, http.MethodPatch, "/v1/categories/cat_x", aliceUserID, `{"name":"X"}`); w.Code != http.StatusNotFound {
		t.Fatalf("update inexistante = %d, attendu 404", w.Code)
	}

	// Delete.
	if w := authedRequest(r, http.MethodDelete, "/v1/categories/"+catID, aliceUserID, ""); w.Code != http.StatusOK {
		t.Fatalf("delete = %d %s", w.Code, w.Body.String())
	}
	// Delete par non-owner → 403.
	authedRequest(r, http.MethodPost, "/v1/categories", aliceUserID,
		`{"publicationId":"`+alicePubID+`","name":"Cuisine","slug":"cuisine"}`)
	var cat2 string
	_ = poolTest.QueryRow(context.Background(),
		`SELECT id FROM "Category" WHERE slug='cuisine' LIMIT 1`).Scan(&cat2)
	if w := authedRequest(r, http.MethodDelete, "/v1/categories/"+cat2, bobID, ""); w.Code != http.StatusForbidden {
		t.Fatalf("delete non-owner = %d, attendu 403", w.Code)
	}
}

func TestCreator_PureHelpers(t *testing.T) {
	// parseFollowPage
	if l, o := parseFollowPage(reqPath("?limit=5&cursor=2")); l != 5 || o != 2 {
		t.Errorf("parseFollowPage = (%d,%d), attendu (5,2)", l, o)
	}
	if l, _ := parseFollowPage(reqPath("?limit=999")); l != 50 {
		t.Errorf("limit 999 clampé = %d, attendu 50", l)
	}
	// parseLimitCursor
	if l, o := parseLimitCursor(reqPath("?limit=8&cursor=3")); l != 8 || o != 3 {
		t.Errorf("parseLimitCursor = (%d,%d)", l, o)
	}
	// stringPtr
	if s := stringPtr(""); s != nil {
		t.Error("stringPtr vide → nil")
	}
	if s := stringPtr("x"); s == nil || *s != "x" {
		t.Error("stringPtr non vide → pointeur")
	}
	// stripHTMLTags
	if got := stripHTMLTags("<p>Bonjour <b>monde</b></p>rest", 40); !strings.Contains(got, "Bonjour") || strings.Contains(got, "<") {
		t.Errorf("stripHTMLTags = %q", got)
	}
	if got := stripHTMLTags("Sans html du tout", 100); got != "Sans html du tout" {
		t.Errorf("stripHTMLTags sans balise = %q", got)
	}
	// parseCursor
	if l, o := parseCursor(reqPath("?limit=12&cursor=4")); l != 12 || o != 4 {
		t.Errorf("parseCursor = (%d,%d)", l, o)
	}
	if l, _ := parseCursor(reqPath("?limit=-1")); l != 20 {
		t.Errorf("parseCursor limit négatif = %d, attendu 20", l)
	}
}

func reqPath(url string) *http.Request {
	if !strings.HasPrefix(url, "/") {
		url = "/" + url
	}
	return httptest.NewRequest(http.MethodGet, url, nil)
}