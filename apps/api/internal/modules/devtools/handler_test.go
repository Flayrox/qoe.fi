package devtools

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
)

const devSecret = "test-internal-secret"

// newDevRouter monte le panneau comme main.go : DevOnlyAuth avec bypass par
// secret partagé (devOnly) ; le middleware pass-through joue le rôle de
// CombinedAuth pour les requêtes sans secret (→ 401 sans userID).
func newDevRouter(t *testing.T) *chi.Mux {
	t.Helper()
	svc := NewService(poolTest, Options{DevOnly: true})
	h := NewHandler(svc)
	combined := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			next.ServeHTTP(w, r)
		})
	}
	r := chi.NewRouter()
	r.With(DevOnlyAuth(combined, devSecret, true)).Group(func(dv chi.Router) {
		h.Register(dv)
	})
	return r
}

func devReq(t *testing.T, r *chi.Mux, method, path, body string, authed bool) *httptest.ResponseRecorder {
	t.Helper()
	var rd *bytes.Reader
	if body == "" {
		rd = bytes.NewReader(nil)
	} else {
		rd = bytes.NewReader([]byte(body))
	}
	req := httptest.NewRequest(method, path, rd)
	req.Header.Set("Content-Type", "application/json")
	if authed {
		req.Header.Set("x-qoe-internal-secret", devSecret)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

// Toutes les routes refusent sans authentification (401).
func TestDevtoolsHandlers_Unauthorized(t *testing.T) {
	r := newDevRouter(t)
	routes := []struct{ method, path string }{
		{"GET", "/v1/devtools/data"},
		{"POST", "/v1/devtools/create-user"},
		{"POST", "/v1/devtools/reset"},
		{"POST", "/v1/devtools/simulate-subscriber"},
		{"POST", "/v1/devtools/simulate-follow"},
		{"POST", "/v1/devtools/simulate-like"},
		{"POST", "/v1/devtools/add-funds"},
		{"POST", "/v1/devtools/reset-onboarding"},
		{"GET", "/v1/devtools/user-by-email"},
		{"POST", "/v1/devtools/reindex"},
		{"POST", "/v1/devtools/seed-top-complete"},
		{"GET", "/v1/devtools/seed-top-progress/seed_test"},
	}
	for _, rt := range routes {
		w := devReq(t, r, rt.method, rt.path, "", false)
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("%s %s = %d, attendu 401", rt.method, rt.path, w.Code)
		}
	}
}

func TestDevtools_DevOnlyAuth_SecretMismatch(t *testing.T) {
	// Mauvais secret → retombe sur CombinedAuth (pass-through sans user) → 401.
	r := newDevRouter(t)
	req := httptest.NewRequest("GET", "/v1/devtools/data", nil)
	req.Header.Set("x-qoe-internal-secret", "wrong")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("mauvais secret = %d, attendu 401", w.Code)
	}
}

func TestDevtoolsHandler_Data(t *testing.T) {
	seedDevtools(t)
	r := newDevRouter(t)

	w := devReq(t, r, "GET", "/v1/devtools/data", "", true)
	if w.Code != http.StatusOK {
		t.Fatalf("data = %d, body = %s", w.Code, w.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("json: %v", err)
	}
	if body["stats"] == nil || body["users"] == nil {
		t.Fatalf("body = %s", w.Body.String())
	}
}

func TestDevtoolsHandler_CreateUser(t *testing.T) {
	seedDevtools(t)
	r := newDevRouter(t)

	// JSON invalide → 400.
	w := devReq(t, r, "POST", "/v1/devtools/create-user", "{bad", true)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("bad json = %d, attendu 400", w.Code)
	}

	// Succès créateur.
	w = devReq(t, r, "POST", "/v1/devtools/create-user",
		`{"id":"00000000-0000-0000-0000-0000000000e1","name":"Harry","email":"harry@t.dev","username":"harry","role":"creator"}`, true)
	if w.Code != http.StatusOK {
		t.Fatalf("create = %d, body = %s", w.Code, w.Body.String())
	}

	// Erreur métier (id manquant) → 500 via handleErr (default branch).
	w = devReq(t, r, "POST", "/v1/devtools/create-user", `{"email":"x@t.dev"}`, true)
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("id manquant = %d, attendu 500", w.Code)
	}
}

func TestDevtoolsHandler_Simulators(t *testing.T) {
	_, regularID := seedDevtools(t)
	r := newDevRouter(t)
	ctx := context.Background()

	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Publication" (id, type, name, slug, "updatedAt")
		 VALUES ('pub_dev_h', 'PERSONAL', 'Dev Pub', 'dev-pub-h', now())`); err != nil {
		t.Fatalf("publication: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`UPDATE "User" SET "publicationId" = 'pub_dev_h' WHERE id = $1`, regularID); err != nil {
		t.Fatalf("link: %v", err)
	}

	// simulate-subscriber : JSON invalide → 400.
	w := devReq(t, r, "POST", "/v1/devtools/simulate-subscriber", "{", true)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("bad json = %d", w.Code)
	}
	// Succès.
	w = devReq(t, r, "POST", "/v1/devtools/simulate-subscriber",
		`{"email":"sub@t.dev","publicationId":"pub_dev_h","isPremium":true,"ltvCents":500}`, true)
	if w.Code != http.StatusOK {
		t.Fatalf("subscriber = %d, body = %s", w.Code, w.Body.String())
	}

	// simulate-follow : 400 JSON + succès.
	w = devReq(t, r, "POST", "/v1/devtools/simulate-follow", "{", true)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("follow bad json = %d", w.Code)
	}
	w = devReq(t, r, "POST", "/v1/devtools/simulate-follow",
		`{"readerId":"`+regularID+`","publicationId":"pub_dev_h"}`, true)
	if w.Code != http.StatusOK {
		t.Fatalf("follow = %d, body = %s", w.Code, w.Body.String())
	}

	// simulate-like : 400 JSON + succès (toggle on).
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Post" (id, content, "authorId", visibility, "isDraft", "createdAt", "updatedAt")
		 VALUES ('post_dev_h', 'salut', $1, 'public', false, now(), now())`, regularID); err != nil {
		t.Fatalf("post: %v", err)
	}
	w = devReq(t, r, "POST", "/v1/devtools/simulate-like", "{", true)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("like bad json = %d", w.Code)
	}
	w = devReq(t, r, "POST", "/v1/devtools/simulate-like",
		`{"postId":"post_dev_h","userId":"`+regularID+`"}`, true)
	if w.Code != http.StatusOK {
		t.Fatalf("like = %d, body = %s", w.Code, w.Body.String())
	}

	// add-funds : 400 JSON + succès.
	w = devReq(t, r, "POST", "/v1/devtools/add-funds", "{", true)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("funds bad json = %d", w.Code)
	}
	w = devReq(t, r, "POST", "/v1/devtools/add-funds",
		`{"userId":"`+regularID+`","amountCents":1000}`, true)
	if w.Code != http.StatusOK {
		t.Fatalf("funds = %d, body = %s", w.Code, w.Body.String())
	}

	// reset-onboarding : succès (target vide = tous).
	w = devReq(t, r, "POST", "/v1/devtools/reset-onboarding", `{}`, true)
	if w.Code != http.StatusOK {
		t.Fatalf("onboarding = %d, body = %s", w.Code, w.Body.String())
	}

	// user-by-email : 400 sans email + 404 inconnu + 200 connu.
	w = devReq(t, r, "GET", "/v1/devtools/user-by-email", "", true)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("email manquant = %d, attendu 400", w.Code)
	}
	w = devReq(t, r, "GET", "/v1/devtools/user-by-email?email=inconnu@t.dev", "", true)
	if w.Code != http.StatusNotFound {
		t.Fatalf("email inconnu = %d, attendu 404", w.Code)
	}
	w = devReq(t, r, "GET", "/v1/devtools/user-by-email?email=devtools.user@test.dev", "", true)
	if w.Code != http.StatusOK {
		t.Fatalf("email connu = %d, body = %s", w.Code, w.Body.String())
	}
}

func TestDevtoolsHandler_Reindex_NoMeili(t *testing.T) {
	seedDevtools(t)
	t.Setenv("MEILISEARCH_HOST", "http://127.0.0.1:1") // port fermé → erreur
	t.Setenv("MEILI_MASTER_KEY", "x")
	r := newDevRouter(t)

	w := devReq(t, r, "POST", "/v1/devtools/reindex", "", true)
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("reindex sans Meili = %d, attendu 500", w.Code)
	}
}

func TestDevtoolsHandler_SeedTopComplete(t *testing.T) {
	seedDevtools(t)
	t.Setenv("REDIS_URL", "")
	t.Setenv("UMAMI_DATABASE_URL", "")
	t.Setenv("MEILISEARCH_HOST", "http://127.0.0.1:1")
	r := newDevRouter(t)

	// Le POST démarre la régénération en arrière-plan et rend le job.
	w := devReq(t, r, "POST", "/v1/devtools/seed-top-complete", "", true)
	if w.Code != http.StatusOK {
		t.Fatalf("seed-top-complete = %d, body = %s", w.Code, w.Body.String())
	}
	var start map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &start); err != nil {
		t.Fatalf("json: %v", err)
	}
	jobID, _ := start["id"].(string)
	if jobID == "" {
		t.Fatalf("job id manquant: %s", w.Body.String())
	}

	// On poll la progression jusqu'à la fin (le seed complet est long).
	deadline := time.Now().Add(5 * time.Minute)
	for {
		w = devReq(t, r, "GET", "/v1/devtools/seed-top-progress/"+jobID, "", true)
		if w.Code != http.StatusOK {
			t.Fatalf("progress = %d, body = %s", w.Code, w.Body.String())
		}
		var job map[string]any
		if err := json.Unmarshal(w.Body.Bytes(), &job); err != nil {
			t.Fatalf("json: %v", err)
		}
		if job["done"] == true {
			if job["success"] != true {
				t.Fatalf("job en échec: %s", w.Body.String())
			}
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("timeout: job de régénération pas terminé")
		}
		time.Sleep(500 * time.Millisecond)
	}
}

func TestDevtoolsHandler_Reset(t *testing.T) {
	seedDevtools(t)
	r := newDevRouter(t)

	w := devReq(t, r, "POST", "/v1/devtools/reset", "", true)
	if w.Code != http.StatusOK {
		t.Fatalf("reset = %d, body = %s", w.Code, w.Body.String())
	}
}
