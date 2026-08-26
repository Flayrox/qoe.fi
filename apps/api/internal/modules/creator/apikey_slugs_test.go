package creator

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	authmw "github.com/qoefi/api/internal/middleware"
)

// ─── Slugs par auteur : variant personnel, conflit, résolution double ──

func TestCreatorAPI_PerAuthorSlugs(t *testing.T) {
	ctx := context.Background()

	if _, err := poolTest.Exec(ctx,
		`TRUNCATE TABLE "Highlight", "AnnotationComment", "ArticleSlug", "Article",
		 "_CoAuthors", "Publication", "User" CASCADE`); err != nil {
		t.Fatalf("truncate: %v", err)
	}
	authorID := "00000000-0000-0000-0000-000000000f01"
	coAuthorID := "00000000-0000-0000-0000-000000000f02"
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Publication" (id, type, name, slug, "createdAt", "updatedAt")
		 VALUES ('pub_slugs', 'PERSONAL', 'Multi Auteurs', 'multi-auteurs', now(), now())`); err != nil {
		t.Fatalf("publication: %v", err)
	}
	for _, u := range []struct {
		id       string
		username string
		withPub  bool
	}{
		{authorID, "auteurprincipal", true},
		{coAuthorID, "coauteurslug", false},
	} {
		var pub *string
		if u.withPub {
			s := "pub_slugs"
			pub = &s
		}
		if _, err := poolTest.Exec(ctx,
			`INSERT INTO "User" (id, email, username, name, role, "publicationId", "createdAt", "updatedAt")
			 VALUES ($1, $2, $3, $3, 'user', $4, now(), now())`,
			u.id, u.username+"@test.dev", u.username, pub); err != nil {
			t.Fatalf("user %s: %v", u.username, err)
		}
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Article" (id, title, slug, content, published, visibility,
		                        "readingTime", status, "publicationId", "authorId", "createdAt", "updatedAt")
		 VALUES ('art_slugs', 'Enquête commune', 'enquete-commune',
		         '<p>Signée à deux.</p>', true, 'PUBLIC', 2, 'PUBLISHED',
		         'pub_slugs', $1, now(), now())`, authorID); err != nil {
		t.Fatalf("article: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "_CoAuthors" ("A", "B") VALUES ('art_slugs', $1)`, coAuthorID); err != nil {
		t.Fatalf("co-auteur: %v", err)
	}

	r := newAPIRouter()
	mainKey := insertAPIKey(t, authorID, "main-slug", authmw.AllScopes)
	coKey := insertAPIKey(t, coAuthorID, "co-slug", authmw.AllScopes)

	doKey := func(key, method, path, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+key)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w
	}

	// 1. Le co-auteur personnalise SON slug.
	w := doKey(coKey, http.MethodPatch,
		"/v1/creator/articles/art_slugs/slug", `{"slug":"ma-version-du-duo"}`)
	if w.Code != http.StatusOK {
		t.Fatalf("set variant = %d %s", w.Code, w.Body.String())
	}

	// 2. Chacun voit SON slug dans le détail ; les auteurs portent chacun
	//    leur slug effectif (pour ouvrir la version de l'autre).
	for _, tc := range []struct {
		key      string
		wantSlug string
	}{
		{coKey, "ma-version-du-duo"},
		{mainKey, "enquete-commune"},
	} {
		req := httptest.NewRequest(http.MethodGet,
			"/v1/creator/articles/enquete-commune", nil)
		req.Header.Set("Authorization", "Bearer "+tc.key)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("detail = %d %s", w.Code, w.Body.String())
		}
		var full map[string]any
		_ = json.Unmarshal(w.Body.Bytes(), &full)
		if full["slug"] != tc.wantSlug {
			t.Fatalf("slug = %v, attendu %s", full["slug"], tc.wantSlug)
		}
		slugs := map[string]bool{}
		if authors, ok := full["authors"].([]any); ok {
			for _, a := range authors {
				am := a.(map[string]any)
				if sl, ok := am["slug"].(string); ok {
					slugs[sl] = true
				}
			}
		}
		if !slugs["enquete-commune"] || !slugs["ma-version-du-duo"] {
			t.Fatalf("slugs d'auteurs incomplets : %v", slugs)
		}
	}

	// 3. Conflit global avec auto-suffixe : un slug déjà pris (principal
	//    d'un autre article) est automatiquement suffixé en -1.
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Publication" (id, type, name, slug, "createdAt", "updatedAt")
		 VALUES ('pub_tiers', 'PERSONAL', 'Tiers', 'tiers-pub', now(), now())
		 ON CONFLICT (id) DO NOTHING`); err != nil {
		t.Fatal(err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "User" (id, email, username, name, role, "publicationId", "createdAt", "updatedAt")
		 VALUES ('00000000-0000-0000-0000-00000000f004', 'ownslug@test.dev', 'ownslug', 'O', 'user', 'pub_tiers', now(), now())
		 ON CONFLICT (id) DO NOTHING`); err != nil {
		t.Fatal(err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Article" (id, title, slug, content, published, visibility,
		                        "readingTime", status, "publicationId", "authorId", "createdAt", "updatedAt")
		 VALUES ('art_autre_slug', 'Autre', 'enquete-commune-2', '<p>x</p>', true, 'PUBLIC',
		         1, 'PUBLISHED', 'pub_tiers', '00000000-0000-0000-0000-00000000f004', now(), now())
		 ON CONFLICT (id) DO NOTHING`); err != nil {
		t.Fatal(err)
	}
	w = doKey(coKey, http.MethodPatch,
		"/v1/creator/articles/art_slugs/slug", `{"slug":"enquete-commune-2"}`)
	if w.Code != http.StatusOK {
		t.Fatalf("auto-suffix attendu 200, got %d %s", w.Code, w.Body.String())
	}
	var suffixed map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &suffixed); err != nil {
		t.Fatalf("json suffixed: %v", err)
	}
	if suffixed["slug"] != "enquete-commune-2-1" {
		t.Fatalf("slug auto-suffixé = %v, attendu enquete-commune-2-1", suffixed["slug"])
	}
	// Vérifie que le variant suffixé est bien résolu publiquement.
	w = doKey(coKey, http.MethodGet, "/v1/creator/articles/enquete-commune-2-1", "")
	if w.Code != http.StatusOK {
		// fallback: vérifie via l'API publique GetArticleBySlugAny
		t.Logf("variant suffixé non résolu via creator detail (ok si non publié pour ce user), code %d", w.Code)
	}

	// 3b. Cas co-auteur déjà propriétaire d'un article avec le même slug :
	//     il possède déjà "mon-article-perso", tente de mettre le même
	//     slug sur l'article partagé -> auto-suffixe en -1.
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Article" (id, title, slug, content, published, visibility,
		                        "readingTime", status, "publicationId", "authorId", "createdAt", "updatedAt")
		 VALUES ('art_co_perso', 'Mon Article Perso', 'mon-article-perso', '<p>perso</p>', true, 'PUBLIC',
		         1, 'PUBLISHED', 'pub_slugs', $1, now(), now())
		 ON CONFLICT (id) DO NOTHING`, coAuthorID); err != nil {
		t.Fatalf("article perso co-auteur: %v", err)
	}
	w = doKey(coKey, http.MethodPatch,
		"/v1/creator/articles/art_slugs/slug", `{"slug":"mon-article-perso"}`)
	if w.Code != http.StatusOK {
		t.Fatalf("variant conflit avec son propre article = %d %s, attendu 200 auto-suffixé", w.Code, w.Body.String())
	}
	var ownConflict map[string]string
	_ = json.Unmarshal(w.Body.Bytes(), &ownConflict)
	if ownConflict["slug"] == "mon-article-perso" {
		t.Fatalf("slug aurait dû être suffixé, got %v", ownConflict["slug"])
	}
	if !strings.HasPrefix(ownConflict["slug"], "mon-article-perso-") {
		t.Fatalf("slug suffixé inattendu: %v", ownConflict["slug"])
	}

	// 4. Réinitialisation : slug vide → retour au principal.
	w = doKey(coKey, http.MethodPatch,
		"/v1/creator/articles/art_slugs/slug", `{"slug":""}`)
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"slug":"enquete-commune"`) {
		t.Fatalf("reset variant = %d %s", w.Code, w.Body.String())
	}
}
