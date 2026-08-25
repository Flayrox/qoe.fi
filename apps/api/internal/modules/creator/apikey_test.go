package creator

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	db "github.com/qoefi/api/internal/database"
	authmw "github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/testutil"
)

// insertAPIKey insère une clé avec les scopes donnés et renvoie la clé
// en clair (format qoe_live_…).
func insertAPIKey(t *testing.T, userID, name string, scopes []string) string {
	t.Helper()
	raw := make([]byte, 16)
	if _, err := rand.Read(raw); err != nil {
		t.Fatalf("rand: %v", err)
	}
	key := "qoe_live_" + hex.EncodeToString(raw)
	sum := sha256.Sum256([]byte(key))
	if _, err := poolTest.Exec(context.Background(),
		`INSERT INTO "ApiKey" (id, name, "keyPrefix", "keyHash", scopes, "userId")
		 VALUES (gen_random_uuid()::text, $1, 'qoe_live', $2, $3, $4)`,
		name, hex.EncodeToString(sum[:]), scopes, userID); err != nil {
		t.Fatalf("insert api key: %v", err)
	}
	return key
}

// newAPIRouter reproduit le montage production : APIKeyAuth puis
// RegisterAPIKey (routes consommables par clé créateur).
func newAPIRouter() http.Handler {
	h := NewHandler(poolTest, nil, "")
	r := chi.NewRouter()
	r.Group(func(api chi.Router) {
		api.Use(authmw.APIKeyAuth(db.New(poolTest)))
		h.RegisterAPIKey(api)
	})
	return r
}

func TestCreatorAPI_FullScopeKeyAllowed(t *testing.T) {
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	r := newAPIRouter()
	key := insertAPIKey(t, fx.AuthorID, "full", authmw.AllScopes)

	req := httptest.NewRequest(http.MethodGet, "/v1/analytics/stats", nil)
	req.Header.Set("Authorization", "Bearer "+key)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("clé complète = %d %s, attendu 200", w.Code, w.Body.String())
	}
	var res struct {
		Data struct {
			Stats map[string]int `json:"stats"`
		} `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatalf("json: %v (%s)", err, w.Body.String())
	}
	if _, ok := res.Data.Stats["pageviews"]; !ok {
		t.Fatalf("shape stats attendue : %s", w.Body.String())
	}

	// lastUsedAt mis à jour par l'authentification.
	var used *bool
	rows, err := poolTest.Query(context.Background(),
		`SELECT "lastUsedAt" IS NOT NULL FROM "ApiKey" WHERE "userId" = $1`, fx.AuthorID)
	if err != nil {
		t.Fatalf("query lastUsed: %v", err)
	}
	defer rows.Close()
	for rows.Next() {
		var u bool
		if err := rows.Scan(&u); err != nil {
			t.Fatalf("scan: %v", err)
		}
		used = &u
	}
	if used == nil || !*used {
		t.Fatal("lastUsedAt non mis à jour après usage")
	}
}

func TestCreatorAPI_ScopeEnforcement(t *testing.T) {
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	r := newAPIRouter()

	// Clé limitée au scope READ : /analytics/stats exige ANALYTICS → 403.
	readonly := insertAPIKey(t, fx.ViewerID, "readonly", []string{authmw.ScopeRead})
	req := httptest.NewRequest(http.MethodGet, "/v1/analytics/stats", nil)
	req.Header.Set("Authorization", "Bearer "+readonly)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Fatalf("scope READ sur route ANALYTICS = %d %s, attendu 403", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), "ANALYTICS") {
		t.Fatalf("message de scope manquant : %s", w.Body.String())
	}
}

func TestCreatorAPI_RejectsBadCredentials(t *testing.T) {
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	r := newAPIRouter()

	cases := []struct {
		name, header string
	}{
		{"sans header", ""},
		{"pas un bearer", "Basic abc"},
		{"mauvais préfixe", "Bearer sk_live_abcdef"},
		{"clé inconnue", "Bearer qoe_live_" + strings.Repeat("0", 32)},
	}
	for _, tc := range cases {
		req := httptest.NewRequest(http.MethodGet, "/v1/analytics/stats", nil)
		if tc.header != "" {
			req.Header.Set("Authorization", tc.header)
		}
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("%s = %d %s, attendu 401", tc.name, w.Code, w.Body.String())
		}
	}
	_ = fx
}

func TestRequireAPIScope_JWTPassesWithoutScopes(t *testing.T) {
	// Une requête JWT (aucun scope en contexte) traverse RequireAPIScope :
	// le RBAC publication s'applique en aval.
	called := false
	handler := authmw.RequireAPIScope(authmw.ScopeAnalytics)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusOK)
	}))
	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	if !called || w.Code != http.StatusOK {
		t.Fatal("JWT sans scopes doit passer le middleware de scope")
	}

	// Clé API limitée à READ : bloquée pour ANALYTICS.
	ctx := context.WithValue(req.Context(), authmw.ScopesKey, []string{authmw.ScopeRead})
	w = httptest.NewRecorder()
	handler.ServeHTTP(w, req.WithContext(ctx))
	if w.Code != http.StatusForbidden {
		t.Fatalf("READ sur route ANALYTICS = %d, attendu 403", w.Code)
	}
}

// ─── GET /v1/creator/highlights — surlignages publics multi-auteurs ────

func TestCreatorAPI_Highlights(t *testing.T) {
	ctx := context.Background()

	// Fixture dédiée : publication créateur + 2 articles (dont un
	// co-écrit) + lecteurs qui surlignent.
	pubID := "pub_api_hl"
	creatorID := "00000000-0000-0000-0000-000000000c01"
	coAuthorID := "00000000-0000-0000-0000-000000000c02"
	reader1 := "00000000-0000-0000-0000-000000000c03"
	reader2 := "00000000-0000-0000-0000-000000000c04"

	if _, err := poolTest.Exec(ctx,
		`TRUNCATE TABLE "Highlight", "AnnotationComment", "Article", "_CoAuthors",
		 "Publication", "User" CASCADE`); err != nil {
		t.Fatalf("truncate: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Publication" (id, type, name, slug, "createdAt", "updatedAt")
		 VALUES ($1, 'PERSONAL', 'Créateur API', 'createur-api', now(), now())`, pubID); err != nil {
		t.Fatalf("publication: %v", err)
	}
	for _, u := range []struct{ id, username string }{
		{creatorID, "apicreator"}, {coAuthorID, "cocreator"},
		{reader1, "readerone"}, {reader2, "readertwo"},
	} {
		var pub *string
		if u.id == creatorID {
			pub = &pubID
		}
		if _, err := poolTest.Exec(ctx,
			`INSERT INTO "User" (id, email, username, name, role, "publicationId", "createdAt", "updatedAt")
			 VALUES ($1, $2, $3, $3, 'user', $4, now(), now())`,
			u.id, u.username+"@test.dev", u.username, pub); err != nil {
			t.Fatalf("user %s: %v", u.username, err)
		}
	}

	// Article signé par le créateur + article co-écrit.
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Article" (id, title, slug, content, published, visibility,
		                        "readingTime", status, "publicationId", "authorId", "createdAt", "updatedAt")
		 VALUES ('art_api_1', 'Article Solo', 'article-solo', '<p>x</p>', true, 'PUBLIC',
		         3, 'PUBLISHED', $1, $2, now(), now())`,
		pubID, creatorID); err != nil {
		t.Fatalf("article solo: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Article" (id, title, slug, content, published, visibility,
		                        "readingTime", status, "publicationId", "authorId", "createdAt", "updatedAt")
		 VALUES ('art_api_2', 'Article Duo', 'article-duo', '<p>y</p>', true, 'PUBLIC',
		         3, 'PUBLISHED', $1, $2, now(), now())`,
		pubID, creatorID); err != nil {
		t.Fatalf("article duo: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "_CoAuthors" ("A", "B") VALUES ('art_api_2', $1)`, coAuthorID); err != nil {
		t.Fatalf("co-auteur: %v", err)
	}

	// Surlignages : publics sur les 2 articles, un privé ignoré.
	hl := func(id, articleID, readerID, text string, public bool) {
		t.Helper()
		if _, err := poolTest.Exec(ctx,
			`INSERT INTO "Highlight" (id, text, "isPublic", "readerId", "articleId", "createdAt")
			 VALUES ($1, $2, $3, $4, $5, now())`,
			id, text, public, readerID, articleID); err != nil {
			t.Fatalf("highlight %s: %v", id, err)
		}
	}
	hl("hl_pub_solo", "art_api_1", reader1, "Passage solo souligné", true)
	hl("hl_pub_duo", "art_api_2", reader2, "Passage duo souligné", true)
	hl("hl_prive", "art_api_1", reader2, "Privé — ne doit pas sortir", false)

	r := newAPIRouter()
	key := insertAPIKey(t, creatorID, "lecteur", authmw.AllScopes)

	req := httptest.NewRequest(http.MethodGet, "/v1/creator/highlights", nil)
	req.Header.Set("Authorization", "Bearer "+key)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("highlights = %d %s", w.Code, w.Body.String())
	}
	var page struct {
		Items []struct {
			ID     string `json:"id"`
			Text   string `json:"text"`
			Reader struct {
				Username *string `json:"username"`
			} `json:"reader"`
			Article struct {
				Slug    string   `json:"slug"`
				Authors []string `json:"authors"`
			} `json:"article"`
		} `json:"items"`
		HasMore    bool   `json:"hasMore"`
		NextCursor string `json:"nextCursor"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &page); err != nil {
		t.Fatalf("json: %v (%s)", err, w.Body.String())
	}

	if len(page.Items) != 2 {
		t.Fatalf("items = %d, attendu 2 (publics uniquement)", len(page.Items))
	}
	texts := map[string]string{}
	for _, it := range page.Items {
		texts[it.ID] = it.Text
	}
	if _, ok := texts["hl_pub_solo"]; !ok {
		t.Fatal("highlight de l'article solo absent")
	}
	if _, ok := texts["hl_pub_duo"]; !ok {
		t.Fatal("highlight de l'article co-écrit absent")
	}
	if _, ok := texts["hl_prive"]; ok {
		t.Fatal("highlight privé exposé !")
	}

	// Pagination limit=1 → 1 item + curseur.
	req = httptest.NewRequest(http.MethodGet, "/v1/creator/highlights?limit=1", nil)
	req.Header.Set("Authorization", "Bearer "+key)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	var paged map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &paged); err != nil {
		t.Fatalf("json page 2: %v (%s)", err, w.Body.String())
	}
	if items, ok := paged["items"].([]any); !ok || len(items) != 1 {
		t.Fatalf("pagination limit=1 : items=%v, attendu 1", paged["items"])
	}
	if paged["hasMore"] != true {
		t.Fatal("hasMore attendu true avec limit=1 et 2 résultats")
	}
	if paged["nextCursor"] == nil || paged["nextCursor"] == "" {
		t.Fatal("nextCursor manquant")
	}

	// Clé READ-only : autorisé (scope READ requis uniquement).
	ro := insertAPIKey(t, creatorID, "read-only", []string{authmw.ScopeRead})
	req = httptest.NewRequest(http.MethodGet, "/v1/creator/highlights", nil)
	req.Header.Set("Authorization", "Bearer "+ro)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("clé READ = %d %s, attendu 200", w.Code, w.Body.String())
	}

	// Anonyme → 401.
	req = httptest.NewRequest(http.MethodGet, "/v1/creator/highlights", nil)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("anonyme = %d, attendu 401", w.Code)
	}
}

func TestCreatorAPI_Highlights_CoAuthorSeesOwnArticles(t *testing.T) {
	ctx := context.Background()
	r := newAPIRouter()

	// Le co-auteur (clé propre) voit les surlignages de l'article duo
	// même sans posséder la publication.
	key := insertAPIKey(t, "00000000-0000-0000-0000-000000000c02", "coauteur", authmw.AllScopes)

	// Recrée les données minimales si le test précédent a purgé.
	var n int
	if err := poolTest.QueryRow(ctx,
		`SELECT COUNT(*) FROM "Highlight" WHERE id = 'hl_pub_duo'`).Scan(&n); err != nil || n == 0 {
		t.Skip("données du test précédent absentes")
	}

	req := httptest.NewRequest(http.MethodGet, "/v1/creator/highlights?limit=50", nil)
	req.Header.Set("Authorization", "Bearer "+key)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("co-auteur = %d %s", w.Code, w.Body.String())
	}
	var page struct {
		Items []struct {
			ID      string `json:"id"`
			Article struct {
				Authors []string `json:"authors"`
			} `json:"article"`
		} `json:"items"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &page); err != nil {
		t.Fatalf("json: %v (%s)", err, w.Body.String())
	}
	foundDuo := false
	foundAuthors := false
	for _, it := range page.Items {
		if it.ID == "hl_pub_duo" {
			foundDuo = true
			for _, a := range it.Article.Authors {
				if a == "00000000-0000-0000-0000-000000000c02" {
					foundAuthors = true
				}
			}
		}
	}
	if !foundDuo {
		t.Fatal("l'article co-écrit n'apparaît pas pour le co-auteur")
	}
	if !foundAuthors {
		t.Fatal("le co-auteur n'est pas listé dans article.authors")
	}
}

// ─── API v2 : /me, /articles, /articles/{slug}, highlights filtrés ─────

func TestCreatorAPI_Content(t *testing.T) {
	r := newAPIRouter()
	key := insertAPIKey(t, "00000000-0000-0000-0000-000000000c01", "contenu", authmw.AllScopes)

	getJSON := func(path string) (int, map[string]any) {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		req.Header.Set("Authorization", "Bearer "+key)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		var body map[string]any
		_ = json.Unmarshal(w.Body.Bytes(), &body)
		return w.Code, body
	}

	// ── /v1/creator/me : publication + scopes.
	code, me := getJSON("/v1/creator/me")
	if code != http.StatusOK {
		t.Fatalf("me = %d %v", code, me)
	}
	pub, _ := me["publication"].(map[string]any)
	if pub == nil || pub["slug"] != "createur-api" || pub["name"] != "Créateur API" {
		t.Fatalf("publication inattendue : %v", pub)
	}
	if scopes, ok := me["scopes"].([]any); !ok || len(scopes) == 0 {
		t.Fatal("scopes absents de /me")
	}

	// ── /v1/creator/articles : 2 articles publiés avec auteurs résolus.
	code, list := getJSON("/v1/creator/articles?limit=10")
	if code != http.StatusOK {
		t.Fatalf("articles = %d %v", code, list)
	}
	items, _ := list["items"].([]any)
	if len(items) != 2 {
		t.Fatalf("items = %d, attendu 2", len(items))
	}
	first := items[0].(map[string]any)
	if first["excerpt"] == "" || first["excerpt"] == nil {
		t.Fatal("extrait vide")
	}
	authors := first["authors"].([]any)
	if len(authors) == 0 {
		t.Fatal("auteurs non résolus sur la liste")
	}
	a0 := authors[0].(map[string]any)
	if a0["username"] != "apicreator" && a0["username"] != "cocreator" {
		t.Fatalf("auteur inattendu : %v", a0)
	}

	// ── /v1/creator/articles/article-duo : contenu HTML + co-auteur.
	code, full := getJSON("/v1/creator/articles/article-duo")
	if code != http.StatusOK {
		t.Fatalf("article by slug = %d %v", code, full)
	}
	if html, _ := full["contentHtml"].(string); !strings.Contains(html, "<p>") {
		t.Fatalf("contentHtml absent : %v", full["contentHtml"])
	}
	fullAuthors := full["authors"].([]any)
	if len(fullAuthors) < 2 {
		t.Fatalf("co-auteur manquant sur article-duo : %v", fullAuthors)
	}

	// Slug inconnu → 404.
	req := httptest.NewRequest(http.MethodGet, "/v1/creator/articles/inconnu-xyz", nil)
	req.Header.Set("Authorization", "Bearer "+key)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusNotFound {
		t.Fatalf("slug inconnu = %d, attendu 404", w.Code)
	}

	// ── Highlights filtrés par article.
	code, filtered := getJSON("/v1/creator/highlights?article=article-solo")
	if code != http.StatusOK {
		t.Fatalf("highlights filtrés = %d", code)
	}
	fItems, _ := filtered["items"].([]any)
	for _, it := range fItems {
		item := it.(map[string]any)
		art := item["article"].(map[string]any)
		if art["slug"] != "article-solo" {
			t.Fatalf("filtre article ignoré : %v", art["slug"])
		}
	}
	if len(fItems) == 0 {
		t.Skip("aucun highlight seedé pour ce filtre")
	}
}

// ─── Markdown : contentMarkdown généré depuis le HTML stocké ──────────

func TestCreatorAPI_ArticleMarkdown(t *testing.T) {
	ctx := context.Background()

	// Fixture autonome (ce test peut tourner seul) : publication + auteur.
	if _, err := poolTest.Exec(ctx,
		`TRUNCATE TABLE "Highlight", "Article", "_CoAuthors", "Publication", "User" CASCADE`); err != nil {
		t.Fatalf("truncate: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Publication" (id, type, name, slug, "createdAt", "updatedAt")
		 VALUES ('pub_api_hl', 'PERSONAL', 'Créateur API', 'createur-api', now(), now())`); err != nil {
		t.Fatalf("publication: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "User" (id, email, username, name, role, "publicationId", "createdAt", "updatedAt")
		 VALUES ('00000000-0000-0000-0000-000000000c01', 'apicreator@test.dev', 'apicreator', 'apicreator', 'user', 'pub_api_hl', now(), now())`); err != nil {
		t.Fatalf("user: %v", err)
	}

	r := newAPIRouter()
	key := insertAPIKey(t, "00000000-0000-0000-0000-000000000c01", "md", authmw.AllScopes)

	// Article avec du HTML sémantique riche.
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Article" (id, title, slug, content, published, visibility,
		                        "readingTime", status, "publicationId", "authorId", "createdAt", "updatedAt")
		 VALUES ('art_api_md', 'Article Markdown', 'article-markdown',
		         '<h2>Introduction</h2><p>Du texte avec du <strong>gras</strong> et un <a href="https://qoe.fi">lien</a>.</p><ul><li>Puce un</li><li>Puce deux</li></ul><blockquote>Citation</blockquote>',
		         true, 'PUBLIC', 2, 'PUBLISHED', $1, $2, now(), now())`,
		"pub_api_hl", "00000000-0000-0000-0000-000000000c01"); err != nil {
		t.Fatalf("article md: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/v1/creator/articles/article-markdown", nil)
	req.Header.Set("Authorization", "Bearer "+key)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("detail = %d %s", w.Code, w.Body.String())
	}
	var full struct {
		ContentHTML     string `json:"contentHtml"`
		ContentMarkdown string `json:"contentMarkdown"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &full); err != nil {
		t.Fatalf("json: %v", err)
	}
	for _, want := range []string{"## Introduction", "**gras**", "[lien](https://qoe.fi)", "- Puce un", "> Citation"} {
		if !strings.Contains(full.ContentMarkdown, want) {
			t.Errorf("markdown sans %q :\n%s", want, full.ContentMarkdown)
		}
	}
}

// ─── Annotations officielles de l'auteur + commentaires (isAuthor) ─────

func TestCreatorAPI_OfficialAnnotationsAndComments(t *testing.T) {
	ctx := context.Background()

	// Fixture autonome : publication, auteur, lecteur, article,
	// surlignage officiel de l'auteur + lecteur, et discussion.
	if _, err := poolTest.Exec(ctx,
		`TRUNCATE TABLE "AnnotationComment", "Highlight", "Article", "_CoAuthors",
		 "Publication", "User" CASCADE`); err != nil {
		t.Fatalf("truncate: %v", err)
	}
	authorID := "00000000-0000-0000-0000-000000000d01"
	readerID := "00000000-0000-0000-0000-000000000d02"
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Publication" (id, type, name, slug, "createdAt", "updatedAt")
		 VALUES ('pub_official', 'PERSONAL', 'Éditorial', 'editorial', now(), now())`); err != nil {
		t.Fatalf("publication: %v", err)
	}
	for _, u := range []struct{ id, username string }{
		{authorID, "officiauteur"}, {readerID, "lecteurannot"},
	} {
		if _, err := poolTest.Exec(ctx,
			`INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt")
			 VALUES ($1, $2, $3, $3, 'user', now(), now())`,
			u.id, u.username+"@test.dev", u.username); err != nil {
			t.Fatalf("user %s: %v", u.username, err)
		}
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Article" (id, title, slug, content, published, visibility,
		                        "readingTime", status, "publicationId", "authorId", "createdAt", "updatedAt")
		 VALUES ('art_official', 'Analyse annotée', 'analyse-annotee',
		         '<p>Un passage important à souligner.</p>',
		         true, 'PUBLIC', 2, 'PUBLISHED', 'pub_official', $1, now(), now())`,
		authorID); err != nil {
		t.Fatalf("article: %v", err)
	}

	hl := func(id, readerID, text string, official bool) {
		t.Helper()
		if _, err := poolTest.Exec(ctx,
			`INSERT INTO "Highlight" (id, text, note, "isPublic", "isOfficial", "readerId", "articleId", "createdAt")
			 VALUES ($1, $2, NULL, true, $3, $4, 'art_official', now())`,
			id, text, official, readerID); err != nil {
			t.Fatalf("highlight %s: %v", id, err)
		}
	}
	hl("hl_officiel", authorID, "Un passage important", true)
	hl("hl_lecteur", readerID, "À retenir aussi", false)

	r := newAPIRouter()
	key := insertAPIKey(t, authorID, "official", authmw.AllScopes)

	getJSON := func(path string) map[string]any {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		req.Header.Set("Authorization", "Bearer "+key)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		var body map[string]any
		_ = json.Unmarshal(w.Body.Bytes(), &body)
		return body
	}

	// Filtre official=true → uniquement l'annotation éditoriale.
	only := getJSON("/v1/creator/highlights?official=true")
	items, _ := only["items"].([]any)
	if len(items) != 1 {
		t.Fatalf("official=true = %d items, attendu 1", len(items))
	}
	item := items[0].(map[string]any)
	if item["isOfficial"] != true || item["text"] != "Un passage important" {
		t.Fatalf("annotation officielle incorrecte : %v", item)
	}

	// Sans filtre : les deux, avec le flag isOfficial correct.
	all := getJSON("/v1/creator/highlights")
	allItems, _ := all["items"].([]any)
	if len(allItems) != 2 {
		t.Fatalf("sans filtre = %d items, attendu 2", len(allItems))
	}

	// Commentaires du surlignage officiel : réponse auteur + lecteur.
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "AnnotationComment" (id, content, "highlightId", "authorId", "createdAt")
		 VALUES ('c_auteur', 'Merci pour la lecture attentive !', 'hl_officiel', $1, now()),
		        ('c_lecteur', 'Très éclairant.', 'hl_officiel', $2, now())`,
		authorID, readerID); err != nil {
		t.Fatalf("comments seed: %v", err)
	}
	req := httptest.NewRequest(http.MethodGet, "/v1/creator/highlights/hl_officiel/comments", nil)
	req.Header.Set("Authorization", "Bearer "+key)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("comments = %d %s", w.Code, w.Body.String())
	}
	var cRes struct {
		Comments []struct {
			Content string `json:"content"`
			Author  struct {
				ID string `json:"id"`
			} `json:"author"`
			IsAuthor bool `json:"isAuthor"`
		} `json:"comments"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &cRes); err != nil {
		t.Fatalf("json comments: %v (%s)", err, w.Body.String())
	}
	if len(cRes.Comments) != 2 {
		t.Fatalf("comments = %d, attendu 2", len(cRes.Comments))
	}
	byAuthorFlag := map[string]bool{}
	for _, c := range cRes.Comments {
		byAuthorFlag[c.Content] = c.IsAuthor
	}
	if !byAuthorFlag["Merci pour la lecture attentive !"] {
		t.Fatal("réponse de l'auteur non marquée isAuthor")
	}
	if byAuthorFlag["Très éclairant."] {
		t.Fatal("commentaire lecteur marqué isAuthor")
	}
}
