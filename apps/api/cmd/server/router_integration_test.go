package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/testutil"
)

// routerSecret est le secret HS256 partagé entre le routeur et les JWT de test.
const routerSecret = "router-test-secret-0123456789"

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

// testRouter assemble le routeur de PRODUCTION (newRouter) avec la vraie DB.
func testRouter(t *testing.T) *chi.Mux {
	t.Helper()
	return newRouter(RouterDeps{
		Pool:             poolTest,
		Redis:            nil, // rate-limit désactivé en test
		Asynq:            nil, // émissions no-op en test
		JWTSecret:        routerSecret,
		InternalSecret:   "test-internal-secret",
		StripeWebhookKey: "",
		UmamiAPIURL:      "",
	})
}

func routerJWT(userID string) string {
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": userID,
		"exp": time.Now().Add(time.Hour).Unix(),
	})
	s, _ := tok.SignedString([]byte(routerSecret))
	return s
}

func routerAPIKey(t *testing.T, userID string) string {
	t.Helper()
	raw := "qoe_live_" + strings.Repeat("c", 32) + t.Name()
	sum := sha256.Sum256([]byte(raw))
	if _, err := poolTest.Exec(context.Background(),
		`INSERT INTO "ApiKey" (id, name, "keyPrefix", "keyHash", scopes, "userId", "createdAt")
		 VALUES (gen_random_uuid()::text, 'smoke', 'qoe_live', $1, $2, $3, now())`,
		hex.EncodeToString(sum[:]), []string{middleware.ScopeRead, middleware.ScopeWrite}, userID,
	); err != nil {
		t.Fatalf("insert api key: %v", err)
	}
	return raw
}

func doReq(t *testing.T, r http.Handler, method, path, token string, body any) (*httptest.ResponseRecorder, map[string]any) {
	t.Helper()
	var rd *bytes.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("marshal: %v", err)
		}
		rd = bytes.NewReader(b)
	} else {
		rd = bytes.NewReader(nil)
	}
	req := httptest.NewRequest(method, path, rd)
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	var parsed map[string]any
	if strings.Contains(w.Header().Get("Content-Type"), "json") && w.Body.Len() > 0 {
		_ = json.Unmarshal(w.Body.Bytes(), &parsed)
	}
	return w, parsed
}

// ─── Smoke : assemblage complet du routeur ────────────────────────────

func TestRouter_Healthz(t *testing.T) {
	r := testRouter(t)

	for _, path := range []string{"/healthz", "/health"} {
		w, body := doReq(t, r, "GET", path, "", nil)
		if w.Code != http.StatusOK {
			t.Fatalf("%s = %d", path, w.Code)
		}
		if body["status"] != "ok" {
			t.Fatalf("%s body = %s", path, w.Body.String())
		}
	}
}

func TestRouter_SearchPublic(t *testing.T) {
	r := testRouter(t)

	// /search/articles est public (parité Hono) — Meili absent → 500, mais la
	// route doit exister (pas de 404).
	w, _ := doReq(t, r, "GET", "/search/articles?q=test", "", nil)
	if w.Code == http.StatusNotFound {
		t.Fatal("/search/articles → 404, route non montée")
	}
}

func TestRouter_CreatorRoute_NoAuth_401(t *testing.T) {
	r := testRouter(t)

	w, _ := doReq(t, r, "GET", "/v1/articles", "", nil)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, attendu 401 (sans token)", w.Code)
	}
}

func TestRouter_FullCreatorFlow(t *testing.T) {
	// Seed : publication + auteur.
	fx, err := testutil.SeedArticles(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	r := testRouter(t)
	token := routerJWT(fx.AuthorID)

	// 1) Lecture publique d'un article publié (paywall sur le premium).
	w, body := doReq(t, r, "GET", "/v1/articles/recette-pates?publicationId="+fx.PublicationID, "", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("lecture publique = %d, body = %s", w.Code, w.Body.String())
	}
	if body["slug"] != "recette-pates" {
		t.Fatalf("body = %s", w.Body.String())
	}

	// 2) Liste créateur avec JWT : tableau brut d'articles complets (dashboard),
	// brouillons inclus — parité avec les server actions du studio.
	w2, _ := doReq(t, r, "GET", "/v1/articles?publicationId="+fx.PublicationID, token, nil)
	if w2.Code != http.StatusOK {
		t.Fatalf("liste = %d, body = %s", w2.Code, w2.Body.String())
	}
	var list2 []map[string]any
	if err := json.Unmarshal(w2.Body.Bytes(), &list2); err != nil {
		t.Fatalf("liste JWT : JSON invalide (%v), body = %s", err, w2.Body.String())
	}
	if len(list2) != 4 {
		t.Fatalf("len = %d, attendu 4 (3 publiés + 1 brouillon)", len(list2))
	}
	if _, ok := list2[0]["published"]; !ok {
		t.Fatalf("items sans champ published: %s", w2.Body.String())
	}

	// 3) Création d'un article via le routeur complet.
	w3, body3 := doReq(t, r, "POST", "/v1/articles", token, map[string]any{
		"publicationId": fx.PublicationID,
		"title":         "Via routeur",
		"slug":          "via-routeur",
		"content":       "Contenu complet via le routeur de prod",
		"contentFormat": "markdown",
		"status":        "PUBLISHED",
		"published":     true,
	})
	if w3.Code != http.StatusCreated {
		t.Fatalf("création = %d, body = %s", w3.Code, w3.Body.String())
	}
	createdID, _ := body3["id"].(string)

	// 4) Lecture publique du nouvel article.
	w4, _ := doReq(t, r, "GET", "/v1/articles/via-routeur?publicationId="+fx.PublicationID, "", nil)
	if w4.Code != http.StatusOK {
		t.Fatalf("lecture nouvel article = %d", w4.Code)
	}

	// 5) Capabilities (route statique — régression du bug chi).
	w5, body5 := doReq(t, r, "GET", "/v1/articles/capabilities?publicationId="+fx.PublicationID, token, nil)
	if w5.Code != http.StatusOK {
		t.Fatalf("capabilities = %d, body = %s", w5.Code, w5.Body.String())
	}
	if body5["isMedia"] != false {
		t.Fatalf("caps = %s", w5.Body.String())
	}

	// 6) Suppression.
	w6, _ := doReq(t, r, "DELETE", "/v1/articles/"+createdID+"?activePublicationId="+fx.PublicationID, token, nil)
	if w6.Code != http.StatusOK {
		t.Fatalf("suppression = %d", w6.Code)
	}
}

func TestRouter_APIKey_CreatorMode(t *testing.T) {
	fx, err := testutil.SeedArticles(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	r := testRouter(t)
	key := routerAPIKey(t, fx.AuthorID)

	// Clé API → mode créateur sur la lecture publique ({data} + troncature).
	w, body := doReq(t, r, "GET", "/v1/articles/article-payant", key, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	if body["data"] == nil {
		t.Fatalf("body = %s, attendu enveloppe {data}", w.Body.String())
	}
	data, _ := body["data"].(map[string]any)
	if data["isTruncated"] != true {
		t.Fatalf("data.isTruncated = %v, attendu true (paywall)", data["isTruncated"])
	}

	// Liste par clé API (publication résolue depuis la clé, sans query param).
	w2, body2 := doReq(t, r, "GET", "/v1/articles", key, nil)
	if w2.Code != http.StatusOK {
		t.Fatalf("liste clé API = %d, body = %s", w2.Code, w2.Body.String())
	}
	items, _ := body2["data"].([]any)
	if len(items) != 3 {
		t.Fatalf("len(data) = %d, attendu 3", len(items))
	}
}
