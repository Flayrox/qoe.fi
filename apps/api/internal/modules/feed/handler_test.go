package feed

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/middleware"
)

func newRouter(t *testing.T, userID string) *chi.Mux {
	t.Helper()
	r := chi.NewRouter()
	h := NewHandler(newTestService())
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			ctx := req.Context()
			if userID != "" {
				ctx = context.WithValue(ctx, middleware.UserIDKey, userID)
			}
			next.ServeHTTP(w, req.WithContext(ctx))
		})
	})
	h.Register(r)
	return r
}

func keyGet(t *testing.T, r *chi.Mux, path string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest("GET", path, nil)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	return rr
}

func onePostID(t *testing.T) string {
	t.Helper()
	var id string
	if err := poolTest.QueryRow(context.Background(), `SELECT id FROM "Post" LIMIT 1`).Scan(&id); err != nil {
		t.Fatalf("post id: %v", err)
	}
	return id
}

func TestFeedHandlers(t *testing.T) {
	if _, err := seedEngine(context.Background(), poolTest); err != nil {
		t.Fatalf("seed engine: %v", err)
	}
	r := newRouter(t, "") // public / non authentifié

	// Tendance, personnalisé (cold-start), articles, home.
	if rr := keyGet(t, r, "/v1/feed/trending?limit=5"); rr.Code != http.StatusOK {
		t.Fatalf("trending code = %d", rr.Code)
	}
	if rr := keyGet(t, r, "/v1/feed/personalized?limit=5"); rr.Code != http.StatusOK {
		t.Fatalf("personalized code = %d", rr.Code)
	}
	if rr := keyGet(t, r, "/v1/feed/articles"); rr.Code != http.StatusOK {
		t.Fatalf("articles code = %d", rr.Code)
	}
	if rr := keyGet(t, r, "/v1/home/feed"); rr.Code != http.StatusOK {
		t.Fatalf("homeFeed code = %d", rr.Code)
	}

	// userPosts : publication résolue par slug/subdomain, puis introuvable.
	if rr := keyGet(t, r, "/v1/users/eng-pub/posts"); rr.Code != http.StatusOK {
		t.Fatalf("userPosts code = %d, body=%s", rr.Code, rr.Body.String())
	}
	if rr := keyGet(t, r, "/v1/users/inconnu/posts"); rr.Code != http.StatusNotFound {
		t.Fatalf("userPosts introuvable code = %d, attendu 404", rr.Code)
	}
	// userArticles (profil résolu par slug).
	if rr := keyGet(t, r, "/v1/users/eng-pub/articles"); rr.Code != http.StatusOK {
		t.Fatalf("userArticles code = %d, body=%s", rr.Code, rr.Body.String())
	}
}

func TestFeedHandlers_ThreadAndFollowing(t *testing.T) {
	if _, err := seedEngine(context.Background(), poolTest); err != nil {
		t.Fatalf("seed engine: %v", err)
	}
	// thread avec uid (chemin enrichi).
	rAuth := newRouter(t, "00000000-0000-0000-0000-000000000010")
	id := onePostID(t)
	if rr := keyGet(t, rAuth, "/v1/posts/"+id+"/thread"); rr.Code != http.StatusOK {
		t.Fatalf("thread code = %d, body=%s", rr.Code, rr.Body.String())
	}
	if rr := keyGet(t, rAuth, "/v1/posts/introuvable/thread"); rr.Code != http.StatusNotFound {
		t.Fatalf("thread introuvable code = %d, attendu 404", rr.Code)
	}
	// following (auth requise mais route mappée : renvoie 200 même vide).
	if rr := keyGet(t, rAuth, "/v1/feed/?limit=5"); rr.Code != http.StatusOK {
		t.Fatalf("following code = %d", rr.Code)
	}
	// personalized protégé (avec uid) et pagination offset.
	if rr := keyGet(t, rAuth, "/v1/feed/personalized?offset=0&userHour=14"); rr.Code != http.StatusOK {
		t.Fatalf("personalized protégé code = %d", rr.Code)
	}
}

func TestFeedHandler_Hydrate(t *testing.T) {
	if _, err := seedEngine(context.Background(), poolTest); err != nil {
		t.Fatalf("seed engine: %v", err)
	}
	r := newRouter(t, "")

	body := `{"items":[]}`
	req := httptest.NewRequest("POST", "/v1/feed/hydrate", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("hydrate vide code = %d, body=%s", rr.Code, rr.Body.String())
	}

	// Hydrate un vrai article (chemine feedArticleCat / HydrateArticles).
	art := `{"items":[{"itemType":"ARTICLE","id":"eng_art_a"}]}`
	req = httptest.NewRequest("POST", "/v1/feed/hydrate", bytes.NewBufferString(art))
	req.Header.Set("Content-Type", "application/json")
	rr = httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("hydrate article code = %d, body=%s", rr.Code, rr.Body.String())
	}

	// JSON invalide → 400.
	rr = httptest.NewRecorder()
	r.ServeHTTP(rr, httptest.NewRequest("POST", "/v1/feed/hydrate", bytes.NewBufferString(`{`)))
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("hydrate badjson code = %d", rr.Code)
	}

	// trop d'items → 400.
	big := `{"items":[` + repeatItem(101) + `]}`
	rr = httptest.NewRecorder()
	r.ServeHTTP(rr, httptest.NewRequest("POST", "/v1/feed/hydrate", bytes.NewBufferString(big)))
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("hydrate >100 code = %d", rr.Code)
	}
}

func repeatItem(n int) string {
	out := ""
	for i := 0; i < n; i++ {
		if i > 0 {
			out += ","
		}
		out += `{"itemType":"ARTICLE","id":"x"}`
	}
	return out
}

func TestFeedHandler_ParseLimitCursor(t *testing.T) {
	if _, err := seedEngine(context.Background(), poolTest); err != nil {
		t.Fatalf("seed engine: %v", err)
	}
	r := newRouter(t, "")
	// limit invalide → défaut 20 ; cursor → offset.
	req := httptest.NewRequest("GET", "/v1/feed/trending?limit=999&cursor=abc", nil)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("trending limit invalide code = %d", rr.Code)
	}
}